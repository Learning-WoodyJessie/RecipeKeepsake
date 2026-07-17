"""
Stage 1: audio_path → TranscriptResult.

Calls Whisper (with Telugu glossary prompt) for raw transcript,
then faithfully translates to English via LLM Call A.
"""
from __future__ import annotations
import logging
import time

_logger = logging.getLogger(__name__)

from tools.transcribe import transcribe_audio
from tools.config import load_config
from prompts.translate_audio import translate_to_english
from prompts.llm import LLMProvider, OpenAIProvider
from pipeline.models import TranscriptResult


def run_transcribe(audio_path: str, provider: LLMProvider | None = None, language: str = "auto") -> TranscriptResult:
    """
    Stage 1: transcribe audio and (for Telugu) faithfully translate to English.

    Args:
        audio_path: path to audio file
        provider:   LLM provider for translation. Defaults to OpenAIProvider from config.
        language:   "te" (Telugu), "en" (English — skip translation), "auto" (detect)

    Returns:
        TranscriptResult with raw transcript and English translation.
    """
    if provider is None:
        config = load_config()
        model = config["llm"].get("translate_model", config["llm"]["model"])
        provider = OpenAIProvider(model=model)

    t0 = time.perf_counter()
    raw = transcribe_audio(audio_path, language=language)
    _logger.info(f"event=transcribe_done duration={time.perf_counter()-t0:.2f}s language={language}")

    if language == "en":
        # Already English — no translation needed
        return TranscriptResult(raw=raw, english=raw)

    t1 = time.perf_counter()
    english = translate_to_english(raw, provider)
    _logger.info(f"event=translate_done duration={time.perf_counter()-t1:.2f}s")

    return TranscriptResult(raw=raw, english=english)
