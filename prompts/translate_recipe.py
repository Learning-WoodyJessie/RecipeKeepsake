"""
Translate structured English recipe fields → target language via LLM.

Distinct from prompts/translate.py (Telugu audio → English).
This module takes already-structured fields (dish_name, ingredients, steps,
cook_notes) and outputs a translated version in the target language.

Vague quantity words ("a little", "to taste", "enough") are explicitly
preserved as natural equivalents — never converted to specific measurements.
For Telugu, the cooking glossary is injected so the model uses correct spellings.
"""
import json
from prompts.llm import LLMProvider
from tools.glossary import build_glossary_hint

SUPPORTED_LANGS = {"en", "te", "hi", "kn", "es", "fr"}

LANG_NAMES = {
    "en": "English",
    "te": "Telugu",
    "hi": "Hindi",
    "kn": "Kannada",
    "es": "Spanish",
    "fr": "French",
}

_SYSTEM = (
    "You are translating a structured recipe from English into {language}.\n"
    "Rules:\n"
    "- Preserve vague quantity words as natural equivalents — never convert to specific measurements.\n"
    "  Examples: \"a little\" → natural equivalent in {language}, NOT \"½ tsp\".\n"
    "  \"to taste\", \"until it smells right\", \"enough\" → keep the spirit, not a number.\n"
    "- Keep ingredient names recognisable (e.g. \"ragi\", \"turmeric\" stay as food names).\n"
    "- Translate step instructions naturally — imperative mood, like a cook talking.\n"
    "- Return ONLY valid JSON with the same keys as the input. No markdown, no explanation.\n"
    "{glossary_hint}"
)


def translate_recipe_fields(fields: dict, lang: str, provider: LLMProvider) -> dict:
    """Translate dish_name, ingredients, steps, cook_notes into target language.

    Args:
        fields:   dict with keys dish_name, ingredients, steps, cook_notes
        lang:     2-letter language code (must be in SUPPORTED_LANGS)
        provider: LLMProvider instance

    Returns:
        dict with same keys, content translated into target language

    Raises:
        ValueError: if lang is not in SUPPORTED_LANGS
        json.JSONDecodeError: if the LLM returns malformed JSON
    """
    if lang not in SUPPORTED_LANGS:
        raise ValueError(f"Unsupported language: {lang}. Must be one of {SUPPORTED_LANGS}")

    glossary_hint = ""
    if lang == "te":
        glossary_hint = f"\nTelugu cooking glossary:\n{build_glossary_hint()}"

    system = _SYSTEM.format(language=LANG_NAMES[lang], glossary_hint=glossary_hint)

    user_text = json.dumps(
        {
            "dish_name": fields.get("dish_name", ""),
            "ingredients": fields.get("ingredients", []),
            "steps": fields.get("steps", []),
            "cook_notes": fields.get("cook_notes", ""),
        },
        ensure_ascii=False,
    )

    raw = provider.generate(system=system, user=user_text)
    return json.loads(raw)
