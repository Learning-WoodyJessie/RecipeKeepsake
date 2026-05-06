from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from scripts.serve import app


class TestHealthEndpoint:
    def test_returns_ok_when_db_reachable(self):
        """GET /health returns 200 + {"status": "ok"} when Supabase is reachable."""
        mock_result = MagicMock()
        mock_result.data = [{"id": "abc"}]
        with patch("tools.storage._client") as mock_client:
            mock_client.return_value.table.return_value.select.return_value \
                .limit.return_value.execute.return_value = mock_result
            response = TestClient(app).get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert response.json()["db"] == "ok"

    def test_returns_503_when_db_unreachable(self):
        """GET /health returns 503 when Supabase raises an exception."""
        with patch("tools.storage._client") as mock_client:
            mock_client.return_value.table.return_value.select.return_value \
                .limit.return_value.execute.side_effect = Exception("connection refused")
            response = TestClient(app).get("/health")
        assert response.status_code == 503
        assert response.json()["status"] == "degraded"

    def test_returns_version_field(self):
        """GET /health includes a version field."""
        mock_result = MagicMock()
        mock_result.data = [{"id": "abc"}]
        with patch("tools.storage._client") as mock_client:
            mock_client.return_value.table.return_value.select.return_value \
                .limit.return_value.execute.return_value = mock_result
            response = TestClient(app).get("/health")
        assert "version" in response.json()
