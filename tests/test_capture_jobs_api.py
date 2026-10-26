"""
Purpose: Specify the HTTP behaviour of background capture.

What: mounts the real router on a tiny app with a stand-in login and an in-memory database,
and asserts on responses, stored rows, stored files, charges and refunds.

Why: these endpoints decide who can see a recording, when a user is charged, and whether a
double tap makes two memories. Each of those must be provably right before the flow is
turned on for anyone.
"""
import uuid
from dataclasses import dataclass, field
from unittest.mock import patch

import pytest
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

import tools.storage as storage
from scripts import capture_jobs_api as api
from scripts.capture_jobs_api import JobDeps, JobRunner, build_router
from tests.fakes.jobs_db import new_jobs_db, TABLE
from tools.errors import classify_failure
from tools.jobs import CaptureJobStore


@dataclass
class Env:
    client: TestClient
    db: object
    store: CaptureJobStore
    runner: JobRunner
    charges: list = field(default_factory=list)
    refunds: list = field(default_factory=list)
    images: list = field(default_factory=list)
    disabled: set = field(default_factory=set)
    over_limit: bool = False
    capped: bool = False
    bad_audio: bool = False
    failures: list = field(default_factory=list)
    availability: object = None


def alice(): return {"X-User": "alice"}
def bob(): return {"X-User": "bob"}


@pytest.fixture
def env():
    db = new_jobs_db()
    db.unique["memories"] = [("token",)]
    storage._supabase = db
    store = CaptureJobStore(client_factory=lambda: db)
    holder = {}

    async def auth(x_user: str | None = Header(default=None)):
        if not x_user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return {"sub": x_user, "email": f"{x_user}@example.com", "user_metadata": {"full_name": x_user.title()}}

    def charge(uid):
        if holder["env"].over_limit:
            raise HTTPException(status_code=429, detail="Daily limit reached")
        holder["env"].charges.append(uid)

    def cap(uid):
        if holder["env"].capped:
            raise HTTPException(status_code=403, detail="memory_cap_reached")

    def validate(upload, data):
        if holder["env"].bad_audio:
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
    router_availability = api.Availability(store.is_available, ttl_seconds=60)
    app.include_router(build_router(deps, store, runner, availability=router_availability))
    e = Env(client=TestClient(app), db=db, store=store, runner=runner, availability=router_availability)
    holder["env"] = e
    runner.schedule_image = lambda token, recipe: e.images.append((token, recipe["title"]))

    def fake_upload(local_path, filename, user_id=""):
        with open(local_path, "rb") as f:
            db.files.setdefault("audio", {})[filename] = f.read()
        return filename

    with patch.object(api, "upload_audio", side_effect=fake_upload):
        yield e
    storage._supabase = None


REQ = "11111111-aaaa-bbbb-cccc-000000000001"


def upload(env, headers=None, request_id=REQ, **form):
    return env.client.post(
        "/capture/jobs",
        files={"audio": ("rec.webm", b"RECORDING", "audio/webm")},
        data={"client_request_id": request_id, "language": "te", "narrator": "Lakshmi", **form},
        headers=headers or alice(),
    )


def ready_job(env, user="alice", req=REQ):
    resp = upload(env, headers={"X-User": user}, request_id=req)
    job_id = resp.json()["job"]["id"]
    env.store.claim(job_id)
    env.store.mark_ready(job_id, {
        "title": "Pesarattu", "ingredients": [{"item": "dal"}], "steps": ["Soak"], "cook_notes": "n",
        "review_flags": [], "transcript_raw": "RAW", "transcript_english": "ENGLISH",
        "category": "Breakfast", "image_url": "", "narrator": "Lakshmi",
    })
    return job_id


SAVE = {"title": "My Pesarattu", "narrator": "Lakshmi", "ingredients": [{"item": "dal"}], "steps": ["Soak"],
        "cook_notes": "n", "review_flags": [], "category": "Breakfast"}


