from unittest.mock import patch, MagicMock
from scripts.capture import capture, process_recipe
from pipeline.models import TranscriptResult, RecipeData

_TRANSCRIPT = TranscriptResult(raw="raw telugu", english="english translation")

_RECIPE_DATA = RecipeData(
    dish_name="Pesarattu",
    ingredients=[{"item": "moong dal", "quantity": "1 cup"}],
    steps=["Soak moong dal.", "Grind to batter."],
    cook_notes="Add oil until it smells right.",
    review_flags=[],
    transcript_raw="raw telugu",
    transcript_english="english translation",
)

_STORED = {
    "id": "uuid-123",
    "token": "tok-abc",
    "audio_url": "https://storage/audio.m4a",
    "dish_name": "Pesarattu",
    "ingredients": [{"item": "moong dal", "quantity": "1 cup"}],
    "steps": ["Soak moong dal.", "Grind to batter."],
    "cook_notes": "Add oil until it smells right.",
    "review_flags": [],
    "transcript_raw": "raw telugu",
    "transcript_english": "english translation",
}


class TestCapture:
    def test_returns_stored_recipe(self):
        """capture() returns the Supabase-saved recipe dict."""
        with patch("scripts.capture.run_transcribe", return_value=_TRANSCRIPT), \
             patch("scripts.capture.run_transform", return_value=_RECIPE_DATA), \
             patch("scripts.capture.insert_recipe", return_value=_STORED):
            result = capture("audio.m4a", "https://storage/audio.m4a")

        assert result["id"] == "uuid-123"
        assert result["dish_name"] == "Pesarattu"

    def test_pipeline_order(self):
        """capture() calls run_transcribe → run_transform → insert_recipe in order."""
        call_order = []

        with patch("scripts.capture.run_transcribe",
                   side_effect=lambda *a, **k: call_order.append("transcribe") or _TRANSCRIPT), \
             patch("scripts.capture.run_transform",
                   side_effect=lambda *a, **k: call_order.append("transform") or _RECIPE_DATA), \
             patch("scripts.capture.insert_recipe",
                   side_effect=lambda *a, **k: call_order.append("insert") or _STORED):
            capture("audio.m4a", "https://storage/audio.m4a")

        assert call_order == ["transcribe", "transform", "insert"]


class TestProcessRecipe:
    def test_returns_pipeline_fields_without_insert(self):
        """process_recipe() returns structured data and does NOT call insert_recipe."""
        with patch("scripts.capture.run_transcribe", return_value=_TRANSCRIPT), \
             patch("scripts.capture.run_transform", return_value=_RECIPE_DATA), \
             patch("scripts.capture.insert_recipe") as mock_insert:
            result = process_recipe("audio.m4a")

        mock_insert.assert_not_called()
        assert result["dish_name"] == "Pesarattu"
        assert result["transcript_raw"] == "raw telugu"
        assert result["transcript_english"] == "english translation"
        assert "id" not in result
        assert "token" not in result
        assert "audio_url" not in result

    def test_pipeline_order_without_insert(self):
        """process_recipe() calls run_transcribe → run_transform in order."""
        call_order = []

        with patch("scripts.capture.run_transcribe",
                   side_effect=lambda *a, **k: call_order.append("transcribe") or _TRANSCRIPT), \
             patch("scripts.capture.run_transform",
                   side_effect=lambda *a, **k: call_order.append("transform") or _RECIPE_DATA), \
             patch("scripts.capture.insert_recipe"):
            process_recipe("audio.m4a")

        assert call_order == ["transcribe", "transform"]


class TestRunPersist:
    def test_returns_saved_recipe(self, tmp_path):
        """run_persist() uploads audio and inserts recipe, returns SavedRecipe."""
        from pipeline.persist import run_persist
        from pipeline.models import SavedRecipe

        recipe = RecipeData(
            dish_name="Pesarattu",
            ingredients=[],
            steps=[],
            cook_notes="",
            review_flags=[],
            transcript_raw="raw",
            transcript_english="eng",
        )

        audio_file = tmp_path / "test.webm"
        audio_file.write_bytes(b"fake audio")

        with patch("pipeline.persist.upload_audio", return_value="audio/test.webm"), \
             patch("pipeline.persist.insert_recipe", return_value={"id": "u1", "token": "t1"}):
            result = run_persist(recipe, audio_path=str(audio_file), audio_filename="test.webm")

        assert isinstance(result, SavedRecipe)
        assert result.id == "u1"
        assert result.token == "t1"
        assert result.audio_url == "audio/test.webm"

    def test_audio_upload_failure_is_nonfatal(self, tmp_path):
        """run_persist() saves recipe even when audio upload throws."""
        from pipeline.persist import run_persist

        recipe = RecipeData(
            dish_name="Test", ingredients=[], steps=[], cook_notes="",
            review_flags=[], transcript_raw="", transcript_english="",
        )
        audio_file = tmp_path / "test.webm"
        audio_file.write_bytes(b"fake")

        with patch("pipeline.persist.upload_audio", side_effect=Exception("Storage down")), \
             patch("pipeline.persist.insert_recipe", return_value={"id": "u2", "token": "t2"}):
            result = run_persist(recipe, audio_path=str(audio_file), audio_filename="test.webm")

        assert result.id == "u2"
        assert result.audio_url == ""


class TestCaptureAudioUrl:
    def test_audio_url_and_transcripts_stored(self):
        """capture() includes audio_url, transcript_raw, transcript_english in the insert payload."""
        with patch("scripts.capture.run_transcribe", return_value=_TRANSCRIPT), \
             patch("scripts.capture.run_transform", return_value=_RECIPE_DATA), \
             patch("scripts.capture.insert_recipe", return_value=_STORED) as mock_insert:
            capture("audio.m4a", "https://storage/audio.m4a")

        inserted = mock_insert.call_args[0][0]
        assert inserted["audio_url"] == "https://storage/audio.m4a"
        assert inserted["transcript_raw"] == "raw telugu"
        assert inserted["transcript_english"] == "english translation"
