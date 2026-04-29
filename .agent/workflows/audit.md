---
description: Technical and UX quality gate. Must pass before /closeout.
---

# /audit

Required before every `/closeout`. Evidence over assertions — run the commands, read the output.

---

## 1. Python layer audit

### Test suite (hard gate)
```bash
python -m pytest tests/ -v
```
**Pass condition**: all 138+ tests green, 0 failures, 0 errors.
If any test fails → audit is **FAILED**. Fix before proceeding.

**Test count regression check**: if you added new code, did you add new tests? Count before vs after.

### Mock integrity (no live API calls)
```bash
# Check for any live external calls in tests
grep -rn "openai\|supabase\|twilio\|requests\." tests/ | grep -v "@patch\|MagicMock\|mock\|Mock\|#"
```
Any unmocked external call = **FAILED**. Live calls in tests = flaky CI + real cost.

### CLOSE_RELATIONSHIPS duplication check
If you touched tone/relationship logic anywhere:
```bash
grep -rn "CLOSE_RELATIONSHIPS\|close_relationships\|closeRelationships" . --include="*.py" --include="*.ts" --include="*.tsx"
```
Should only appear in `router/message_router.py` (definition) and any file that imports from it.
If the same relationship list appears hardcoded in `warmly/app/api/generate/route.ts` AND you modified one → update the other too.

### Planning agent fast path
If you touched `router/planning_agent.py`:
```bash
python -m pytest tests/test_planning_agent.py -v
```
Confirm tests cover:
- [ ] Fast path: notes ≤ 50 chars → no LLM call → `_no_adjustment()` returned
- [ ] LLM error → `_no_adjustment()` returned (graceful degradation)
- [ ] `NEEDS_ADJUSTMENT: yes` → needs_adjustment=True
- [ ] `URGENCY: skip` → urgency="skip"

### Idempotency check
If you touched `tools/memory.py` or the sync path:
- [ ] `append_sent_log()` still has the `(person_name, occasion, year)` duplicate check
- [ ] Safe to call twice in a row without creating duplicate entries

### Clean code check (entropy)
Review only the files changed this session. Ask:
1. Does any new code solve a problem that doesn't exist yet? (YAGNI)
2. Is there logic duplicated from an existing function? (DRY)
3. Is any function doing more than one thing? (SRP)
4. Will the next person be confused by this? (clarity)

Triage: **Blocking** (fix now) / **Improvement** (log to BUGS.md) / **Nitpick** (skip)

---

## 2. Warmly audit

### Build (hard gate)
```bash
cd warmly && node_modules/.bin/next build
```
**Pass condition**: exits 0, no TypeScript errors, no missing env var warnings.
If it fails → audit is **FAILED**. TypeScript errors that compile locally may still fail on Vercel.

### API route checks
For each new or modified route in `warmly/app/api/`:
- [ ] Missing field → `NextResponse.json({ error: 'Missing ...' }, { status: 400 })`
- [ ] Supabase not-found → `NextResponse.json({ error: 'Not found' }, { status: 404 })`
- [ ] Using `process.env.SUPABASE_SERVICE_KEY!` (server-side only, never exposed to client)
- [ ] No `user_id` checks — app is auth-free (public)

### Supabase column check
If new columns are referenced in queries:
```bash
# Verify columns exist by checking the schema in CLAUDE.md → Supabase setup section
```
A missing column returns a silent empty result, not an error — easy to miss.

### iOS Safari rule
For any feature that opens WhatsApp:
- [ ] `window.open()` is the FIRST thing called in the click handler
- [ ] No `await` before `window.open()`
- [ ] Write-back calls use `.catch(() => {})` fire-and-forget

### Client component states
For any new `'use client'` component:
- [ ] Loading state shown while async work runs (`loading && <skeleton>`)
- [ ] Error state rendered if something fails (`error && <error message>`)
- [ ] Empty state handled if data is null/empty (`!data && <empty state>`)

---

## 3. Results

✅ **PASS**: All tests green, Warmly build clean, no blocking issues, mocks intact.

❌ **FAIL**: Log every failure item in `docs/BUGS.md` using `/log` with:
```
| B-XXX | <description> | Critical/High | Active | <what file, what line> |
```

For any debt that involves moving code, use the agent-fixable format:
```
Move X from file A (line N) to file B. Update imports in: file C, file D.
```

**Next step**: Audit passes → `/kaizen` → `/closeout`
