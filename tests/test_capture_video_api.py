"""
Purpose: Specify the video upload endpoint, the separate path that turns a video into audio.

What: mounts the real router next to the real job router on a tiny app with an in-memory database,
uploads real generated videos, and asserts on responses, stored files, charges, refunds and leftovers.

Why: video is a new way in, not a new pipeline. The tests prove it stores only the sound, charges and
refunds exactly like audio, cleans up after itself, and gives every failure a specific message.
"""
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from unittest.mock import patch

import pytest
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

import tools.storage as storage
from scripts import capture_jobs_api as jobs_api
from scripts import capture_video_api as video_api
from scripts.capture_jobs_api import JobDeps, JobRunner, build_router
from scripts.capture_video_api import Busy, ExtractionSlots, build_video_router
from tests.fakes.jobs_db import new_jobs_db
from tools import video
from tools.errors import classify_failure
from tools.jobs import CaptureJobStore

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg is not installed")

REQ = "11111111-aaaa-bbbb-cccc-000000000001"


def _make(path, *, sound=True, container=None):
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10"]
    if sound:
        cmd += ["-f", "lavfi", "-i", "sine=frequency=440"]
    cmd += ["-t", "2", "-c:v", "mpeg4"] + (["-c:a", "aac"] if sound else [])
    if container:
        cmd += ["-f", container]
    subprocess.run(cmd + [str(path)], check=True)
    return path.read_bytes()


@pytest.fixture(scope="module")
def clips(tmp_path_factory):
    d = tmp_path_factory.mktemp("clips")
    return {
        "mp4": _make(d / "a.mp4"),
        "mov": _make(d / "a.mov", container="mov"),
        "silent": _make(d / "s.mp4", sound=False),
    }


@dataclass
class Env:
    client: TestClient
    db: object
    store: CaptureJobStore
    runner: JobRunner
    charges: list = field(default_factory=list)
    refunds: list = field(default_factory=list)
    disabled: set = field(default_factory=set)
    over_limit: bool = False
    capped: bool = False
    audio_rejected: bool = False
    failures: list = field(default_factory=list)


def alice(): return {"X-User": "alice"}


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))
    db = new_jobs_db()
    db.unique["memories"] = [("token",)]
    storage._supabase = db
    store = CaptureJobStore(client_factory=lambda: db)
    holder = {}

    async def auth(x_user: str | None = Header(default=None)):
        if not x_user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return {"sub": x_user, "email": f"{x_user}@example.com", "user_metadata": {}}

    def charge(uid):
        if holder["env"].over_limit:
            raise HTTPException(status_code=429, detail="Daily limit reached")
        holder["env"].charges.append(uid)

    def cap(uid):
        if holder["env"].capped:
            raise HTTPException(status_code=403, detail="memory_cap_reached")

    def validate(upload, data):
        if holder["env"].audio_rejected:
            raise HTTPException(status_code=400, detail="Unsupported audio format")

    def describe(exc, where, user_id):
        holder["env"].failures.append((where, user_id, str(exc)))
        return classify_failure(exc), None

    deps = JobDeps(
        require_auth=auth, user_id_of=lambda u: u["sub"],
        enabled_for=lambda u: u["sub"] not in holder["env"].disabled, configured=lambda: True,
        validate_audio=validate, check_memory_cap=cap, charge_quota=charge,
        refund_quota=lambda uid: holder["env"].refunds.append(uid),
        moderate=lambda t: None, generate_image=lambda *a, **k: "",
        describe_failure=describe, send_alert=lambda *a: None, transcription_suffix=lambda s: s,
    )
    runner = JobRunner(store, deps, autostart=False)
    app = FastAPI()
    app.include_router(build_router(deps, store, runner))
    app.include_router(build_video_router(deps, store, runner))
    e = Env(client=TestClient(app), db=db, store=store, runner=runner)
    holder["env"] = e

    def fake_upload(local_path, filename, user_id=""):
        with open(local_path, "rb") as f:
            db.files.setdefault("audio", {})[filename] = f.read()
        return filename

    with patch.object(jobs_api, "upload_audio", side_effect=fake_upload):
        yield e
    storage._supabase = None


