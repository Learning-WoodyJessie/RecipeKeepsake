# Single-Screen Review + Type Picker — Build Plan

**Goal:** After a song/story recording, show a single review screen with editable title + transcript before navigating to the memory page. Add a type picker (Song/Story/Fable/Moral) before recording.

**Layer:** Multi-layer — Python serve.py (response) + Next.js frontend (new component + capture flow)

**Architecture:** Three chunks. S.1 extends `/save-audio` response to include transcript fields (backend, with test). S.2 adds a type picker in `direct` mode (frontend only, build verification). S.3 creates `SingleScreenReview` component and wires it into the capture flow via a new `'direct-review'` stage (frontend only, build verification). No new endpoints. PATCH `/recipe/{token}` (already exists) handles title correction on confirm.

**Design doc:** `docs/plans/2026-07-08-single-screen-review-design.md`

**Pre-read findings:**
- `/save-audio` currently returns `{"token": ..., "audio_url": ...}` — transcript fields are computed but not returned.
- `api.recipes.patch(token, body)` already exists in `frontend/lib/api.ts:62` — no new API function needed.
- `Stage` type in `capture/page.tsx:14` is `'idle' | 'recording' | 'processing' | 'review' | 'error'` — needs `'direct-review'` added.
- `saveAudioDirect()` at `capture/page.tsx:230` calls `api.audio.save()` and immediately `router.push(...)` — this is where we intercept.
- `_VALID_MEMORY_TYPES = {"recipe", "song", "story", "fable", "moral"}` in `serve.py:115`.
- Test mock pattern: `dependency_overrides[require_auth] = lambda: _DUMMY_USER`, `data={}` for form fields, `files={}` for file upload (learned from test_save_audio.py).

---

## Chunk S.1 — Backend: `/save-audio` returns transcript fields

**Files:**
- Modify: `scripts/serve.py` — extend response JSON
- Modify: `tests/test_save_audio.py` — add response-body assertion test

**Step 1: Failing test**
```python
# Add to tests/test_save_audio.py inside TestSaveAudioTranscription:

def test_response_includes_transcript_fields(self):
    """POST /save-audio response body includes transcript_raw and transcript_english."""
    app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
    try:
        mock_transcript = MagicMock()
        mock_transcript.raw = "ఒక పాట"
        mock_transcript.english = "A song"

        with patch("scripts.serve.run_transcribe", return_value=mock_transcript), \
             patch("scripts.serve.check_rate_limit_db", return_value=0), \
             patch("tools.storage.upload_audio"), \
             patch("tools.storage.insert_recipe", side_effect=_mock_insert), \
             patch("tools.storage._sign_audio", return_value="https://signed.url/audio.mp3"), \
             patch("tools.storage._client"):
            client = TestClient(app)
            response = client.post(
                "/save-audio",
                files={"audio": ("test.mp3", io.BytesIO(_MP3_MAGIC), "audio/mpeg")},
                data={"title": "Lullaby", "memory_type": "song"},
            )

        assert response.status_code == 200
        body = response.json()
        assert "transcript_raw" in body
        assert "transcript_english" in body
        assert body["transcript_raw"] == "ఒక పాట"
        assert body["transcript_english"] == "A song"
    finally:
        app.dependency_overrides.clear()
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_save_audio.py::TestSaveAudioTranscription::test_response_includes_transcript_fields -v
# Expected: FAILED — KeyError or assert "transcript_raw" in body fails
```

**Step 3: Minimal implementation**

In `scripts/serve.py`, find the return statement in `save_audio_endpoint` (~line 750):
```python
# Before
return JSONResponse(content={"token": row["token"], "audio_url": audio_url})

# After
return JSONResponse(content={
    "token": row["token"],
    "audio_url": audio_url,
    "transcript_raw": transcript_raw,
    "transcript_english": transcript_english,
})
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_save_audio.py -v
python -m pytest tests/ -q  # full suite — must stay green
```

**Step 5: Commit**
```bash
git add scripts/serve.py tests/test_save_audio.py
git commit -m "[Add] [serve]: return transcript_raw and transcript_english in /save-audio response (Chunk S.1)"
```

