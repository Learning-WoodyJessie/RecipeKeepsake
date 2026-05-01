"""
Telugu cooking glossary loader.

The glossary lives in data/telugu_cooking_terms.yaml and is injected at runtime
into both Whisper's initial_prompt and the translation system prompt so the model
consistently uses correct spellings (e.g. 'konchem' not 'konjam').
"""
from pathlib import Path
import yaml

_GLOSSARY_PATH = Path(__file__).resolve().parent.parent / "data" / "telugu_cooking_terms.yaml"
_GLOSSARY_CACHE: dict = {}  # populated below at module load


def load_glossary() -> dict:
    """Load the Telugu cooking glossary from YAML. Returns term → metadata dict.

    Cached at module level so tests that patch builtins.open don't intercept
    the YAML read (the cache is populated on first import, before any patch).
    """
    return _GLOSSARY_CACHE


def _load_from_disk() -> dict:
    """Internal: read YAML from disk. Called once at module load."""
    with open(_GLOSSARY_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


# Populate cache at import time — before any test patches builtins.open
_GLOSSARY_CACHE.update(_load_from_disk())


def build_glossary_hint() -> str:
    """
    Build a compact glossary hint string for injection into Whisper initial_prompt
    or LLM system prompts.

    Format: "konchem (konjam/konjem) = a little; koddiga = a small amount; ..."
    Kept short so it fits in Whisper's 224-token initial_prompt window.
    """
    glossary = load_glossary()
    parts = []
    for term, meta in glossary.items():
        variants = meta.get("variants", [])
        variant_str = f" ({'/'.join(variants[:3])})" if variants else ""
        parts.append(f"{term}{variant_str} = {meta['meaning']}")
    return "; ".join(parts)
