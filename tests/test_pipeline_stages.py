import pytest
from unittest.mock import MagicMock, patch
from pipeline.transcribe import run_transcribe
from pipeline.transform import run_transform
from pipeline.models import TranscriptResult, RecipeData


def _provider(text):
    m = MagicMock()
    m.generate.return_value = text
    return m


def _gemini_mock(transcript_text: str):
    mock_response = MagicMock()
    mock_response.text = transcript_text
    active_file = MagicMock()
    active_file.state.name = "ACTIVE"
    mock_client = MagicMock()
    mock_client.files.upload.return_value = active_file
    mock_client.files.get.return_value = active_file
    mock_client.models.generate_content.return_value = mock_response
    return mock_client


class TestRunTranscribe:
    @pytest.fixture(autouse=True)
    def _set_gemini_key(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    def test_returns_transcript_result(self):
        """run_transcribe() returns a TranscriptResult with raw + english fields."""
        p = _provider("This is a recipe")
        with patch("tools.transcribe.genai.Client", return_value=_gemini_mock("ఇది ఒక రెసిపీ")), \
             patch("pipeline.transcribe.translate_to_english", return_value="This is a recipe"):
            result = run_transcribe("test.m4a", provider=p)

        assert isinstance(result, TranscriptResult)
        assert result.raw == "ఇది ఒక రెసిపీ"
        assert result.english == "This is a recipe"

    def test_passes_provider_to_translate(self):
        """run_transcribe() forwards the provider argument to translate_to_english."""
        with patch("tools.transcribe.genai.Client", return_value=_gemini_mock("raw")), \
             patch("pipeline.transcribe.translate_to_english", return_value="eng") as mock_translate:
            p = _provider("eng")
            run_transcribe("test.m4a", provider=p)
            assert mock_translate.call_args[0][1] is p

    def test_creates_default_provider_when_none(self):
        """run_transcribe() creates an OpenAIProvider when no provider is given."""
        with patch("tools.transcribe.genai.Client", return_value=_gemini_mock("raw")), \
             patch("pipeline.transcribe.translate_to_english", return_value="eng"), \
             patch("pipeline.transcribe.load_config", return_value={"llm": {"model": "gpt-4o"}}), \
             patch("pipeline.transcribe.OpenAIProvider") as mock_prov_cls:
            mock_prov_cls.return_value = _provider("eng")
            run_transcribe("test.m4a")
            mock_prov_cls.assert_called_once()

    def test_uses_translate_model_from_config(self):
        """run_transcribe() uses translate_model key over generic model when present."""
        with patch("tools.transcribe.genai.Client", return_value=_gemini_mock("raw")), \
             patch("pipeline.transcribe.translate_to_english", return_value="eng"), \
             patch("pipeline.transcribe.load_config", return_value={
                 "llm": {"model": "gpt-4o", "translate_model": "gpt-4o-mini"}
             }), \
             patch("pipeline.transcribe.OpenAIProvider") as mock_prov_cls:
            mock_prov_cls.return_value = _provider("eng")
            run_transcribe("test.m4a")
            call_kwargs = mock_prov_cls.call_args[1]
        assert call_kwargs["model"] == "gpt-4o-mini"


class TestRunTransform:
    def test_returns_recipe_data(self):
        """run_transform() wraps structure_recipe output in a RecipeData."""
        transcript = TranscriptResult(raw="raw", english="eng")

        with patch("pipeline.transform.structure_recipe", return_value={
            "title": "Pesarattu",
            "ingredients": [{"item": "moong dal", "quantity": "1 cup"}],
            "steps": ["Soak", "Grind"],
            "cook_notes": "konchem salt",
            "review_flags": [],
            "category": "Breakfast",
        }):
            result = run_transform(transcript, provider=_provider(""))

        assert isinstance(result, RecipeData)
        assert result.title == "Pesarattu"
        assert result.transcript_raw == "raw"
        assert result.transcript_english == "eng"
        assert result.image_url == ""       # not set at this stage
        assert result.category == "Breakfast"

    def test_preserves_transcript_references(self):
        """run_transform() copies transcript raw + english into RecipeData."""
        transcript = TranscriptResult(raw="Telugu raw", english="English translation")

        with patch("pipeline.transform.structure_recipe", return_value={
            "title": "Dish", "ingredients": [], "steps": [],
            "cook_notes": "", "review_flags": [], "category": "Other",
        }):
            result = run_transform(transcript, provider=_provider(""))

        assert result.transcript_raw == "Telugu raw"
        assert result.transcript_english == "English translation"

    def test_invalid_category_defaults_to_other(self):
        """run_transform() coerces an unrecognised category to 'Other'."""
        transcript = TranscriptResult(raw="r", english="e")

        with patch("pipeline.transform.structure_recipe", return_value={
            "title": "Mystery", "ingredients": [], "steps": [],
            "cook_notes": "", "review_flags": [], "category": "Junk",
        }):
            result = run_transform(transcript, provider=_provider(""))

        assert result.category == "Other"

    def test_uses_structure_model_from_config(self):
        """run_transform() uses structure_model key over generic model when present."""
        transcript = TranscriptResult(raw="r", english="e")

        with patch("pipeline.transform.structure_recipe", return_value={
                 "title": "X", "ingredients": [], "steps": [],
                 "cook_notes": "", "review_flags": [], "category": "Other",
             }), \
             patch("pipeline.transform.load_config", return_value={
                 "llm": {"model": "gpt-4o", "structure_model": "gpt-4o-mini"}
             }), \
             patch("pipeline.transform.OpenAIProvider") as mock_prov_cls:
            mock_prov_cls.return_value = _provider("")
            run_transform(transcript)
            call_kwargs = mock_prov_cls.call_args[1]
        assert call_kwargs["model"] == "gpt-4o-mini"