---

## Chunk S.2 — Frontend: type picker in direct mode

**Files:**
- Modify: `frontend/app/(app)/capture/page.tsx` — add `memoryType` state + chip row + pass to form

**No Python test needed — frontend-only change. Verification: `next build`.**

**Step 1: Add `memoryType` state and pass it to `saveAudioDirect`**

In `CapturePageInner()` state declarations (after `description` state ~line 132):
```typescript
const [memoryType, setMemoryType] = useState<string>('song')
```

In `saveAudioDirect()` form assembly (~line 232), add before the `try`:
```typescript
form.append('memory_type', memoryType)
```

**Step 2: Add type picker chips**

Add the following constant at top of file (after `TIPS_AUDIO`):
```typescript
const MEMORY_TYPES = [
  { value: 'song',  label: 'Song',  emoji: '🎵' },
  { value: 'story', label: 'Story', emoji: '📖' },
  { value: 'fable', label: 'Fable', emoji: '✨' },
  { value: 'moral', label: 'Moral', emoji: '🙏' },
] as const
```

In the render section, after the mode tabs `</div>` and before the "Title + description for direct mode" section (~line 313), add:
```tsx
{/* Type picker — direct mode only */}
{mode === 'direct' && (stage === 'idle' || stage === 'recording') && (
  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
    {MEMORY_TYPES.map(t => (
      <button
        key={t.value}
        onClick={() => setMemoryType(t.value)}
        disabled={stage === 'recording'}
        style={{
          padding: '5px 14px',
          borderRadius: 20,
          border: `1px solid ${memoryType === t.value ? 'var(--accent)' : 'var(--border)'}`,
          background: memoryType === t.value ? 'var(--accent-light)' : 'transparent',
          color: memoryType === t.value ? 'var(--accent)' : 'var(--muted)',
          fontSize: 13,
          cursor: stage === 'recording' ? 'default' : 'pointer',
          fontFamily: 'var(--sans)',
          fontWeight: memoryType === t.value ? 600 : 400,
        }}
      >
        {t.emoji} {t.label}
      </button>
    ))}
  </div>
)}
```

**Step 3: Watch it pass**
```bash
cd frontend && node_modules/.bin/next build
# Expected: ✓ Compiled, 20 static routes, 0 TS errors
```

**Step 4: Commit**
```bash
git add "frontend/app/(app)/capture/page.tsx"
git commit -m "[Add] [frontend]: type picker (Song/Story/Fable/Moral) before recording in direct mode (Chunk S.2)"
```

---

## Chunk S.3 — Frontend: SingleScreenReview component + wire into capture

**Files:**
- Create: `frontend/components/SingleScreenReview.tsx`
- Modify: `frontend/app/(app)/capture/page.tsx` — add `'direct-review'` stage, intercept post-save

**No Python test needed — frontend-only change. Verification: `next build`.**

**Step 1: Create `SingleScreenReview.tsx`**

