"""
Tier 1 eval: vague quantities must land in cook_notes, never in ingredients.quantity.

These tests make real OpenAI API calls. They are gated behind @pytest.mark.evals
and excluded from the default `pytest tests/` run.

Run explicitly:
    pytest tests/evals/ -m evals -v
"""
import os
import pytest
from prompts.structure import structure_recipe
from prompts.llm import OpenAIProvider

pytestmark = pytest.mark.evals


@pytest.fixture(scope="module")
def provider():
    if not os.getenv("OPENAI_API_KEY"):
        pytest.skip("OPENAI_API_KEY not set — skipping live eval")
    return OpenAIProvider(model="gpt-4o-mini")


@pytest.mark.parametrize("narration,vague_terms,forbidden_in_quantity", [
    (
        "Add a little oil and fry until it smells right.",
        ["a little", "until it smells right"],
        ["a little", "1 tsp", "1 tbsp"],
    ),
    (
        "Cook with enough water to just cover the dal.",
        ["enough"],
        ["1 cup", "2 cups", "enough"],
    ),
    (
        "Season to taste with salt and green chili.",
        ["to taste"],
        ["to taste", "1 tsp"],
    ),
    (
        "Add konjam tamarind — not too much, just enough to balance the spice.",
        ["enough"],
        ["1 tsp", "1 tbsp", "enough"],
    ),
])
def test_vague_terms_in_cook_notes_not_ingredients(
    provider, narration, vague_terms, forbidden_in_quantity
):
    result = structure_recipe(narration, provider)
    quantities = [str(i.get("quantity", "")).lower() for i in result.get("ingredients", [])]
    cook_notes = result.get("cook_notes", "").lower()

    for term in vague_terms:
        assert term.lower() in cook_notes, (
            f"'{term}' missing from cook_notes.\n"
            f"cook_notes={result.get('cook_notes')!r}\n"
            f"ingredients={result.get('ingredients')}"
        )
    for forbidden in forbidden_in_quantity:
        assert not any(forbidden.lower() in q for q in quantities), (
            f"'{forbidden}' found in ingredients.quantity — should be in cook_notes.\n"
            f"ingredients={result.get('ingredients')}"
        )