class TestWhoMayUseIt:
    ENDPOINTS = [("get", "/features"), ("get", "/capture/jobs"), ("get", "/capture/jobs/x"),
                 ("post", "/capture/jobs/x/save"), ("post", "/capture/jobs/x/retry"), ("delete", "/capture/jobs/x")]

    @pytest.mark.parametrize("method,path", ENDPOINTS)
    def test_signed_out_gets_401(self, env, method, path):
        assert getattr(env.client, method)(path, **({"json": SAVE} if path.endswith("save") else {})).status_code == 401

    @pytest.mark.parametrize("method,path", ENDPOINTS[1:])
    def test_a_user_it_is_not_enabled_for_gets_404_as_if_it_did_not_exist(self, env, method, path):
        env.disabled.add("alice")
        kwargs = {"json": SAVE} if path.endswith("save") else {}
        assert getattr(env.client, method)(path, headers=alice(), **kwargs).status_code == 404

    def test_upload_is_also_hidden_and_nothing_is_stored_or_charged(self, env):
        env.disabled.add("alice")
        assert upload(env).status_code == 404
        assert env.charges == [] and env.db.rows(TABLE) == [] and env.db.files == {}

    def test_features_says_no_when_the_table_does_not_exist_yet_even_if_the_flag_is_on(self, env):
        """The flag can be switched on before migration 006 is run. Users must keep the original flow."""
        env.db.missing_tables.add(TABLE)
        assert env.client.get("/features", headers=alice()).json() == {"capture_jobs": False}

    def test_features_comes_back_on_once_the_table_exists(self, env):
        env.db.missing_tables.add(TABLE)
        assert env.client.get("/features", headers=alice()).json() == {"capture_jobs": False}
        env.db.missing_tables.discard(TABLE)
        env.availability.expire()                       # the answer is remembered briefly; skip the wait
        assert env.client.get("/features", headers=alice()).json() == {"capture_jobs": True}

    def test_the_table_check_is_remembered_rather_than_repeated_on_every_page_load(self, env):
        env.client.get("/features", headers=alice())
        env.client.get("/features", headers=bob())
        env.client.get("/features", headers=alice())
        assert env.availability.checks == 1

    def test_features_reports_the_flag_for_the_caller(self, env):
        env.disabled.add("bob")
        assert env.client.get("/features", headers=alice()).json() == {"capture_jobs": True}
        assert env.client.get("/features", headers=bob()).json() == {"capture_jobs": False}


class TestCreate:
    def test_stores_the_recording_once_charges_once_and_queues_the_job(self, env):
        resp = upload(env)
        assert resp.status_code == 202
        job = resp.json()["job"]
        assert (job["status"], job["language"], job["narrator"]) == ("queued", "te", "Lakshmi")
        row = env.db.rows(TABLE)[0]
        assert env.db.files["audio"][row["audio_path"]] == b"RECORDING"
        assert env.charges == ["alice"]
        assert env.runner.scheduled == [job["id"]]

    def test_the_response_never_exposes_the_owner_or_the_storage_path(self, env):
        job = upload(env).json()["job"]
        for hidden in ("user_id", "audio_path", "attempts", "client_request_id", "quota_refunded", "result"):
            assert hidden not in job

    def test_a_repeated_upload_returns_the_same_job_without_a_second_upload_or_charge(self, env):
        first = upload(env).json()["job"]
        again = upload(env)
        assert again.status_code == 200 and again.json()["job"]["id"] == first["id"]
        assert len(env.db.rows(TABLE)) == 1 and len(env.db.files["audio"]) == 1
        assert env.charges == ["alice"] and len(env.runner.scheduled) == 1

    @pytest.mark.parametrize("bad", ["short", "has spaces in it", "x" * 65, "semi;colon-1234"])
    def test_a_malformed_request_id_is_rejected(self, env, bad):
        assert upload(env, request_id=bad).status_code == 400
        assert env.charges == []

    def test_a_rejected_recording_is_not_charged_or_stored(self, env):
        env.bad_audio = True
        assert upload(env).status_code == 400
        assert env.charges == [] and env.db.rows(TABLE) == [] and env.db.files == {}

    def test_over_the_daily_limit_stores_nothing(self, env):
        env.over_limit = True
        assert upload(env).status_code == 429
        assert env.db.rows(TABLE) == [] and env.db.files == {}

    def test_a_full_account_is_told_so_before_anything_is_charged(self, env):
        env.capped = True
        resp = upload(env)
        assert (resp.status_code, resp.json()["detail"]) == (403, "memory_cap_reached")
        assert env.charges == []

    def test_if_saving_the_recording_fails_the_user_is_refunded_and_told_calmly(self, env):
        with patch.object(api, "upload_audio", side_effect=RuntimeError("bucket exploded: secret internals")):
            resp = upload(env)
        assert resp.status_code == 503 and "secret internals" not in resp.text
        assert env.refunds == ["alice"] and env.db.rows(TABLE) == []

    def test_if_the_job_cannot_be_recorded_the_stored_audio_is_removed_and_the_user_refunded(self, env):
        with patch.object(env.store, "create", side_effect=RuntimeError("insert failed")):
            resp = upload(env)
        assert resp.status_code == 503
        assert env.refunds == ["alice"] and env.db.files["audio"] == {}

    def test_if_the_database_is_down_from_the_start_the_user_gets_a_calm_503_and_nothing_is_charged(self, env):
        env.db.fail_tables.add(TABLE)
        resp = upload(env)
        assert resp.status_code == 503 and "boom" not in resp.text
        assert env.charges == [] and env.db.files == {}


