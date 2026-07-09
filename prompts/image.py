"""
DALL-E 3 image generation with recipe-aware prompt enrichment.

Instead of just the dish name, we extract visual details from the structured
recipe data we already have — ingredients (colour), steps (vessel/garnish),
cook_notes (texture) — so the generated image reflects the actual dish.
"""
from openai import OpenAI

# ── Visual detail extraction ───────────────────────────────────────────────

# Ingredients that visibly define a dish's colour and character
_COLOUR_BEARERS = {
    "saffron", "turmeric", "red chili", "chilli", "chili powder",
    "spinach", "tomato", "coconut", "tamarind", "mustard",
    "curry leaves", "fenugreek", "beetroot", "green chili",
    "kashmiri chili", "annatto", "paprika",
}

_REGIONAL_CUES = {
    "hyderabadi": "Hyderabadi Nawabi",
    "chettinad":  "Tamil Chettinad",
    "kerala":     "Kerala sadya-style",
    "malabar":    "Kerala sadya-style",
    "andhra":     "spicy Andhra",
    "gongura":    "spicy Andhra",
    "pesarattu":  "Andhra",
    "udupi":      "coastal Karnataka",
    "mangalorean":"coastal Karnataka",
    "tamil":      "Tamil Nadu",
    "sambar":     "Tamil Nadu",
    "rasam":      "Tamil Nadu",
    "punjabi":    "Punjabi dhaba-style",
    "rajasthani": "Rajasthani",
    "mughlai":    "Mughlai",
}

_VESSEL_CUES = {
    "biryani":   "in a sealed biryani handi, lid just lifted",
    "dum":       "in a sealed handi, steam rising",
    "dosa":      "as a crispy crepe on a banana leaf with coconut chutney",
    "idli":      "stacked on a banana leaf with sambar and coconut chutney alongside",
    "vada":      "on a banana leaf with sambar",
    "payasam":   "in a polished brass bowl",
    "halwa":     "in a brass bowl garnished with nuts",
    "laddu":     "arranged on a brass thali",
    "murukku":   "piled on a brass plate",
    "curry":     "in a seasoned iron kadai",
    "dal":       "in a traditional brass katori",
    "sambar":    "in a brass serving bowl",
    "rasam":     "in a small brass tumbler",
    "kheer":     "in a clay pot with rose petals",
}

_GARNISH_CUES = [
    ("coriander",    "fresh coriander leaves"),
    ("curry leaves", "tempered curry leaves"),
    ("ghee",         "a golden drizzle of ghee"),
    ("fried onion",  "crispy golden fried onions"),
    ("cashew",       "toasted cashews"),
    ("almond",       "slivered almonds"),
    ("mint",         "fresh mint leaves"),
    ("pomegranate",  "ruby pomegranate seeds"),
]

_TEXTURE_CUES = [
    ("crisp",   "Crispy, golden-edged exterior."),
    ("crunchy", "Crunchy, well-fried texture."),
    ("thick",   "Thick, glossy, coat-the-spoon gravy."),
    ("rich",    "Rich, deeply coloured sauce."),
    ("dry",     "Dry masala coating, each piece well-separated."),
    ("soft",    "Pillowy soft texture."),
    ("tender",  "Fall-apart tender meat."),
    ("smooth",  "Smooth, velvety consistency."),
    ("fluffy",  "Light and fluffy."),
]


def _extract_visual_details(
    title: str,
    ingredients: list,
    steps: list,
    cook_notes: str,
) -> dict:
    """Derive visual attributes from structured recipe data."""
    dish_lower = title.lower()
    step_text  = " ".join(steps).lower() if steps else ""
    notes_text = (cook_notes or "").lower()
    combined   = step_text + " " + notes_text

    # ── Key colour-bearing ingredients ────────────────────────────────────
    ing_names = [i.get("item", "").lower() for i in (ingredients or [])]
    key_ings  = [
        i.get("item", "")
        for i in (ingredients or [])
        if any(cb in i.get("item", "").lower() for cb in _COLOUR_BEARERS)
    ][:4]
    key_ing_str = ", ".join(key_ings) if key_ings else ""

    # ── Serving vessel ─────────────────────────────────────────────────────
    vessel = "in a traditional earthen serving bowl"
    if "banana leaf" in step_text:
        vessel = "on a banana leaf"
    else:
        for keyword, style in _VESSEL_CUES.items():
            if keyword in dish_lower or keyword in step_text:
                vessel = style
                break

    # ── Regional style ─────────────────────────────────────────────────────
    region = "South Indian home cooking"
    for keyword, style in _REGIONAL_CUES.items():
        if keyword in dish_lower:
            region = style
            break

    # ── Garnish (from steps) ───────────────────────────────────────────────
    garnish = "fresh herbs"
    for keyword, label in _GARNISH_CUES:
        if keyword in step_text:
            garnish = label
            break

    # ── Texture (from cook_notes + steps) ─────────────────────────────────
    texture = ""
    for keyword, label in _TEXTURE_CUES:
        if keyword in combined:
            texture = label
            break

    return {
        "key_ingredients": key_ing_str,
        "vessel":          vessel,
        "region":          region,
        "garnish":         garnish,
        "texture":         texture,
    }


def _build_prompt(
    title: str,
    ingredients: list | None = None,
    steps: list | None = None,
    cook_notes: str | None = None,
) -> str:
    """Build an enriched DALL-E prompt from dish name + optional recipe data."""
    details = _extract_visual_details(
        title,
        ingredients or [],
        steps or [],
        cook_notes or "",
    )

    parts = [
        f"A beautiful, appetizing close-up photograph of {title}.",
    ]
    if details["key_ingredients"]:
        parts.append(f"The dish showcases {details['key_ingredients']}.")
    parts.append(f"Served {details['vessel']}.")
    if details["texture"]:
        parts.append(details["texture"])
    parts.append(f"Authentic {details['region']} style, home-cooked presentation.")
    parts.append("Warm natural lighting, rustic wooden surface.")
    parts.append(f"Garnished with {details['garnish']}.")
    parts.append("Vibrant colours, sharp focus. No text, no watermarks, no people.")

    return " ".join(parts)


# ── Public API ─────────────────────────────────────────────────────────────

def generate_dish_image(
    title: str,
    ingredients: list | None = None,
    steps: list | None = None,
    cook_notes: str | None = None,
) -> str:
    """Call DALL-E 3 with a recipe-enriched prompt. Returns the generated image URL.

    Pass ingredients/steps/cook_notes for a much more accurate, dish-specific
    image. Falls back gracefully to dish-name-only if not provided.

    Note: URL expires after ~1hr — caller must download and re-upload to
    Supabase Storage via tools.storage.store_image().
    """
    client = OpenAI()
    prompt = _build_prompt(title, ingredients, steps, cook_notes)
    response = client.images.generate(
        model="dall-e-3",
        prompt=prompt,
        size="1024x1024",
        quality="standard",
        n=1,
    )
    return response.data[0].url
