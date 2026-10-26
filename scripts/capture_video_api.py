"""
Purpose: Let a video be uploaded as a background capture, keeping only its sound.

What: `build_video_router()` adds one endpoint, `POST /capture/jobs/video`. It checks the video,
pulls out the sound with ffmpeg, stores that small MP3 and creates an ordinary capture job for it.
`ExtractionSlots` limits how many videos are converted at the same time.

How: it is a separate path in front of the existing one. Once the sound is stored and the job
exists, everything else (the worker, transcription, review, save, playback, retention) is the code
audio uploads already use, untouched. The upload is copied to a private temporary folder, converted,
and the folder is always removed, so a video never stays on the server or in storage.

Why: people often have the memory as a video on their phone. Keeping this out of `/capture/jobs`
means audio uploads cannot be affected by it, and the heavier work (large files, ffmpeg) is fenced:
a size limit, a few conversions at once, and the same charge-and-refund rules as audio.
"""
from __future__ import annotations

import asyncio
import io
import logging
import os
import shutil
import tempfile
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from scripts.capture_jobs_api import (
    JobDeps, JobRunner, _REQUEST_ID, _SAVE_FAILED, _forget_audio, _store_audio,
)
from tools import video
from tools.errors import _MSG_BUSY
from tools.jobs import CaptureJobStore, public_job

_logger = logging.getLogger(__name__)

_COPY_CHUNK = 1024 * 1024
_FORM_OVERHEAD_BYTES = 1024 * 1024       # the form fields around the video in the request body
_SOUND_NAME = "sound.mp3"


class Busy(Exception):
    """Too many videos are being converted already."""


class ExtractionSlots:
    """At most `running` conversions at once, with at most `waiting` more queued behind them.

    ffmpeg on a big video is the heaviest thing this server does, and it runs on one machine. Beyond
    the queue the caller is told to try again, so a burst cannot fill the disk or starve other users.
    """

    def __init__(self, running: int = 1, waiting: int = 3):
        self._running = running
        self._max_waiting = waiting
        self._waiting = 0
        self._sem = asyncio.Semaphore(running)

    @asynccontextmanager
    async def hold(self):
        if self._sem.locked() and self._waiting >= self._max_waiting:
            raise Busy()
        self._waiting += 1
        try:
            await self._sem.acquire()
        finally:
            self._waiting -= 1
        try:
            yield
        finally:
            self._sem.release()


def default_slots() -> ExtractionSlots:
    """Built from VIDEO_MAX_CONCURRENT (default 1); anything unusable falls back to 1."""
    try:
        running = int(os.environ.get("VIDEO_MAX_CONCURRENT", 1))
    except ValueError:
        running = 1
    return ExtractionSlots(running=running if running > 0 else 1)


def _too_large() -> HTTPException:
    mb = video.max_video_bytes() // (1024 * 1024)
    return HTTPException(status_code=413, detail=video.MSG_TOO_LARGE.format(mb=mb))


def _save_upload(upload: UploadFile, path: str) -> None:
    """Copy the upload to a file ffmpeg can open, in chunks, so it is never held in memory."""
    upload.file.seek(0)
    with open(path, "wb") as out:
        shutil.copyfileobj(upload.file, out, _COPY_CHUNK)


def _extract_and_read(src: str, dst: str) -> bytes:
    video.extract_audio(src, dst)
    with open(dst, "rb") as f:
        return f.read()


