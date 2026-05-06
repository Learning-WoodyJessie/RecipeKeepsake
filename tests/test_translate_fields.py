import json
from unittest.mock import MagicMock
import pytest
from prompts.translate_fields import translate_recipe_fields, SUPPORTED_LANGS


def _provider(response_text: str):
    mock = MagicMock()
    mock.generate.return_value = response_text
    return mock


_SAMPLE_FIELDS = {
    "dish_name": "Ragi Mudda",
    "ingredients": [{"item": "ragi flour", "quantity": "1 cup"}],
    "steps": ["Soak ragi flour in water."],
    "cook_notes": "Add a little salt to taste.",
}

_SAMPLE_TRANSLATED = {
    "dish_name": "రాగి ముద్ద",
    "ingredients": [{"item": "రాగి పిండి", "quantity": "ఒక కప్పు"}],
    "steps": ["రాగి పిండిని నీళ్ళలో నానబెట్టండి."],
    "cook_notes": "కొంచెం ఉప్పు వేయండి.",
}


class TestTranslateRecipeFields:
    def test_returns_parsed_dict(self):
        """translate_recipe_fields() parses the provider JSON response into a dict."""
        p = _provider(json.dumps(_SAMPLE_TRANSLATED))
        result = translate_recipe_fields(_SAMPLE_FIELDS, "te", p)
        assert result["dish_name"] == "రాగి ముద్ద"

    def test_sends_fields_as_json_user_message(self):
        """translate_recipe_fields() serialises fields as JSON in the user message."""
        p = _provider(json.dumps(_SAMPLE_TRANSLATED))
        translate_recipe_fields(_SAMPLE_FIELDS, "te", p)
        call_kwargs = p.generate.call_args[1]
        user_msg = call_kwargs.get("user") or p.generate.call_args[0][1]
        parsed = json.loads(user_msg)
        assert parsed["dish_name"] == "Ragi Mudda"

    def test_injects_glossary_for_telugu(self):
        """translate_recipe_fields() includes Telugu glossary in system prompt for lang='te'."""
        p = _provider(json.dumps(_SAMPLE_TRANSLATED))
        translate_recipe_fields(_SAMPLE_FIELDS, "te", p)
        system = p.generate.call_args[1].get("system") or p.generate.call_args[0][0]
        assert "konchem" in system.lower()

    def test_no_glossary_for_hindi(self):
        """translate_recipe_fields() does NOT inject Telugu glossary for lang='hi'."""
        hi_translated = {**_SAMPLE_TRANSLATED, "dish_name": "रागी मुद्दा"}
        p = _provider(json.dumps(hi_translated))
        translate_recipe_fields(_SAMPLE_FIELDS, "hi", p)
        system = p.generate.call_args[1].get("system") or p.generate.call_args[0][0]
        assert "konchem" not in system.lower()

    def test_system_prompt_preserves_vague_terms(self):
        """translate_recipe_fields() system prompt instructs model to preserve vague quantities."""
        p = _provider(json.dumps(_SAMPLE_TRANSLATED))
        translate_recipe_fields(_SAMPLE_FIELDS, "hi", p)
        system = p.generate.call_args[1].get("system") or p.generate.call_args[0][0]
        assert "vague" in system.lower() or "natural equivalent" in system.lower()

    def test_raises_for_unsupported_lang(self):
        """translate_recipe_fields() raises ValueError for unrecognised language codes."""
        p = _provider("{}")
        with pytest.raises(ValueError, match="Unsupported"):
            translate_recipe_fields(_SAMPLE_FIELDS, "zh", p)
