"""
Purpose: Lock in four server-hardening fixes from the Oct 2026 architecture review.

What: (1) heavy pipeline work must not freeze the event loop, (2) a failed
capture hands back the user's daily quota, (3) users never see raw provider
errors and the operator is alerted instead, (4) memories with no owner are not
readable or editable by every signed-in user.

How: HTTP-level tests through FastAPI's TestClient (and an async client for the
concurrency test), with every provider call mocked.

Why: A live capture hit OpenAI's "no credits" 429, showed the user the raw
provider message and a billing URL, consumed their daily quota, and nobody
was told. A capture also holds the single web worker for 30-60s.
"""
import asyncio
import time
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import tools.storage as storage_mod
from pipeline.models import RecipeData, TranscriptResult
from scripts.serve import app, require_auth

_client = TestClient(app)
_USER = {"sub": "u1", "email": "u1@example.com"}

# The exact text a real user saw on screen (request id removed).
_OPENAI_NO_CREDITS = (
    "Error code: 429 - {'error': {'message': 'You have no credits remaining. Add credits to "
    "continue using the API at https://platform.openai.com/settings/organization/billing/', "
    "'type': 'insufficient_quota', 'param': None, 'code': 'credit_balance_exhausted'}}"
)

_TRANSCRIPT = TranscriptResult(raw="raw", english="english")
_RECIPE = RecipeData(
    title="Pesarattu", ingredients=[], steps=[], cook_notes="", review_flags=[],
    transcript_raw="raw", transcript_english="english",
)
_AUDIO = {"audio": ("a.webm", b"x" * 200, "audio/webm")}


def _auth():
    app.dependency_overrides[require_auth] = lambda: _USER


