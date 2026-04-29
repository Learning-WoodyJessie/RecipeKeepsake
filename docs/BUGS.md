# RecipeKeepsake — Bugs & Debt

Format: `| ID | Description | Severity | Status | Location |`

Severity: Critical / High / Improvement / Nitpick
Status: Active / In Progress / Fixed

---

| ID | Description | Severity | Status | Location |
|---|---|---|---|---|
| D-001 | `_load_config()` duplicated in `scripts/capture.py` and `scripts/serve.py` — identical function. Extract to `tools/config.py` and import from both. | Improvement | Active | `scripts/capture.py:13`, `scripts/serve.py:35` |
