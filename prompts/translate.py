from prompts.llm import LLMProvider

TRANSLATE_SYSTEM = (
    "You are a faithful translator. Translate this Telugu recipe narration to English. "
    "Preserve vague quantities verbatim: words like 'konjam', 'a little', 'to taste', "
    "'until it smells right', 'enough' must appear in the translation exactly as-is. "
    "Do not normalize or invent measurements. Do not add or remove any information."
)


def translate_to_english(transcript: str, provider: LLMProvider) -> str:
    """Call A: faithfully translate a raw Telugu transcript to English."""
    return provider.generate(system=TRANSLATE_SYSTEM, user=transcript)