class TestReading:
    def test_each_user_sees_only_their_own_open_jobs(self, env):
        upload(env, headers=alice(), request_id="aaaaaaaa-0001")
        upload(env, headers=bob(), request_id="bbbbbbbb-0001")
        jobs = env.client.get("/capture/jobs", headers=alice()).json()["jobs"]
        assert len(jobs) == 1 and "result" not in jobs[0]

    def test_a_ready_job_lists_its_title_and_opens_with_its_full_draft(self, env):
        job_id = ready_job(env)
        listed = env.client.get("/capture/jobs", headers=alice()).json()["jobs"][0]
        assert (listed["status"], listed["title"]) == ("ready", "Pesarattu")
        opened = env.client.get(f"/capture/jobs/{job_id}", headers=alice()).json()["job"]
        assert opened["result"]["transcript_english"] == "ENGLISH"

    def test_someone_elses_job_is_indistinguishable_from_a_missing_one(self, env):
        job_id = upload(env, headers=alice()).json()["job"]["id"]
        theirs = env.client.get(f"/capture/jobs/{job_id}", headers=bob())
        missing = env.client.get("/capture/jobs/nope", headers=bob())
        assert theirs.status_code == missing.status_code == 404
        assert theirs.json() == missing.json()


class TestSave:
    def _save(self, env, job_id, user="alice", **over):
        return env.client.post(f"/capture/jobs/{job_id}/save", json={**SAVE, **over}, headers={"X-User": user})

    def test_creates_a_memory_that_points_at_the_same_recording_and_remembers_it(self, env):
        job_id = ready_job(env)
        audio_path = env.db.rows(TABLE)[0]["audio_path"]
        resp = self._save(env, job_id)
        assert resp.status_code == 200
        memory = env.db.rows("memories")[0]
        assert resp.json()["token"] == memory["token"]
        assert (memory["title"], memory["narrator"], memory["user_id"], memory["type"]) == ("My Pesarattu", "Lakshmi", "alice", "recipe")
        assert memory["audio_url"] == audio_path and list(env.db.files["audio"]) == [audio_path]   # no copy, no second upload
        assert memory["tags"] == ["Breakfast"] and memory["recorded_by_email"] == "alice@example.com"
        assert env.store.get(job_id)["status"] == "saved"

    def test_transcripts_come_from_the_stored_draft_not_from_the_client(self, env):
        job_id = ready_job(env)
        self._save(env, job_id, transcript_raw="FORGED", transcript_english="FORGED")
        memory = env.db.rows("memories")[0]
        assert (memory["transcript_raw"], memory["transcript_english"]) == ("RAW", "ENGLISH")

    def test_the_picture_is_made_after_saving_in_the_background(self, env):
        job_id = ready_job(env)
        token = self._save(env, job_id).json()["token"]
        assert env.images == [(token, "My Pesarattu")]
        assert env.db.rows("memories")[0]["image_url"] == ""

    def test_saving_twice_returns_the_same_memory_and_creates_one(self, env):
        job_id = ready_job(env)
        first = self._save(env, job_id).json()["token"]
        again = self._save(env, job_id)
        assert again.json()["token"] == first
        assert len(env.db.rows("memories")) == 1 and len(env.images) == 1

    def test_a_save_that_was_interrupted_after_the_memory_existed_still_completes_without_a_duplicate(self, env):
        job_id = ready_job(env)
        token = str(uuid.uuid5(api._MEMORY_TOKEN_NAMESPACE, job_id))
        env.db.rows("memories").append({"id": "m", "token": token, "user_id": "alice", "title": "My Pesarattu"})
        resp = self._save(env, job_id)
        assert resp.status_code == 200 and resp.json()["token"] == token
        assert len(env.db.rows("memories")) == 1
        assert env.store.get(job_id)["status"] == "saved"
        assert env.images == []                       # the earlier attempt already owns the picture

    def test_a_job_that_is_not_ready_cannot_be_saved(self, env):
        job_id = upload(env).json()["job"]["id"]
        assert self._save(env, job_id).status_code == 409
        assert env.db.rows("memories") == []

    def test_someone_elses_job_cannot_be_saved(self, env):
        job_id = ready_job(env)
        assert self._save(env, job_id, user="bob").status_code == 404
        assert env.db.rows("memories") == []

    def test_an_unknown_category_becomes_other_and_the_narrator_falls_back_to_the_upload(self, env):
        job_id = ready_job(env)
        self._save(env, job_id, category="Hacking", narrator="  ")
        memory = env.db.rows("memories")[0]
        assert memory["tags"] == ["Other"] and memory["narrator"] == "Lakshmi"

    def test_a_blank_title_is_refused(self, env):
        job_id = ready_job(env)
        assert self._save(env, job_id, title="").status_code == 422

    def test_a_full_account_cannot_save(self, env):
        job_id = ready_job(env)
        env.capped = True
        assert self._save(env, job_id).status_code == 403
        assert env.store.get(job_id)["status"] == "ready"

    def test_if_the_database_fails_the_user_sees_a_calm_message_and_the_draft_survives_for_another_try(self, env):
        job_id = ready_job(env)
        with patch.object(api, "run_persist_stored", side_effect=RuntimeError("relation memories is broken")):
            resp = self._save(env, job_id)
        assert resp.status_code == 500 and "memories is broken" not in resp.text
        assert env.store.get(job_id)["status"] == "ready"


