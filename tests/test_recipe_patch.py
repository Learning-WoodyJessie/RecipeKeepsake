"""
Tests for PATCH /recipe/{token} — ownership enforcement.
Mirrors the existing ownership check pattern in DELETE /recipe/{token}
and tests/test_photo_upload.py's TestUploadMemoryPhotoEndpoint.
"""
from unittest.mock import patch

from fastapi.testclient import TestClient

from scripts.serve import app, require_auth

_client = TestClient(app)


async def _auth_u1():
    return {"sub": "u1"}


class TestPatchRecipeEndpoint:
    def teardown_method(self):
        app.dependency_overrides.pop(require_auth, None)

    def test_returns_403_for_wrong_user(self):
        recipe = {"token": "tok1", "user_id": "other_user"}
        with patch("tools.storage.get_recipe_by_token", return_value=recipe), \
             patch("tools.storage.patch_recipe") as mock_patch:
            app.dependency_overrides[require_auth] = _auth_u1
            res = _client.patch(
                "/recipe/tok1",
                json={"title": "Hijacked title"},
                headers={"Authorization": "Bearer fake"},
            )
        assert res.status_code == 403
        mock_patch.assert_not_called()

    def test_owner_can_patch(self):
        recipe = {"token": "tok1", "user_id": "u1"}
        with patch("tools.storage.get_recipe_by_token", return_value=recipe), \
             patch("tools.storage.patch_recipe", return_value={**recipe, "title": "New title"}) as mock_patch:
            app.dependency_overrides[require_auth] = _auth_u1
            res = _client.patch(
                "/recipe/tok1",
                json={"title": "New title"},
                headers={"Authorization": "Bearer fake"},
            )
        assert res.status_code == 200
        mock_patch.assert_called_once()
