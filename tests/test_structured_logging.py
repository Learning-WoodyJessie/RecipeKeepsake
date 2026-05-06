import io
import logging
import os
from unittest.mock import patch

from fastapi.testclient import TestClient

from scripts.serve import app, require_auth

_DUMMY_USER = {"sub": "test-user-id", "email": "test@example.com"}


class TestStructuredLogging:
    def test_capture_start_logged_as_json(self, caplog):
        """A failed /capture/process logs event=process_start and event=process_failed."""
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        try:
            with caplog.at_level(logging.INFO, logger="serve"):
                with patch("scripts.serve.run_transcribe", side_effect=Exception("boom")), \
                     patch("scripts.serve.check_rate_limit_db", return_value=0):
                    client = TestClient(app, raise_server_exceptions=False)
                    # Valid M4A magic bytes (ftyp box at offset 4) so the upload
                    # passes file-validation and reaches run_transcribe (which we mock).
                    m4a_magic = b"\x00\x00\x00\x00ftyp" + b"\x00" * 100
                    data = {"audio": ("test.m4a", io.BytesIO(m4a_magic), "audio/mp4")}
                    client.post("/capture/process", files=data)
        finally:
            app.dependency_overrides.clear()
        events = [r.getMessage() for r in caplog.records if r.name == "serve"]
        assert any("event=process_start" in e for e in events)
        assert any("event=process_failed" in e for e in events)
        assert any("error=Exception" in e for e in events)


class TestRequestErrorLogging:
    def test_4xx_logs_request_error_event(self, caplog):
        """Unauthenticated request to protected route logs event=request_error status=401."""
        with caplog.at_level(logging.WARNING, logger="serve"):
            client = TestClient(app, raise_server_exceptions=False)
            client.get("/recipes")  # no auth -> 401
        messages = [r.getMessage() for r in caplog.records if r.name == "serve"]
        assert any("event=request_error" in m and "status=401" in m for m in messages)
