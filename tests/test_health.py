import logging
import os
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from scripts.serve import app

_client = TestClient(app)


class TestHealthEndpoint:
    def test_returns_ok_when_db_reachable(self):
        """GET /health returns 200 + {"status": "ok"} when Supabase is reachable."""
        mock_result = MagicMock()
        mock_result.data = [{"id": "abc"}]
        with patch("tools.storage._client") as mock_client:
            mock_client.return_value.table.return_value.select.return_value \
                .limit.return_value.execute.return_value = mock_result
            response = _client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert response.json()["db"] == "ok"

    def test_returns_503_when_db_unreachable(self):
        """GET /health returns 503 when Supabase raises an exception."""
        with patch("tools.storage._client") as mock_client:
            mock_client.return_value.table.return_value.select.return_value \
                .limit.return_value.execute.side_effect = Exception("connection refused")
            response = _client.get("/health")
        assert response.status_code == 503
        assert response.json()["status"] == "degraded"

    def test_returns_version_field(self):
        """GET /health includes a version field."""
        mock_result = MagicMock()
        mock_result.data = [{"id": "abc"}]
        with patch("tools.storage._client") as mock_client:
            mock_client.return_value.table.return_value.select.return_value \
                .limit.return_value.execute.return_value = mock_result
            response = _client.get("/health")
        assert "version" in response.json()


class TestAdminClearCache:
    def test_rejects_wrong_secret(self):
        """POST /admin/clear-translation-cache returns 403 with wrong secret."""
        with patch.dict(os.environ, {"ADMIN_SECRET": "correct-secret"}):
            response = _client.post(
                "/admin/clear-translation-cache?lang=te&secret=wrong"
            )
        assert response.status_code == 403

    def test_clears_cache_with_correct_secret(self):
        """POST /admin/clear-translation-cache calls clear_translation_cache and returns count."""
        with patch.dict(os.environ, {"ADMIN_SECRET": "correct-secret"}), \
             patch("tools.storage.clear_translation_cache", return_value=7) as mock_clear:
            response = _client.post(
                "/admin/clear-translation-cache?lang=te&secret=correct-secret"
            )
        assert response.status_code == 200
        assert response.json()["cleared"] == 7
        mock_clear.assert_called_once_with("te")

    def test_missing_secret_env_returns_503(self):
        """POST /admin/clear-translation-cache returns 503 if ADMIN_SECRET not configured."""
        env_without_admin = {k: v for k, v in os.environ.items() if k != "ADMIN_SECRET"}
        with patch.dict(os.environ, env_without_admin, clear=True):
            response = _client.post(
                "/admin/clear-translation-cache?lang=te&secret=anything"
            )
        assert response.status_code == 503


class TestClientErrorEndpoint:
    def test_logs_client_error_and_returns_ok(self, caplog):
        """POST /client-error logs event=client_error and returns {ok: true}."""
        with caplog.at_level(logging.ERROR, logger="serve"):
            response = _client.post(
                "/client-error",
                json={"error": "Cannot read properties of null", "url": "/memories"},
            )
        assert response.status_code == 200
        assert response.json()["ok"] is True
        messages = [r.getMessage() for r in caplog.records if r.name == "serve"]
        assert any("event=client_error" in m for m in messages)
