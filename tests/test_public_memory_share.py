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

import pytest
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


BROWSER = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
}
WHATSAPP = {"Accept": "text/html,application/xhtml+xml", "User-Agent": "WhatsApp/2.23.20 A"}


@pytest.fixture
def static_site(tmp_path, monkeypatch):
    """A stand-in for frontend/out. _SpaMiddleware answers browser navigations
    from these files BEFORE any route runs, and falls back to the landing page
    for any path with no file — which is what swallowed /m/{shortcode}."""
    for rel, marker in {
        "index.html": "LANDING-PAGE",
        "m/index.html": "PUBLIC-MEMORY-PAGE",
        "memory/index.html": "MEMORY-APP-PAGE",
    }.items():
        f = tmp_path / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(f"<html>{marker}</html>")
    monkeypatch.setattr("scripts.serve._FRONTEND_OUT", tmp_path)
    monkeypatch.setenv("NEXT_PUBLIC_APP_URL", "http://testserver")
    _public_memory_ip_hits.clear()
    return tmp_path


class TestRealBrowserNavigation:
    """The earlier tests sent no Accept header, so they skipped _SpaMiddleware
    and passed while every real browser was handed the landing page — a
    signed-in user bounced to /home, a signed-out one saw the sign-in screen.
    These send what a browser actually sends."""

    def test_a_browser_opening_the_pretty_link_is_redirected_not_given_the_landing_page(self, static_site):
        with _storage_env(), patch("tools.storage.get_recipe_by_slug", return_value=dict(_FULL_ROW)):
            res = _client.get("/m/dads-song-abc12345", headers=BROWSER, follow_redirects=False)
        assert res.status_code == 302
        assert res.headers["location"].endswith("/m?code=dads-song-abc12345")
        assert "LANDING-PAGE" not in res.text

    def test_following_the_redirect_lands_on_the_public_memory_page(self, static_site):
        with _storage_env(), patch("tools.storage.get_recipe_by_slug", return_value=dict(_FULL_ROW)):
            res = _client.get("/m/dads-song-abc12345", headers=BROWSER, follow_redirects=True)
        assert res.status_code == 200
        assert "PUBLIC-MEMORY-PAGE" in res.text

    def test_a_trailing_slash_does_not_fall_through_to_the_landing_page(self, static_site):
        with _storage_env(), patch("tools.storage.get_recipe_by_slug", return_value=dict(_FULL_ROW)):
            res = _client.get("/m/dads-song-abc12345/", headers=BROWSER, follow_redirects=True)
        assert "LANDING-PAGE" not in res.text

    def test_a_chat_app_crawler_still_gets_the_link_preview(self, static_site):
        with _storage_env(), patch("tools.storage.get_recipe_by_slug", return_value=dict(_FULL_ROW)):
            res = _client.get("/m/dads-song-abc12345", headers=WHATSAPP, follow_redirects=False)
        assert res.status_code == 200
        assert "og:title" in res.text and "Dad's Song" in res.text
        assert "LANDING-PAGE" not in res.text

    def test_an_unknown_link_in_a_browser_goes_home_instead_of_hanging(self, static_site):
        with _storage_env(), \
             patch("tools.storage.get_recipe_by_slug", side_effect=Exception("no row")), \
             patch("tools.storage.get_recipe_by_token_prefix", side_effect=Exception("no row")):
            res = _client.get("/m/nothing-here-00000000", headers=BROWSER, follow_redirects=False)
        assert res.status_code == 302 and res.headers["location"] == "/"

    def test_the_public_page_itself_is_still_served_to_browsers(self, static_site):
        res = _client.get("/m?code=dads-song-abc12345", headers=BROWSER)
        assert res.status_code == 200 and "PUBLIC-MEMORY-PAGE" in res.text

    def test_the_existing_memory_page_rewrite_is_unchanged(self, static_site):
        res = _client.get("/memory/some-slug-12345678", headers=BROWSER)
        assert res.status_code == 200 and "MEMORY-APP-PAGE" in res.text

    def test_api_style_requests_without_the_browser_accept_header_still_reach_the_route(self, static_site):
        with _storage_env(), patch("tools.storage.get_recipe_by_slug", return_value=dict(_FULL_ROW)):
            res = _client.get("/public/memory/dads-song-abc12345")
        assert res.status_code == 200 and res.json()["title"] == "Dad's Song"
