import json
from prompts.llm import LLMProvider

STRUCTURE_SYSTEM = """Extract a structured recipe from this English narration.
Output valid JSON only — no prose before or after, no markdown fences.

Schema:
{
  "title": "string or null",
  "ingredients": [{"item": "string", "quantity": "string"}],
  "steps": ["string"],
  "cook_notes": "string",
  "review_flags": ["string"],
  "category": "string"
}

Rules:
- Only include what was explicitly stated. Never add an ingredient, step, or detail the narrator did not say, even if it seems like an obvious or conventional part of the dish. If the narration cuts off abruptly or mid-sentence, do not complete the thought — stop where the narration stops and add a review_flag noting the cutoff.
- title: use EXACTLY as spoken — preserve Telugu/regional names verbatim (e.g. "Gongura Pachadi", not "Sorrel Chutney"). Do NOT translate, simplify, or paraphrase. Do NOT guess a dish name from the ingredients/technique if it was never spoken; use null instead.
- steps: ONE physical action per step. "Wash and dry" must be TWO steps. "Roast, grind, and temper" must be THREE steps. Never combine separate actions into one step. Preserve the order the narrator actually spoke them in — do NOT reorder into "correct" cooking sequence; if the order seems off, leave it as spoken and add a review_flag. If the same action is repeated in the narration (e.g. mentioned again mid-conversation as a reminder or confirmation), include it ONCE only.
- ingredients quantity: use explicit measurements when spoken (e.g. "2 cups", "1 tsp") VERBATIM in the quantity field. If the narrator gives ANY vague amount instead (konchem, koddiga, a little, a pinch, to taste, enough, just enough, etc.) — even if you could translate it to plain English — do NOT put that vague phrase in the quantity field. Use a neutral placeholder instead: "to taste" for spices/condiments, "as needed" for everything else. Then record the narrator's actual vague phrase, translated to plain English, in cook_notes. The quantity field must never contain words like "a little", "a pinch", "some", or "a bit" — those belong in cook_notes only. This is the single most important rule in this schema: vague measurements are the authentic voice of the narrator, and normalizing them into `quantity` erases that. Example: narrator says "add a little oil" → ingredients: {"item": "oil", "quantity": "as needed"}; cook_notes: "Oil: a little." NOT {"item": "oil", "quantity": "a little"}.
- cook_notes: capture doneness cues, technique nuances, and EVERY vague quantity verbatim (e.g. "until it smells right", "roast until slightly brown", "coarse paste not fine", "turmeric: a little", "salt: to taste"). This is where vague measurement language lives — never in `ingredients[].quantity`.
- review_flags: note implied steps, abrupt/incomplete sentences, non-linear ordering left as-is, or genuinely ambiguous instructions needing human review.
- category: exactly one of: Breakfast, Lunch, Sweets, Pickles, Snacks, Drinks, Other.

---
Example narration:
"First wash the gongura leaves well and then spread them out to dry and wilt for two days. After they wilt, dry roast fenugreek seeds until slightly brown and set aside. Then dry roast coriander seeds the same way. Grind the wilted gongura with the roasted spices, some red chillies, a little turmeric, salt to taste, and garlic into a coarse paste. Heat oil, add mustard seeds, let them splutter, add curry leaves and pour this over the paste."

Example output:
{
  "title": "Gongura Pachadi",
  "ingredients": [
    {"item": "gongura leaves", "quantity": "as needed"},
    {"item": "fenugreek seeds", "quantity": "to taste"},
    {"item": "coriander seeds", "quantity": "to taste"},
    {"item": "red chillies", "quantity": "to taste"},
    {"item": "turmeric", "quantity": "as needed"},
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
