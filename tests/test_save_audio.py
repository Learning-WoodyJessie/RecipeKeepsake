"""
Tests for /save-audio endpoint — Chunk A.1: optional Whisper + translate pipeline
for non-recipe memory types when audio is provided without original_text.
"""
import io
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient
from scripts.serve import app, require_auth

_client = TestClient(app)

_DUMMY_USER = {
    "sub": "test-user-id",
    "email": "test@example.com",
    "user_metadata": {"full_name": "Test User"},
}

_MP3_MAGIC = b"\xFF\xFB" + b"\x00" * 100


def _mock_insert(row_dict):
    row_dict.setdefault("id", "abc-123")
    row_dict.setdefault("token", "tok-xyz")
    return row_dict


class TestSaveAudioTranscription:
    def test_audio_with_no_original_text_calls_run_transcribe_for_song(self):
        """When audio is uploaded with no original_text and type=song, run_transcribe is called."""
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        try:
            mock_transcript = MagicMock()
            mock_transcript.raw = "ఒక పాట"
            mock_transcript.english = "A song"

            with patch("scripts.serve.run_transcribe", return_value=mock_transcript) as mock_rt, \
                 patch("scripts.serve.check_rate_limit_db", return_value=0), \
                 patch("tools.storage.upload_audio"), \
                 patch("tools.storage.insert_recipe", side_effect=_mock_insert), \
                 patch("tools.storage._sign_audio", return_value="https://signed.url/audio.mp3"), \
                 patch("tools.storage._client"):
                response = _client.post(
                    "/save-audio",
                    files={"audio": ("test.mp3", io.BytesIO(_MP3_MAGIC), "audio/mpeg")},
                    data={"title": "Lullaby", "memory_type": "song"},
                )

            assert response.status_code == 200
            mock_rt.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    def test_transcript_raw_and_english_populated_from_run_transcribe(self):
        """transcript_raw and transcript_english in insert_recipe come from run_transcribe output."""
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        inserted_rows = []

        def capture_insert(row):
            inserted_rows.append(row)
            return {**row, "id": "abc", "token": "tok"}

        try:
            mock_transcript = MagicMock()
            mock_transcript.raw = "ఒక పాట కూర్చున్నాను"
            mock_transcript.english = "I composed a song"

            with patch("scripts.serve.run_transcribe", return_value=mock_transcript), \
                 patch("scripts.serve.check_rate_limit_db", return_value=0), \
                 patch("tools.storage.upload_audio"), \
                 patch("tools.storage.insert_recipe", side_effect=capture_insert), \
                 patch("tools.storage._sign_audio", return_value="https://signed.url/audio.mp3"), \
                 patch("tools.storage._client"):
                _client.post(
                    "/save-audio",
                    files={"audio": ("test.mp3", io.BytesIO(_MP3_MAGIC), "audio/mpeg")},
                    data={"title": "Lullaby", "memory_type": "song"},
                )

            assert len(inserted_rows) == 1
            assert inserted_rows[0]["transcript_raw"] == "ఒక పాట కూర్చున్నాను"
            assert inserted_rows[0]["transcript_english"] == "I composed a song"
        finally:
            app.dependency_overrides.clear()

    def test_original_text_provided_skips_run_transcribe(self):
        """When original_text is given, run_transcribe is NOT called — user text wins."""
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        try:
            with patch("scripts.serve.run_transcribe") as mock_rt, \
                 patch("scripts.serve.check_rate_limit_db", return_value=0), \
                 patch("tools.storage.upload_audio"), \
                 patch("tools.storage.insert_recipe", side_effect=_mock_insert), \
                 patch("tools.storage._sign_audio", return_value="https://signed.url/audio.mp3"), \
                 patch("tools.storage._client"):
                response = _client.post(
                    "/save-audio",
                    files={"audio": ("test.mp3", io.BytesIO(_MP3_MAGIC), "audio/mpeg")},
                    data={"title": "Lullaby", "original_text": "ఒక పాట", "memory_type": "song"},
                )

            assert response.status_code == 200
            mock_rt.assert_not_called()
        finally:
            app.dependency_overrides.clear()

    def test_response_includes_transcript_fields(self):
        """POST /save-audio response body includes transcript_raw and transcript_english."""
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        try:
            mock_transcript = MagicMock()
            mock_transcript.raw = "ఒక పాట"
            mock_transcript.english = "A song"

            with patch("scripts.serve.run_transcribe", return_value=mock_transcript), \
                 patch("scripts.serve.check_rate_limit_db", return_value=0), \
                 patch("tools.storage.upload_audio"), \
                 patch("tools.storage.insert_recipe", side_effect=_mock_insert), \
                 patch("tools.storage._sign_audio", return_value="https://signed.url/audio.mp3"), \
                 patch("tools.storage._client"):
                response = _client.post(
                    "/save-audio",
                    files={"audio": ("test.mp3", io.BytesIO(_MP3_MAGIC), "audio/mpeg")},
                    data={"title": "Lullaby", "memory_type": "song"},
                )

            assert response.status_code == 200
            body = response.json()
            assert "transcript_raw" in body
            assert "transcript_english" in body
            assert body["transcript_raw"] == "ఒక పాట"
            assert body["transcript_english"] == "A song"
        finally:
            app.dependency_overrides.clear()

    def test_recipe_type_skips_run_transcribe_even_without_original_text(self):
        """memory_type=recipe never auto-transcribes in /save-audio (recipe uses /capture/process)."""
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        try:
            with patch("scripts.serve.run_transcribe") as mock_rt, \
                 patch("scripts.serve.check_rate_limit_db", return_value=0), \
                 patch("tools.storage.upload_audio"), \
                 patch("tools.storage.insert_recipe", side_effect=_mock_insert), \
                 patch("tools.storage._sign_audio", return_value="https://signed.url/audio.mp3"), \
                 patch("tools.storage._client"):
                response = _client.post(
                    "/save-audio",
                    files={"audio": ("test.mp3", io.BytesIO(_MP3_MAGIC), "audio/mpeg")},
                    data={"title": "Biryani", "memory_type": "recipe"},
                )

            assert response.status_code == 200
            mock_rt.assert_not_called()
        finally:
            app.dependency_overrides.clear()
