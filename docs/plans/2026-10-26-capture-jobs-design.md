# Capture jobs: design

Status: approved to build, dark-launched behind `CAPTURE_JOBS_ENABLED` (default off).
Origin: architecture review of 2026-10-26, items 2 and 3 ("pipeline runs inside one HTTP request").

## Problem

A capture is transcribe, translate, safety check, structure, (image), save. It takes
30 to 60 seconds and all of it happens inside one HTTP request.

- The user must keep the app open, on that screen, with a steady connection. A locked
  phone, a dropped signal or a server restart loses the work and the recording.
- The audio is uploaded twice (once to process, once to save).
- Nothing records that a capture was attempted, so nothing can be retried or recovered.

Already fixed (not part of this work): the server no longer freezes during a capture,
quota is refunded on failure, errors are sanitised (`fb72f2e`).

## Goals

1. A capture survives the phone locking, the connection dropping, and a server restart.
2. The user can leave the screen and come back to a finished draft.
3. The audio is uploaded once.
4. A failure leaves the recording safe, with a retry button, and costs no quota.
5. **No regressions.** With the flag off, behaviour is byte-for-byte what ships today.

## Non-goals

- Push notifications (needs a native iOS change and an App Store release).
- A separate worker service or a message broker. Not needed at this scale; see D2.
- Changing the transcription, translation or structuring prompts.
- Drafts in the family collection. A draft is private until its owner saves it.

## Decisions

### D1. Drafts live in a `capture_jobs` table, not in `memories`

Alternative: save the result straight into `memories` with `status = 'draft'`.
Rejected. `memories` is read in 19 places (lists, search, family collection, portal,
public share, reactions, account deletion). Every one would need a `status` filter, and
missing one shows an unreviewed (possibly mis-structured) recipe to the family, which
is a privacy bug. A separate table has no such blast radius: nothing that exists today
can see a job. The memory is created only when the owner presses Save.

### D2. In-process worker, database as the source of truth

Alternatives: Redis/RQ/Celery, a second Railway service, Supabase queues.
Rejected for now: each adds an operational dependency for a service that runs one
process. Instead:

- `POST /capture/jobs` inserts the row, then schedules `run_job(id)` on the event loop.
- A semaphore (`CAPTURE_JOBS_MAX_CONCURRENT`, default 3) caps simultaneous pipelines so a
  burst queues instead of exhausting memory and provider limits.
- The runner claims the job with one atomic `UPDATE ... WHERE status = 'queued'`, so two
  processes can never run the same job. This is what makes a later move to several
  instances, or to a separate worker, a deployment change and not a rewrite.
- On startup, jobs left `processing` by a process that died are re-queued (max 3
  attempts), and `queued` jobs are re-scheduled.

### D3. Dark launch

Two environment variables, both off by default:

- `CAPTURE_JOBS_ALLOWLIST`: comma-separated emails or user ids. Only those people get the flow.
- `CAPTURE_JOBS_ENABLED=true`: everyone gets it.

`GET /features` (signed in) tells the website whether this user has it, once per page session. Any
failure of that call means "no", so the original flow keeps working. When neither variable is set the
background machinery does not even start (no database access, no timers). Off means the old
endpoints and the old screens, untouched. Rollback is changing one variable, with no code deploy.

### D4. The old endpoints are not modified

`/capture/process`, `/capture/save`, `/capture` keep their exact contract and code.
They stay until the new flow has run in production for a release, then are retired
separately.

### D5. Image generation moves after save (new flow only)

The image needs the structured recipe and is the single slowest optional step. In the
new flow the draft is ready without it; after the user saves, the image is generated in
the background and attached to the memory. A failed image is logged and the memory has
no image, which is already a valid state (songs and stories have none).

### D6. Idempotent creation

The client sends a `client_request_id` (UUID) with each upload. `(user_id,
client_request_id)` is unique, so a retry after a dropped response returns the existing
job instead of creating a second one or charging quota twice.

