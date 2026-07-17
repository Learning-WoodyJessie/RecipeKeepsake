"""
Tests for POST /save-text endpoint — paste text, Call A translate, save as memory.
"""
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from scripts.serve import app, require_auth

_client = TestClient(app)

_DUMMY_USER = {"sub": "test-user-id", "email": "test@example.com"}


def _mock_insert(row_dict):
    row_dict.setdefault("id", "abc-123")
    row_dict.setdefault("token", "tok-txt")
    return row_dict


class TestSaveTextEndpoint:
    def test_saves_memory_with_pasted_text_as_transcript_raw(self):
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        inserted = []

        def capture(row):
            inserted.append(row)
            return {**row, "id": "abc", "token": "tok"}

        try:
            with patch("scripts.serve.translate_to_english", return_value="A poem about raja"), \
                 patch("scripts.serve.check_rate_limit_db", return_value=0), \
                 patch("tools.storage.insert_recipe", side_effect=capture), \
                 patch("tools.storage._client"):
                resp = _client.post("/save-text", json={
                    "title": "రాజశేఖర్ కవిత", "text": "రాజశేఖర్", "memory_type": "poem"
                })
            assert resp.status_code == 200
            assert inserted[0]["transcript_raw"] == "రాజశేఖర్"
        finally:
            app.dependency_overrides.clear()

    def test_translation_called_with_pasted_text(self):
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        try:
            with patch("scripts.serve.translate_to_english", return_value="English") as mock_t, \
                 patch("scripts.serve.check_rate_limit_db", return_value=0), \
                 patch("tools.storage.insert_recipe", side_effect=_mock_insert), \
                 patch("tools.storage._client"):
                _client.post("/save-text", json={
                    "title": "Poem", "text": "రాజశేఖర్", "memory_type": "poem"
                })
            assert mock_t.called
            assert mock_t.call_args[0][0] == "రాజశేఖర్"
        finally:
            app.dependency_overrides.clear()

    def test_response_includes_transcript_fields(self):
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        try:
            with patch("scripts.serve.translate_to_english", return_value="English version"), \
                 patch("scripts.serve.check_rate_limit_db", return_value=0), \
                 patch("tools.storage.insert_recipe", side_effect=_mock_insert), \
                 patch("tools.storage._client"):
                resp = _client.post("/save-text", json={
                    "title": "Poem", "text": "పాట", "memory_type": "poem"
                })
            body = resp.json()
            assert body["transcript_raw"] == "పాట"
            assert body["transcript_english"] == "English version"
            assert "token" in body
        finally:
            app.dependency_overrides.clear()

    def test_empty_title_returns_400(self):
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        try:
            with patch("tools.storage._client"):
                resp = _client.post("/save-text", json={
                    "title": "", "text": "పాట", "memory_type": "poem"
                })
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_empty_text_returns_400(self):
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        try:
            with patch("tools.storage._client"):
                resp = _client.post("/save-text", json={
                    "title": "Poem", "text": "", "memory_type": "poem"
                })
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_translation_failure_saves_with_empty_english(self):
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        inserted = []

        def capture(row):
            inserted.append(row)
            return {**row, "id": "abc", "token": "tok"}

        try:
            with patch("scripts.serve.translate_to_english", side_effect=Exception("OpenAI down")), \
                 patch("scripts.serve.check_rate_limit_db", return_value=0), \
                 patch("tools.storage.insert_recipe", side_effect=capture), \
                 patch("tools.storage._client"):
                resp = _client.post("/save-text", json={
                    "title": "Poem", "text": "పాట", "memory_type": "poem"
                })
            assert resp.status_code == 200
            assert inserted[0]["transcript_english"] == ""
        finally:
            app.dependency_overrides.clear()