def send(env, data, name="clip.mp4", request_id=REQ, headers=None, **form):
    return env.client.post(
        "/capture/jobs/video",
        files={"video": (name, data, "video/mp4")},
        data={"client_request_id": request_id, "language": "te", "narrator": "Lakshmi", **form},
        headers=alice() if headers is None else headers,
    )


def stored_audio(env):
    return env.db.files.get("audio", {})


class TestWhoMayUseIt:
    def test_signed_out_people_are_turned_away(self, env, clips):
        assert send(env, clips["mp4"], headers={}).status_code == 401

    def test_someone_without_background_capture_sees_a_plain_404(self, env, clips):
        env.disabled.add("alice")
        res = send(env, clips["mp4"])
        assert res.status_code == 404 and res.json() == {"detail": "Not found"}
        assert env.charges == [] and stored_audio(env) == {}


class TestAVideoBecomesAnAudioJob:
    @pytest.mark.parametrize("kind,name", [("mp4", "clip.mp4"), ("mov", "clip.MOV")])
    def test_accepted_and_queued_exactly_like_an_audio_upload(self, env, clips, kind, name):
        res = send(env, clips[kind], name=name)
        assert res.status_code == 202
        job = res.json()["job"]
        assert job["status"] == "queued" and job["narrator"] == "Lakshmi" and job["language"] == "te"
        assert env.charges == ["alice"] and env.refunds == []
        assert env.runner.scheduled == [job["id"]]

    def test_only_the_sound_is_kept_never_the_video(self, env, clips):
        job = send(env, clips["mp4"]).json()["job"]
        files = stored_audio(env)
        assert len(files) == 1
        (name, content), = files.items()
        assert name.endswith(".mp3")
        assert not video.looks_like_video(content)
        assert len(content) < len(clips["mp4"])
        row = env.store.get(job["id"])
        assert row["audio_path"] == name

    def test_a_repeated_request_returns_the_first_job_without_a_second_charge(self, env, clips):
        first = send(env, clips["mp4"])
        again = send(env, clips["mp4"])
        assert again.status_code == 200
        assert again.json()["job"]["id"] == first.json()["job"]["id"]
        assert env.charges == ["alice"] and len(stored_audio(env)) == 1 and len(env.runner.scheduled) == 1

    def test_a_bad_request_id_is_refused(self, env, clips):
        assert send(env, clips["mp4"], request_id="x y").status_code == 400
        assert env.charges == []


class TestRefusedBeforeAnythingHappens:
    def test_a_file_type_that_is_not_a_phone_video(self, env):
        res = send(env, b"\x00" * 100, name="program.exe")
        assert res.status_code == 400
        assert res.json()["detail"] == "Unsupported file type '.exe'. Upload an MP4, MOV or M4V video."
        assert env.charges == [] and stored_audio(env) == {}

    def test_a_video_extension_on_something_that_is_not_a_video(self, env):
        res = send(env, b"<html>not a video at all</html>" * 10)
        assert res.status_code == 400
        assert res.json()["detail"] == "File does not appear to be a valid video file. Please upload an actual video."
        assert env.charges == [] and stored_audio(env) == {}

    def test_a_video_over_the_limit(self, env, clips, monkeypatch):
        monkeypatch.setenv("VIDEO_MAX_MB", "1")
        res = send(env, clips["mp4"] + b"\x00" * (1100 * 1024))
        assert res.status_code == 413
        assert res.json()["detail"] == "File too large. Maximum size is 1 MB."
        assert env.charges == [] and stored_audio(env) == {}

    def test_the_memory_cap_is_checked_first(self, env, clips):
        env.capped = True
        assert send(env, clips["mp4"]).status_code == 403
        assert env.charges == [] and stored_audio(env) == {}

    def test_the_daily_limit_applies_to_videos_too(self, env, clips):
        env.over_limit = True
        assert send(env, clips["mp4"]).status_code == 429
        assert stored_audio(env) == {}


