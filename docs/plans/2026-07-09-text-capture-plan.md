# Text Capture ("Their Words") — Build Plan

**Goal:** Add a "Their words" paste-to-save flow on the upload page, rename Moral → Wisdom, add Poem type, and wire Call A translation for pasted text.

**Layer:** Multi-layer — Python backend + frontend.

**Architecture:** New `POST /save-text` JSON endpoint mirrors `/save-audio` but takes plain text instead of a file. It calls `translate_to_english()` (Call A, already exists) to produce `transcript_english`, then inserts into `memories`. Frontend adds a third tab "Their words" on the upload page with a textarea, type picker (updated set), narrator picker, title field, and the same `SingleScreenReview` intercept used by the audio direct flow. No new DB columns needed — `transcript_raw` and `transcript_english` already exist.

**Design doc:** `docs/plans/2026-07-09-text-capture-design.md`

**Pre-read findings:**
- `scripts/serve.py:115` — `_VALID_MEMORY_TYPES = {"recipe", "song", "story", "fable", "moral"}` — add "poem", "wisdom"; remove "moral"
- `scripts/serve.py:42` — `run_transcribe` imported at module level; `translate_to_english` must also be imported at module level (so `patch("scripts.serve.translate_to_english")` works in tests)
- `tests/test_save_audio.py` — mock pattern: `patch("scripts.serve.translate_to_english", return_value="...")`, `patch("tools.storage.insert_recipe", side_effect=_mock_insert)`, `patch("scripts.serve.check_rate_limit_db", return_value=0)`, `patch("tools.storage._client")`
- `frontend/lib/api.ts:92` — `api.audio.save()` pattern to mirror for `api.text.save()`
- `frontend/app/(app)/upload/page.tsx` — three-tab mode switch already exists (ai / direct); add third tab "text"
- Type picker appears in: `capture/page.tsx`, `upload/page.tsx`, `SingleScreenReview.tsx`, `memories/page.tsx`, `lib/share.ts`

---

## Chunk P.1 — `POST /save-text` endpoint + type set update

**Files:**
- Modify: `scripts/serve.py`
- Create: `tests/test_save_text.py`

### Step 1: Failing tests

