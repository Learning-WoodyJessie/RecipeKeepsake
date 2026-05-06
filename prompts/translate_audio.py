"""
Call A: faithful Telugu → English translation with glossary injection.

The system prompt is built dynamically so any new term added to
data/telugu_cooking_terms.yaml is automatically included — no code change needed.
"""
from prompts.llm import LLMProvider
from tools.glossary import build_glossary_hint

_TRANSLATE_BASE = (
    "You are a faithful translator. Translate this Telugu recipe narration to English. "
    "Preserve vague quantities verbatim: words like 'konchem' (a little), 'koddiga', "
    "'chaalu' (enough), 'to taste', 'until it smells right', 'enough' must appear in "
    "the translation exactly as-is. "
    "Do not normalize or invent measurements. Do not add or remove any information.\n\n"
    "Telugu cooking glossary for reference:\n{glossary}"
)


def build_translate_system() -> str:
    """Build the translation system prompt with the current glossary injected."""
    return _TRANSLATE_BASE.format(glossary=build_glossary_hint())


# Module-level constant for backward compatibility
TRANSLATE_SYSTEM = build_translate_system()


def translate_to_english(transcript: str, provider: LLMProvider) -> str:
    """Call A: faithfully translate a raw Telugu transcript to English."""
    return provider.generate(system=build_translate_system(), user=transcript)