class TestFailuresAreSpecificAndFree:
    def test_a_video_with_no_sound(self, env, clips):
        res = send(env, clips["silent"])
        assert res.status_code == 400 and res.json()["detail"] == "We couldn't find any sound in this video."
        assert env.charges == ["alice"] and env.refunds == ["alice"]
        assert stored_audio(env) == {} and env.store.list_open("alice") == []

    def test_a_video_ffmpeg_cannot_read(self, env):
        junk = b"\x00\x00\x00\x14ftypmp42" + b"\x01" * 4000
        res = send(env, junk)
        assert res.status_code == 400
        assert res.json()["detail"] == "We couldn't read this video. Please try a different file."
        assert env.refunds == ["alice"] and stored_audio(env) == {}

    def test_ffmpeg_missing_is_our_problem_and_says_so_calmly(self, env, clips):
        with patch.object(video_api.video, "extract_audio", side_effect=video.VideoError("unavailable", video.MSG_UNAVAILABLE)):
            res = send(env, clips["mp4"])
        assert res.status_code == 503 and res.json()["detail"] == "Something went wrong on our side. Please try again."
        assert env.refunds == ["alice"] and env.failures

    def test_a_sound_track_the_audio_checks_reject_is_refunded(self, env, clips):
        env.audio_rejected = True
        res = send(env, clips["mp4"])
        assert res.status_code == 400
        assert env.refunds == ["alice"] and stored_audio(env) == {}

    def test_the_database_failing_after_the_upload_cleans_up_and_refunds(self, env, clips):
        with patch.object(env.store, "create", side_effect=RuntimeError("db down")):
            res = send(env, clips["mp4"])
        assert res.status_code == 503
        assert env.refunds == ["alice"] and env.failures

    def test_too_many_at_once_is_a_calm_try_again_and_free(self, env, clips):
        class Full:
            def hold(self):
                raise Busy()
        app_router = build_video_router(
            env.runner.deps, env.store, env.runner, slots=Full()) if hasattr(env.runner, "deps") else None
        assert app_router is not None
        app = FastAPI()
        app.include_router(app_router)
        res = TestClient(app).post(
            "/capture/jobs/video", headers=alice(),
            files={"video": ("clip.mp4", clips["mp4"], "video/mp4")}, data={"client_request_id": REQ})
        assert res.status_code == 503
        assert res.json()["detail"] == "Our processing is busy right now. Please try again in a minute."
        assert env.refunds == ["alice"] and stored_audio(env) == {}


class TestNothingIsLeftBehind:
    @pytest.mark.parametrize("case", ["ok", "silent", "junk"])
    def test_temporary_files_are_removed(self, env, clips, tmp_path, case):
        data = {"ok": clips["mp4"], "silent": clips["silent"], "junk": b"\x00\x00\x00\x14ftypmp42" + b"\x01" * 4000}[case]
        send(env, data)
        assert list(tmp_path.iterdir()) == []


class TestOnlyAFewVideosAreProcessedAtOnce:
    def test_a_slot_is_held_then_released(self):
        import asyncio

        async def scenario():
            slots = ExtractionSlots(running=1, waiting=0)
            async with slots.hold():
                with pytest.raises(Busy):
                    async with slots.hold():
                        pass
            async with slots.hold():                # released: free again
                pass
        asyncio.run(scenario())

    def test_the_waiting_room_is_bounded(self):
        import asyncio

        async def scenario():
            slots = ExtractionSlots(running=1, waiting=1)
            order = []

            async def worker(tag, hold_for):
                async with slots.hold():
                    order.append(tag)
                    await asyncio.sleep(hold_for)

            first = asyncio.create_task(worker("first", 0.2))
            await asyncio.sleep(0.02)
            second = asyncio.create_task(worker("second", 0))      # waits its turn
            await asyncio.sleep(0.02)
            with pytest.raises(Busy):                              # waiting room is full
                async with slots.hold():
                    pass
            await asyncio.gather(first, second)
            assert order == ["first", "second"]
        asyncio.run(scenario())

    def test_the_defaults_come_from_the_environment(self, monkeypatch):
        monkeypatch.setenv("VIDEO_MAX_CONCURRENT", "2")
        assert video_api.default_slots()._running == 2
        monkeypatch.setenv("VIDEO_MAX_CONCURRENT", "nonsense")
        assert video_api.default_slots()._running == 1
