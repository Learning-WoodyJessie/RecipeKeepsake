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
- ingredients quantity: use explicit measurements when spoken (e.g. "2 cups", "1 tsp"). When the narrator uses a vague amount (konchem, koddiga, a little, a pinch, to taste, enough), translate it to plain English and use that as the quantity (e.g. "a little", "to taste", "a pinch"). If no quantity at all is mentioned, use "to taste" for spices/condiments or "as needed" for main ingredients — never leave quantity blank.
- cook_notes: capture doneness cues and technique nuances verbatim (e.g. "until it smells right", "roast until slightly brown", "coarse paste not fine"). Also note any quantities that are genuinely ambiguous or narrator-specific.
- review_flags: note implied steps or genuinely ambiguous instructions needing human review.
- category: exactly one of: Breakfast, Lunch, Sweets, Pickles, Snacks, Drinks, Other.

---
Example narration:
"First wash the gongura leaves well and then spread them out to dry and wilt for two days. After they wilt, dry roast fenugreek seeds until slightly brown and set aside. Then dry roast coriander seeds the same way. Grind the wilted gongura with the roasted spices, some red chillies, a little turmeric, salt to taste, and garlic into a coarse paste. Heat oil, add mustard seeds, let them splutter, add curry leaves and pour this over the paste."

Example output:
{
  "dish_name": "Gongura Pachadi",
  "ingredients": [
    {"item": "gongura leaves", "quantity": "as needed"},
    {"item": "fenugreek seeds", "quantity": "to taste"},
    {"item": "coriander seeds", "quantity": "to taste"},
    {"item": "red chillies", "quantity": "to taste"},
    {"item": "turmeric", "quantity": "a little"},
    {"item": "salt", "quantity": "to taste"},
    {"item": "garlic", "quantity": "to taste"},
    {"item": "oil", "quantity": "as needed"},
    {"item": "mustard seeds", "quantity": "to taste"},
    {"item": "curry leaves", "quantity": "a few"}
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
