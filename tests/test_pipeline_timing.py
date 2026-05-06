import logging
import re
from unittest.mock import patch, MagicMock, mock_open
from pipeline.transcribe import run_transcribe
from pipeline.transform import run_transform
from pipeline.models import TranscriptResult


class TestPipelineTiming:
    def test_transcribe_logs_stage_duration(self, caplog):
        """run_transcribe() logs event=transcribe_done and event=translate_done with duration."""
        mock_tr = MagicMock()
        mock_tr.text = "raw"
        p = MagicMock()
        p.generate.return_value = "eng"

        with caplog.at_level(logging.INFO, logger="pipeline.transcribe"):
            with patch("tools.transcribe.OpenAI") as mock_openai, \
                 patch("builtins.open", mock_open(read_data=b"audio")), \
                 patch("pipeline.transcribe.translate_to_english", return_value="eng"):
                mock_openai.return_value.audio.transcriptions.create.return_value = mock_tr
                run_transcribe("test.m4a", provider=p)

        messages = [r.getMessage() for r in caplog.records if "pipeline" in r.name]
        assert any(re.search(r"event=transcribe_done duration=\d+\.\d+s", m) for m in messages)
        assert any(re.search(r"event=translate_done duration=\d+\.\d+s", m) for m in messages)

    def test_transform_logs_stage_duration(self, caplog):
        """run_transform() logs event=structure_done with duration."""
        transcript = TranscriptResult(raw="raw", english="eng")
        p = MagicMock()

        with caplog.at_level(logging.INFO, logger="pipeline.transform"):
            with patch("pipeline.transform.structure_recipe", return_value={
                "dish_name": "X", "ingredients": [], "steps": [],
                "cook_notes": "", "review_flags": [],
            }):
                run_transform(transcript, provider=p)

        messages = [r.getMessage() for r in caplog.records if "pipeline" in r.name]
        assert any(re.search(r"event=structure_done duration=\d+\.\d+s", m) for m in messages)