def build_video_router(
    deps: JobDeps, store: CaptureJobStore, runner: JobRunner, slots: ExtractionSlots | None = None,
) -> APIRouter:
    router = APIRouter()
    slots = slots or default_slots()

    async def gate(user: dict = Depends(deps.require_auth)) -> dict:
        """Signed in AND switched on for this user. Everyone else sees a plain 404, as if it did not exist."""
        if not deps.enabled_for(user):
            raise HTTPException(status_code=404, detail="Not found")
        return user

    @router.post("/capture/jobs/video")
    async def create_job_from_video(request: Request, user: dict = Depends(gate)):
        user_id = deps.user_id_of(user)
        limit = video.max_video_bytes()

        # Turn away an oversized body before it is read at all.
        declared = request.headers.get("content-length", "")
        if declared.isdigit() and int(declared) > limit + _FORM_OVERHEAD_BYTES:
            raise _too_large()

        form = await request.form()
        try:
            upload = form.get("video")
            if not hasattr(upload, "filename") or not hasattr(upload, "file"):
                raise HTTPException(status_code=400, detail="Please choose a video.")
            client_request_id = str(form.get("client_request_id") or "")
            language = str(form.get("language") or "auto")
            narrator = str(form.get("narrator") or "").strip() or None
            if not _REQUEST_ID.match(client_request_id):
                raise HTTPException(status_code=400, detail="Invalid client_request_id")

            # A repeated upload (dropped response, double tap) gets the original job back: no second conversion or charge.
            try:
                existing = await run_in_threadpool(store.find_by_request, user_id, client_request_id)
            except Exception as exc:
                deps.describe_failure(exc, "capture-jobs/video", user_id)
                raise HTTPException(status_code=503, detail=_SAVE_FAILED) from exc
            if existing is not None:
                return JSONResponse(status_code=200, content={"job": public_job(existing)})

            await run_in_threadpool(deps.check_memory_cap, user_id)

            ext = os.path.splitext(upload.filename or "")[1].lower()
            if ext not in video.VIDEO_EXTS:
                raise HTTPException(status_code=400, detail=video.MSG_UNSUPPORTED_TYPE.format(ext=ext))
            if (upload.size or 0) > limit:
                raise _too_large()
            head = await upload.read(16)
            if not video.looks_like_video(head):
                _logger.warning(f"event=video_magic_fail filename={upload.filename} size={upload.size}")
                raise HTTPException(status_code=400, detail=video.MSG_NOT_VIDEO)

            await run_in_threadpool(deps.charge_quota, user_id)
            workdir = tempfile.mkdtemp(prefix="echoes-video-")
            stored = None
            try:
                try:
                    src, dst = os.path.join(workdir, "in" + ext), os.path.join(workdir, _SOUND_NAME)
                    await run_in_threadpool(_save_upload, upload, src)
                    async with slots.hold():
                        data = await run_in_threadpool(_extract_and_read, src, dst)
                except Busy as exc:
                    raise HTTPException(status_code=503, detail=_MSG_BUSY) from exc
                except video.VideoError as exc:
                    if exc.kind == "unavailable":
                        deps.describe_failure(exc, "capture-jobs/video", user_id)
                        raise HTTPException(status_code=503, detail=exc.message) from exc
                    raise HTTPException(status_code=400, detail=exc.message) from exc

                # The sound is held to exactly the rules an uploaded audio file is.
                sound = UploadFile(file=io.BytesIO(data), filename=_SOUND_NAME)
                await run_in_threadpool(deps.validate_audio, sound, data)

                try:
                    stored = await run_in_threadpool(_store_audio, data, _SOUND_NAME, user_id)
                    job, created = await run_in_threadpool(
                        store.create, user_id, client_request_id,
                        audio_path=stored, language=language, narrator=narrator,
                    )
                except Exception as exc:
                    deps.describe_failure(exc, "capture-jobs/video", user_id)
                    raise HTTPException(status_code=503, detail=_SAVE_FAILED) from exc
            except HTTPException:
                await run_in_threadpool(deps.refund_quota, user_id)
                if stored:
                    await _forget_audio(stored)
                raise
            finally:
                shutil.rmtree(workdir, ignore_errors=True)

            if not created:                       # lost a race with an identical request: keep theirs, undo ours
                await run_in_threadpool(deps.refund_quota, user_id)
                await _forget_audio(stored)
                return JSONResponse(status_code=200, content={"job": public_job(job)})

            runner.schedule(job["id"])
            return JSONResponse(status_code=202, content={"job": public_job(job)})
        finally:
            await form.close()

    return router
