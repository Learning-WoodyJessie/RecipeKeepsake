"""
Purpose: Prove that adding background capture changes nothing for anyone it is not switched on for.

What: runs the real app (scripts.serve) and checks (1) every endpoint that existed before still
has the exact same contract, (2) with the feature off the new endpoints are invisible, (3) the
allowlist and global switch behave, (4) the background machinery stays idle unless configured.

Why: "no regressions" has to be demonstrable, not promised. The golden file is the API surface
that was live in production on 2026-10-26, captured before this feature existed.
"""
import asyncio
import json
import subprocess
import sys
import warnings
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import tools.storage as storage
from scripts.serve import app, require_auth, _job_runner, _job_availability
from tests.fakes.jobs_db import new_jobs_db

ROOT = Path(__file__).resolve().parent.parent
GOLDEN = json.loads((ROOT / "tests/golden/api_surface_2026-10-26.json").read_text())
NEW_ENDPOINTS = {
    "GET /features", "GET /capture/jobs", "POST /capture/jobs", "GET /capture/jobs/{job_id}",
    "POST /capture/jobs/{job_id}/save", "POST /capture/jobs/{job_id}/retry", "DELETE /capture/jobs/{job_id}",
}
_client = TestClient(app)
AUTH = {"Authorization": "Bearer x"}


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("CAPTURE_JOBS_ENABLED", raising=False)
    monkeypatch.delenv("CAPTURE_JOBS_ALLOWLIST", raising=False)
    storage._supabase = new_jobs_db()               # the capture_jobs table exists unless a test says otherwise
    _job_availability.expire()
    yield
    _job_availability.expire()
    app.dependency_overrides.pop(require_auth, None)
    storage._supabase = None


def sign_in(email="me@example.com", sub="u1"):
    app.dependency_overrides[require_auth] = lambda: {"sub": sub, "email": email}


def current_surface() -> dict:
    out = subprocess.run([sys.executable, str(ROOT / "tests/golden/dump_api_surface.py"), str(ROOT)],
                         capture_output=True, text=True, cwd=ROOT, check=True)
    return json.loads(out.stdout)


class TestExistingApiIsUnchanged:
    def test_every_endpoint_that_existed_still_has_exactly_the_same_contract(self):
        now = current_surface()
        missing = sorted(set(GOLDEN) - set(now))
        changed = sorted(k for k in GOLDEN if k in now and now[k] != GOLDEN[k])
        assert missing == [], f"endpoints that disappeared: {missing}"
        assert changed == [], f"endpoints whose contract changed: {changed}"

    def test_the_only_additions_are_the_background_capture_endpoints(self):
        added = set(current_surface()) - set(GOLDEN)
        assert added == NEW_ENDPOINTS


class TestFeatureOff:
    NEW_PATHS = [("get", "/capture/jobs"), ("get", "/capture/jobs/abc"), ("delete", "/capture/jobs/abc"),
                 ("post", "/capture/jobs/abc/retry")]

    def test_features_says_no(self):
        sign_in()
        assert _client.get("/features", headers=AUTH).json() == {"capture_jobs": False}

    @pytest.mark.parametrize("method,path", NEW_PATHS)
    def test_the_new_endpoints_answer_a_plain_json_404(self, method, path):
        sign_in()
        res = getattr(_client, method)(path, headers=AUTH)
        assert res.status_code == 404 and res.json() == {"detail": "Not found"}

    def test_uploading_is_refused_and_nothing_is_touched(self):
        sign_in()
        res = _client.post("/capture/jobs", headers=AUTH, files={"audio": ("a.webm", b"x" * 50, "audio/webm")},
                           data={"client_request_id": "11111111-aaaa-bbbb"})
        assert res.status_code == 404

    def test_the_background_machinery_does_nothing_at_startup(self):
        asyncio.run(_job_runner.start())
        assert _job_runner._maintenance is None


class TestSwitchingItOn:
    def test_the_allowlist_enables_only_the_named_person(self, monkeypatch):
        monkeypatch.setenv("CAPTURE_JOBS_ALLOWLIST", "me@example.com")
        sign_in("me@example.com", "u1")
        assert _client.get("/features", headers=AUTH).json() == {"capture_jobs": True}
        sign_in("someone@else.com", "u2")
        assert _client.get("/features", headers=AUTH).json() == {"capture_jobs": False}

    def test_the_global_switch_enables_everyone(self, monkeypatch):
        monkeypatch.setenv("CAPTURE_JOBS_ENABLED", "true")
        sign_in("anyone@else.com", "u9")
        assert _client.get("/features", headers=AUTH).json() == {"capture_jobs": True}

    def test_switching_it_on_before_the_migration_is_run_keeps_everyone_on_the_original_flow(self, monkeypatch):
        monkeypatch.setenv("CAPTURE_JOBS_ENABLED", "true")
        db = new_jobs_db()
        db.missing_tables.add("capture_jobs")
        storage._supabase = db
        sign_in()
        assert _client.get("/features", headers=AUTH).json() == {"capture_jobs": False}

    def test_an_enabled_user_reaches_the_real_endpoint_not_the_website_catch_all(self, monkeypatch):
        monkeypatch.setenv("CAPTURE_JOBS_ENABLED", "true")
        storage._supabase = new_jobs_db()
        sign_in()
        res = _client.get("/capture/jobs/does-not-exist", headers=AUTH)
        assert res.status_code == 404 and res.json() == {"detail": "Not found"}


class TestAvailabilityIsRememberedBriefly:
    def test_the_cache_serves_repeats_and_can_be_expired(self):
        from scripts.capture_jobs_api import Availability
        calls = []
        now = {"t": 1000.0}
        cache = Availability(lambda: calls.append(1) or True, ttl_seconds=60, clock=lambda: now["t"])
        assert cache.get() is True and cache.get() is True and len(calls) == 1
        now["t"] += 61
        cache.get()
        assert len(calls) == 2
        cache.expire(); cache.get()
        assert len(calls) == 3
