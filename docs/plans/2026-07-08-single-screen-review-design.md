# Single-Screen Review + Type Picker — Design Doc

**Date:** 2026-07-08  
**Phase:** 4B — Non-recipe capture flow

---

## Goal

Give song/story/fable/moral captures a type selector before recording and a single-screen review after — so the user sees the transcript and confirms the title before the memory is finalised.

---

## Audience

Keeper (human-in-the-loop) — using the capture page on phone or desktop.

---

## Scope — what we're NOT building

- Transcript editing (audio is source of truth; read-only is correct)
- Wizard steps (single screen only — no next/back)
- New backend transcription endpoint (reuse `/save-audio` with response extended)
- Type picker for recipe mode (recipe is always `recipe`)
- Re-record from review screen (cancel returns to capture screen at idle)

---

## Current state

`capture/page.tsx` has two modes: `'ai'` (recipe → full pipeline → ReviewWizard) and `'direct'` (song/story → `/save-audio` → navigate directly to memory page). In `direct` mode:

- User enters title + optional description before recording
- Records → `saveAudioDirect()` → POST `/save-audio` → `router.push('/memory?token=...')`
- No review step. No type picker (type defaults to `"song"` on server).

`/save-audio` response currently returns `{ token, audio_url }` only — no transcript fields.

---

## Core Requirements

1. **Type picker in direct mode** — before recording, user sees 4 chips: Song 🎵 / Story 📖 / Fable ✨ / Moral 🙏. Default: Song. Selection passed to `/save-audio` as `memory_type`.

2. **`/save-audio` returns transcript fields** — response extended to include `transcript_raw` and `transcript_english` from the Whisper + translate result. No new endpoint — same call, richer response.

3. **Single-screen review after save** — instead of navigating to `/memory`, show `SingleScreenReview` component with:
   - Type badge (non-editable)
   - Title input (pre-filled from capture, editable)
   - Transcript section: "Original" (raw) + "English" (translated), read-only
   - "Save Memory" button → if title changed, PATCH `/recipe/{token}` first → navigate to `/memory?token=...&justSaved=1`
   - "Re-record" button → back to capture idle state (memory already saved — user can delete from memory page)

4. **Type picker placement** — shown in `direct` mode only, between the mode tabs and the title input, visible at `stage === 'idle'` and `stage === 'recording'` (hidden at `processing` and `review`).

---

## Flow

```
[Capture page — direct mode]
  1. User picks type: Song / Story / Fable / Moral
  2. User enters title
  3. User taps Record → records voice
  4. User taps Stop → stage = 'processing' ("♪ Saving your keepsake…")
  5. POST /save-audio → server: Whisper + translate + DB insert → returns {token, audio_url, transcript_raw, transcript_english}
  6. stage = 'direct-review' → SingleScreenReview rendered
  7a. User leaves title as-is → taps "Save Memory" → navigate to /memory?token=...
  7b. User edits title → taps "Save Memory" → PATCH /recipe/{token} {title} → navigate
  7c. User taps "Re-record" → stage = 'idle', memory exists in DB (user can delete it)
```

---

## Success Criteria

- [ ] Type picker visible in direct mode before recording; selection sent as `memory_type`
- [ ] After recording + save, review screen appears (not memory page)
- [ ] Review screen shows transcript (raw + English)
- [ ] Title editable; PATCH fires only if changed
- [ ] Save Memory → memory page with `justSaved=1` toast
- [ ] Recipe mode (`'ai'`) unchanged — still goes to ReviewWizard

---

## Edge Cases & Failure Modes

| Case | Behaviour |
|------|-----------|
| Transcript empty (Whisper produced nothing) | Show "No transcript generated" placeholder; Save still enabled |
| PATCH title fails | Log error, navigate anyway — memory is saved, title can be fixed inline later |
| User taps Re-record | Navigate back to capture idle; memory exists in DB but user can delete from memory page |
| `/save-audio` fails | Existing error state (`stage = 'error'`) — no change |
| Transcript fields missing from response (old server) | Gracefully fall back to empty strings |

---

## Architecture

**Backend change (small):**  
`scripts/serve.py` — `save_audio_endpoint()` response dict extended:
```python
return JSONResponse(content={
    "token": row["token"],
    "audio_url": audio_url,
    "transcript_raw": transcript_raw,        # new
    "transcript_english": transcript_english, # new
})
```

**Frontend — new stage:**  
`capture/page.tsx` — add `'direct-review'` to the `Stage` type. After `saveAudioDirect()` resolves, instead of `router.push(...)`, set `stage = 'direct-review'` and store the response in state.

**New component:**  
`frontend/components/SingleScreenReview.tsx` — props:
```typescript
type Props = {
  token: string
  initialTitle: string
  transcriptRaw: string
  transcriptEnglish: string
  memoryType: string
  onReRecord: () => void
}
```

**Type picker — no new component:**  
Inline in `capture/page.tsx` as a chip row, rendered when `mode === 'direct' && stage === 'idle'`. State: `const [memoryType, setMemoryType] = useState<string>('song')`.

---

## Decisions

```
[2026-07-08] [Single-screen review] — Decision: Save immediately, show review with transcript from response, PATCH only if title changed. Rejected: hold blob and save on review confirmation. Because: simpler (one POST instead of POST+blob management); the review is primarily for title correction, not a save gate.
[2026-07-08] [Type picker placement] — Decision: Before recording (capture screen). Rejected: on review screen. Because: type frames the recording intention, not the output inspection.
```