```python
# tests/test_save_text.py
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from scripts.serve import app, require_auth

_DUMMY_USER = {"sub": "test-user-id", "email": "test@example.com"}

def _mock_insert(row_dict):
    row_dict.setdefault("id", "abc-123")
    row_dict.setdefault("token", "tok-txt")
    return row_dict


class TestSaveTextEndpoint:
    def test_saves_memory_with_pasted_text_as_transcript_raw(self):
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        inserted = []
        def capture(row):
            inserted.append(row)
            return {**row, "id": "abc", "token": "tok"}
        try:
            with patch("scripts.serve.translate_to_english", return_value="A song about raja"), \
                 patch("scripts.serve.check_rate_limit_db", return_value=0), \
                 patch("tools.storage.insert_recipe", side_effect=capture), \
                 patch("tools.storage._client"):
                resp = TestClient(app).post("/save-text", json={
                    "title": "రాజశేఖర్ కవిత", "text": "రాజశేఖర్", "memory_type": "poem"
                })
            assert resp.status_code == 200
            assert inserted[0]["transcript_raw"] == "రాజశేఖర్"
        finally:
            app.dependency_overrides.clear()

    def test_translation_called_with_pasted_text(self):
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        try:
            with patch("scripts.serve.translate_to_english", return_value="English") as mock_t, \
                 patch("scripts.serve.check_rate_limit_db", return_value=0), \
                 patch("tools.storage.insert_recipe", side_effect=_mock_insert), \
                 patch("tools.storage._client"):
                TestClient(app).post("/save-text", json={
                    "title": "Poem", "text": "రాజశేఖర్", "memory_type": "poem"
                })
            assert mock_t.called
            assert mock_t.call_args[0][0] == "రాజశేఖర్"
        finally:
            app.dependency_overrides.clear()

    def test_response_includes_transcript_fields(self):
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        try:
            with patch("scripts.serve.translate_to_english", return_value="English version"), \
                 patch("scripts.serve.check_rate_limit_db", return_value=0), \
                 patch("tools.storage.insert_recipe", side_effect=_mock_insert), \
                 patch("tools.storage._client"):
                resp = TestClient(app).post("/save-text", json={
                    "title": "Poem", "text": "పాట", "memory_type": "poem"
                })
            body = resp.json()
            assert body["transcript_raw"] == "పాట"
            assert body["transcript_english"] == "English version"
            assert "token" in body
        finally:
            app.dependency_overrides.clear()

    def test_empty_title_returns_400(self):
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        try:
            with patch("tools.storage._client"):
                resp = TestClient(app).post("/save-text", json={
                    "title": "", "text": "పాట", "memory_type": "poem"
                })
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_empty_text_returns_400(self):
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        try:
            with patch("tools.storage._client"):
                resp = TestClient(app).post("/save-text", json={
                    "title": "Poem", "text": "", "memory_type": "poem"
                })
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_translation_failure_saves_with_empty_english(self):
        app.dependency_overrides[require_auth] = lambda: _DUMMY_USER
        inserted = []
        def capture(row):
            inserted.append(row)
            return {**row, "id": "abc", "token": "tok"}
        try:
            with patch("scripts.serve.translate_to_english", side_effect=Exception("OpenAI down")), \
                 patch("scripts.serve.check_rate_limit_db", return_value=0), \
                 patch("tools.storage.insert_recipe", side_effect=capture), \
                 patch("tools.storage._client"):
                resp = TestClient(app).post("/save-text", json={
                    "title": "Poem", "text": "పాట", "memory_type": "poem"
                })
            assert resp.status_code == 200
            assert inserted[0]["transcript_english"] == ""
        finally:
            app.dependency_overrides.clear()
```

### Step 2: Watch them fail
```bash
python -m pytest tests/test_save_text.py -v
# Expected: FAILED — ImportError or 404 (endpoint doesn't exist yet)
```

### Step 3: Implementation in `scripts/serve.py`

Add after the `run_transcribe` import line (~line 42):
```python
from prompts.translate_audio import translate_to_english
from prompts.llm import OpenAIProvider
```

Update line 115:
```python
_VALID_MEMORY_TYPES = {"recipe", "song", "story", "fable", "wisdom", "poem"}
```

Add Pydantic model (near other models in serve.py):
```python
class SaveTextRequest(BaseModel):
    title: str
    text: str
    memory_type: str = "poem"
    narrator: str = ""
```

Add endpoint (after `/save-audio`):
```python
@app.post("/save-text")
async def save_text_endpoint(body: SaveTextRequest, user: dict = Depends(require_auth)):
    user_id = _user_id(user)
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="title is required")
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    if body.memory_type not in _VALID_MEMORY_TYPES:
        raise HTTPException(status_code=400, detail=f"invalid memory_type: {body.memory_type}")

    _check_rate_limit_db_or_raise(user_id, "capture", _LIMITS["capture"])

    english = ""
    try:
        config = load_config()
        model = config["llm"].get("translate_model", config["llm"]["model"])
        provider = OpenAIProvider(model=model)
        english = translate_to_english(body.text.strip(), provider)
    except Exception:
        pass

    row = insert_recipe({
        "title": body.title.strip(),
        "narrator": body.narrator.strip() or None,
        "transcript_raw": body.text.strip(),
        "transcript_english": english,
        "type": body.memory_type,
        "user_id": user_id,
    })

    return JSONResponse(content={
        "token": row["token"],
        "transcript_raw": body.text.strip(),
        "transcript_english": english,
    })
```

Note: `load_config` and `insert_recipe` are already imported in serve.py.

### Step 4: Watch them pass
```bash
python -m pytest tests/test_save_text.py -v
python -m pytest tests/ -q  # must stay at 197+
```

