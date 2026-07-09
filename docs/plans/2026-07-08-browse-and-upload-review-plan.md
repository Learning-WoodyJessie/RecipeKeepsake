# Browse by Type + Upload Review — Build Plan

**Goal:** (T.1) Wire SingleScreenReview into the upload flow. (T.2) Add type-based filter tabs (Song/Story/Fable/Moral) in the audio memories browse view.

**Layer:** Frontend only — no Python changes, no new tests. Verification: `next build`.

**Architecture:** Two small chunks. T.1 mirrors what S.3 did for the capture/record flow — intercept the post-save navigation in `handleFileDirect` and render `SingleScreenReview` instead. T.2 extends the memories page right-panel filter for audio mode: replace the "All / Favorites" pair with "All / Song / Story / Fable / Moral / Favorites", and update the `displayed` memo to filter by `m.type` when a type chip is active.

**C (per-type Call B prompts) is deferred** — it requires a brainstorm to settle fable/moral schema, display sections, and pipeline routing before building.

**Design doc:** `docs/plans/2026-07-08-single-screen-review-design.md` (same feature family)

**Pre-read findings:**
- `upload/page.tsx:181` — `handleFileDirect` calls `api.audio.save(form)` then `router.push(...)` directly. Already has `memoryType` state (line 177).
- `upload/page.tsx:202` — `if (draft && audioFile) return <ReviewWizard ...>` — intercept point is immediately before this.
- `memories/page.tsx:14` — `Memory` type missing `type` field. API already returns it (same endpoint, same row).
- `memories/page.tsx:146–163` — audio mode right panel shows only "All" and "Favorites". Replace with full type set.
- `memories/page.tsx:448` — filter logic `else if (filter !== 'All') list.filter(m => tags.includes(filter))` — add a type-specific branch before this.

---

## Chunk T.1 — Upload flow: SingleScreenReview after direct save

**Files:**
- Modify: `frontend/app/(app)/upload/page.tsx`

**Changes:**

1. Add import at top:
```typescript
import SingleScreenReview from '@/components/SingleScreenReview'
```

2. Add `directReview` state after `audioFile` state:
```typescript
const [directReview, setDirectReview] = useState<{ token: string; transcriptRaw: string; transcriptEnglish: string } | null>(null)
```

3. Replace `handleFileDirect` body after the `try`:
```typescript
// Before
const result = await api.audio.save(form) as { token: string }
router.push(`/memory?token=${result.token}&justSaved=1`)

// After
const result = await api.audio.save(form) as { token: string; transcript_raw?: string; transcript_english?: string }
setDirectReview({
  token: result.token,
  transcriptRaw: result.transcript_raw ?? '',
  transcriptEnglish: result.transcript_english ?? '',
})
```

4. Add render intercept before the existing `if (draft && audioFile)` check (line 202):
```tsx
if (directReview) {
  return (
    <SingleScreenReview
      token={directReview.token}
      initialTitle={title}
      transcriptRaw={directReview.transcriptRaw}
      transcriptEnglish={directReview.transcriptEnglish}
      memoryType={memoryType}
      onReRecord={() => setDirectReview(null)}
    />
  )
}
```

**Step 1: Watch it pass**
```bash
cd frontend && node_modules/.bin/next build
# Expected: ✓ Compiled, 20 static routes, 0 TS errors
```

**Step 2: Commit**
```bash
git add "frontend/app/(app)/upload/page.tsx"
git commit -m "[Add] [frontend]: SingleScreenReview after upload in direct mode (Chunk T.1)"
```

---

## Chunk T.2 — Memories browse: type filter tabs for audio mode

**Files:**
- Modify: `frontend/app/(app)/memories/page.tsx`

**Changes:**

1. Add `type` to the `Memory` type:
```typescript
type Memory = {
  token: string
  title: string | null
  narrator: string | null
  recorded_at: string
  image_url: string | null
  tags: string[] | null
  type?: string | null   // ← add this
}
```

2. Add constant after `SORT_OPTIONS`:
```typescript
const AUDIO_TYPE_FILTERS = [
  { value: 'All',   label: 'All' },
  { value: 'song',  label: '🎵 Songs' },
  { value: 'story', label: '📖 Stories' },
  { value: 'fable', label: '✨ Fables' },
  { value: 'moral', label: '🙏 Morals' },
  { value: 'Favorites', label: '♥ Favorites' },
] as const
```

3. Replace the audio-mode filter box in `RightPanel` (currently lines ~146–163 showing only "All" and "Favorites"):
```tsx
{isAudioMode && (
  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.25rem', boxShadow: '0 4px 16px rgba(45,27,14,0.05)' }}>
    <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', marginBottom: '1rem' }}>
      Filter memories
    </h3>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
      {AUDIO_TYPE_FILTERS.map(({ value, label }) => {
        const isFav = value === 'Favorites'
        const active = filter === value
        return (
          <button key={value} onClick={() => setFilter(value)}
            style={{
              padding: '0.3rem 0.75rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 500,
              border: '1.5px solid', cursor: 'pointer',
              borderColor: active ? (isFav ? 'var(--amber)' : 'var(--accent)') : 'var(--border)',
              background: active ? (isFav ? 'var(--gold-light)' : 'var(--accent-light)') : 'transparent',
              color: active ? (isFav ? 'var(--amber)' : 'var(--accent)') : 'var(--text2)',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  </div>
)}
```

4. Update `displayed` memo filter logic — add type branch before the tag-based catch-all:
```typescript
// Before
else if (filter !== 'All') list = list.filter(m => (m.tags ?? []).includes(filter))

// After
else if (['song', 'story', 'fable', 'moral'].includes(filter)) list = list.filter(m => m.type === filter)
else if (filter !== 'All') list = list.filter(m => (m.tags ?? []).includes(filter))
```

**Step 1: Watch it pass**
```bash
cd frontend && node_modules/.bin/next build
# Expected: ✓ Compiled, 20 static routes, 0 TS errors
```

**Step 2: Commit**
```bash
git add "frontend/app/(app)/memories/page.tsx"
git commit -m "[Add] [frontend]: type filter tabs (Song/Story/Fable/Moral) in audio memories browse (Chunk T.2)"
```

---

## Completion gate

- [ ] T.1 committed — upload flow shows SingleScreenReview, `next build` clean
- [ ] T.2 committed — audio browse has type tabs, `next build` clean
- [ ] Full suite: `python -m pytest tests/ -q` — stays at 197
- [ ] `/audit` passes
- [ ] `/closeout`

## Deferred

- C (per-type Call B prompts for fable/moral) — needs brainstorm to settle schema and detail-page display before building
