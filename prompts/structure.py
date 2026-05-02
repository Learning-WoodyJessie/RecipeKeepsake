import json
from prompts.llm import LLMProvider

STRUCTURE_SYSTEM = """Extract a structured recipe from this English narration.
Output valid JSON only — no prose before or after, no markdown fences.

Schema:
{
  "dish_name": "string or null",
  "ingredients": [{"item": "string", "quantity": "string"}],
  "steps": ["string"],
  "cook_notes": "string",
  "review_flags": ["string"]
}

Rules:
- steps must be in cooking order even if narrated non-linearly
- where quantity is vague (a little, konjam, to taste, enough, until it smells right),
  put the full instruction verbatim in cook_notes — NOT in ingredients quantity field
- review_flags: list any implied steps or ambiguous instructions needing human review
- if dish_name is not stated, infer from context; if truly unknown, use null"""


def structure_recipe(english_text: str, provider: LLMProvider) -> dict:
    """Call B: extract structured recipe dict from English narration text."""
    raw = provider.generate(system=STRUCTURE_SYSTEM, user=english_text, json_mode=True).strip()
    # Strip markdown fences as fallback (some model versions still add them)
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())
