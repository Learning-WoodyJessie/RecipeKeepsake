import logging
import re
import pytest
from unittest.mock import patch, MagicMock
from pipeline.transcribe import run_transcribe
from pipeline.transform import run_transform
from pipeline.models import TranscriptResult


def _gemini_mock(transcript_text: str):
    mock_response = MagicMock()
    mock_response.text = transcript_text
    mock_client = MagicMock()
    mock_client.files.upload.return_value = MagicMock()
    mock_client.models.generate_content.return_value = mock_response
    return mock_client


class TestPipelineTiming:
    @pytest.fixture(autouse=True)
    def _set_gemini_key(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    def test_transcribe_logs_stage_duration(self, caplog):
        """run_transcribe() logs event=transcribe_done and event=translate_done with duration."""
        p = MagicMock()
        p.generate.return_value = "eng"

        with caplog.at_level(logging.INFO, logger="pipeline.transcribe"):
            with patch("tools.transcribe.genai.Client", return_value=_gemini_mock("raw")), \
                 patch("pipeline.transcribe.translate_to_english", return_value="eng"):
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