### D7. Dependency-injected router

The job endpoints live in `scripts/capture_jobs_api.py` as `build_router(deps)`, with the
pieces they need from `serve.py` (auth, quota, audio validation, moderation, pipeline
stages) passed in. This avoids a circular import with the 1,800-line `serve.py`, makes
the router testable with fakes, and is the first step of splitting that file.

### D8. Retention and privacy

- Draft audio sits in the existing private `audio` bucket, under the same naming.
- On Save the memory points at the same object: no copy, no second upload.
- Unsaved jobs (ready or failed) and discarded jobs are purged with their audio after
  14 days. Account deletion removes all of a user's jobs and their audio.
- The table has row level security on and no policies: only the server can touch it.

## States

```
queued -> processing -> ready -> saved
              |           \-> discarded
              \-> failed -> queued (retry)
```

`stage` while processing: `transcribing` then `structuring`.
A failed job stores `error_kind` and a user-safe `error_message` (from
`tools/errors.classify_failure`), and its quota is refunded exactly once.

## API (all JWT-authenticated, 404 when the flag is off)

| Method | Path | Purpose |
|---|---|---|
| GET | `/features` | `{capture_jobs: bool}` (public) |
| POST | `/capture/jobs` | multipart: audio, language, narrator, client_request_id. 202 + job |
| GET | `/capture/jobs` | the caller's open jobs (queued, processing, ready, failed) |
| GET | `/capture/jobs/{id}` | one job, owner only (404 for anyone else) |
| POST | `/capture/jobs/{id}/save` | the reviewed recipe -> creates the memory; idempotent |
| POST | `/capture/jobs/{id}/retry` | failed -> queued; charges quota again |
| DELETE | `/capture/jobs/{id}` | discard and delete the audio |

## No-push experience

- The website re-checks immediately when the app returns to the foreground
  (the `@capacitor/app` plugin is already inside the iOS app).
- Home shows a card for every open job: progress, "ready to review", or "couldn't finish,
  your recording is safe" with Retry.
- If the user stays on the capture screen, the review opens by itself when ready, which
  matches how it feels today.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A bug in the new flow harms current users | Flag off by default; old path untouched; contract tests pin both |
| Job stuck in `processing` after a crash | Startup recovery + attempt cap + stale cleanup |
| Duplicate jobs / double charge | Idempotency key, unique index |
| Orphaned audio (privacy) | Purge job; account deletion extended and tested |
| Abandoned drafts accumulate | 14-day purge; Home shows them |
| Provider outage | Existing classification, alert, refund; job shows Retry |

## Rollout

1. Run migration `006_capture_jobs.sql` in the Supabase SQL editor.
2. Deploy with both variables unset. Nothing changes for anyone (verified by tests/test_capture_jobs_wiring.py).
3. Set `CAPTURE_JOBS_ALLOWLIST=<your email>`. Record, leave the screen, lock the phone, come back, review, save.
4. When happy, set `CAPTURE_JOBS_ENABLED=true`.
5. Retire the old endpoints in a later release, after a few weeks without incident.

## Rollback

Unset `CAPTURE_JOBS_ENABLED` and `CAPTURE_JOBS_ALLOWLIST` and let Railway redeploy. New captures use the
original flow immediately. Jobs already in flight are not lost: drafts stay on the Home card only while the
feature is on, remain in the table, and are swept after 14 days (or removed with the account).

## Known limits

- One server process is assumed for crash recovery: at startup, a job `processing` for more than two
  minutes is treated as abandoned. The atomic claim keeps several instances safe from running one job
  twice, but the startup rule would need a heartbeat before scaling out.
- No push notification (needs a native release). The Home card refreshes the moment the app returns.
- No sidebar badge yet; the Home card and the capture screen carry the status.
- The generated picture appears a few seconds after saving; the memory page looks for it for about a minute.
