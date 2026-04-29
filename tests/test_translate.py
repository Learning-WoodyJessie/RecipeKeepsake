from unittest.mock import MagicMock
from prompts.translate import translate_to_english, TRANSLATE_SYSTEM


def _provider(text):
    mock = MagicMock()
    mock.generate.return_value = text
    return mock


class TestTranslateToEnglish:
    def test_returns_provider_output(self):
        """translate_to_english() returns whatever the provider generates."""
        p = _provider("Add a little oil and fry until it smells right.")
        result = translate_to_english("కొంచెం నూనె వేసి వేయించాలి", p)
        assert result == "Add a little oil and fry until it smells right."

    def test_passes_transcript_as_user_message(self):
        """translate_to_english() sends the raw transcript as the user message."""
        p = _provider("result")
        translate_to_english("raw telugu text", p)
        call_args = p.generate.call_args
        # support both positional and keyword args
        user_arg = call_args[1].get("user") if call_args[1] else call_args[0][1]
        assert user_arg == "raw telugu text"

    def test_system_prompt_forbids_normalization(self):
        """TRANSLATE_SYSTEM prompt must mention vague term preservation."""
        assert "konjam" in TRANSLATE_SYSTEM.lower() or "vague" in TRANSLATE_SYSTEM.lower()
        assert "normalize" in TRANSLATE_SYSTEM.lower() or "do not" in TRANSLATE_SYSTEM.lower()
