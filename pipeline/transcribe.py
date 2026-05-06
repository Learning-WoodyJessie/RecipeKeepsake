"""
Stage 1: audio_path → TranscriptResult.

Calls Whisper (with Telugu glossary prompt) for raw transcript,
then faithfully translates to English via LLM Call A.
"""
from __future__ import annotations

from tools.whisper import transcribe_audio
from tools.config import load_config
from prompts.translate_audio import translate_to_english
from prompts.llm import LLMProvider, OpenAIProvider
from pipeline.models import TranscriptResult


def run_transcribe(audio_path: str, provider: LLMProvider | None = None) -> TranscriptResult:
    """
    Stage 1: transcribe audio and faithfully translate to English.

    Args:
        audio_path: path to audio file (any format Whisper accepts)
        provider:   LLM provider for translation. Defaults to OpenAIProvider from config.

    Returns:
        TranscriptResult with raw Telugu transcript and English translation.
    """
    if provider is None:
        config = load_config()
        provider = OpenAIProvider(model=config["llm"]["model"])

    raw = transcribe_audio(audio_path)
    english = translate_to_english(raw, provider)
    return TranscriptResult(raw=raw, english=english)