### Step 5: Commit
```bash
git add scripts/serve.py tests/test_save_text.py
git commit -m "[Add] [serve]: POST /save-text endpoint — paste text, Call A translate, save as memory (Chunk P.1)"
```

---

## Chunk U.1 — Rename Moral → Wisdom, add Poem (frontend sweep)

**Files:**
- Modify: `frontend/app/(app)/capture/page.tsx`
- Modify: `frontend/components/SingleScreenReview.tsx`
- Modify: `frontend/app/(app)/memories/page.tsx`
- Modify: `frontend/lib/share.ts`

No tests — verification is `next build`.

### Changes

**`capture/page.tsx`** — MEMORY_TYPES constant:
```tsx
// Before
{ value: 'moral', label: '🙏 Moral' },
// After
{ value: 'wisdom', label: '🙏 Wisdom' },
{ value: 'poem',   label: '🖊️ Poem' },
```

**`SingleScreenReview.tsx`** — TYPE_LABELS:
```tsx
// Before
moral: '🙏 Moral',
// After
wisdom: '🙏 Wisdom',
poem:   '🖊️ Poem',
moral:  '🙏 Wisdom',   // alias — handles any existing saved records
```

**`memories/page.tsx`** — AUDIO_TYPE_FILTERS:
```tsx
// Before
{ value: 'moral', label: '🙏 Morals' },
// After
{ value: 'wisdom', label: '🙏 Wisdom' },
{ value: 'poem',   label: '🖊️ Poems' },
```
Also update `displayed` memo type filter: add `'wisdom'` and `'poem'` to the array:
```tsx
else if (['song', 'story', 'fable', 'wisdom', 'poem'].includes(filter)) list = list.filter(m => m.type === filter)
```

**`lib/share.ts`** — add wisdom + poem entries to EN and TE maps:
```tsx
// In EN:
wisdom: (n, t) => `${n} shares a piece of wisdom: "${t}" 🙏`,
poem:   (n, t) => `${n} — "${t}" 🖊️`,
// In TE:
wisdom: (n, t) => `${n} ఒక జ్ఞాన వాక్యం: "${t}" 🙏`,
poem:   (n, t) => `${n} — "${t}" 🖊️`,
```
Also rename `moral` entries to `wisdom` (keep `moral` as alias if present).

### Step: Build + commit
```bash
cd frontend && node_modules/.bin/next build
# Expected: ✓ Compiled, 20 static routes, 0 TS errors
git add frontend/app/\(app\)/capture/page.tsx frontend/components/SingleScreenReview.tsx frontend/app/\(app\)/memories/page.tsx frontend/lib/share.ts
git commit -m "[Update] [frontend]: rename Moral → Wisdom, add Poem type across type pickers and share messages (Chunk U.1)"
```

---

## Chunk U.2 — "Their words" tab on upload page

**Files:**
- Modify: `frontend/app/(app)/upload/page.tsx`
- Modify: `frontend/lib/api.ts`

No tests — verification is `next build`.

### Changes

**`frontend/lib/api.ts`** — add `api.text` namespace:
```typescript
text: {
  save: (body: { title: string; text: string; memory_type: string; narrator?: string }) =>
    authFetch('/save-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
},
```

**`frontend/app/(app)/upload/page.tsx`** changes:

1. Import `api.text`:
   - Already imported from `@/lib/api`

2. Add `import SingleScreenReview` (already added in T.1 this session).

3. Extend mode type to include `'text'`:
```tsx
const [mode, setMode] = useState<'ai' | 'direct' | 'text'>('ai')
```

4. Add third tab in the mode tabs row:
```tsx
{ value: 'text', label: '🖊️ Their words' }
```

5. Add `handleSaveText` handler:
```tsx
async function handleSaveText() {
  if (!title.trim()) { setError('Please enter a title first.'); return }
  if (!textContent.trim()) { setError('Please paste some text first.'); return }
  setProcessing(true)
  setError('')
  try {
    const result = await api.text.save({
      title: title.trim(),
      text: textContent.trim(),
      memory_type: memoryType,
      narrator: narrator || undefined,
    }) as { token: string; transcript_raw: string; transcript_english: string }
    setDirectReview({
      token: result.token,
      transcriptRaw: result.transcript_raw,
      transcriptEnglish: result.transcript_english,
    })
  } catch (e: unknown) {
    setError((e as Error).message)
  } finally {
    setProcessing(false)
  }
}
```

