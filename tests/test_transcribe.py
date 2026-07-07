from unittest.mock import patch, MagicMock, mock_open
from tools.transcribe import transcribe_audio, _strip_hallucination_loops, _collapse_ngram_runs, _MAX_CONSECUTIVE_REPEATS


class TestTranscribeAudio:
    def test_returns_transcript_text(self):
        """transcribe_audio() calls Whisper and returns the .text field."""
        mock_transcript = MagicMock()
        mock_transcript.text = "ఇది ఒక రెసిపీ"

        with patch("tools.transcribe.OpenAI") as mock_openai, \
             patch("builtins.open", mock_open(read_data=b"audio bytes")):
            mock_openai.return_value.audio.transcriptions.create.return_value = mock_transcript
            result = transcribe_audio("test.m4a")

        assert result == "ఇది ఒక రెసిపీ"

    def test_passes_telugu_language_code(self):
        """transcribe_audio() passes language='te' — gpt-4o-transcribe supports it."""
        mock_transcript = MagicMock()
        mock_transcript.text = "some text"

        with patch("tools.transcribe.OpenAI") as mock_openai, \
             patch("builtins.open", mock_open(read_data=b"audio bytes")):
            mock_client = mock_openai.return_value
            mock_client.audio.transcriptions.create.return_value = mock_transcript
            transcribe_audio("test.m4a")

            call_kwargs = mock_client.audio.transcriptions.create.call_args[1]

        assert call_kwargs["language"] == "te"

    def test_uses_gpt4o_transcribe_model(self):
        """transcribe_audio() uses gpt-4o-transcribe, not whisper-1."""
        mock_transcript = MagicMock()
        mock_transcript.text = "some text"

        with patch("tools.transcribe.OpenAI") as mock_openai, \
             patch("builtins.open", mock_open(read_data=b"audio bytes")):
            mock_client = mock_openai.return_value
            mock_client.audio.transcriptions.create.return_value = mock_transcript
            transcribe_audio("test.m4a")

            call_kwargs = mock_client.audio.transcriptions.create.call_args[1]

        assert call_kwargs["model"] == "gpt-4o-transcribe"

    def test_passes_initial_prompt_with_glossary(self):
        """transcribe_audio() passes initial_prompt containing Telugu cooking terms."""
        mock_transcript = MagicMock()
        mock_transcript.text = "some text"

        with patch("tools.transcribe.OpenAI") as mock_openai, \
             patch("builtins.open", mock_open(read_data=b"audio bytes")):
            mock_client = mock_openai.return_value
            mock_client.audio.transcriptions.create.return_value = mock_transcript
            transcribe_audio("test.m4a")

            call_kwargs = mock_client.audio.transcriptions.create.call_args[1]

        assert "prompt" in call_kwargs
        assert "konchem" in call_kwargs["prompt"].lower()

    def test_passes_temperature_zero(self):
        """D-002: temperature=0 keeps transcription deterministic, reducing hallucination."""
        mock_transcript = MagicMock()
        mock_transcript.text = "some text"

        with patch("tools.transcribe.OpenAI") as mock_openai, \
             patch("builtins.open", mock_open(read_data=b"audio bytes")):
            mock_client = mock_openai.return_value
            mock_client.audio.transcriptions.create.return_value = mock_transcript
            transcribe_audio("test.m4a")

            call_kwargs = mock_client.audio.transcriptions.create.call_args[1]

        assert call_kwargs["temperature"] == 0

    def test_initial_prompt_omits_term_meanings(self):
        """D-002: prompt is a terse vocab list, not full meanings — full meanings
        (e.g. "until it smells right") prime the model to fabricate that kind of
        content when audio cuts off abruptly."""
        mock_transcript = MagicMock()
        mock_transcript.text = "some text"

        with patch("tools.transcribe.OpenAI") as mock_openai, \
             patch("builtins.open", mock_open(read_data=b"audio bytes")):
            mock_client = mock_openai.return_value
            mock_client.audio.transcriptions.create.return_value = mock_transcript
            transcribe_audio("test.m4a")

            call_kwargs = mock_client.audio.transcriptions.create.call_args[1]

        assert "until it smells right" not in call_kwargs["prompt"].lower()


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
