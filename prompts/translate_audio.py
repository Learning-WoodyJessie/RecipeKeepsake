"""
Call A: faithful Telugu → English translation with glossary injection.

The system prompt is built dynamically so any new term added to
data/telugu_cooking_terms.yaml is automatically included — no code change needed.
"""
from prompts.llm import LLMProvider
from tools.glossary import build_glossary_hint

_TRANSLATE_BASE = (
    "You are a faithful translator, not a recipe writer. Translate this Telugu recipe "
    "narration to English, word for word in meaning, no more and no less. "
    "Preserve vague quantities verbatim: words like 'konchem' (a little), 'koddiga', "
    "'chaalu' (enough), 'to taste', 'until it smells right', 'enough' must appear in "
    "the translation exactly as-is. "
    "Do not normalize or invent measurements. Do not add or remove any information. "
    "If the narration is very short or incomplete - for example, just a dish name with "
    "no ingredients or steps - translate only what was said and stop there. Do not fill "
    "in ingredients, steps, or any other detail the speaker did not actually say, even if "
    "you recognize the dish and know what it typically contains. A two-word utterance "
    "must produce a two-word translation, not a paragraph.\n\n"
    "Telugu cooking glossary for reference:\n{glossary}"
)


def build_translate_system() -> str:
    """Build the translation system prompt with the current glossary injected."""
    return _TRANSLATE_BASE.format(glossary=build_glossary_hint())


# Module-level constant for backward compatibility
TRANSLATE_SYSTEM = build_translate_system()


def translate_to_english(transcript: str, provider: LLMProvider) -> str:
    """Call A: faithfully translate a raw Telugu transcript to English.

    temperature=0 for the same reason as Call B (structuring) - without it,
    the model's default sampling temperature (1.0) is prone to "helpfully"
    elaborating a short utterance (e.g. just a dish name) into a full
    description, fabricating ingredients/steps the narrator never said,
    before Call B even gets a chance to structure anything.
    """
    return provider.generate(system=build_translate_system(), user=transcript, temperature=0)
