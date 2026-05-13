---
description: Wrap up a session — update docs, verify tests and build, commit, push.
---

# /closeout

Run at the end of every session. Takes 5 minutes. Keeps the project coherent across sessions.

## Prerequisites

Before running this:
- [ ] `/audit` passed (all tests green, Warmly build clean)
- [ ] `/kaizen` applied or deferred (kaizen items logged to BUGS.md if not applied)
- [ ] `docs/BUGS.md` active table reflects current state

---

## Step 1 — Update gotchas

Did this session surface a new failure pattern?
If yes, append to `.agent/gotchas.md`:
```markdown
## [Name]
**Pattern**: [what happened]
**Tell**: [symptom]
**Wrong**: [code]
**Right**: [code]
**Rule**: [one-line rule]
```
Update the `*Last updated*` line at the bottom.

---

## Step 2 — Update PROJECT_HISTORY.md

Prepend a new entry at the TOP:
```markdown
## [YYYY-MM-DD] — [Feature or session name]

### Accomplished
- [bullet]

### Learned
- [bullet — what wasn't obvious before this session]

### Deferred
- [bullet — link to BUGS.md ID if applicable]
```

---

## Step 3 — Update docs/ROADMAP.md

- Mark completed items with ✅
- If a full phase was completed, note the date
- Move any newly discovered future work to the appropriate future phase

---

## Step 4 — Update docs/BUGS.md

- Move resolved bugs from Active → Resolved
- Confirm active table reflects reality (no phantom bugs, no missing ones)

---

## Step 5 — Verify and commit

```bash
# Full test suite — must be green
python -m pytest tests/ -v

# Warmly build — if warmly/ was touched
cd warmly && node_modules/.bin/next build

# Stage specific files — never git add -A or git add .
git add <file1> <file2> ...
# Include: any changed source + test files + docs

# Commit with clear message
git commit -m "docs: closeout <feature name> session"

# Push
git push
```

**Secret hygiene check** — if this session added new env vars:
- [ ] Added to GitHub → Settings → Secrets → Actions (for Python / GitHub Actions layer)
- [ ] Added to Vercel env vars (for Warmly layer)
- [ ] Added to `CLAUDE.md` secrets tables (both sections)
- [ ] Confirmed NOT committed to the repo (check `.gitignore`)

---

## Step 6 — Session summary

Provide a concise summary (5-8 bullets):
- What shipped (feature or fix + test count: e.g. "138 → 145 tests")
- What was deferred (with BUGS.md IDs)
- What was learned (from `PROJECT_HISTORY.md` entry)
- Next thing to work on (from `ROADMAP.md`)
