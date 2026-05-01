from unittest.mock import patch
from scripts.capture import capture, process_recipe

_STRUCTURED = {
    "dish_name": "Pesarattu",
    "ingredients": [{"item": "moong dal", "quantity": "1 cup"}],
    "steps": ["Soak moong dal.", "Grind to batter."],
    "cook_notes": "Add oil until it smells right.",
    "review_flags": [],
}
_STORED = {
    **_STRUCTURED,
    "id": "uuid-123",
    "token": "tok-abc",
    "audio_url": "https://storage/audio.m4a",
    "transcript_raw": "raw telugu",
    "transcript_english": "english translation",
}


class TestCapture:
    def test_returns_stored_recipe(self):
        """capture() returns the Supabase-saved recipe dict."""
        with patch("scripts.capture.transcribe_audio", return_value="raw telugu"), \
             patch("scripts.capture.translate_to_english", return_value="english translation"), \
             patch("scripts.capture.structure_recipe", return_value=_STRUCTURED), \
             patch("scripts.capture.insert_recipe", return_value=_STORED), \
             patch("scripts.capture.OpenAIProvider"):
            result = capture("audio.m4a", "https://storage/audio.m4a")

        assert result["id"] == "uuid-123"
        assert result["dish_name"] == "Pesarattu"

    def test_pipeline_order(self):
        """capture() calls transcribe → translate → structure → insert in order."""
        call_order = []

        with patch("scripts.capture.transcribe_audio",
                   side_effect=lambda *a, **k: call_order.append("transcribe") or "raw"), \
             patch("scripts.capture.translate_to_english",
                   side_effect=lambda *a, **k: call_order.append("translate") or "english"), \
             patch("scripts.capture.structure_recipe",
                   side_effect=lambda *a, **k: call_order.append("structure") or _STRUCTURED), \
             patch("scripts.capture.insert_recipe",
                   side_effect=lambda *a, **k: call_order.append("insert") or _STORED), \
             patch("scripts.capture.OpenAIProvider"):
            capture("audio.m4a", "https://storage/audio.m4a")

        assert call_order == ["transcribe", "translate", "structure", "insert"]

class TestProcessRecipe:
    def test_returns_pipeline_fields_without_insert(self):
        """process_recipe() returns structured data and does NOT call insert_recipe."""
        with patch("scripts.capture.transcribe_audio", return_value="raw telugu"), \
             patch("scripts.capture.translate_to_english", return_value="english"), \
             patch("scripts.capture.structure_recipe", return_value={
                 "dish_name": "Pesarattu",
                 "ingredients": [{"item": "moong dal", "quantity": "1 cup"}],
                 "steps": ["Soak", "Grind"],
                 "cook_notes": "add oil till it smells right",
                 "review_flags": [],
             }), \
             patch("scripts.capture.insert_recipe") as mock_insert, \
             patch("scripts.capture.OpenAIProvider"):
            result = process_recipe("audio.m4a")

        mock_insert.assert_not_called()
        assert result["dish_name"] == "Pesarattu"
        assert result["transcript_raw"] == "raw telugu"
        assert result["transcript_english"] == "english"
        assert "id" not in result
        assert "token" not in result
        assert "audio_url" not in result

    def test_pipeline_order_without_insert(self):
        """process_recipe() calls transcribe → translate → structure in order."""
        call_order = []
        with patch("scripts.capture.transcribe_audio",
                   side_effect=lambda *a, **k: call_order.append("transcribe") or "raw"), \
             patch("scripts.capture.translate_to_english",
                   side_effect=lambda *a, **k: call_order.append("translate") or "english"), \
             patch("scripts.capture.structure_recipe",
                   side_effect=lambda *a, **k: call_order.append("structure") or {
                       "dish_name": "x", "ingredients": [], "steps": [],
                       "cook_notes": "", "review_flags": []}), \
             patch("scripts.capture.insert_recipe"), \
             patch("scripts.capture.OpenAIProvider"):
            process_recipe("audio.m4a")

        assert call_order == ["transcribe", "translate", "structure"]


class TestCaptureAudioUrl:
    def test_audio_url_and_transcripts_stored(self):
        """capture() includes audio_url, transcript_raw, transcript_english in the insert payload."""
        with patch("scripts.capture.transcribe_audio", return_value="raw telugu"), \
             patch("scripts.capture.translate_to_english", return_value="english translation"), \
             patch("scripts.capture.structure_recipe", return_value=_STRUCTURED), \
             patch("scripts.capture.insert_recipe", return_value=_STORED) as mock_insert, \
             patch("scripts.capture.OpenAIProvider"):
            capture("audio.m4a", "https://storage/audio.m4a")

        inserted = mock_insert.call_args[0][0]
        assert inserted["audio_url"] == "https://storage/audio.m4a"
        assert inserted["transcript_raw"] == "raw telugu"
        assert inserted["transcript_english"] == "english translation"