@pytest.fixture(autouse=True)
def _env_and_cleanup(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    yield
    app.dependency_overrides.pop(require_auth, None)


def _pipeline_patches(transcribe=None):
    """Everything /capture/process touches, mocked."""
    return [
        patch("scripts.serve._validate_audio_upload"),
        patch("scripts.serve.check_rate_limit_db", return_value=1),
        patch("scripts.serve.run_transcribe", side_effect=transcribe or (lambda *a, **k: _TRANSCRIPT)),
        patch("scripts.serve._moderate_transcript"),
        patch("scripts.serve.run_transform", return_value=_RECIPE),
        patch("scripts.serve._generate_image", return_value=""),
    ]


class _Stack:
    def __init__(self, patches):
        self.patches = patches
        self.mocks = []

    def __enter__(self):
        self.mocks = [p.start() for p in self.patches]
        return self.mocks

    def __exit__(self, *exc):
        for p in self.patches:
            p.stop()


# ── 1. Event loop ─────────────────────────────────────────────────────────────

class TestEventLoopNotBlocked:
    def test_health_answers_while_a_capture_is_running(self):
        """A slow capture must not make every other request wait for it."""
        started = []

        def slow_transcribe(*a, **k):
            started.append(time.perf_counter())
            time.sleep(0.8)          # stands in for 30-60s of transcribe + LLM + DALL-E
            return _TRANSCRIPT

        async def scenario():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
                capture = asyncio.create_task(ac.post(
                    "/capture/process", files=_AUDIO, headers={"Authorization": "Bearer x"}))
                await asyncio.sleep(0.2)                      # capture is now inside the slow step
                health = await ac.get("/health")
                # How long after the slow step began did a plain health check finish?
                lag = time.perf_counter() - started[0]
                cap = await capture
                return health.status_code, lag, cap.status_code

        _auth()
        with _Stack(_pipeline_patches(transcribe=slow_transcribe)), \
             patch("tools.storage._client", return_value=MagicMock()):
            health_status, lag, cap_status = asyncio.run(scenario())

        assert cap_status == 200
        assert health_status == 200
        assert lag < 0.5, f"/health only finished {lag:.2f}s into a 0.8s capture, so the capture blocked the server"


# ── 2. Quota refund ───────────────────────────────────────────────────────────

class TestRefundRateLimit:
    def test_calls_decrement_rpc(self, monkeypatch):
        sb = MagicMock()
        monkeypatch.setattr(storage_mod, "_supabase", sb)
        storage_mod.refund_rate_limit_db("u1", "capture")
        sb.rpc.assert_called_once_with("decrement_rate_limit", {"p_user_id": "u1", "p_endpoint": "capture"})

    def test_never_raises_when_db_is_down(self, monkeypatch):
        sb = MagicMock()
        sb.rpc.side_effect = Exception("db down")
        sb.table.side_effect = Exception("db down")
        monkeypatch.setattr(storage_mod, "_supabase", sb)
        storage_mod.refund_rate_limit_db("u1", "capture")     # must not raise


class TestQuotaContext:
    def test_refunds_when_the_body_raises(self):
        from scripts.serve import _quota
        with patch("scripts.serve.check_rate_limit_db", return_value=1), \
             patch("scripts.serve.refund_rate_limit_db") as refund:
            with pytest.raises(RuntimeError):
                with _quota("u1", "capture", 5):
                    raise RuntimeError("provider blew up")
        refund.assert_called_once_with("u1", "capture")

    def test_keeps_the_charge_on_success(self):
        from scripts.serve import _quota
        with patch("scripts.serve.check_rate_limit_db", return_value=1), \
             patch("scripts.serve.refund_rate_limit_db") as refund:
            with _quota("u1", "capture", 5):
                pass
        refund.assert_not_called()

    def test_over_limit_raises_429_and_does_not_refund(self):
        from scripts.serve import _quota
        with patch("scripts.serve.check_rate_limit_db", return_value=6), \
             patch("scripts.serve.refund_rate_limit_db") as refund:
            with pytest.raises(HTTPException) as exc:
                with _quota("u1", "capture", 5):
                    pass
        assert exc.value.status_code == 429
        refund.assert_not_called()

    def test_refund_happens_only_once(self):
        from scripts.serve import _quota
        with patch("scripts.serve.check_rate_limit_db", return_value=1), \
             patch("scripts.serve.refund_rate_limit_db") as refund:
            with _quota("u1", "capture", 5) as charge:
                charge.refund()
                charge.refund()
        refund.assert_called_once()


class TestCaptureRefundsOnFailure:
    def test_failed_capture_gives_the_quota_back(self):
        _auth()
        boom = lambda *a, **k: (_ for _ in ()).throw(Exception(_OPENAI_NO_CREDITS))
        with _Stack(_pipeline_patches(transcribe=boom)), \
             patch("scripts.serve.refund_rate_limit_db") as refund, \
             patch("tools.alerts.send_alert"):
            res = _client.post("/capture/process", files=_AUDIO, headers={"Authorization": "Bearer x"})
        assert res.status_code == 503
        refund.assert_called_once_with("u1", "capture")

    def test_successful_capture_keeps_the_charge(self):
        _auth()
        with _Stack(_pipeline_patches()), patch("scripts.serve.refund_rate_limit_db") as refund:
            res = _client.post("/capture/process", files=_AUDIO, headers={"Authorization": "Bearer x"})
        assert res.status_code == 200
        refund.assert_not_called()

    def test_english_translate_is_not_charged(self):
        """English comes straight from the row; it must not eat the daily translate quota."""
        _auth()
        recipe = {"token": "t1", "user_id": "u1", "title": "T", "ingredients": [], "steps": [], "cook_notes": ""}
        with patch("scripts.serve.check_rate_limit_db", return_value=1), \
             patch("scripts.serve.refund_rate_limit_db") as refund, \
             patch("tools.storage.get_recipe_by_token", return_value=recipe), \
             patch.dict("os.environ", {"SUPABASE_URL": "http://x", "SUPABASE_SERVICE_KEY": "k"}):
            res = _client.get("/recipe/t1/translate?lang=en", headers={"Authorization": "Bearer x"})
        assert res.status_code == 200
        refund.assert_called_once_with("u1", "translate")


# ── 3. Error messages and operator alerts ─────────────────────────────────────

class TestClassifyFailure:
    def _classify(self, exc):
        from tools.errors import classify_failure
        return classify_failure(exc)

    def test_openai_no_credits_is_a_503_with_an_alert(self):
        f = self._classify(Exception(_OPENAI_NO_CREDITS))
        assert f.status_code == 503
        assert f.alert is True
        assert f.kind == "provider_quota"

    def test_bad_provider_key_is_a_503_with_an_alert(self):
        class AuthErr(Exception):
            status_code = 401
        f = self._classify(AuthErr("Incorrect API key provided: sk-abc"))
        assert (f.status_code, f.alert, f.kind) == (503, True, "provider_auth")

    def test_busy_provider_asks_the_user_to_retry_without_paging_anyone(self):
        class Busy(Exception):
            status_code = 429
        f = self._classify(Busy("Rate limit reached for gpt-4o in organization org-123"))
        assert (f.status_code, f.alert, f.kind) == (503, False, "provider_busy")

    def test_unreadable_audio_is_a_422_the_user_can_act_on_and_nobody_is_paged(self):
        f = self._classify(RuntimeError("Gemini (gemini-2.5-flash) returned empty transcription, possible content filter"))
        assert (f.status_code, f.alert, f.kind) == (422, False, "unreadable_audio")
        assert "different file" in f.message

    def test_unknown_error_is_a_generic_500_that_alerts(self):
        f = self._classify(KeyError("secret_column_name"))
        assert (f.status_code, f.alert, f.kind) == (500, True, "internal")

    @pytest.mark.parametrize("exc", [
        Exception(_OPENAI_NO_CREDITS),
        KeyError("secret_column_name"),
        RuntimeError("Gemini (gemini-2.5-flash) returned empty transcription"),
        RuntimeError("Gemini (gemini-2.5-flash) refused transcription (likely copyright/safety filter)"),
    ])
    def test_user_message_never_leaks_internals(self, exc):
        message = self._classify(exc).message.lower()
        for leak in ("openai", "gemini", "billing", "credit", "quota", "http", "secret_column", "traceback", "supabase"):
            assert leak not in message


class TestCaptureErrorResponse:
    def _fail_capture(self, error):
        _auth()
        boom = lambda *a, **k: (_ for _ in ()).throw(error)
        with _Stack(_pipeline_patches(transcribe=boom)), \
             patch("scripts.serve.refund_rate_limit_db"), \
             patch("tools.alerts.send_alert") as alert:
            res = _client.post("/capture/process", files=_AUDIO, headers={"Authorization": "Bearer x"})
        return res, alert

    def test_user_gets_a_friendly_message_not_the_provider_text(self):
        res, _ = self._fail_capture(Exception(_OPENAI_NO_CREDITS))
        detail = res.json()["detail"].lower()
        assert res.status_code == 503
        for leak in ("openai", "billing", "credit", "429", "insufficient_quota", "platform."):
            assert leak not in detail

    def test_operator_is_alerted_about_exhausted_credits(self):
        res, alert = self._fail_capture(Exception(_OPENAI_NO_CREDITS))
        alert.assert_called_once()
        key, subject, body = alert.call_args.args
        assert "provider_quota" in key
        assert "u1" in body                      # which user hit it
        assert "insufficient_quota" in body      # the real cause, for the operator only

    def test_unexpected_crash_is_generic_500_and_alerts(self):
        res, alert = self._fail_capture(KeyError("secret_column_name"))
        assert res.status_code == 500
        assert "secret_column_name" not in res.text
        alert.assert_called_once()

    def test_busy_provider_does_not_page_the_operator(self):
        class Busy(Exception):
            status_code = 429
        res, alert = self._fail_capture(Busy("Rate limit reached for gpt-4o"))
        assert res.status_code == 503
        alert.assert_not_called()

    def test_moderation_rejection_stays_a_400_and_is_not_turned_into_a_500(self):
        """_moderate_transcript raises HTTPException inside the pipeline; it must reach the user as-is."""
        _auth()
        reject = HTTPException(status_code=400, detail="This recording can't be saved.")
        with _Stack(_pipeline_patches()) as mocks, patch("scripts.serve.refund_rate_limit_db") as refund, \
             patch("tools.alerts.send_alert") as alert:
            mocks[3].side_effect = reject        # _moderate_transcript
            res = _client.post("/capture/process", files=_AUDIO, headers={"Authorization": "Bearer x"})
        assert res.status_code == 400
        assert res.json()["detail"] == "This recording can't be saved."
        refund.assert_called_once()              # the user got nothing, so the quota comes back
        alert.assert_not_called()

    def test_expected_http_errors_pass_through_unchanged(self):
        """Validation (400), limits (429) and permission (403) messages are for the user."""
        _auth()
        def reject(*a, **k):
            raise HTTPException(status_code=400, detail="Unsupported audio format")
        with _Stack(_pipeline_patches()) as mocks, \
             patch("scripts.serve.refund_rate_limit_db"):
            mocks[0].side_effect = reject        # _validate_audio_upload
            res = _client.post("/capture/process", files=_AUDIO, headers={"Authorization": "Bearer x"})
        assert res.status_code == 400
        assert res.json()["detail"] == "Unsupported audio format"


# ── 4. Memories with no owner ─────────────────────────────────────────────────

_OWNERLESS = {"token": "old1", "user_id": None, "title": "Ragi Dosa"}


class TestOwnerlessMemories:
    def test_cannot_be_edited_by_a_signed_in_user(self):
        _auth()
        with patch("tools.storage.get_recipe_by_token", return_value=_OWNERLESS), \
             patch("tools.storage.patch_recipe") as patch_fn, \
             patch.dict("os.environ", {"SUPABASE_URL": "http://x", "SUPABASE_SERVICE_KEY": "k"}):
            res = _client.patch("/recipe/old1", json={"title": "Hijacked"}, headers={"Authorization": "Bearer x"})
        assert res.status_code == 403
        patch_fn.assert_not_called()

    def test_cannot_be_deleted_by_a_signed_in_user(self):
        _auth()
        with patch("tools.storage.get_recipe_by_token", return_value=_OWNERLESS), \
             patch("tools.storage.delete_recipe") as delete_fn, \
             patch.dict("os.environ", {"SUPABASE_URL": "http://x", "SUPABASE_SERVICE_KEY": "k"}):
            res = _client.delete("/recipe/old1", headers={"Authorization": "Bearer x"})
        assert res.status_code == 403
        delete_fn.assert_not_called()

    def test_cannot_be_read_by_a_signed_in_user(self):
        _auth()
        with patch("tools.storage.get_recipe_by_token", return_value=_OWNERLESS), \
             patch.dict("os.environ", {"SUPABASE_URL": "http://x", "SUPABASE_SERVICE_KEY": "k"}):
            res = _client.get("/recipe/old1", headers={"Authorization": "Bearer x"})
        assert res.status_code == 404

    def test_cannot_be_translated_by_a_signed_in_user(self):
        _auth()
        with patch("scripts.serve.check_rate_limit_db", return_value=1), \
             patch("scripts.serve.refund_rate_limit_db"), \
             patch("tools.storage.get_recipe_by_token", return_value=_OWNERLESS), \
             patch.dict("os.environ", {"SUPABASE_URL": "http://x", "SUPABASE_SERVICE_KEY": "k"}):
            res = _client.get("/recipe/old1/translate?lang=en", headers={"Authorization": "Bearer x"})
        assert res.status_code == 404

    def test_a_user_with_no_id_never_matches_an_ownerless_row(self):
        from scripts.serve import _owns
        assert _owns({"user_id": None}, "") is False
        assert _owns({"user_id": ""}, "") is False
        assert _owns({"user_id": "u1"}, "") is False

    def test_the_real_owner_still_works(self):
        from scripts.serve import _owns
        assert _owns({"user_id": "u1"}, "u1") is True
        assert _owns({"user_id": "u1"}, "u2") is False
