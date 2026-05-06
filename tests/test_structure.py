import json
from unittest.mock import MagicMock
from prompts.structure import structure_recipe, STRUCTURE_SYSTEM


def _provider(json_dict: dict):
    mock = MagicMock()
    mock.generate.return_value = json.dumps(json_dict)
    return mock


_SAMPLE = {
    "dish_name": "Pesarattu",
    "ingredients": [{"item": "moong dal", "quantity": "1 cup"}],
    "steps": ["Soak moong dal for 4 hours.", "Grind to a smooth batter."],
    "cook_notes": "Add oil until it smells right.",
    "review_flags": ["Possible implied step: drain water after soaking"],
    "category": "Breakfast",
}


class TestStructureRecipe:
    def test_returns_dict(self):
        """structure_recipe() returns a dict parsed from the provider's JSON."""
        result = structure_recipe("some english text", _provider(_SAMPLE))
        assert isinstance(result, dict)

    def test_preserves_all_fields(self):
        """All schema fields are present in the returned dict."""
        result = structure_recipe("some english text", _provider(_SAMPLE))
        for key in ("dish_name", "ingredients", "steps", "cook_notes", "review_flags", "category"):
            assert key in result

    def test_category_field_present(self):
        """category field is returned from the LLM response."""
        result = structure_recipe("some english text", _provider(_SAMPLE))
        assert result["category"] == "Breakfast"

    def test_ingredients_are_list_of_dicts(self):
        """ingredients is a list of {item, quantity} dicts."""
        result = structure_recipe("some english text", _provider(_SAMPLE))
        assert isinstance(result["ingredients"], list)
        assert "item" in result["ingredients"][0]
        assert "quantity" in result["ingredients"][0]

    def test_strips_markdown_code_fences(self):
        """structure_recipe() handles ```json ... ``` wrapped output."""
        mock = MagicMock()
        mock.generate.return_value = f"```json\n{json.dumps(_SAMPLE)}\n```"
        result = structure_recipe("some text", mock)
        assert result["dish_name"] == "Pesarattu"

    def test_system_prompt_forbids_normalization(self):
        """STRUCTURE_SYSTEM must tell the model to put vague quantities in cook_notes."""
        assert "cook_notes" in STRUCTURE_SYSTEM
        assert "vague" in STRUCTURE_SYSTEM.lower() or "konjam" in STRUCTURE_SYSTEM.lower()

    def test_system_prompt_includes_category_values(self):
        """STRUCTURE_SYSTEM must enumerate the allowed category values."""
        for cat in ("Breakfast", "Lunch", "Sweets", "Pickles", "Snacks", "Drinks", "Other"):
            assert cat in STRUCTURE_SYSTEM
