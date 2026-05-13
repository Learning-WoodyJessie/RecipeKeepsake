# PRD: Recipe Language Switcher

## Goal
Let anyone reading a saved recipe switch between 6 languages (EN, TE, HI, KN, ES, FR) so family members can follow the recipe in their preferred language.

## Audience
Human-in-the-loop — person browsing/cooking from a saved recipe on the web app.

## Scope — what we're NOT building
- Auto-detect the reader's browser language and switch automatically
- Translate the raw audio transcript (only structured fields: ingredients, steps, cook_notes, dish_name)
- Re-translate on every page load (translations are cached forever in Supabase)
- New language additions requiring code changes (the language list is a config constant, not hardcoded per-component)
- Machine translation via Google Translate / DeepL (must stay in LLM pipeline so vague terms are preserved)

## Languages
| Code | Language | Source |
|---|---|---|
| `en` | English | Already stored in `transcript_english` / structured fields |
| `te` | Telugu | Re-translate structured English fields using LLM + Telugu glossary |
| `hi` | Hindi | LLM translate from English structured fields |
| `kn` | Kannada | LLM translate from English structured fields |
| `es` | Spanish | LLM translate from English structured fields |
| `fr` | French | LLM translate from English structured fields |

Telugu is special: `transcript_raw` is unstructured Whisper output. We translate the structured English fields *back* into Telugu (using our glossary) to get clean structured Telugu — better than raw transcript.

## Core Requirements

1. **Language chips** on the recipe detail view — `EN TE HI KN ES FR` — active chip highlighted in accent colour.
2. **English is default** — no loading, no API call, already in Supabase.
3. **First tap on a non-English language** → calls `GET /recipe/{token}/translate?lang=te` → LLM translates `dish_name`, `ingredients`, `steps`, `cook_notes` → result stored in `recipes.translations` JSONB column → response returned.
4. **Subsequent taps** → server returns cached translation from Supabase instantly (no LLM call).
5. **Vague terms preserved** — translation prompt explicitly instructs model to keep quantity words ("a little", "to taste", "until it smells right", "konchem", "chaalu", "enough") as natural equivalents, never as specific measurements. Telugu glossary injected for TE translations.
6. **Loading state** — active chip shows a small spinner during the ~2–3s first-translate; ingredient/step text shows a subtle shimmer skeleton.
7. **Failure graceful** — if translation API call fails, stay on current language, show a toast "Couldn't translate right now — try again."
8. **Dish name translated** — the large recipe title switches language too, not just body content.
9. **Cook notes translated with label** — a small badge "vague terms preserved" appears next to the notes section header when not in English.

## Success Criteria
- Tap TE chip on a recipe → within 3s see Telugu ingredients and steps
- "a little" in the English original appears as "కొంచెం" (not "50ml") in Telugu
- Tap TE again after first load → instant, no spinner
- Tap ES → Spanish appears; tap EN → English snaps back instantly (no re-fetch)
- All 6 languages work end-to-end on production Railway URL

## Edge Cases & Failure Modes

| Scenario | Behaviour |
|---|---|
| LLM returns malformed JSON | Server falls back to English, returns 200 with `{"error": "translation_failed", "lang": "en", ...original fields}` |
| Supabase write fails after LLM success | Return translation to client (it's correct), log error server-side, don't fail the request |
| Recipe has empty cook_notes | Skip cook_notes in translation payload, return empty string |
| Telugu glossary file missing | `build_glossary_hint()` returns empty string (non-fatal), translation still proceeds |
| User taps language while a translate is already in flight | Debounce — ignore taps during loading |
| Old recipes with no `translations` column yet | Supabase migration adds column with default `{}` — handled at DB level |

## Architecture

### New Supabase column
```sql
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS translations jsonb DEFAULT '{}';
```

### New prompt: `prompts/translate_recipe.py`
Distinct from `prompts/translate.py` (which is for raw Telugu audio → English).
This one translates structured English recipe fields → target language.

```python
TRANSLATE_RECIPE_SYSTEM = """
You are translating a structured recipe from English into {language}.
Rules:
- Preserve vague quantity words as natural equivalents — never convert to specific measurements.
  Examples: "a little" → natural equivalent in {language}, NOT "½ tsp"
  "to taste", "until it smells right", "enough" → keep the spirit, not a number.
- Keep ingredient names recognisable (e.g. "ragi", "turmeric" stay as food names).
- Translate step instructions naturally — imperative mood, like a cook talking.
- Return ONLY valid JSON matching the input schema. No markdown, no explanation.
{glossary_hint}
"""
```

For Telugu (`te`), inject `build_glossary_hint()` so the model uses correct spellings.

### New endpoint: `GET /recipe/{token}/translate`
```
GET /recipe/{token}/translate?lang=hi
```
1. Fetch recipe from Supabase by token
2. Check `recipe.translations["hi"]` — if present, return immediately
3. Call `translate_recipe(recipe, lang="hi", provider)` → structured dict
4. Store result in `recipe.translations["hi"]` via Supabase PATCH
5. Return translated fields

### Client-side JS cache (on top of server cache)
```js
const _translationCache = {};  // { "token:lang": { dish_name, ingredients, steps, cook_notes } }
```
So switching back to a language already fetched this session is instant without any network call.

### UI changes in `web/app.html`
- Add language chip row below recipe title on `screen-recipe-detail`
- JS: `switchLang(lang)` → check `_translationCache`, else fetch, then update DOM
- Loading: chip gets `.loading` class → CSS spinner; ingredient list gets `.skeleton` class
- English chip always instant (original fields in `currentRecipe`)