```tsx
// frontend/components/SingleScreenReview.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

const TYPE_LABELS: Record<string, string> = {
  song:  '🎵 Song',
  story: '📖 Story',
  fable: '✨ Fable',
  moral: '🙏 Moral',
}

type Props = {
  token: string
  initialTitle: string
  transcriptRaw: string
  transcriptEnglish: string
  memoryType: string
  onReRecord: () => void
}

export default function SingleScreenReview({
  token, initialTitle, transcriptRaw, transcriptEnglish, memoryType, onReRecord,
}: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      if (title.trim() && title.trim() !== initialTitle) {
        await api.recipes.patch(token, { title: title.trim() })
      }
      router.push(`/memory?token=${token}&justSaved=1`)
    } catch {
      router.push(`/memory?token=${token}&justSaved=1`)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '1.5rem 1.25rem 5rem' }}>
      {/* Back / re-record */}
      <button
        onClick={onReRecord}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, marginBottom: '1.5rem', fontFamily: 'var(--sans)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Re-record
      </button>

      {/* Type badge */}
      <div style={{ marginBottom: '1rem' }}>
        <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}>
          {TYPE_LABELS[memoryType] ?? memoryType}
        </span>
      </div>

      {/* Title */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.4rem' }}>
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '0.65rem 0.85rem', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '0.95rem',
          }}
        />
      </div>

      {/* Transcript */}
      {(transcriptRaw || transcriptEnglish) ? (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.75rem' }}>
            Transcript
          </p>
          {transcriptRaw && (
            <div style={{ marginBottom: '0.75rem' }}>
              <p style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>Original</p>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem', fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.85 }}>
                {transcriptRaw}
              </div>
            </div>
          )}
          {transcriptEnglish && (
            <div>
              <p style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>English</p>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem', fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.85 }}>
                {transcriptEnglish}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: '1.5rem', padding: '0.85rem', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '0.85rem' }}>
          No transcript generated.
        </div>
      )}

      {/* Sticky save bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '0.75rem 1rem', display: 'flex', gap: '0.75rem', zIndex: 20 }}>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          style={{
            flex: 1, padding: '0.75rem', borderRadius: 12, border: 'none',
            background: 'var(--accent)', color: 'white',
            fontWeight: 700, fontSize: '0.95rem', cursor: saving ? 'default' : 'pointer',
            fontFamily: 'var(--sans)', opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save Memory'}
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Wire into `capture/page.tsx`**

Add `'direct-review'` to the `Stage` type:
```typescript
// Before
type Stage = 'idle' | 'recording' | 'processing' | 'review' | 'error'
// After
type Stage = 'idle' | 'recording' | 'processing' | 'review' | 'direct-review' | 'error'
```

Add import at top:
```typescript
import SingleScreenReview from '@/components/SingleScreenReview'
```

Add `directReview` state in `CapturePageInner` (after `audioFile` state):
```typescript
const [directReview, setDirectReview] = useState<{ token: string; transcriptRaw: string; transcriptEnglish: string } | null>(null)
```

Replace `saveAudioDirect` body:
```typescript
async function saveAudioDirect(blob: Blob) {
  const form = new FormData()
  form.append('audio', blob, `recording${extRef.current}`)
  form.append('title', title.trim())
  form.append('memory_type', memoryType)
  if (narrator) form.append('narrator', narrator)
  if (description.trim()) form.append('description', description.trim())
  try {
    const result = await api.audio.save(form) as { token: string; transcript_raw?: string; transcript_english?: string }
    setDirectReview({
      token: result.token,
      transcriptRaw: result.transcript_raw ?? '',
      transcriptEnglish: result.transcript_english ?? '',
    })
    setStage('direct-review')
  } catch (e: unknown) { setError((e as Error).message); setStage('error') }
}
```

Add render intercept before the existing `if (stage === 'review' && draft && audioFile)` check:
```tsx
if (stage === 'direct-review' && directReview) {
  return (
    <SingleScreenReview
      token={directReview.token}
      initialTitle={title}
      transcriptRaw={directReview.transcriptRaw}
      transcriptEnglish={directReview.transcriptEnglish}
      memoryType={memoryType}
      onReRecord={() => { setStage('idle'); setDirectReview(null) }}
    />
  )
}
```

**Step 3: Watch it pass**
```bash
cd frontend && node_modules/.bin/next build
# Expected: ✓ Compiled, 20 static routes, 0 TS errors
```

**Step 4: Commit**
```bash
git add "frontend/components/SingleScreenReview.tsx" "frontend/app/(app)/capture/page.tsx"
git commit -m "[Add] [frontend]: SingleScreenReview component + direct-review stage in capture flow (Chunk S.3)"
```

---

## Completion gate

- [ ] S.1 committed — `/save-audio` returns `transcript_raw` + `transcript_english`, new test green, full suite 197+ passing
- [ ] S.2 committed — type picker visible in direct mode, `next build` clean
- [ ] S.3 committed — `SingleScreenReview` renders after direct recording, `next build` clean
- [ ] `/audit` passes
- [ ] `/closeout`
