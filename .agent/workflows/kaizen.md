---
description: Continuous improvement pass — identify one or two targeted improvements before closing out.
---

# /kaizen

Run after `/audit` passes, before `/closeout`. Find one real improvement — not a wishlist.

## The question

> "What's the smallest change that makes this codebase meaningfully better?"

Not the most impressive. Not the most complete. The smallest real improvement.

---

## Where to look

### Muda (waste) — things that exist but add no value
```bash
# Dead code — functions defined but never called
grep -rn "^def " tools/ router/ prompts/ | awk -F: '{print $3}' | sort > /tmp/defs.txt
grep -rn "$(cat /tmp/defs.txt | head -5 | awk '{print $1}' | tr '\n' '|')" . --include="*.py"

# Unused imports
grep -rn "^import\|^from" tools/ router/ prompts/ scripts/

# DALL-E route — exists but never wired into UI (D-002 in BUGS.md)
ls warmly/app/api/generate-image/
```

### Mura (inconsistency) — things that don't match each other
```bash
# CLOSE_RELATIONSHIPS defined in router but duplicated in Warmly API route
grep -rn "closeRelationships\|CLOSE_RELATIONSHIPS" warmly/app/api/generate/route.ts router/message_router.py

# Response shape inconsistency across API routes
grep -rn "return NextResponse.json" warmly/app/api/ | head -20
# Are some returning { data }, others { result }? Pick one.
```

### Muri (overburden) — things that are more complex than they need to be
- Is `scripts/check_reminders.py` still thin orchestration, or has it accumulated logic?
- Are any functions in `tools/` doing two things that could be split?
- Are any test files testing the same scenario multiple times?

---

## Entropy check

Before and after: count lines.

```bash
wc -l tools/*.py router/*.py prompts/*.py scripts/*.py
```

Writing 50 lines that delete 200 = net win. Writing 100 lines that add nothing structural = net loss.

**Red flags:**
- "This adds flexibility for later" → YAGNI, reject
- "Better separation of concerns" → only worth it if something is actually hurting
- "Keep both versions" → pick one, delete the other

---

## Gotchas update

If this session revealed a new failure pattern that isn't in `.agent/gotchas.md`, add it now:

```markdown
## [Pattern name]

**Pattern**: [what goes wrong]
**Tell**: [symptom — how you know this is the problem]
**Wrong**: [code example]
**Right**: [code example]
**Rule**: [one-line rule to remember]
```

---

## Output

Propose **1-3 specific edits** only. Each must include:
- Which file to change
- What line/section
- The exact change

No architecture lessons. No analogies. Just the edits.

Then confirm: "Shall I apply these, or log them for later?"

---

## Verification

After applying any kaizen change:
```bash
python -m pytest tests/ -q   # still green?
```
If Warmly was touched:
```bash
cd warmly && node_modules/.bin/next build
```
