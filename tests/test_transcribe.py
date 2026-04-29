from unittest.mock import patch, MagicMock, mock_open
from tools.transcribe import transcribe_audio


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
