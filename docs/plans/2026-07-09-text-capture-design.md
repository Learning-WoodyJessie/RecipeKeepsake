# Text Capture ("Their Words") — Design PRD

## Goal
Let users paste text content (poems, proverbs, blessings, stories) from any source directly into Echoes of Home — no audio required — and save it as a translated, searchable memory.

## Audience
You (interactive) — paste content shared by family on WhatsApp, email, notes apps, or typed directly.

## Scope — what we're NOT building
- OCR / photo-to-text (scan a handwritten poem) — separate feature
- Rich text formatting (bold, italics) — plain text only
- Post-save editing of transcript text — same rule as audio; only title and personal annotation editable post-save
- A new memory type for every sub-genre — five types covers it (see below)

---

## Type set changes (apply everywhere)

| Old | New | Emoji |
|-----|-----|-------|
| Song | Song | 🎵 |
| Story | Story | 📖 |
| Fable | Fable | ✨ |
| Moral | **Wisdom** (renamed) | 🙏 |
| *(new)* | **Poem** | 🖊️ |

The rename `moral → wisdom` and addition of `poem` must be swept across:
- `frontend/app/(app)/capture/page.tsx` — type picker chips
- `frontend/app/(app)/upload/page.tsx` — type picker chips
- `frontend/components/SingleScreenReview.tsx` — TYPE_LABELS
- `frontend/app/(app)/memories/page.tsx` — AUDIO_TYPE_FILTERS
- `frontend/lib/share.ts` — EN/TE message builders
- `frontend/app/(app)/family/page.tsx` — type display if present
- `scripts/serve.py` — `_VALID_MEMORY_TYPES` set
- `pipeline/persist.py` — if type referenced

---

## Core Requirements

1. **"Their words" tab** on the upload page alongside "Their recipe" and "Their voice".
2. **Textarea** — large, paste-friendly, no character limit shown (Supabase text column is unbounded).
3. **Type picker** — same chip row as voice mode: Song / Story / Fable / Wisdom / Poem.
4. **Narrator picker** — same `NarratorChip` component as other modes.
5. **Title field** — required before save (same as voice direct mode).
6. **Save flow**:
   - POST to new `POST /save-text` endpoint
   - Backend translates via Call A (`translate_to_english()`) — saves as `transcript_english`
   - Pasted text saved verbatim as `transcript_raw`
   - Returns `{ token, transcript_raw, transcript_english }`
7. **Review screen** — same `SingleScreenReview` component used after save (shows pasted text + English translation).
8. **Rate limiting** — counts against `MAX_CAPTURE_PER_DAY` (same as audio, it's an LLM call).
9. No audio URL, no image generation — `audio_url` and `image_url` are null for text memories.

---

## Pipeline

```
User pastes text
      ↓
POST /save-text { title, text, memory_type, narrator }
      ↓
translate_to_english(text)   ← Call A (same function as audio pipeline)
      ↓
insert_memory({ title, transcript_raw=text, transcript_english, type, narrator, user_id })
      ↓
{ token, transcript_raw, transcript_english }
      ↓
SingleScreenReview
```

---

## Backend endpoint

```python
class SaveTextRequest(BaseModel):
    title: str
    text: str
    memory_type: str = "poem"
    narrator: str = ""

POST /save-text  (JWT auth required, rate limited)
→ 200: { token, transcript_raw, transcript_english }
→ 400: missing title or empty text
→ 429: daily limit reached
```

---

## Success Criteria

- Paste Telugu poem → save → memory detail shows original Telugu + English translation side by side
- Type "Wisdom" appears in the type picker and browse filter tabs
- Type "Poem" appears in the type picker and browse filter tabs
- "Moral" no longer appears anywhere in the UI
- Text memory has no audio player (no `audio_url`)
- WhatsApp share message works for Poem and Wisdom types
- `next build` clean, tests at 197+ (new `/save-text` tests added)

---

## Edge Cases & Failure Modes

| Case | Behaviour |
|------|-----------|
| Translation (Call A) fails | Save memory with `transcript_english = ""` — don't block the save |
| Text is English only | translate_to_english returns it largely unchanged — fine |
| User pastes very long text (10 000+ chars) | No frontend cap; backend passes to OpenAI (128k context) — fine |
| Title left empty | Frontend blocks submit (same as voice mode) |
| Empty textarea | Frontend blocks submit — "Please paste some text first." |
| Memory saved, review crashes | Token exists in DB; user can find it in memories list |
