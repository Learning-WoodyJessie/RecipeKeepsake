# Phase 1.6 — Scale Hardening Design PRD

*Date: 2026-05-04*
*Status: Approved — ready for /plan*

---

## Goal

Fix the critical infrastructure issues that prevent the system from serving 10,000 users safely and reliably, without introducing new infrastructure dependencies.

---

## Context

A code review against a 10k-user target identified six issues ranked by severity. The job queue (for the synchronous capture pipeline) was considered and deliberately deferred — see Decisions below. This phase addresses the remaining five issues, all of which are pure code or configuration changes.

---

## Scope — what we are NOT building

- **Job queue / async capture pipeline** — deferred. Trigger to revisit: concurrent captures regularly exceed 5. The synchronous pipeline is acceptable until then.
- **API gateway** (Kong, Zuplo, AWS API Gateway) — right long-term answer for rate limiting and auth token validation at scale. Deferred to Phase 5+ when multi-instance setup and DevOps support exist.
- **Redis** — not needed for this phase. Postgres upsert covers distributed rate limiting without new infrastructure.
- Any product features — this phase is infrastructure only.

---

## Problems Being Solved

### P1 — New Supabase client on every DB call (Critical)
`_client()` in `tools/storage.py` calls `create_client()` on every database operation. This creates a new HTTP client, new connection, and new auth handshake each time. At ~50 concurrent users this exhausts Supabase connection limits. Every page load that generates signed URLs calls `_client()` 50+ times.

### P2 — Blocking HTTP call in async auth handler (Critical)
`require_auth` in `scripts/serve.py` uses synchronous `httpx.get()` inside an `async def`. This blocks the FastAPI event loop for up to 5 seconds (the timeout) on every authenticated request. Under any concurrent load, all requests queue behind each other.

### P3 — No local JWT verification — Supabase round-trip per request (High)
Every API request makes a live HTTP call to Supabase Auth to validate the token. At 10k users this is 100k+ daily validation calls to an external service. If Supabase Auth is slow, every user feels it simultaneously. JWT signatures can be verified locally using `SUPABASE_JWT_SECRET` in microseconds with no network call.

### P4 — Silent auth bypass when SUPABASE_URL is missing (Critical)
`require_auth` returns an empty dict `{}` when `SUPABASE_URL` is not set, silently granting access to all endpoints. A misconfigured production deploy would expose all user data with no authentication.

### P5 — In-memory rate limiter broken across instances (Medium)
`_rec_counts` is a Python dict — not shared across Railway instances. Each instance maintains its own counter. With two instances a user can capture `2× MAX_RECORDINGS_PER_DAY`. Rate limiting is meaningless under horizontal scaling.

### P6 — CORS wildcards (Low)
`allow_methods=["*"]` and `allow_headers=["*"]` expose all HTTP methods and headers. Should be explicit.

### P7 — RLS unconfirmed (High — from D-004)
Supabase Row Level Security was designed in the security PRD but dashboard setup is unconfirmed. Python ownership checks are the only data isolation layer. One bug in any endpoint silently exposes another user's family data.

---

## Core Requirements

1. `_client()` returns a module-level singleton — one Supabase client per process, reused across all calls
2. `require_auth` uses `httpx.AsyncClient` with `await` — non-blocking
3. `require_auth` verifies JWT signature locally using `SUPABASE_JWT_SECRET` — Supabase network call only as fallback on verification failure
4. `require_auth` raises `HTTP 500` (not silently passes) when `SUPABASE_URL` is missing and `ENV=production`
5. Rate limiting uses a Postgres `rate_limits` table — atomic upsert, accurate across instances, survives restarts
6. CORS specifies explicit methods and headers — no wildcards
7. RLS policies confirmed active on `recipes` and `people` tables — D-004 closed

---

## Decisions Made

### Decision 1 — Job queue deferred
**Chosen:** defer  
**Rejected:** include in this phase  
**Reason:** The capture pipeline blocking the HTTP worker is a real problem at scale, but the break point is ~5 concurrent captures. At 10k users with the family archive use case (periodic recording sessions, not high-frequency), this threshold is unlikely to be hit in the near term. Introducing Celery or RQ adds significant operational complexity. Will revisit when monitoring shows concurrent captures regularly exceeding 5.

