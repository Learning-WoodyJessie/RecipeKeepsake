"""
Tests for reading memories shared through a family group or a viewer invite.

The listing endpoints (/family/recipes, /viewers/shared-with-me) return
memories owned by other people, but the detail routes used to accept only the
owner. A family member could see a memory in the list and then get a 404 on
tap. These cover the shared predicate that keeps the two in agreement, and
the audio signing that makes a shared memory actually playable.
"""
import os
from unittest.mock import patch

from fastapi.testclient import TestClient

from scripts.serve import app, require_auth

_client = TestClient(app)

_HDR = {"Authorization": "Bearer fake"}


async def _auth_member():
    return {"sub": "member", "email": "member@example.com"}


def _storage_env():
    return patch.dict(os.environ, {
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_KEY": "svc-key",
    })


class TestSharedMemoryDetailAccess:
    """GET /recipe/{token} — who may open a memory they do not own."""

    def teardown_method(self):
        app.dependency_overrides.pop(require_auth, None)

    def test_owner_can_open_own_memory(self):
        recipe = {"token": "t1", "user_id": "member", "title": "Mine"}
        with _storage_env(), \
             patch("tools.storage.get_recipe_by_token", return_value=recipe):
            app.dependency_overrides[require_auth] = _auth_member
            res = _client.get("/recipe/t1", headers=_HDR)
        assert res.status_code == 200
        assert res.json()["title"] == "Mine"

    def test_family_group_member_can_open_shared_memory(self):
        """The bug: listed via /family/recipes, then 404 on open."""
        recipe = {"token": "t1", "user_id": "owner", "title": "Hanuman"}
        with _storage_env(), \
             patch("tools.storage.get_recipe_by_token", return_value=recipe), \
             patch("tools.groups.get_group_for_user", side_effect=[{"id": "g1"}, {"id": "g1"}]):
            app.dependency_overrides[require_auth] = _auth_member
            res = _client.get("/recipe/t1", headers=_HDR)
        assert res.status_code == 200
        assert res.json()["title"] == "Hanuman"

    def test_approved_viewer_can_open_shared_memory(self):
        recipe = {"token": "t1", "user_id": "owner", "title": "Shared"}
        with _storage_env(), \
             patch("tools.storage.get_recipe_by_token", return_value=recipe), \
             patch("tools.groups.get_group_for_user", return_value=None), \
             patch("tools.storage.get_owners_for_viewer", return_value=["owner"]):
            app.dependency_overrides[require_auth] = _auth_member
            res = _client.get("/recipe/t1", headers=_HDR)
        assert res.status_code == 200

    def test_unrelated_user_still_gets_404(self):
        """No group, no invite — must stay hidden, and 404 not 403."""
        recipe = {"token": "t1", "user_id": "owner", "title": "Private"}
        with _storage_env(), \
             patch("tools.storage.get_recipe_by_token", return_value=recipe), \
             patch("tools.groups.get_group_for_user", return_value=None), \
             patch("tools.storage.get_owners_for_viewer", return_value=[]):
            app.dependency_overrides[require_auth] = _auth_member
            res = _client.get("/recipe/t1", headers=_HDR)
        assert res.status_code == 404
        assert "Private" not in res.text

    def test_member_of_a_different_group_gets_404(self):
        recipe = {"token": "t1", "user_id": "owner", "title": "Private"}
        with _storage_env(), \
             patch("tools.storage.get_recipe_by_token", return_value=recipe), \
             patch("tools.groups.get_group_for_user", side_effect=[{"id": "g1"}, {"id": "g2"}]), \
             patch("tools.storage.get_owners_for_viewer", return_value=[]):
            app.dependency_overrides[require_auth] = _auth_member
            res = _client.get("/recipe/t1", headers=_HDR)
        assert res.status_code == 404


class TestSharedMemoryBySlugAccess:
    """GET /recipe/by-slug/{slug} — same predicate as the token route."""

    def teardown_method(self):
        app.dependency_overrides.pop(require_auth, None)

    def test_family_group_member_can_open_by_slug(self):
        recipe = {"slug": "hanuman", "user_id": "owner", "title": "Hanuman"}
        with _storage_env(), \
             patch("tools.storage.get_recipe_by_slug", return_value=recipe), \
             patch("tools.groups.get_group_for_user", side_effect=[{"id": "g1"}, {"id": "g1"}]):
            app.dependency_overrides[require_auth] = _auth_member
            res = _client.get("/recipe/by-slug/hanuman", headers=_HDR)
        assert res.status_code == 200

    def test_unrelated_user_gets_404_by_slug(self):
        recipe = {"slug": "hanuman", "user_id": "owner", "title": "Private"}
        with _storage_env(), \
             patch("tools.storage.get_recipe_by_slug", return_value=recipe), \
             patch("tools.groups.get_group_for_user", return_value=None), \
             patch("tools.storage.get_owners_for_viewer", return_value=[]):
            app.dependency_overrides[require_auth] = _auth_member
            res = _client.get("/recipe/by-slug/hanuman", headers=_HDR)
        assert res.status_code == 404


class TestFamilyRecipesAudioSigning:
    """/family/recipes must sign audio — the bucket is private."""

    def teardown_method(self):
        app.dependency_overrides.pop(require_auth, None)

    def test_audio_urls_are_signed(self):
        rows = [{"token": "t1", "title": "Hanuman", "audio_url": "abc.mp3"}]
        with patch("tools.groups.get_group_for_user", return_value={"id": "g1"}), \
             patch("tools.groups.list_group_recipes", return_value=rows), \
             patch("tools.storage._client"), \
             patch("tools.storage._sign_audio", return_value="https://signed.example/abc.mp3?token=x") as signer:
            app.dependency_overrides[require_auth] = _auth_member
            res = _client.get("/family/recipes", headers=_HDR)
        assert res.status_code == 200
        assert res.json()["recipes"][0]["audio_url"].startswith("https://signed.example/")
        signer.assert_called_once()

    def test_signing_failure_does_not_break_the_listing(self):
        rows = [{"token": "t1", "title": "Hanuman", "audio_url": "abc.mp3"}]
        with patch("tools.groups.get_group_for_user", return_value={"id": "g1"}), \
             patch("tools.groups.list_group_recipes", return_value=rows), \
             patch("tools.storage._client", side_effect=RuntimeError("storage down")):
            app.dependency_overrides[require_auth] = _auth_member
            res = _client.get("/family/recipes", headers=_HDR)
        assert res.status_code == 200
        assert len(res.json()["recipes"]) == 1