6. Add `textContent` state:
```tsx
const [textContent, setTextContent] = useState('')
```

7. Add "Their words" mode UI block (between the mode tabs and the drop zone — only shown when `mode === 'text'`):
```tsx
{mode === 'text' && (
  <>
    {/* Type picker */}
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Type</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {([
          { value: 'poem',    label: '🖊️ Poem' },
          { value: 'story',   label: '📖 Story' },
          { value: 'wisdom',  label: '🙏 Wisdom' },
          { value: 'fable',   label: '✨ Fable' },
          { value: 'song',    label: '🎵 Song' },
        ] as const).map(({ value, label }) => (
          <button key={value} type="button" onClick={() => setMemoryType(value)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid var(--border)',
              background: memoryType === value ? 'var(--accent)' : 'transparent',
              color: memoryType === value ? 'white' : 'var(--muted)',
              fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)',
            }}>{label}</button>
        ))}
      </div>
    </div>

    {/* Title */}
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Title *</div>
      <input type="text" value={title} onChange={e => setTitle(e.target.value)}
        placeholder="e.g. Rajasekhar poem, Dad's blessing…"
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 10, padding: '0.65rem 0.85rem', fontSize: '0.9rem', fontFamily: 'var(--sans)', background: 'var(--surface)', color: 'var(--text)' }} />
    </div>

    {/* Narrator */}
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Author</div>
      <NarratorChip selected={narrator} onSelect={setNarrator} />
    </div>

    {/* Paste area */}
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Content *</div>
      <textarea
        value={textContent}
        onChange={e => setTextContent(e.target.value)}
        placeholder="Paste the poem, story, blessing, or proverb here…"
        rows={10}
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 12, padding: '0.85rem', fontSize: '0.9rem', fontFamily: 'var(--sans)', background: 'var(--surface)', color: 'var(--text)', resize: 'vertical', lineHeight: 1.7 }}
      />
    </div>

    {error && <p style={{ color: 'var(--accent)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}

    <button
      onClick={handleSaveText}
      disabled={processing || !title.trim() || !textContent.trim()}
      style={{
        width: '100%', padding: '0.75rem', borderRadius: 12, border: 'none',
        background: 'var(--accent)', color: 'white', fontWeight: 700, fontSize: '0.95rem',
        cursor: (processing || !title.trim() || !textContent.trim()) ? 'default' : 'pointer',
        opacity: (processing || !title.trim() || !textContent.trim()) ? 0.7 : 1,
        fontFamily: 'var(--sans)',
      }}
    >
      {processing ? '✨ Translating & saving…' : 'Save Memory'}
    </button>
  </>
)}
```

8. The existing `directReview` intercept already handles the post-save review — no change needed there.

9. The existing dropzone block should only render when `mode !== 'text'`:
```tsx
{mode !== 'text' && (
  <label ...> {/* existing dropzone */} </label>
)}
```

### Step: Build + commit
```bash
cd frontend && node_modules/.bin/next build
# Expected: ✓ Compiled, 20 static routes, 0 TS errors
git add frontend/app/\(app\)/upload/page.tsx frontend/lib/api.ts
git commit -m "[Add] [frontend]: 'Their words' text paste tab on upload page — poem/wisdom/story input with Call A translation (Chunk U.2)"
```

---

## Completion gate

- [ ] P.1 committed — `POST /save-text` green, tests at 203+ (197 + 6 new)
- [ ] U.1 committed — type picker shows Wisdom + Poem, Moral gone, `next build` clean
- [ ] U.2 committed — "Their words" tab functional, `next build` clean
- [ ] Full suite: `python -m pytest tests/ -q` — green
- [ ] `/audit` passes
- [ ] `/closeout`
