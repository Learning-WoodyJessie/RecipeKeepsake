"""
Purpose: Specify the background runner that turns a queued capture job into a draft.

What: runs the real JobRunner and CaptureJobStore against an in-memory fake database with
the AI stages replaced by stubs, and asserts on what ends up stored, refunded and alerted.

Why: the runner is the part that touches money (AI calls), quota and the user's recording.
It must finish or fail cleanly, refund exactly once, never lose or resurrect a draft, never
exceed its concurrency cap, and stay completely idle when the feature is not switched on.
"""
import asyncio
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi import HTTPException

import tools.storage as storage
from pipeline.models import RecipeData, TranscriptResult
from scripts import capture_jobs_api as api
from scripts.capture_jobs_api import JobDeps, JobRunner
from tests.fakes.jobs_db import new_jobs_db, TABLE
from tools.errors import classify_failure
from tools.jobs import CaptureJobStore, MAX_ATTEMPTS

NO_CREDITS = (
    "Error code: 429 - {'error': {'message': 'You have no credits remaining.', "
    "'type': 'insufficient_quota', 'code': 'credit_balance_exhausted'}}"
)
TRANSCRIPT = TranscriptResult(raw="raw telugu", english="english text")
RECIPE = RecipeData(
    title="Pesarattu", ingredients=[{"item": "moong dal", "quantity": "a little"}], steps=["Soak.", "Grind."],
    cook_notes="until it smells right", review_flags=["maybe a step is missing"],
    transcript_raw="raw telugu", transcript_english="english text", category="Breakfast",
)


class Clock:
    def __init__(self): self.now = datetime(2026, 10, 26, 12, 0, tzinfo=timezone.utc)
    def __call__(self): return self.now
    def advance(self, **kw): self.now += timedelta(**kw)


@dataclass
class World:
    """Everything a test needs: the fake database, the store, the runner and what the deps recorded."""
    db: object
    store: CaptureJobStore
    runner: JobRunner
    clock: Clock
    refunds: list = field(default_factory=list)
    alerts: list = field(default_factory=list)
    moderated: list = field(default_factory=list)


@pytest.fixture(autouse=True)
def _real_storage_helpers_use_the_fake_database():
    yield
    storage._supabase = None


def build_world(*, moderate=None, max_concurrent=3, configured=True):
    db = new_jobs_db()
    storage._supabase = db          # download_stored_audio / delete_stored_audio / attach_generated_image hit this fake
    clock = Clock()
    store = CaptureJobStore(client_factory=lambda: db, clock=clock)
    world = World(db=db, store=store, runner=None, clock=clock)

    def describe(exc, where, user_id):
        failure = classify_failure(exc)
        alert = (failure.kind, f"subject {failure.kind}", f"user {user_id} {exc}") if failure.alert else None
        return failure, alert

    deps = JobDeps(
        require_auth=lambda: {}, user_id_of=lambda u: u.get("sub", ""), enabled_for=lambda u: True,
        configured=lambda: configured,
        validate_audio=lambda *_: None, check_memory_cap=lambda *_: None,
        charge_quota=lambda *_: None, refund_quota=lambda uid: world.refunds.append(uid),
        moderate=moderate or (lambda text: world.moderated.append(text)),
        generate_image=lambda *a, **k: "http://img/generated",
        describe_failure=describe, send_alert=lambda *a: world.alerts.append(a),
        transcription_suffix=lambda s: s,
    )
    world.runner = JobRunner(store, deps, max_concurrent=max_concurrent, autostart=False)
    return world


def queue(world, user="u1", req="r1", language="te", narrator="Lakshmi"):
    world.db.files.setdefault("audio", {})["a.mp3"] = b"AUDIO-BYTES"
    job, _ = world.store.create(user, req, audio_path="a.mp3", language=language, narrator=narrator)
    return job


@pytest.fixture
def stages():
    """Replace the AI stages and file access with stubs; the test sets what they do."""
    state = {"transcribe": lambda path, language: TRANSCRIPT, "transform": lambda t: RECIPE, "heard": []}

    def transcribe(path, language="auto"):
        with open(path, "rb") as f:
            state["heard"].append((f.read(), language, path))
        return state["transcribe"](path, language)

    with patch.object(api, "run_transcribe", side_effect=transcribe), \
         patch.object(api, "run_transform", side_effect=lambda t: state["transform"](t)):
        yield state