### Decision 2 — Postgres upsert for rate limiting
**Chosen:** `rate_limits` table with atomic `INSERT ... ON CONFLICT DO UPDATE`  
**Rejected:** Redis (new infrastructure), API gateway (too heavy for this phase), in-memory (broken across instances), Supabase Edge Function rate limiting (requires moving endpoint)  
**Reason:** Postgres is already in the stack. Atomic upsert is correct across instances, survives restarts, and requires zero new infrastructure. API gateway is the right long-term answer and is logged for Phase 5+.

### Decision 3 — Local JWT verification as primary path
**Chosen:** `PyJWT` decode using `SUPABASE_JWT_SECRET`, Supabase network call as fallback  
**Rejected:** keep Supabase network call as primary  
**Reason:** Eliminates network round-trip on every authenticated request. Reduces latency by ~50–100ms per call. Removes hard dependency on Supabase Auth availability for request handling. Supabase call retained as fallback for edge cases.

---

## New Schema

```sql
CREATE TABLE rate_limits (
  user_id   text        NOT NULL,
  date      date        NOT NULL DEFAULT CURRENT_DATE,
  count     integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
```

Upsert on every capture attempt:
```sql
INSERT INTO rate_limits (user_id, date, count)
VALUES ($1, CURRENT_DATE, 1)
ON CONFLICT (user_id, date)
DO UPDATE SET count = rate_limits.count + 1
RETURNING count;
```

Old rows (past dates) can be pruned periodically — they are never queried.

---

## New Dependency

`PyJWT` — for local JWT signature verification.

```
pip install PyJWT
```

---

## Success Criteria

- [ ] `_client()` creates exactly one Supabase client per process — verified by adding a call counter in tests
- [ ] `POST /capture` with 20 concurrent requests completes without event loop blocking — verified by async test
- [ ] JWT validation does not make a Supabase network call on the happy path — verified by mocking `httpx.AsyncClient` and confirming it is not called when signature is valid
- [ ] Missing `SUPABASE_URL` with `ENV=production` returns HTTP 500, not a valid user dict
- [ ] Two simulated Railway instances both increment the same Postgres counter — verified by direct DB query
- [ ] CORS response headers contain explicit methods list, not `*`
- [ ] D-004 closed — RLS confirmed active in Supabase dashboard, documented in BUGS.md

---

## Edge Cases & Failure Modes

| Scenario | Behaviour |
|---|---|
| `SUPABASE_JWT_SECRET` missing | Fall back to Supabase network call (same as today). Log a warning. |
| JWT signature valid locally but token revoked in Supabase | Supabase fallback call catches this — token revocation is rare, fallback path is acceptable |
| Supabase Auth unavailable | Local verification succeeds — API remains functional. Only revoked tokens would slip through during an outage. |
| `rate_limits` table insert fails (DB down) | Fail open — log error, allow request. Rate limiting is abuse prevention not billing enforcement. |
| Railway scales to 0 and restarts | In-memory counters were reset before; Postgres counters survive. Behaviour improves. |
| `ENV` env var not set in production | Default to safe behaviour — treat as production, fail closed. |

---

## Files Changed

| File | Change |
|---|---|
| `tools/storage.py` | Module-level `_supabase` singleton; `_client()` returns it |
| `scripts/serve.py` | `require_auth` → async httpx + local JWT verify; rate limit → Postgres; CORS explicit |
| `requirements.txt` | Add `PyJWT` |
| `data/migrations/` | `rate_limits` table migration SQL |
| `tests/test_auth.py` | New — covers singleton, async auth, local verify, fail-closed |
| `tests/test_rate_limit.py` | New — covers Postgres upsert, cross-instance accuracy |
| `docs/BUGS.md` | D-004 closed after RLS confirmed |

---

## Build Order (for /plan)

1. **Chunk 1** — Supabase client singleton (`tools/storage.py`) — smallest, highest impact, no dependencies
2. **Chunk 2** — Async auth + local JWT verification (`scripts/serve.py`, `requirements.txt`) — unblocks everything else
3. **Chunk 3** — Fail-closed auth bypass + CORS explicit (`scripts/serve.py`) — safety hardening
4. **Chunk 4** — Postgres rate limiting (`data/migrations/`, `scripts/serve.py`, `tools/storage.py`)
5. **Chunk 5** — RLS confirmation (Supabase dashboard — manual step, documented)
6. **Chunk 6** — Tests for all above

*Next step: `/plan`*
