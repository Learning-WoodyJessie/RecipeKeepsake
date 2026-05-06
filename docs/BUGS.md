# RecipeKeepsake — Bugs & Debt

Format: `| ID | Description | Severity | Status | Location |`

Severity: Critical / High / Improvement / Nitpick
Status: Active / In Progress / Fixed

---

| ID | Description | Severity | Status | Location |
|---|---|---|---|---|
| D-001 | `_load_config()` duplicated in `scripts/capture.py` and `scripts/serve.py` — identical function. Extract to `tools/config.py` and import from both. | Improvement | Active | `scripts/capture.py:13`, `scripts/serve.py:35` |
| D-002 | Pipeline fabricates content when narrator stops mid-sentence. Two failure points: (1) Whisper (`gpt-4o-transcribe`) hallucinates completions on silence/abrupt endings — worsened by our recipe-vocabulary `initial_prompt` priming it. (2) Structure LLM prompt says "steps must be in cooking order even if narrated non-linearly" and "infer dish_name from context" — both invite the model to fill gaps that weren't narrated. Fix: add `temperature=0` to Whisper call, shorten `initial_prompt` to terse vocab list, rewrite structure rules to "only include what was explicitly stated" + flag incomplete sentences as `review_flags`. | High | Active | `tools/transcribe.py`, `prompts/structure.py` |
| D-003 | `POST /generate-image` endpoint (standalone image regeneration) still only accepts `dish_name` — does not pass `ingredients`, `steps`, `cook_notes` to `generate_dish_image()`. Fix: update `ImageRequest` Pydantic model to include optional recipe fields and pass them through. | Improvement | Active | `scripts/serve.py:~420-429` |
| D-005 | `user.get("sub") or user.get("id", "")` repeated 4× across rate limit calls in `serve.py`. Extract to a `_user_id(user: dict) -> str` helper. | Nitpick | Active | `scripts/serve.py:199, 273, 457, 515` |
| D-004 | Supabase RLS policy setup unconfirmed. Security PRD requires `user_id::text = auth.uid()::text` cast on `recipes` and `people` tables. Python ownership checks exist as a layer but RLS is the DB-level backstop against direct anon-key access. Verify in Supabase dashboard → Authentication → Policies. | High | Fixed 2026-05-05 | Supabase dashboard |
| D-006 | `readFavorites()` / `toggleFavorite()` localStorage logic was duplicated across 3 files (`home/page.tsx`, `memories/page.tsx`, `memory/page.tsx`) with slightly different key strings. Extracted to `frontend/lib/favorites.ts` as single source of truth. | Improvement | Fixed 2026-05-05 | `frontend/lib/favorites.ts` |
