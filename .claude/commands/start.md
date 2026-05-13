---
description: Orient to the current project state at the start of any session.
---

# /start

Run this at the start of every session. Takes 60 seconds and prevents wasted work.

## Step 1 — Read the room (silently)

```bash
git status                        # uncommitted changes?
git log --oneline -3              # what was last worked on?
python -m pytest tests/ -q        # is the baseline green?
```

Check:
- `PROJECT_HISTORY.md` — what was the last session?
- `docs/BUGS.md` — any open Critical/High bugs?
- `docs/ROADMAP.md` — what phase are we in?

Use this to determine: **returning session** (known context, continue) vs **new feature** (needs /brainstorm first).

---

## Step 2 — Orient in 3 bullets

Tell the user:
1. What the last session accomplished (from PROJECT_HISTORY.md)
2. What open work exists (from BUGS.md / ROADMAP.md)
3. What the baseline test count is (`138 passed` = all clear)

Then ask: **"What do you want to work on today?"**

One question. Wait for the answer.

---

## Step 3 — Clarify (one question at a time)

After they describe the goal, ask only what's needed:

- Is this **Python layer** (tools/router/prompts/scripts) or **Warmly UI** (`warmly/`)?
- Is this a **new feature**, a **bug fix**, or an **improvement**?
- Does an existing tool/function already cover ≥80% of this? Check first.

---

## Step 4 — Route

| Situation | Next step |
|---|---|
| New idea, no design | `/brainstorm` |
| Design approved, no plan | `/plan` |
| Plan exists, ready to execute | `/build` |
| Something broken, needs logging | `/log` |
| End of session | `/closeout` |

Always end with a clear directive. Never leave the user wondering what to do next.

---

## Quick reference — project at a glance

```
Python layer:    tools/ → prompts/ → router/ → scripts/check_reminders.py
Tests:           tests/ — 138 tests, all mocked, run with: python -m pytest tests/ -v
Warmly:          warmly/ — Next.js 14 on Vercel, build: cd warmly && node_modules/.bin/next build
Data:            data/people.yaml (contacts), data/sent_log.yaml (episodic), data/run_log.yaml (runs)
Config:          config.yaml — reminder_days, llm.provider, llm.model
Delivery:        GitHub Actions cron (7AM PST) → check_reminders.py → Twilio WhatsApp
```