def run(world, job):
    asyncio.run(world.runner.run(job["id"]))
    return world.store.get(job["id"])


class TestSuccess:
    def test_the_job_becomes_a_ready_draft_with_every_field_the_review_screen_needs(self, stages):
        world = build_world(); job = queue(world)
        got = run(world, job)
        assert (got["status"], got["stage"], got["error_kind"]) == ("ready", None, None)
        result = got["result"]
        assert result == {
            "title": "Pesarattu", "ingredients": [{"item": "moong dal", "quantity": "a little"}],
            "steps": ["Soak.", "Grind."], "cook_notes": "until it smells right",
            "review_flags": ["maybe a step is missing"], "transcript_raw": "raw telugu",
            "transcript_english": "english text", "category": "Breakfast",
            "image_url": "", "narrator": "Lakshmi",
        }

    def test_the_stored_recording_is_what_gets_transcribed_in_the_users_language(self, stages):
        world = build_world(); job = queue(world, language="te")
        run(world, job)
        audio, language, path = stages["heard"][0]
        assert (audio, language) == (b"AUDIO-BYTES", "te")
        assert path.endswith(".mp3")

    def test_the_temporary_copy_of_the_recording_is_always_removed(self, stages):
        import os
        world = build_world(); job = queue(world)
        run(world, job)
        assert not os.path.exists(stages["heard"][0][2])

    def test_the_transcript_is_safety_checked_before_it_is_structured(self, stages):
        world = build_world(); job = queue(world)
        order = []
        stages["transform"] = lambda t: order.append("transform") or RECIPE
        world.runner.deps = JobDeps(**{**world.runner.deps.__dict__, "moderate": lambda text: order.append(f"moderate:{text}")})
        run(world, job)
        assert order == ["moderate:english text", "transform"]

    def test_it_reports_which_stage_it_is_in(self, stages):
        world = build_world(); job = queue(world)
        seen = []
        stages["transform"] = lambda t: seen.append(world.store.get(job["id"])["stage"]) or RECIPE
        run(world, job)
        assert seen == ["structuring"]

    def test_success_costs_nothing_back(self, stages):
        world = build_world(); job = queue(world)
        run(world, job)
        assert world.refunds == [] and world.alerts == []


class TestFailures:
    def _fail_with(self, stages, error):
        world = build_world(); job = queue(world)
        stages["transcribe"] = lambda path, language: (_ for _ in ()).throw(error)
        return world, run(world, job)

    def test_out_of_credits_fails_the_job_safely_refunds_once_and_tells_the_operator(self, stages):
        world, got = self._fail_with(stages, Exception(NO_CREDITS))
        assert (got["status"], got["error_kind"], got["result"]) == ("failed", "provider_quota", None)
        for leak in ("openai", "credit", "billing", "quota", "http"):
            assert leak not in got["error_message"].lower()
        assert world.refunds == ["u1"]
        assert [a[0] for a in world.alerts] == ["provider_quota"]

    def test_a_busy_provider_refunds_but_does_not_page_anyone(self, stages):
        class Busy(Exception):
            status_code = 429
        world, got = self._fail_with(stages, Busy("Rate limit reached"))
        assert got["error_kind"] == "provider_busy"
        assert world.refunds == ["u1"] and world.alerts == []

    def test_content_the_safety_check_rejects_keeps_its_own_message_and_cannot_be_retried_as_is(self, stages):
        def reject(text):
            raise HTTPException(status_code=400, detail="This recording can't be saved.")
        world = build_world(moderate=reject); job = queue(world)
        got = run(world, job)
        assert (got["status"], got["error_kind"], got["error_message"]) == ("failed", "rejected", "This recording can't be saved.")
        assert world.refunds == ["u1"] and world.alerts == []

    def test_an_unexpected_crash_is_generic_for_the_user_and_alerts_the_operator(self, stages):
        world, got = self._fail_with(stages, KeyError("secret_column"))
        assert got["error_kind"] == "internal" and "secret_column" not in got["error_message"]
        assert [a[0] for a in world.alerts] == ["internal"]

    def test_a_failed_job_keeps_the_recording_so_retry_needs_no_second_upload(self, stages):
        world, got = self._fail_with(stages, Exception(NO_CREDITS))
        assert world.db.files["audio"]["a.mp3"] == b"AUDIO-BYTES"

    def test_the_refund_is_given_once_however_many_times_the_failure_is_recorded(self, stages):
        world = build_world(); job = queue(world)
        failure = classify_failure(KeyError("x"))
        for _ in range(3):
            world.runner._record_failure(job, failure.kind, failure.message, None)
        assert world.refunds == ["u1"]

    def test_each_retry_that_fails_again_is_refunded_for_its_own_charge(self, stages):
        world, got = self._fail_with(stages, Exception(NO_CREDITS))
        world.store.requeue_failed(got["id"], "u1")           # the retry endpoint charges again
        asyncio.run(world.runner.run(got["id"]))
        assert world.refunds == ["u1", "u1"]

    def test_a_missing_recording_fails_the_job_instead_of_hanging_it(self, stages):
        world = build_world(); job = queue(world)
        world.db.files["audio"].clear()
        got = run(world, job)
        assert got["status"] == "failed" and world.refunds == ["u1"]


