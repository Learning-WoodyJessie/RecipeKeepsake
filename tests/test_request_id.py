from fastapi.testclient import TestClient
from scripts.serve import app

_client = TestClient(app)


class TestRequestIDMiddleware:
    def test_response_has_x_request_id_header(self):
        """Every response carries X-Request-ID."""
        response = _client.get("/health")
        assert "x-request-id" in response.headers

    def test_request_id_is_8_char_hex(self):
        """X-Request-ID is an 8-character hex string."""
        response = _client.get("/health")
        rid = response.headers["x-request-id"]
        assert len(rid) == 8
        assert all(c in "0123456789abcdef" for c in rid)

    def test_each_request_gets_unique_id(self):
        """Two requests to the same endpoint produce different IDs."""
        r1 = _client.get("/health")
        r2 = _client.get("/health")
        assert r1.headers["x-request-id"] != r2.headers["x-request-id"]
