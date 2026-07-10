"""
Tests for POST /memories/{token}/photo — image validation, storage upload, and endpoint behaviour.
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from scripts.serve import app, require_auth

JPEG = b"\xff\xd8\xff" + b"\x00" * 100
PNG  = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
WEBP = b"RIFF" + b"\x00" * 100


async def _auth_u1():
    return {"sub": "u1"}

async def _auth_u2():
    return {"sub": "u2"}


# ── Chunk 1.1 — _validate_image_upload ────────────────────────────────────────

class TestValidateImageUpload:
    def _post(self, filename, data, content_type="image/jpeg", user_fn=_auth_u1):
        app.dependency_overrides[require_auth] = user_fn
        try:
            with patch("tools.storage._client"), \
                 patch("scripts.serve.check_rate_limit_db"):
                client = TestClient(app)
                return client.post(
                    "/memories/tok1/photo",
                    files={"photo": (filename, data, content_type)},
                    headers={"Authorization": "Bearer fake"},
                )
        finally:
            app.dependency_overrides.pop(require_auth, None)

    def test_rejects_non_image_extension(self):
        res = self._post("evil.exe", JPEG, "application/octet-stream")
        assert res.status_code == 400

    def test_rejects_oversized_file(self):
        big = b"\xff\xd8\xff" + b"\x00" * (6 * 1024 * 1024)
        res = self._post("big.jpg", big)
        assert res.status_code == 413

    def test_rejects_non_image_magic_bytes(self):
        res = self._post("fake.jpg", b"PK\x03\x04" + b"\x00" * 100)
        assert res.status_code == 400