class TestSafetyAroundTheRun:
    def test_a_job_someone_else_already_claimed_is_left_alone(self, stages):
        world = build_world(); job = queue(world)
        world.store.claim(job["id"])
        asyncio.run(world.runner.run(job["id"]))
        assert stages["heard"] == []

    def test_a_job_discarded_while_it_runs_stays_discarded_and_stores_no_draft(self, stages):
        world = build_world(); job = queue(world)
        def discard_mid_flight(path, language):
            world.store.mark_discarded(job["id"], "u1")
            return TRANSCRIPT
        stages["transcribe"] = discard_mid_flight
        got = run(world, job)
        assert (got["status"], got["result"]) == ("discarded", None)
        assert world.refunds == []

    def test_an_unknown_job_is_ignored(self, stages):
        world = build_world()
        asyncio.run(world.runner.run("does-not-exist"))


class TestConcurrencyCap:
    def test_never_more_than_the_limit_run_at_once_and_all_of_them_finish(self, stages):
        world = build_world(max_concurrent=2)
        jobs = [queue(world, req=f"r{i}") for i in range(5)]
        lock, state = threading.Lock(), {"now": 0, "peak": 0}

        def slow(path, language):
            with lock:
                state["now"] += 1; state["peak"] = max(state["peak"], state["now"])
            time.sleep(0.08)
            with lock:
                state["now"] -= 1
            return TRANSCRIPT
        stages["transcribe"] = slow

        async def go():
            await asyncio.gather(*[world.runner.run(j["id"]) for j in jobs])
        asyncio.run(go())
        assert state["peak"] == 2
        assert {world.store.get(j["id"])["status"] for j in jobs} == {"ready"}


class TestScheduling:
    def test_without_autostart_scheduling_only_records_the_job(self):
        world = build_world(); job = queue(world)
        world.runner.schedule(job["id"])
        assert world.runner.scheduled == [job["id"]]
        assert world.store.get(job["id"])["status"] == "queued"

    def test_with_autostart_the_job_runs_without_the_caller_waiting(self, stages):
        world = build_world(); job = queue(world)
        world.runner.autostart = True

        async def go():
            world.runner.schedule(job["id"])
            await world.runner.wait_idle()
        asyncio.run(go())
        assert world.store.get(job["id"])["status"] == "ready"


class TestRecovery:
    def test_jobs_a_dead_process_left_running_are_queued_again_and_rescheduled(self, stages):
        world = build_world(); job = queue(world)
        world.store.claim(job["id"]); world.clock.advance(minutes=11)
        asyncio.run(world.runner.recover(stale_after_seconds=600))
        assert world.store.get(job["id"])["status"] == "queued"
        assert world.runner.scheduled == [job["id"]]

    def test_jobs_waiting_in_the_queue_are_rescheduled_too(self, stages):
        world = build_world(); job = queue(world)
        asyncio.run(world.runner.recover(stale_after_seconds=600))
        assert world.runner.scheduled == [job["id"]]

    def test_a_job_that_keeps_killing_the_server_is_failed_refunded_and_reported(self, stages):
        world = build_world(); job = queue(world)
        for _ in range(MAX_ATTEMPTS):
            world.store.claim(job["id"]); world.clock.advance(minutes=11)
            asyncio.run(world.runner.recover(stale_after_seconds=600))
        got = world.store.get(job["id"])
        assert (got["status"], got["error_kind"]) == ("failed", "internal")
        assert world.refunds == ["u1"]
        assert [a[0] for a in world.alerts] == ["internal"]


