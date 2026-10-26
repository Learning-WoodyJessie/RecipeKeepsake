"""
Purpose: Walk the whole background-capture journey through the real application.

What: the real app, the real router, runner, store, audio validation and persistence, with an
in-memory database and storage, and only the AI providers stubbed.

Why: the unit tests prove each piece. This proves the pieces fit: upload -> background work ->
review -> save, and the failure path that must leave the recording safe and the quota refunded.
"""
import asyncio
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import tools.storage as storage
from pipeline.models import RecipeData, TranscriptResult
from scripts import capture_jobs_api as api
from scripts.serve import app, require_auth, _job_runner
from tests.fakes.jobs_db import new_jobs_db, TABLE

NO_CREDITS = "Error code: 429 - {'error': {'type': 'insufficient_quota', 'code': 'credit_balance_exhausted'}}"
MP3 = b"ID3" + b"\x00" * 200
RECIPE = RecipeData(
    title="Pesarattu", ingredients=[{"item": "moong dal", "quantity": "a little"}], steps=["Soak", "Grind"],
    cook_notes="until it smells right", review_flags=[], transcript_raw="raw", transcript_english="english",
    category="Breakfast",
)
ME = {"sub": "u1", "email": "me@example.com", "user_metadata": {"full_name": "Me Myself"}}
AUTH = {"Authorization": "Bearer x"}
_client = TestClient(app)


@pytest.fixture
def system(monkeypatch):
    monkeypatch.setenv("CAPTURE_JOBS_ENABLED", "true")
    db = new_jobs_db()
    db.unique["memories"] = [("token",)]
    storage._supabase = db
    app.dependency_overrides[require_auth] = lambda: ME
    monkeypatch.setattr(_job_runner, "autostart", False)       # the test runs the job itself, deterministically
    _job_runner.scheduled.clear()
    charged, refunded = [], []
    with patch("scripts.serve.check_rate_limit_db", side_effect=lambda uid, ep: charged.append((uid, ep)) or 1), \
         patch("scripts.serve.refund_rate_limit_db", side_effect=lambda uid, ep: refunded.append((uid, ep))), \
         patch.object(api, "run_transcribe", return_value=TranscriptResult(raw="raw", english="english")), \
         patch.object(api, "run_transform", return_value=RECIPE), \
         patch("scripts.serve._moderate_transcript"):
        yield db, charged, refunded
    app.dependency_overrides.pop(require_auth, None)
    storage._supabase = None


def upload(request_id="11111111-aaaa-bbbb"):
    return _client.post("/capture/jobs", headers=AUTH, files={"audio": ("rec.mp3", MP3, "audio/mpeg")},
                        data={"client_request_id": request_id, "language": "te", "narrator": "Lakshmi"})


def process_in_background(job_id):
    asyncio.run(_job_runner.run(job_id))


def test_upload_then_background_work_then_review_then_save(system):
    db, charged, refunded = system

    created = upload()
    assert created.status_code == 202
    job_id = created.json()["job"]["id"]
    assert charged == [("u1", "capture")]
    assert _job_runner.scheduled == [job_id]

    # while it works, the user can see it
    assert _client.get("/capture/jobs", headers=AUTH).json()["jobs"][0]["status"] == "queued"

    process_in_background(job_id)

    opened = _client.get(f"/capture/jobs/{job_id}", headers=AUTH).json()["job"]
    assert opened["status"] == "ready"
    assert opened["result"]["title"] == "Pesarattu" and opened["result"]["image_url"] == ""

    saved = _client.post(f"/capture/jobs/{job_id}/save", headers=AUTH, json={
        "title": "Pesarattu (Amma's way)", "narrator": "Lakshmi", "ingredients": opened["result"]["ingredients"],
        "steps": opened["result"]["steps"], "cook_notes": opened["result"]["cook_notes"], "category": "Breakfast"})
    assert saved.status_code == 200

    memory = db.rows("memories")[0]
    assert memory["token"] == saved.json()["token"]
    assert (memory["title"], memory["user_id"], memory["type"]) == ("Pesarattu (Amma's way)", "u1", "recipe")
    assert list(db.files["audio"]) == [memory["audio_url"]]            # one recording, uploaded once, referenced by the memory
    assert _client.get("/capture/jobs", headers=AUTH).json()["jobs"] == []     # no longer an open job
    assert refunded == []


def test_a_provider_outage_leaves_the_recording_safe_refunds_and_offers_retry(system):
    db, charged, refunded = system
    job_id = upload().json()["job"]["id"]

    with patch.object(api, "run_transcribe", side_effect=Exception(NO_CREDITS)), \
         patch("tools.alerts.send_alert") as alert:
        process_in_background(job_id)

    failed = _client.get(f"/capture/jobs/{job_id}", headers=AUTH).json()["job"]
    assert failed["status"] == "failed" and failed["error_kind"] == "provider_quota"
    for leak in ("openai", "credit", "billing", "quota", "429"):
        assert leak not in failed["error_message"].lower()
    assert len(db.files["audio"]) == 1                                  # the recording is still there
    assert refunded == [("u1", "capture")]
    alert.assert_called_once()

    # the retry charges again and the work goes through
    retried = _client.post(f"/capture/jobs/{job_id}/retry", headers=AUTH)
    assert retried.status_code == 200 and charged.count(("u1", "capture")) == 2
    process_in_background(job_id)
    assert _client.get(f"/capture/jobs/{job_id}", headers=AUTH).json()["job"]["status"] == "ready"
    assert len(db.files["audio"]) == 1                                  # still one upload


def test_two_signed_in_people_never_see_each_others_recordings(system):
    db, _, _ = system
    job_id = upload().json()["job"]["id"]
    process_in_background(job_id)
    app.dependency_overrides[require_auth] = lambda: {"sub": "u2", "email": "other@example.com"}
    assert _client.get("/capture/jobs", headers=AUTH).json()["jobs"] == []
    assert _client.get(f"/capture/jobs/{job_id}", headers=AUTH).status_code == 404
    assert _client.delete(f"/capture/jobs/{job_id}", headers=AUTH).status_code == 404
    assert _client.post(f"/capture/jobs/{job_id}/save", headers=AUTH, json={"title": "stolen"}).status_code == 404
    assert db.rows("memories") == [] and len(db.files["audio"]) == 1


def test_a_double_tap_on_upload_makes_one_job_and_one_charge(system):
    db, charged, _ = system
    first, second = upload(), upload()
    assert (first.status_code, second.status_code) == (202, 200)
    assert first.json()["job"]["id"] == second.json()["job"]["id"]
    assert len(db.rows(TABLE)) == 1 and len(charged) == 1
