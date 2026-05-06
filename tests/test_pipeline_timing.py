import re
from unittest.mock import patch, MagicMock, mock_open
from pipeline.transcribe import run_transcribe
from pipeline.transform import run_transform
from pipeline.models import TranscriptResult


class TestPipelineTiming:
    def test_transcribe_logs_stage_duration(self, capsys):
        """run_transcribe() prints timing lines for transcribe and translate stages."""
        mock_tr = MagicMock()
        mock_tr.text = "raw"
        p = MagicMock()
        p.generate.return_value = "eng"

        with patch("tools.transcribe.OpenAI") as mock_openai, \
             patch("builtins.open", mock_open(read_data=b"audio")), \
             patch("pipeline.transcribe.translate_to_english", return_value="eng"):
            mock_openai.return_value.audio.transcriptions.create.return_value = mock_tr
            run_transcribe("test.m4a", provider=p)

        out = capsys.readouterr().out
        assert re.search(r"\[pipeline\] stage=transcribe duration=\d+\.\d+s", out)
        assert re.search(r"\[pipeline\] stage=translate duration=\d+\.\d+s", out)

    def test_transform_logs_stage_duration(self, capsys):
        """run_transform() prints a timing line for the structure stage."""
        transcript = TranscriptResult(raw="raw", english="eng")
        p = MagicMock()

        with patch("pipeline.transform.structure_recipe", return_value={
            "dish_name": "X", "ingredients": [], "steps": [],
            "cook_notes": "", "review_flags": [],
        }):
            run_transform(transcript, provider=p)

        out = capsys.readouterr().out
        assert re.search(r"\[pipeline\] stage=structure duration=\d+\.\d+s", out)
