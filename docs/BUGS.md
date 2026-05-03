# RecipeKeepsake — Bugs & Debt

Format: `| ID | Description | Severity | Status | Location |`

Severity: Critical / High / Improvement / Nitpick
Status: Active / In Progress / Fixed

---

| ID | Description | Severity | Status | Location |
|---|---|---|---|---|
| D-001 | `_load_config()` duplicated in `scripts/capture.py` and `scripts/serve.py` — identical function. Extract to `tools/config.py` and import from both. | Improvement | Active | `scripts/capture.py:13`, `scripts/serve.py:35` |
| D-002 | Pipeline fabricates content when narrator stops mid-sentence. Two failure points: (1) Whisper (`gpt-4o-transcribe`) hallucinates completions on silence/abrupt endings — worsened by our recipe-vocabulary `initial_prompt` priming it. (2) Structure LLM prompt says "steps must be in cooking order even if narrated non-linearly" and "infer dish_name from context" — both invite the model to fill gaps that weren't narrated. Fix: add `temperature=0` to Whisper call, shorten `initial_prompt` to terse vocab list, rewrite structure rules to "only include what was explicitly stated" + flag incomplete sentences as `review_flags`. | High | Active | `tools/transcribe.py`, `prompts/structure.py` |