class TestStartup:
    def test_stays_completely_idle_when_the_feature_is_not_configured(self, stages):
        world = build_world(configured=False)
        world.db.fail_tables.add(TABLE)                       # any database access would blow up
        asyncio.run(world.runner.start())
        assert world.runner._maintenance is None

    def test_a_missing_table_does_not_stop_the_server_starting(self, stages):
        world = build_world()
        world.db.missing_tables.add(TABLE)                    # flag turned on before migration 006 was run
        async def go():
            await world.runner.start()
            await world.runner.stop()
        asyncio.run(go())                                     # must not raise

    def test_startup_picks_up_unfinished_work(self, stages):
        world = build_world(); job = queue(world)
        world.store.claim(job["id"]); world.clock.advance(minutes=3)
        async def go():
            await world.runner.start()
            await world.runner.stop()
        asyncio.run(go())
        assert world.runner.scheduled == [job["id"]]


class TestCleanup:
    def _finished(self, world, req, how):
        job = queue(world, req=req)
        world.db.files["audio"][f"{req}.mp3"] = b"x"
        world.db.rows(TABLE)[-1]["audio_path"] = f"{req}.mp3"
        world.store.claim(job["id"])
        if how == "failed":
            world.store.mark_failed(job["id"], "internal", "m")
        else:
            world.store.mark_ready(job["id"], {})
            if how == "saved":
                world.store.mark_saved(job["id"], "tok")
        return job

    def test_old_drafts_lose_their_audio_and_row_but_a_saved_memorys_audio_is_kept(self, stages):
        world = build_world()
        draft = self._finished(world, "draft", "ready"); failed = self._finished(world, "failed", "failed")
        saved = self._finished(world, "saved", "saved")
        world.clock.advance(days=15)
        asyncio.run(world.runner.purge())
        assert set(world.db.files["audio"]) == {"a.mp3", "saved.mp3"}      # the saved memory still plays
        assert world.db.rows(TABLE) == []

    def test_if_storage_refuses_the_draft_rows_stay_so_the_next_sweep_retries(self, stages):
        world = build_world()
        draft = self._finished(world, "draft", "ready"); saved = self._finished(world, "saved", "saved")
        world.clock.advance(days=15)
        world.db.fail_buckets.add("audio")
        asyncio.run(world.runner.purge())
        assert [r["id"] for r in world.db.rows(TABLE)] == [draft["id"]]    # saved row (no audio to delete) is gone

    def test_recent_drafts_are_untouched(self, stages):
        world = build_world(); self._finished(world, "draft", "ready")
        world.clock.advance(days=3)
        asyncio.run(world.runner.purge())
        assert len(world.db.rows(TABLE)) == 1


class TestImageAfterSave:
    def _run(self, world, url):
        world.runner.deps = JobDeps(**{**world.runner.deps.__dict__, "generate_image": lambda *a, **k: url})
        attached = []
        with patch.object(api, "attach_generated_image", side_effect=lambda token, u: attached.append((token, u)) or True):
            async def go():
                world.runner.autostart = True
                world.runner.schedule_image("tok", {"title": "T", "ingredients": [], "steps": [], "cook_notes": ""})
                await world.runner.wait_idle()
            asyncio.run(go())
        return attached

    def test_the_generated_picture_is_attached_to_the_saved_memory(self):
        assert self._run(build_world(), "http://img/1") == [("tok", "http://img/1")]

    def test_no_picture_means_nothing_is_attached(self):
        assert self._run(build_world(), "") == []

    def test_an_image_failure_never_raises(self):
        world = build_world()
        def boom(*a, **k): raise RuntimeError("provider down")
        world.runner.deps = JobDeps(**{**world.runner.deps.__dict__, "generate_image": boom})
        async def go():
            world.runner.autostart = True
            world.runner.schedule_image("tok", {"title": "T", "ingredients": [], "steps": [], "cook_notes": ""})
            await world.runner.wait_idle()
        asyncio.run(go())
