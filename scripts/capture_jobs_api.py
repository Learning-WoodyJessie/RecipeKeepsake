"""
Purpose: Background capture. Upload a recording once, let the server turn it into a draft
recipe while the user does something else, then review and save it.

What: `JobRunner` runs queued jobs (transcribe, safety-check, structure) with a concurrency
cap, recovers work a dead process left behind and cleans up old drafts. `build_router()`
exposes the HTTP endpoints. `JobDeps` carries the few things that live in serve.py.

How: a job is a row in `capture_jobs` (tools/jobs.py). Creating one stores the audio in the
private bucket and charges the daily quota. The runner claims it with a single conditional
UPDATE, does the AI work in a worker thread, and stores the draft on the row. Saving turns
the draft into a memory that points at the same audio file. Image generation happens after
the save, in the background. A failed job keeps the recording, refunds the quota exactly
once, and shows a user-safe message with a Retry button.

Why: the old flow did all of this inside one HTTP request, so a locked phone, a dropped
connection or a restart lost the recording. Everything here is switched off unless
CAPTURE_JOBS_ENABLED or CAPTURE_JOBS_ALLOWLIST is set, and the old endpoints are untouched.

Design: docs/plans/2026-10-26-capture-jobs-design.md
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from pipeline.models import RecipeData
from pipeline.persist import run_persist_stored
from pipeline.transcribe import run_transcribe
from pipeline.transform import VALID_CATEGORIES, run_transform
from tools.jobs import CaptureJobStore, is_duplicate_key, public_job
from tools.storage import (
    attach_generated_image,
    delete_stored_audio,
    download_stored_audio,
    ensure_person_exists,
    upload_audio,
)

_logger = logging.getLogger("serve")

STARTUP_STALE_SECONDS = 120      # right after a restart anything "processing" belongs to the process that just died
STALE_SECONDS = 600              # while running, a job untouched this long is presumed lost
MAINTENANCE_INTERVAL_SECONDS = 60
PURGE_INTERVAL_SECONDS = 6 * 3600
DRAFT_RETENTION_DAYS = 14
SAVED_RETENTION_DAYS = 7

_SAVE_FAILED = "We couldn't save your recording. Please try again."
_REQUEST_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
# Fixed namespace: the memory made from a job gets a token derived from the job id, so
# saving the same job twice collides on the unique token instead of making a duplicate.
_MEMORY_TOKEN_NAMESPACE = uuid.UUID("6f1c2a7e-0b0e-4f55-9a6e-3d2f6a1b9c11")


@dataclass(frozen=True)
class JobDeps:
    """What the job endpoints need from serve.py (kept explicit to avoid a circular import)."""
    require_auth: Callable
    user_id_of: Callable[[dict], str]
    enabled_for: Callable[[dict], bool]          # may this user use background capture?
    configured: Callable[[], bool]               # is it switched on for anybody at all?
    validate_audio: Callable                     # (UploadFile, bytes) -> None, raises HTTPException
    check_memory_cap: Callable[[str], None]      # raises HTTPException(403)
    charge_quota: Callable[[str], None]          # raises HTTPException(429) when over the daily limit
    refund_quota: Callable[[str], None]
    moderate: Callable[[str], None]              # raises HTTPException(400) for content we will not keep
    generate_image: Callable[..., str]
    describe_failure: Callable                   # (exc, where, user_id) -> (Failure, alert tuple | None)
    send_alert: Callable[[str, str, str], None]
    transcription_suffix: Callable[[str], str]


class Availability:
    """Remembers for a minute whether the capture_jobs table is usable.

    The feature can be switched on before migration 006 has been run, or the database can have a
    bad moment. Either way users must keep the original capture flow, so /features only says yes
    when jobs can actually be stored. The answer is cached so it is not a database round trip on
    every page load.
    """

    def __init__(self, check: Callable[[], bool], ttl_seconds: float = 60, clock: Callable[[], float] = time.monotonic):
        self._check = check
        self._ttl = ttl_seconds
        self._clock = clock
        self._answer: bool | None = None
        self._at = 0.0
        self.checks = 0

    def get(self) -> bool:
        now = self._clock()
        if self._answer is None or now - self._at >= self._ttl:
            self._answer, self._at = bool(self._check()), now
            self.checks += 1
        return self._answer

    def expire(self) -> None:
        self._answer = None


def _draft_from(recipe: RecipeData, narrator: str | None) -> dict:
    """The draft stored on the job: the same fields /capture/process returns, minus the image."""
    return {
        "title": recipe.title,
        "ingredients": recipe.ingredients,
        "steps": recipe.steps,
        "cook_notes": recipe.cook_notes,
        "review_flags": recipe.review_flags,
        "transcript_raw": recipe.transcript_raw,
        "transcript_english": recipe.transcript_english,
        "category": recipe.category,
        "image_url": "",              # generated after the user saves
        "narrator": narrator,
    }


class JobRunner:
    def __init__(
        self, store: CaptureJobStore, deps: JobDeps, *, max_concurrent: int = 3, autostart: bool = True,
    ):
        self.store = store
        self.deps = deps
        self.autostart = autostart
        self.scheduled: list[str] = []
        self._semaphore = asyncio.Semaphore(max(1, max_concurrent))
        self._tasks: set[asyncio.Task] = set()
        self._maintenance: asyncio.Task | None = None

    # -- scheduling -------------------------------------------------------------

    def _spawn(self, coro) -> None:
        task = asyncio.get_running_loop().create_task(coro)
        self._tasks.add(task)                     # keep a reference: tasks nobody holds can be garbage collected mid-run
        task.add_done_callback(self._tasks.discard)

    def schedule(self, job_id: str) -> None:
        self.scheduled.append(job_id)
        if self.autostart:
            self._spawn(self.run(job_id))

    def schedule_image(self, token: str, recipe: dict) -> None:
        if self.autostart:
            self._spawn(self._attach_image(token, recipe))

    async def wait_idle(self) -> None:
        while self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)

    # -- running a job ----------------------------------------------------------

    async def run(self, job_id: str) -> None:
        async with self._semaphore:
            job = await run_in_threadpool(self.store.claim, job_id)
            if job is None:
                return                            # already running elsewhere, finished or discarded
            try:
                draft = await run_in_threadpool(self._process, job)
            except HTTPException as exc:          # a deliberate refusal, e.g. content we will not keep
                await run_in_threadpool(self._record_failure, job, "rejected", str(exc.detail), None)
                return
            except Exception as exc:
                failure, alert = self.deps.describe_failure(exc, "capture-jobs/run", job["user_id"])
                await run_in_threadpool(self._record_failure, job, failure.kind, failure.message, alert)
                return
            try:
                stored = await run_in_threadpool(self.store.mark_ready, job["id"], draft)
            except Exception as exc:              # the draft is lost but the job is not: recovery will run it again
                _logger.error(f"event=capture_job_store_failed id={job['id']} error={type(exc).__name__} msg={exc}")
                return
            if not stored:
                _logger.info(f"event=capture_job_result_dropped id={job['id']} reason=no_longer_processing")

    def _process(self, job: dict) -> dict:
        """The blocking AI work. Runs in a worker thread."""
        audio = download_stored_audio(job["audio_path"])
        suffix = self.deps.transcription_suffix(Path(job["audio_path"]).suffix.lower() or ".mp3")
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio)
            path = tmp.name
        try:
            transcript = run_transcribe(path, language=job["language"])
            self.deps.moderate(transcript.english)
            self.store.set_stage(job["id"], "structuring")
            recipe = run_transform(transcript)
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass
        return _draft_from(recipe, job.get("narrator"))

    def _record_failure(self, job: dict, kind: str, message: str, alert: tuple | None) -> None:
        """Mark the job failed, then settle up. The alert goes out only for the caller that actually failed the job."""
        marked = self.store.mark_failed(job["id"], kind, message)
        self._settle(job, alert if marked else None)

    def _settle(self, job: dict, alert: tuple | None) -> None:
        """Give the quota back (once, however often this is reached) and tell the operator if it needs a human."""
        if self.store.claim_refund(job["id"]):
            self.deps.refund_quota(job["user_id"])
        if alert:
            self.deps.send_alert(*alert)

    async def _attach_image(self, token: str, recipe: dict) -> None:
        """Best-effort: a memory without a generated picture is perfectly valid."""
        async with self._semaphore:
            try:
                url = await run_in_threadpool(
                    self.deps.generate_image, recipe["title"],
                    ingredients=recipe["ingredients"], steps=recipe["steps"], cook_notes=recipe["cook_notes"],
                )
                if url:
                    await run_in_threadpool(attach_generated_image, token, url)
            except Exception as exc:
                _logger.warning(f"event=capture_job_image_failed token={token} error={type(exc).__name__} msg={exc}")

    # -- recovery and housekeeping ---------------------------------------------

    async def recover(self, stale_after_seconds: int) -> None:
        """Re-run work a dead process left behind; fail (and refund) jobs that keep crashing the server."""
        requeued, failed = await run_in_threadpool(self.store.recover_stale, stale_after_seconds)
        for job_id in failed:                     # the store already failed these; refund and report them
            job = await run_in_threadpool(self.store.get, job_id)
            if job is not None:
                _, alert = self.deps.describe_failure(
                    RuntimeError("capture job exceeded its attempts"), "capture-jobs/recover", job["user_id"])
                await run_in_threadpool(self._settle, job, alert)
        for job_id in await run_in_threadpool(self.store.list_queued_ids):
            self.schedule(job_id)
        if requeued or failed:
            _logger.info(f"event=capture_jobs_recovered requeued={len(requeued)} failed={len(failed)}")

    async def purge(self) -> None:
        """Delete drafts nobody reviewed in two weeks, with their audio. A saved job's audio belongs to a memory and is kept."""
        expired = await run_in_threadpool(self.store.find_expired, DRAFT_RETENTION_DAYS, SAVED_RETENTION_DAYS)
        drafts = [j for j in expired if j["status"] != "saved"]
        deletable = [j["id"] for j in expired if j["status"] == "saved"]
        if drafts:
            try:
                await run_in_threadpool(delete_stored_audio, [j["audio_path"] for j in drafts])
                deletable += [j["id"] for j in drafts]
            except Exception as exc:              # keep the rows: they are what lets the next sweep try again
                _logger.warning(f"event=capture_jobs_purge_audio_failed error={type(exc).__name__} msg={exc}")
        await run_in_threadpool(self.store.delete_rows, deletable)

    async def start(self) -> None:
        """Called once at server startup. Does nothing at all unless the feature is configured."""
        if not self.deps.configured():
            return
        try:
            await self.recover(STARTUP_STALE_SECONDS)
        except Exception as exc:                  # e.g. flag turned on before migration 006: never block the server booting
            _logger.warning(f"event=capture_jobs_startup_failed error={type(exc).__name__} msg={exc}")
        self._maintenance = asyncio.get_running_loop().create_task(self._maintenance_loop())

    async def stop(self) -> None:
        if self._maintenance is not None:
            self._maintenance.cancel()
            await asyncio.gather(self._maintenance, return_exceptions=True)
            self._maintenance = None

    async def _maintenance_loop(self) -> None:
        since_purge = 0
        while True:
            await asyncio.sleep(MAINTENANCE_INTERVAL_SECONDS)
            since_purge += MAINTENANCE_INTERVAL_SECONDS
            try:
                await self.recover(STALE_SECONDS)
                if since_purge >= PURGE_INTERVAL_SECONDS:
                    since_purge = 0
                    await self.purge()
            except Exception as exc:
                _logger.warning(f"event=capture_jobs_maintenance_failed error={type(exc).__name__} msg={exc}")


