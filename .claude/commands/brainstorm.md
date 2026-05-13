---
description: Design a new feature through Socratic questions before any code is written.
---

# /brainstorm

Use before any new feature. Produces a PRD that anchors the `/plan` and `/build` sessions.

## Step 1 — Pre-read (before asking anything)

Read these three files silently:
- `docs/ROADMAP.md` — what phase are we in? what's already decided?
- `docs/BUGS.md` — is this feature blocked by open debt?
- `.agent/decisions.log` — has this already been decided and rejected?

Summarise in 3 bullets: (1) current phase state, (2) what's already locked, (3) what still needs a decision. Only ask about the undecided parts.

---

## Step 2 — Layer identification

Before design questions, identify which layer this touches:

| Layer | Files | Test approach |
|---|---|---|
| Python tool | `tools/<name>.py` | `tests/test_<name>.py` with `monkeypatch` + `MagicMock` |
| Router logic | `router/message_router.py` | `tests/test_router.py` — class-based, pure functions |
| Planning agent | `router/planning_agent.py` | `tests/test_planning_agent.py` — mock `LLMProvider` |
| Prompt/LLM | `prompts/messages.py`, `prompts/llm.py` | `tests/test_prompts.py`, `tests/test_llm.py` |
| Orchestrator | `scripts/check_reminders.py` | Covered by integration across tool tests |
| Warmly UI | `warmly/app/` | Build verification + manual check (no unit tests) |
| GitHub Actions | `.github/workflows/` | Manual trigger test |

---

## Step 3 — Socratic questions (one at a time)

Start with these, in order:

1. **"What problem are we solving?"** — state the user pain, not the technical solution
2. **"Who is the user here?"** — is it the Python automation (runs unattended), or you using Warmly (human-in-the-loop)?
3. **"What does 'done' look like?"** — specific observable outcome, not a feature description
4. **"What happens when it goes wrong?"** — error states, Twilio failures, LLM timeouts, missing data
5. **"Does this already exist somewhere?"** — check `tools/`, `router/`, `scripts/` before designing net-new

---

## Step 4 — Architecture constraints to check

For **Python layer** additions:
- [ ] Does the new tool follow single-responsibility? (each `tools/*.py` does one thing)
- [ ] Does it need a new dependency? Check `requirements.txt` — keep it minimal
- [ ] Does it call an external service? → Must be mockable. How will tests isolate it?
- [ ] Does it write to disk? → Use `_ROOT / "data" / "filename.yaml"` path pattern
- [ ] Does it need config? → Add to `config.yaml` with a sensible default, not hardcoded

For **router** additions:
- [ ] Is this a rule (finite, enumerable decision)? → Add to `message_router.py`
- [ ] Is this open-ended judgment over free text? → Use or extend `planning_agent.py`
- [ ] New relationship type? → Add to `CLOSE_RELATIONSHIPS` in `message_router.py`, NOWHERE ELSE
  - ⚠️ Known debt: `CLOSE_RELATIONSHIPS` logic is duplicated in `warmly/app/api/generate/route.ts` — update both

For **Warmly UI** additions:
- [ ] Where does the data come from? Supabase `people` table? `reminders` table? a new API route?
- [ ] Does it call OpenAI? → Needs error handling + loading state + regenerate option
- [ ] Does it open WhatsApp? → `window.open()` must be synchronous — no `await` before it
- [ ] Does it write back to Supabase? → Fire-and-forget `.catch(() => {})` — never block primary action
- [ ] TypeScript types → define them inline or in the same file (no shared types dir yet)

---

## Step 5 — Propose 2-3 approaches

Lead with a recommendation. For each approach state:
- What it changes
- What it doesn't change
- The failure mode if something goes wrong

**Build vs. Borrow**: If a well-maintained library covers ≥80% of the need, default to it over custom code.

---

## Step 6 — Write the PRD

Save to `docs/plans/YYYY-MM-DD-<topic>-design.md`:

```markdown
## Goal
[One sentence]

## Audience
[Python automation (unattended) | You using Warmly (interactive)]

## Scope — what we're NOT building
[Explicit exclusions prevent scope creep]

## Core Requirements
[Numbered list of must-haves]

## Success Criteria
[Observable, testable outcomes]

## Edge Cases & Failure Modes
[What breaks? What's the fallback?]
```

**Append to `.agent/decisions.log`** for every significant decision:
```
[YYYY-MM-DD] [Feature] — Decision: <chosen>. Rejected: <considered>. Because: <reason>.
```

Update `PROJECT_HISTORY.md`.

---

## Step 7 — Warmly mockup (if UI work)

Create `warmly/public/prototype_<feature>.html` — static HTML/CSS/JS only, no build step. Match the dark theme (`#0A0A18` background, `#A78BFA` / `#818CF8` accent colors). Get explicit user approval before moving to `/plan`.

**Next step**: Once design is approved → `/plan`
