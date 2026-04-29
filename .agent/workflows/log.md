---
description: Capture a bug, debt item, or feature idea without starting any work.
---

# /log

Categorise and record. That's it. No investigation, no fix, no branch.

---

## Bug / Technical Debt → `docs/BUGS.md`

Add to the **Active** table:

```markdown
| B-XXX | Description | Severity | Active | Context |
```

**Severity guide for this project:**
- **Critical** — breaks the daily run or sends a wrong/harmful message
- **High** — incorrect behavior visible to the user; Warmly UI broken flow
- **Medium** — tech debt accumulating; logic duplicated across files
- **Low** — naming inconsistency; style issue; nice-to-have cleanup

**For debt that moves code**, use the agent-fixable format so any future agent can execute without investigation:
```
Move X from file A (line N) to file B. Update imports in: file C, file D.
```

**Example — the known CLOSE_RELATIONSHIPS duplication:**
```
| D-004 | CLOSE_RELATIONSHIPS logic duplicated in router/message_router.py and warmly/app/api/generate/route.ts — Warmly route should import from router or an extracted constants file | Medium | Open | Update both whenever a new relationship type is added |
```

---

## Feature / Idea → `docs/ROADMAP.md`

- Small UI tweak or routing change → add to current phase section
- New capability (new tool, new delivery channel, new memory type) → add to a future phase section

---

## Hard stops

- Do NOT investigate the root cause
- Do NOT propose a fix
- Do NOT open a new branch
- Do NOT read more than the one or two files needed to categorise

Confirm with: `"Added [ID] to [file]. Not starting work on this."`
