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


# ── Chunk 1.3 — POST /memories/{token}/photo endpoint ────────────────────────

class TestUploadMemoryPhotoEndpoint:
    def teardown_method(self):
        app.dependency_overrides.pop(require_auth, None)

    def test_happy_path_returns_image_url(self):
        recipe = {"token": "tok1", "user_id": "u1", "image_url": None, "audio_url": None}
        with patch("tools.storage._client", return_value=MagicMock()) as mock_client_fn, \
             patch("scripts.serve.check_rate_limit_db"):
            mock_sb = MagicMock()
            mock_sb.table("recipes").select("*").eq("token", "tok1").single().execute.return_value = \
                MagicMock(data=recipe)
            mock_sb.table("recipes").update({"image_url": "https://sb.io/photo.jpg"}).eq("token", "tok1").execute.return_value = \
                MagicMock(data=[recipe])
            mock_sb.storage.from_("memory-photos").upload.return_value = None
            mock_sb.storage.from_("memory-photos").get_public_url.return_value = "https://sb.io/photo.jpg"
            mock_client_fn.return_value = mock_sb
            app.dependency_overrides[require_auth] = _auth_u1
            client = TestClient(app)
            res = client.post(
                "/memories/tok1/photo",
                files={"photo": ("dish.jpg", JPEG, "image/jpeg")},
                headers={"Authorization": "Bearer fake"},
            )
        assert res.status_code == 200
        assert res.json()["image_url"] == "https://sb.io/photo.jpg"

    def test_returns_403_for_wrong_user(self):
        recipe = {"token": "tok1", "user_id": "other_user", "image_url": None, "audio_url": None}
        with patch("tools.storage._client") as mock_client_fn, \
             patch("scripts.serve.check_rate_limit_db"):
            mock_sb = MagicMock()
            mock_sb.table("recipes").select("*").eq("token", "tok1").single().execute.return_value = \
                MagicMock(data=recipe)
            mock_client_fn.return_value = mock_sb
            app.dependency_overrides[require_auth] = _auth_u1
            client = TestClient(app)
            res = client.post(
                "/memories/tok1/photo",
                files={"photo": ("dish.jpg", JPEG, "image/jpeg")},
                headers={"Authorization": "Bearer fake"},
            )
        assert res.status_code == 403

    def test_returns_404_when_token_not_found(self):
        with patch("tools.storage._client") as mock_client_fn, \
             patch("scripts.serve.check_rate_limit_db"):
            mock_sb = MagicMock()
            mock_sb.table("recipes").select("*").eq("token", "bad").single().execute.side_effect = \
                Exception("not found")
            mock_client_fn.return_value = mock_sb
            app.dependency_overrides[require_auth] = _auth_u1
            client = TestClient(app)
            res = client.post(
                "/memories/bad/photo",
                files={"photo": ("dish.jpg", JPEG, "image/jpeg")},
                headers={"Authorization": "Bearer fake"},
            )
        assert res.status_code == 404


# ── Chunk 1.2 — upload_memory_photo ──────────────────────────────────────────

class TestUploadMemoryPhoto:
    def test_uploads_to_memory_photos_bucket(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.storage.from_("memory-photos").get_public_url.return_value = "https://sb.io/photo.jpg"
        monkeypatch.setattr("tools.storage._client", lambda: mock_sb)

        from tools.storage import upload_memory_photo
        url = upload_memory_photo(b"\xff\xd8\xff", "image/jpeg")

        mock_sb.storage.from_("memory-photos").upload.assert_called_once()
        assert url == "https://sb.io/photo.jpg"

    def test_raises_on_storage_error(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.storage.from_("memory-photos").upload.side_effect = Exception("Storage down")
        monkeypatch.setattr("tools.storage._client", lambda: mock_sb)

        from tools.storage import upload_memory_photo
        with pytest.raises(Exception, match="Storage down"):
            upload_memory_photo(b"\xff\xd8\xff", "image/jpeg")


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
