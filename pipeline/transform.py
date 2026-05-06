"""
Stage 2: TranscriptResult → RecipeData.

Calls LLM Call B to extract structured recipe fields from the English translation.
image_url is left empty here — the HTTP layer populates it after this stage.
"""
from __future__ import annotations
import logging
import time

_logger = logging.getLogger(__name__)

from tools.config import load_config
from prompts.structure import structure_recipe
from prompts.llm import LLMProvider, OpenAIProvider
from pipeline.models import TranscriptResult, RecipeData


def run_transform(transcript: TranscriptResult, provider: LLMProvider | None = None) -> RecipeData:
    """
    Stage 2: extract structured recipe fields from the English transcript.

    Args:
        transcript: output of run_transcribe()
        provider:   LLM provider. Defaults to OpenAIProvider from config.

    Returns:
        RecipeData with all fields populated. image_url is "" — set by caller.
    """
    if provider is None:
        config = load_config()
        model = config["llm"].get("structure_model", config["llm"]["model"])
        provider = OpenAIProvider(model=model)

    t0 = time.perf_counter()
    structured = structure_recipe(transcript.english, provider)
    _logger.info(f"event=structure_done duration={time.perf_counter()-t0:.2f}s")

    _VALID_CATEGORIES = {"Breakfast", "Lunch", "Sweets", "Pickles", "Snacks", "Drinks", "Other"}
    raw_category = structured.get("category", "Other")
    category = raw_category if raw_category in _VALID_CATEGORIES else "Other"

    return RecipeData(
        dish_name=structured.get("dish_name", ""),
        ingredients=structured.get("ingredients", []),
        steps=structured.get("steps", []),
        cook_notes=structured.get("cook_notes", ""),
        review_flags=structured.get("review_flags", []),
        transcript_raw=transcript.raw,
        transcript_english=transcript.english,
        category=category,
    )
