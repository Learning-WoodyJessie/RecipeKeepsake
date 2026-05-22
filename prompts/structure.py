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
  "review_flags": ["string"],
  "category": "string"
}

Rules:
- dish_name: use EXACTLY as spoken — preserve Telugu/regional names verbatim (e.g. "Gongura Pachadi", not "Sorrel Chutney"). Do NOT translate, simplify, or paraphrase. Only infer if never mentioned; use null if truly unknown.
- steps: ONE physical action per step. "Wash and dry" must be TWO steps. "Roast, grind, and temper" must be THREE steps. Never combine separate actions into one step. Steps must be in cooking order even if narrated non-linearly.
- ingredients quantity: use ONLY explicit measurements spoken by the narrator (e.g. "2 cups", "1 tsp", "a handful"). If the narrator gives no quantity, leave quantity as "" (empty string). NEVER fill in "to taste" or any vague amount as the quantity — record those in cook_notes instead.
- cook_notes: capture ALL vague instructions verbatim: amounts like "a little", "to taste", "enough", "as needed", doneness cues like "until it smells right", and any technique nuance the narrator mentioned.
- review_flags: note implied steps or genuinely ambiguous instructions needing human review.
- category: exactly one of: Breakfast, Lunch, Sweets, Pickles, Snacks, Drinks, Other.

---
Example narration:
"First wash the gongura leaves well and then spread them out to dry and wilt for two days. After they wilt, dry roast fenugreek seeds until slightly brown and set aside. Then dry roast coriander seeds the same way. Grind the wilted gongura with the roasted spices, some red chillies, a little turmeric, salt to taste, and garlic into a coarse paste. Heat oil, add mustard seeds, let them splutter, add curry leaves and pour this over the paste."

Example output:
{
  "dish_name": "Gongura Pachadi",
  "ingredients": [
    {"item": "gongura leaves", "quantity": ""},
    {"item": "fenugreek seeds", "quantity": ""},
    {"item": "coriander seeds", "quantity": ""},
    {"item": "red chillies", "quantity": ""},
    {"item": "turmeric", "quantity": ""},
    {"item": "salt", "quantity": ""},
    {"item": "garlic", "quantity": ""},
    {"item": "oil", "quantity": ""},
    {"item": "mustard seeds", "quantity": ""},
    {"item": "curry leaves", "quantity": ""}
  ],
  "steps": [
    "Wash the gongura leaves thoroughly.",
    "Spread the washed gongura out to dry and wilt for two days.",
    "Dry roast the fenugreek seeds until slightly brown. Set aside.",
    "Dry roast the coriander seeds the same way. Set aside.",
    "Grind the wilted gongura with roasted fenugreek, roasted coriander, red chillies, turmeric, salt and garlic into a coarse paste.",
    "Heat oil in a pan and add mustard seeds. Let them splutter.",
    "Add curry leaves to the pan.",
    "Pour the tempering over the ground paste and mix."
  ],
  "cook_notes": "Turmeric: a little. Salt: to taste. Gongura, spice, and chilli quantities are to the narrator's taste — adjust for sourness and heat.",
  "review_flags": ["No exact quantity given for gongura — likely a large bunch or as available"],
  "category": "Pickles"
}
---"""


def structure_recipe(english_text: str, provider: LLMProvider) -> dict:
    """Call B: extract structured recipe dict from English narration text."""
    raw = provider.generate(system=STRUCTURE_SYSTEM, user=english_text, json_mode=True, temperature=0).strip()
    # Strip markdown fences as fallback (some model versions still add them)
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())