# ── HTTP ──────────────────────────────────────────────────────────────────────

class SaveJobRequest(BaseModel):
    """The recipe as the user reviewed it. Transcripts are taken from the stored draft, not the client."""
    title: str = Field(min_length=1, max_length=200)
    narrator: str = Field(default="", max_length=120)
    ingredients: list = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    cook_notes: str = ""
    review_flags: list = Field(default_factory=list)
    category: str = "Other"


def build_router(
    deps: JobDeps, store: CaptureJobStore, runner: JobRunner, availability: Availability | None = None,
) -> APIRouter:
    router = APIRouter()
    availability = availability or Availability(store.is_available)

    async def gate(user: dict = Depends(deps.require_auth)) -> dict:
        """Signed in AND switched on for this user. Everyone else sees a plain 404, as if it did not exist."""
        if not deps.enabled_for(user):
            raise HTTPException(status_code=404, detail="Not found")
        return user

    async def owned_job(job_id: str, user_id: str) -> dict:
        job = await run_in_threadpool(store.get_for_user, job_id, user_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Not found")      # same answer for "missing" and "not yours"
        return job

    @router.get("/features")
    async def features(user: dict = Depends(deps.require_auth)):
        # Both: switched on for this user AND the table exists. Otherwise the original flow keeps working.
        on = bool(deps.enabled_for(user)) and await run_in_threadpool(availability.get)
        return {"capture_jobs": on}

    @router.post("/capture/jobs")
    async def create_job(
        audio: UploadFile = File(...),
        client_request_id: str = Form(...),
        language: str = Form("auto"),
        narrator: str = Form(""),
        user: dict = Depends(gate),
    ):
        user_id = deps.user_id_of(user)
        if not _REQUEST_ID.match(client_request_id):
            raise HTTPException(status_code=400, detail="Invalid client_request_id")

        # A repeated upload (dropped response, double tap) gets the original job back: no second upload, no second charge.
        try:
            existing = await run_in_threadpool(store.find_by_request, user_id, client_request_id)
        except Exception as exc:                  # database unreachable: nothing has been charged or stored yet
            deps.describe_failure(exc, "capture-jobs/create", user_id)
            raise HTTPException(status_code=503, detail=_SAVE_FAILED) from exc
        if existing is not None:
            return JSONResponse(status_code=200, content={"job": public_job(existing)})

        await run_in_threadpool(deps.check_memory_cap, user_id)
        data = await audio.read()
        deps.validate_audio(audio, data)
        await run_in_threadpool(deps.charge_quota, user_id)

        stored = None
        try:
            stored = await run_in_threadpool(_store_audio, data, audio.filename, user_id)
            job, created = await run_in_threadpool(
                store.create, user_id, client_request_id,
                audio_path=stored, language=language, narrator=narrator.strip() or None,
            )
        except Exception as exc:
            await run_in_threadpool(deps.refund_quota, user_id)
            if stored:
                await _forget_audio(stored)
            deps.describe_failure(exc, "capture-jobs/create", user_id)
            raise HTTPException(status_code=503, detail=_SAVE_FAILED) from exc

        if not created:                           # lost a race with an identical request: keep theirs, undo ours
            await run_in_threadpool(deps.refund_quota, user_id)
            await _forget_audio(stored)
            return JSONResponse(status_code=200, content={"job": public_job(job)})

        runner.schedule(job["id"])
        return JSONResponse(status_code=202, content={"job": public_job(job)})

    @router.get("/capture/jobs")
    async def list_jobs(user: dict = Depends(gate)):
        jobs = await run_in_threadpool(store.list_open, deps.user_id_of(user))
        return {"jobs": [public_job(j) for j in jobs]}

    @router.get("/capture/jobs/{job_id}")
    async def get_job(job_id: str, user: dict = Depends(gate)):
        job = await owned_job(job_id, deps.user_id_of(user))
        return {"job": public_job(job, include_result=True)}

    @router.post("/capture/jobs/{job_id}/save")
    async def save_job(job_id: str, body: SaveJobRequest, user: dict = Depends(gate)):
        user_id = deps.user_id_of(user)
        job = await owned_job(job_id, user_id)
        if job["status"] == "saved":
            return {"token": job["memory_token"], "already_saved": True}
        if job["status"] != "ready":
            raise HTTPException(status_code=409, detail="This recording isn't ready to save yet.")
        await run_in_threadpool(deps.check_memory_cap, user_id)

        draft = job.get("result") or {}
        narrator = body.narrator.strip() or (job.get("narrator") or "") or "Grandma"
        recipe = RecipeData(
            title=body.title.strip(),
            ingredients=body.ingredients,
            steps=body.steps,
            cook_notes=body.cook_notes,
            review_flags=body.review_flags,
            transcript_raw=draft.get("transcript_raw", ""),
            transcript_english=draft.get("transcript_english", ""),
            image_url="",
            category=body.category if body.category in VALID_CATEGORIES else "Other",
        )
        token = str(uuid.uuid5(_MEMORY_TOKEN_NAMESPACE, job["id"]))
        first_time = True
        try:
            await run_in_threadpool(
                run_persist_stored, recipe, job["audio_path"], narrator, user_id,
                user.get("email", ""), (user.get("user_metadata") or {}).get("full_name", ""), token,
            )
        except Exception as exc:
            if not is_duplicate_key(exc):
                deps.describe_failure(exc, "capture-jobs/save", user_id)
                raise HTTPException(status_code=500, detail="Something went wrong on our side. Please try again.") from exc
            first_time = False                    # an earlier attempt already made this memory but did not record it

        await run_in_threadpool(store.mark_saved, job["id"], token)
        try:
            await run_in_threadpool(ensure_person_exists, user_id, narrator)
        except Exception as exc:
            _logger.warning(f"event=capture_job_person_failed error={type(exc).__name__} msg={exc}")
        if first_time:
            runner.schedule_image(token, {
                "title": recipe.title, "ingredients": recipe.ingredients,
                "steps": recipe.steps, "cook_notes": recipe.cook_notes,
            })
        return {"token": token}

    @router.post("/capture/jobs/{job_id}/retry")
    async def retry_job(job_id: str, user: dict = Depends(gate)):
        user_id = deps.user_id_of(user)
        job = await owned_job(job_id, user_id)
        if job["status"] != "failed" or job.get("error_kind") == "rejected":
            raise HTTPException(status_code=409, detail="This recording can't be retried.")
        await run_in_threadpool(deps.charge_quota, user_id)        # the failure refunded the first charge
        again = await run_in_threadpool(store.requeue_failed, job_id, user_id)
        if again is None:
            await run_in_threadpool(deps.refund_quota, user_id)
            raise HTTPException(status_code=409, detail="This recording can't be retried.")
        runner.schedule(job_id)
        return {"job": public_job(again)}

    @router.delete("/capture/jobs/{job_id}")
    async def discard_job(job_id: str, user: dict = Depends(gate)):
        job = await run_in_threadpool(store.mark_discarded, job_id, deps.user_id_of(user))
        if job is None:
            raise HTTPException(status_code=404, detail="Not found")
        await _forget_audio(job["audio_path"])
        return {"deleted": job_id}

    return router


def _store_audio(data: bytes, filename: str | None, user_id: str) -> str:
    """Put the upload in the private audio bucket (webm/ogg become mp3 for iOS). Returns the stored name."""
    suffix = Path(filename or "").suffix.lower() or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        return upload_audio(path, f"{uuid.uuid4()}{suffix}", user_id=user_id)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


async def _forget_audio(stored_name: str) -> None:
    """Delete a recording; if storage refuses, log it. The row stays discarded and the 14-day sweep retries."""
    try:
        await run_in_threadpool(delete_stored_audio, [stored_name])
    except Exception as exc:
        _logger.warning(f"event=capture_job_audio_delete_failed name={stored_name} error={type(exc).__name__} msg={exc}")
