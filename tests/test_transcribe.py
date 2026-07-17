import os
import pytest
from unittest.mock import patch, MagicMock, mock_open
from tools.transcribe import transcribe_audio, _strip_hallucination_loops, _collapse_ngram_runs, _MAX_CONSECUTIVE_REPEATS


def _make_gemini_mock(transcript_text: str):
    """Build a minimal Gemini client mock returning the given transcript."""
    mock_response = MagicMock()
    mock_response.text = transcript_text

    # File returned by upload() and get() — state.name must be "ACTIVE"
    # so the polling loop exits on the first iteration.
    active_file = MagicMock()
    active_file.state.name = "ACTIVE"

    mock_client = MagicMock()
    mock_client.files.upload.return_value = active_file
    mock_client.files.get.return_value = active_file
    mock_client.models.generate_content.return_value = mock_response
    return mock_client


class TestTranscribeAudio:
    @pytest.fixture(autouse=True)
    def _set_gemini_key(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    def test_returns_transcript_text(self):
        """transcribe_audio() returns the text from Gemini's response."""
        mock_client = _make_gemini_mock("ఇది ఒక రెసిపీ")
        with patch("tools.transcribe.genai.Client", return_value=mock_client):
            result = transcribe_audio("test.m4a")
        assert result == "ఇది ఒక రెసిపీ"

    def test_uploads_audio_via_files_api(self):
        """transcribe_audio() uploads the audio path via the Gemini Files API."""
        mock_client = _make_gemini_mock("some text")
        with patch("tools.transcribe.genai.Client", return_value=mock_client):
            transcribe_audio("test.m4a")
        mock_client.files.upload.assert_called_once()
        assert "test.m4a" in str(mock_client.files.upload.call_args)

    def test_uses_gemini_flash_model(self):
        """transcribe_audio() targets gemini-2.5-flash."""
        mock_client = _make_gemini_mock("some text")
        with patch("tools.transcribe.genai.Client", return_value=mock_client):
            transcribe_audio("test.m4a")
        call_kwargs = mock_client.models.generate_content.call_args[1]
        assert call_kwargs["model"] == "gemini-2.5-flash"

    def test_prompt_contains_dialect_context(self):
        """Prompt tells Gemini to handle Telangana/Andhra/Rayalaseema/Hyderabadi dialects."""
        mock_client = _make_gemini_mock("some text")
        with patch("tools.transcribe.genai.Client", return_value=mock_client):
            transcribe_audio("test.m4a")
        contents = mock_client.models.generate_content.call_args[1]["contents"]
        prompt_text = contents[0]
        assert "telangana" in prompt_text.lower()
        assert "andhra" in prompt_text.lower()

    def test_prompt_contains_glossary_terms(self):
        """Prompt includes Telugu cooking vocabulary from the glossary."""
        mock_client = _make_gemini_mock("some text")
        with patch("tools.transcribe.genai.Client", return_value=mock_client):
            transcribe_audio("test.m4a")
        contents = mock_client.models.generate_content.call_args[1]["contents"]
        assert "konchem" in contents[0].lower()

    def test_prompt_requests_telugu_script_output(self):
        """Prompt explicitly requests Telugu script, not romanized output."""
        mock_client = _make_gemini_mock("some text")
        with patch("tools.transcribe.genai.Client", return_value=mock_client):
            transcribe_audio("test.m4a")
        contents = mock_client.models.generate_content.call_args[1]["contents"]
        assert "telugu script" in contents[0].lower()


    def test_polls_until_file_active(self):
        """transcribe_audio() calls files.get() until state is ACTIVE before generating."""
        processing_file = MagicMock()
        processing_file.state.name = "PROCESSING"
        active_file = MagicMock()
        active_file.state.name = "ACTIVE"

        mock_response = MagicMock()
        mock_response.text = "ready"
        mock_client = MagicMock()
        mock_client.files.upload.return_value = processing_file
        # First get() still PROCESSING, second is ACTIVE
        mock_client.files.get.side_effect = [processing_file, active_file]
        mock_client.models.generate_content.return_value = mock_response

        with patch("tools.transcribe.genai.Client", return_value=mock_client), \
             patch("tools.transcribe.time.sleep"):
            result = transcribe_audio("test.m4a")

        assert mock_client.files.get.call_count == 2
        assert result == "ready"

    def test_falls_back_to_whisper_if_gemini_file_fails(self, monkeypatch):
        """When both Gemini models fail file processing, falls back to OpenAI Whisper."""
        monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")

        failed_file = MagicMock()
        failed_file.state.name = "FAILED"
        mock_gemini_client = MagicMock()
        mock_gemini_client.files.upload.return_value = failed_file
        mock_gemini_client.files.get.return_value = failed_file

        mock_whisper_resp = MagicMock()
        mock_whisper_resp.text = "whisper fallback transcript"
        mock_openai_client = MagicMock()
        mock_openai_client.audio.transcriptions.create.return_value = mock_whisper_resp

        with patch("tools.transcribe.genai.Client", return_value=mock_gemini_client), \
             patch("tools.transcribe.time.sleep"), \
             patch("tools.transcribe.OpenAI", return_value=mock_openai_client), \
             patch("builtins.open", mock_open(read_data=b"audio")):
            result = transcribe_audio("test.m4a")

        assert result == "whisper fallback transcript"
        mock_openai_client.audio.transcriptions.create.assert_called_once()


class TestStripHallucinationLoops:
    def test_collapses_repeated_word_runs(self):
        """Word-level repetition (e.g. Telugu word repeated without punctuation) is collapsed."""
        text = "నూవులు మోటియింది మోటియింది మోటియింది మోటియింది"
        result = _strip_hallucination_loops(text)
        assert result.count("మోటియింది") <= 2

    def test_collapses_repeated_sentence_runs(self):
        """Sentence-level repetition (English hallucination loop) is collapsed."""
        text = "Add sugar. " * 50
        result = _strip_hallucination_loops(text.strip())
        assert result.count("Add sugar.") <= 2

    def test_preserves_real_content_before_loop(self):
        """Content before the hallucination loop is kept intact."""
        text = "Soak tamarind. Add onions. Add cumin seeds. Add sugar. Add sugar. Add sugar. Add sugar."
        result = _strip_hallucination_loops(text)
        assert "Soak tamarind." in result
        assert "Add onions." in result
        assert "Add cumin seeds." in result

    def test_normal_text_passes_through(self):
        """Text with no repetition is returned unchanged."""
        text = "Soak tamarind well. Add oil and onions. Grind sesame seeds with salt."
        assert _strip_hallucination_loops(text) == text

    def test_legitimate_double_mention_kept(self):
        """Two mentions of the same sentence are allowed when non-consecutive."""
        text = "Add oil. Mix well. Add oil. Cook until done."
        result = _strip_hallucination_loops(text)
        assert result.count("Add oil.") == 2

    def test_collapses_bigram_loops(self):
        """Alternating two-word phrase loop (no punctuation) is collapsed to one copy."""
        real_content = "పిండీ నీలు వేయాలి ఉప్పు"
        hallucination = " పిండీ కలపాలు" * 100
        text = real_content + hallucination
        result = _strip_hallucination_loops(text)
        assert result.count("పిండీ కలపాలు") <= _MAX_CONSECUTIVE_REPEATS
        assert "ఉప్పు" in result

    def test_collapse_ngram_runs_single_word(self):
        """_collapse_ngram_runs with n=1 collapses identical consecutive words."""
        words = ["A", "B", "B", "B", "C"]
        assert _collapse_ngram_runs(words, 1) == ["A", "B", "C"]

    def test_collapse_ngram_runs_bigram(self):
        """_collapse_ngram_runs with n=2 collapses consecutive identical bigrams."""
        words = ["X", "Y", "X", "Y", "X", "Y", "Z"]
        result = _collapse_ngram_runs(words, 2)
        assert result.count("X") == 1
        assert result.count("Y") == 1
        assert "Z" in result
