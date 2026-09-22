"""
Tests for GET /public/memory/{shortcode} — the no-auth, per-memory share page.

The full row (get_recipe_by_slug / get_recipe_by_token_prefix) includes
user_id, review_flags, cook_notes, user_notes, and portal_visible — none of
which are meant to be public. This endpoint must only ever return the
safelisted fields, must 404 (not leak) when nothing matches, and must rate
limit per IP since the token is only 8 hex characters.
"""
import os
from unittest.mock import patch

from fastapi.testclient import TestClient

from scripts.serve import app, _public_memory_ip_hits

_client = TestClient(app)


def _storage_env():
    return patch.dict(os.environ, {
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_KEY": "svc-key",
    })


_FULL_ROW = {
    "token": "abc12345xyz",
    "user_id": "owner-123",
    "slug": "dads-song-abc12345",
    "title": "Dad's Song",
    "narrator": "Dad",
    "type": "song",
    "recorded_at": "2026-01-01T00:00:00Z",
    "image_url": "https://x/img.png",
    "audio_url": "https://x/signed-audio.mp3",
    "transcript_raw": "తెలుగు",
    "transcript_english": "Telugu lyrics",
    "ingredients": [],
    "steps": [],
    "cook_notes": "secret family notes",
    "user_notes": "private reminder to self",
    "review_flags": ["possible implied detail"],
    "portal_visible": True,
}

_ALLOWED_KEYS = {
    "token", "slug", "title", "narrator", "type", "recorded_at",
    "image_url", "audio_url", "transcript_raw", "transcript_english",
    "ingredients", "steps",
}


class TestPublicMemoryEndpoint:
    def teardown_method(self):
        _public_memory_ip_hits.clear()

    def test_returns_only_safelisted_fields(self):
        with _storage_env(), patch("tools.storage.get_recipe_by_slug", return_value=dict(_FULL_ROW)):
            res = _client.get("/public/memory/dads-song-abc12345")
        assert res.status_code == 200
        body = res.json()
        assert set(body.keys()) == _ALLOWED_KEYS
        assert body["title"] == "Dad's Song"

    def test_never_leaks_owner_or_private_fields(self):
        with _storage_env(), patch("tools.storage.get_recipe_by_slug", return_value=dict(_FULL_ROW)):
            res = _client.get("/public/memory/dads-song-abc12345")
        body = res.json()
        for leaked in ("user_id", "review_flags", "cook_notes", "user_notes", "portal_visible"):
            assert leaked not in body

    def test_falls_back_to_token_prefix_when_slug_lookup_fails(self):
        with _storage_env(), \
             patch("tools.storage.get_recipe_by_slug", side_effect=Exception("no row")), \
             patch("tools.storage.get_recipe_by_token_prefix", return_value=dict(_FULL_ROW)) as prefix_lookup:
            res = _client.get("/public/memory/memory-abc12345")
        assert res.status_code == 200
        prefix_lookup.assert_called_once_with("abc12345")

    def test_unknown_shortcode_is_a_plain_404_not_an_error(self):
        with _storage_env(), \
             patch("tools.storage.get_recipe_by_slug", side_effect=Exception("no row")), \
             patch("tools.storage.get_recipe_by_token_prefix", side_effect=Exception("no row")):
            res = _client.get("/public/memory/does-not-exist")
        assert res.status_code == 404

    def test_rate_limited_after_60_requests_from_one_ip(self):
        with _storage_env(), patch("tools.storage.get_recipe_by_slug", return_value=dict(_FULL_ROW)):
            headers = {"X-Forwarded-For": "9.9.9.9"}
            for _ in range(60):
                assert _client.get("/public/memory/dads-song-abc12345", headers=headers).status_code == 200
            res = _client.get("/public/memory/dads-song-abc12345", headers=headers)
        assert res.status_code == 429

    def test_rate_limit_is_per_ip_not_global(self):
        with _storage_env(), patch("tools.storage.get_recipe_by_slug", return_value=dict(_FULL_ROW)):
            for _ in range(60):
                _client.get("/public/memory/dads-song-abc12345", headers={"X-Forwarded-For": "1.1.1.1"})
            res = _client.get("/public/memory/dads-song-abc12345", headers={"X-Forwarded-For": "2.2.2.2"})
        assert res.status_code == 200


class TestPublicMemoryPrettyLink:
    """GET /m/{shortcode} — pretty share link. Bots get an OG preview, real
    visitors get redirected to the static /m?code= page that can actually
    exist under this app's Next static export."""

    def teardown_method(self):
        from scripts.serve import _public_memory_ip_hits as hits
        hits.clear()

    def test_real_visitor_is_redirected_to_the_static_query_string_page(self):
        with _storage_env(), patch("tools.storage.get_recipe_by_slug", return_value=dict(_FULL_ROW)):
            res = _client.get("/m/dads-song-abc12345", headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=False)
        assert res.status_code == 302
        assert res.headers["location"].endswith("/m?code=dads-song-abc12345")

    def test_bot_gets_an_og_preview_pointed_at_the_static_page(self):
        with _storage_env(), patch("tools.storage.get_recipe_by_slug", return_value=dict(_FULL_ROW)):
            res = _client.get("/m/dads-song-abc12345", headers={"User-Agent": "WhatsApp/2.0"})
        assert res.status_code == 200
        assert "Dad's Song" in res.text
        assert "/m?code=dads-song-abc12345" in res.text

    def test_unknown_shortcode_redirects_home_instead_of_erroring(self):
        with _storage_env(), \
             patch("tools.storage.get_recipe_by_slug", side_effect=Exception("no row")), \
             patch("tools.storage.get_recipe_by_token_prefix", side_effect=Exception("no row")):
            res = _client.get("/m/does-not-exist", headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=False)
        assert res.status_code == 302
        assert res.headers["location"] == "/"

    def test_also_rate_limited_per_ip(self):
        with _storage_env(), patch("tools.storage.get_recipe_by_slug", return_value=dict(_FULL_ROW)):
            headers = {"User-Agent": "Mozilla/5.0", "X-Forwarded-For": "8.8.8.8"}
            for _ in range(60):
                _client.get("/m/dads-song-abc12345", headers=headers, follow_redirects=False)
            res = _client.get("/m/dads-song-abc12345", headers=headers, follow_redirects=False)
        assert res.status_code == 429