class TestRetry:
    def _failed(self, env, kind="provider_busy"):
        job_id = upload(env).json()["job"]["id"]
        env.store.claim(job_id); env.store.mark_failed(job_id, kind, "msg")
        env.charges.clear(); env.runner.scheduled.clear()
        return job_id

    def test_a_failed_job_goes_back_in_the_queue_and_is_charged_again(self, env):
        job_id = self._failed(env)
        resp = env.client.post(f"/capture/jobs/{job_id}/retry", headers=alice())
        assert resp.status_code == 200 and resp.json()["job"]["status"] == "queued"
        assert env.charges == ["alice"] and env.runner.scheduled == [job_id]

    def test_a_recording_the_safety_check_refused_cannot_be_retried(self, env):
        job_id = self._failed(env, kind="rejected")
        assert env.client.post(f"/capture/jobs/{job_id}/retry", headers=alice()).status_code == 409
        assert env.charges == []

    def test_only_a_failed_job_can_be_retried_and_nothing_is_charged_for_a_refused_retry(self, env):
        job_id = upload(env).json()["job"]["id"]
        env.charges.clear()
        assert env.client.post(f"/capture/jobs/{job_id}/retry", headers=alice()).status_code == 409
        assert env.charges == []

    def test_over_the_limit_the_job_stays_failed(self, env):
        job_id = self._failed(env)
        env.over_limit = True
        assert env.client.post(f"/capture/jobs/{job_id}/retry", headers=alice()).status_code == 429
        assert env.store.get(job_id)["status"] == "failed"

    def test_someone_elses_job_cannot_be_retried(self, env):
        job_id = self._failed(env)
        assert env.client.post(f"/capture/jobs/{job_id}/retry", headers=bob()).status_code == 404


class TestDiscard:
    def test_removes_the_draft_and_its_recording(self, env):
        job_id = ready_job(env)
        assert env.client.delete(f"/capture/jobs/{job_id}", headers=alice()).status_code == 200
        assert env.store.get(job_id)["status"] == "discarded" and env.db.files["audio"] == {}

    def test_someone_else_cannot_discard_my_draft(self, env):
        job_id = ready_job(env)
        assert env.client.delete(f"/capture/jobs/{job_id}", headers=bob()).status_code == 404
        assert env.store.get(job_id)["status"] == "ready" and len(env.db.files["audio"]) == 1

    def test_a_saved_recording_cannot_be_deleted_this_way_because_a_memory_needs_it(self, env):
        job_id = ready_job(env)
        env.client.post(f"/capture/jobs/{job_id}/save", json=SAVE, headers=alice())
        assert env.client.delete(f"/capture/jobs/{job_id}", headers=alice()).status_code == 404
        assert len(env.db.files["audio"]) == 1

    def test_if_storage_refuses_the_discard_still_succeeds_and_the_sweep_will_retry(self, env):
        job_id = ready_job(env)
        env.db.fail_buckets.add("audio")
        assert env.client.delete(f"/capture/jobs/{job_id}", headers=alice()).status_code == 200
        assert env.store.get(job_id)["status"] == "discarded"
