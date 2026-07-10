# Photo Upload — Implementation Plan

```
Goal:         Let the Keeper attach a real photo to any memory — in the review wizard and on the detail page.
Layer:        Multi-layer (FastAPI backend + Next.js frontend)
Architecture: New POST /memories/{token}/photo endpoint uploads to a dedicated Supabase Storage
              bucket and PATCHes image_url on the memories row. Frontend holds a File in state
              during the wizard and uploads after save (using the returned token). Detail page
              uploads immediately on file select. All tests mocked — no live Storage calls.
Design doc:   docs/plans/2026-07-09-photo-upload-design.md
```

---

## Block 1 — Backend

### Chunk 1.1 — `_validate_image_upload()` helper

**Files:**
- Modify: `scripts/serve.py` (add helper after `_validate_audio_upload`)
- Create: `tests/test_photo_upload.py`

**Step 1: Failing test**
```python
# tests/test_photo_upload.py
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

# --- helpers ---

def _make_client():
    with patch("tools.storage._client"), \
         patch("scripts.serve.require_auth", return_value={"sub": "u1"}):
        from scripts.serve import app
        return TestClient(app)

JPEG_MAGIC = b"\xff\xd8\xff" + b"\x00" * 100
PNG_MAGIC  = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100

class TestValidateImageUpload:
    def test_rejects_non_image_extension(self):
        client = _make_client()
        with patch("tools.storage._client"), \
             patch("scripts.serve.check_rate_limit_db"):
            res = client.post(
                "/memories/tok1/photo",
                files={"photo": ("evil.exe", b"\xff\xd8\xff" + b"\x00"*100, "application/octet-stream")},
                headers={"Authorization": "Bearer fake"},
            )
        assert res.status_code == 400

    def test_rejects_oversized_file(self):
        client = _make_client()
        big = b"\xff\xd8\xff" + b"\x00" * (6 * 1024 * 1024)
        with patch("tools.storage._client"), \
             patch("scripts.serve.check_rate_limit_db"):
            res = client.post(
                "/memories/tok1/photo",
                files={"photo": ("big.jpg", big, "image/jpeg")},
                headers={"Authorization": "Bearer fake"},
            )
        assert res.status_code == 413

    def test_rejects_non_image_magic_bytes(self):
        client = _make_client()
        with patch("tools.storage._client"), \
             patch("scripts.serve.check_rate_limit_db"):
            res = client.post(
                "/memories/tok1/photo",
                files={"photo": ("fake.jpg", b"PK\x03\x04" + b"\x00"*100, "image/jpeg")},
                headers={"Authorization": "Bearer fake"},
            )
        assert res.status_code == 400
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_photo_upload.py::TestValidateImageUpload -v
# Expected: FAILED — 404 (endpoint doesn't exist yet)
```

**Step 3: Minimal implementation**

Add to `scripts/serve.py` after the existing `_validate_audio_upload` block (~line 165):

```python
# ── Image upload validation ───────────────────────────────────────────────────

_ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
_MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB
_IMAGE_MAGIC = [
    (0, b"\xff\xd8\xff"),           # JPEG
    (0, b"\x89PNG\r\n\x1a\n"),      # PNG
    (0, b"RIFF"),                   # WebP (container)
]

def _validate_image_upload(photo: UploadFile, data: bytes) -> None:
    ext = Path(photo.filename or "").suffix.lower()
    if ext not in _ALLOWED_IMAGE_EXTS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'. Upload JPEG, PNG, or WebP.")
    if len(data) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Photo too large. Maximum size is 5 MB.")
    matched = any(data[off: off + len(sig)] == sig for off, sig in _IMAGE_MAGIC)
    if not matched:
        raise HTTPException(status_code=400, detail="File does not appear to be a valid image.")
```

Then stub the endpoint (so the test can reach it):

```python
@app.post("/memories/{token}/photo")
async def upload_memory_photo_endpoint(
    token: str,
    photo: UploadFile = File(...),
    user: dict = Depends(require_auth),
):
    data = await photo.read()
    _validate_image_upload(photo, data)
    return JSONResponse(content={"image_url": ""})
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_photo_upload.py::TestValidateImageUpload -v
python -m pytest tests/ -q
```

**Step 5: Commit**
```bash
git add scripts/serve.py tests/test_photo_upload.py
git commit -m "[Add] [serve]: _validate_image_upload helper + stub /memories/{token}/photo endpoint"
```

---

### Chunk 1.2 — `upload_memory_photo()` in storage.py

**Files:**
- Modify: `tools/storage.py`
- Modify: `tests/test_photo_upload.py` (add storage tests)

**Step 1: Failing test**
```python
# Append to tests/test_photo_upload.py

class TestUploadMemoryPhoto:
    def test_uploads_to_memory_photos_bucket(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.storage.from_("memory-photos").upload.return_value = None
        mock_sb.storage.from_("memory-photos").get_public_url.return_value = "https://sb.io/photo.jpg"
        monkeypatch.setattr("tools.storage._client", lambda: mock_sb)

        from tools.storage import upload_memory_photo
        url = upload_memory_photo(b"\xff\xd8\xff", "image/jpeg")

        mock_sb.storage.from_("memory-photos").upload.assert_called_once()
        assert url == "https://sb.io/photo.jpg"

    def test_raises_on_storage_error(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.storage.from_("memory-photos").upload.side_effect = Exception("Storage down")
        monkeypatch.setattr("tools.storage._client", lambda: mock_sb)

        from tools.storage import upload_memory_photo
        with pytest.raises(Exception, match="Storage down"):
            upload_memory_photo(b"\xff\xd8\xff", "image/jpeg")
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_photo_upload.py::TestUploadMemoryPhoto -v
# Expected: ImportError — upload_memory_photo doesn't exist
```

**Step 3: Minimal implementation**

Add to `tools/storage.py` after `upload_audio`:

```python
def upload_memory_photo(image_bytes: bytes, content_type: str) -> str:
    """Upload a user photo to the private 'memory-photos' bucket. Returns the public URL."""
    import uuid as _uuid_mod
    sb = _client()
    ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}.get(content_type, ".jpg")
    filename = f"{_uuid_mod.uuid4()}{ext}"
    sb.storage.from_("memory-photos").upload(
        path=filename,
        file=image_bytes,
        file_options={"content-type": content_type, "upsert": "false"},
    )
    return sb.storage.from_("memory-photos").get_public_url(filename)
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_photo_upload.py::TestUploadMemoryPhoto -v
python -m pytest tests/ -q
```

**Step 5: Commit**
```bash
git add tools/storage.py tests/test_photo_upload.py
git commit -m "[Add] [storage]: upload_memory_photo to memory-photos Supabase bucket"
```

---

### Chunk 1.3 — Full `POST /memories/{token}/photo` endpoint

**Files:**
- Modify: `scripts/serve.py` (flesh out the stub)
- Modify: `tests/test_photo_upload.py` (endpoint integration tests)

**Step 1: Failing tests**
```python
# Append to tests/test_photo_upload.py

JPEG = b"\xff\xd8\xff" + b"\x00" * 100

class TestUploadMemoryPhotoEndpoint:
    def _client_with_recipe(self, token="tok1", user_id="u1"):
        """TestClient with auth + recipe owned by user_id."""
        mock_sb = MagicMock()
        mock_sb.table("recipes").select("*").eq("token", token).single().execute.return_value = \
            MagicMock(data={"token": token, "user_id": user_id, "image_url": None})
        mock_sb.table("recipes").update({"image_url": "https://sb.io/photo.jpg"}).eq("token", token).execute.return_value = \
            MagicMock(data=[{"token": token, "image_url": "https://sb.io/photo.jpg"}])
        mock_sb.storage.from_("memory-photos").upload.return_value = None
        mock_sb.storage.from_("memory-photos").get_public_url.return_value = "https://sb.io/photo.jpg"
        with patch("tools.storage._client", return_value=mock_sb), \
             patch("scripts.serve.require_auth", return_value={"sub": user_id}), \
             patch("scripts.serve.check_rate_limit_db"):
            from scripts.serve import app
            return TestClient(app), mock_sb

    def test_happy_path_returns_image_url(self):
        client, _ = self._client_with_recipe()
        res = client.post(
            "/memories/tok1/photo",
            files={"photo": ("dish.jpg", JPEG, "image/jpeg")},
            headers={"Authorization": "Bearer fake"},
        )
        assert res.status_code == 200
        assert res.json()["image_url"] == "https://sb.io/photo.jpg"

    def test_returns_403_for_wrong_user(self):
        mock_sb = MagicMock()
        mock_sb.table("recipes").select("*").eq("token", "tok1").single().execute.return_value = \
            MagicMock(data={"token": "tok1", "user_id": "other_user"})
        with patch("tools.storage._client", return_value=mock_sb), \
             patch("scripts.serve.require_auth", return_value={"sub": "u1"}), \
             patch("scripts.serve.check_rate_limit_db"):
            from scripts.serve import app
            client = TestClient(app)
        res = client.post(
            "/memories/tok1/photo",
            files={"photo": ("dish.jpg", JPEG, "image/jpeg")},
            headers={"Authorization": "Bearer fake"},
        )
        assert res.status_code == 403

    def test_returns_404_when_token_not_found(self):
        mock_sb = MagicMock()
        mock_sb.table("recipes").select("*").eq("token", "bad").single().execute.side_effect = Exception("not found")
        with patch("tools.storage._client", return_value=mock_sb), \
             patch("scripts.serve.require_auth", return_value={"sub": "u1"}), \
             patch("scripts.serve.check_rate_limit_db"):
            from scripts.serve import app
            client = TestClient(app)
        res = client.post(
            "/memories/bad/photo",
            files={"photo": ("dish.jpg", JPEG, "image/jpeg")},
            headers={"Authorization": "Bearer fake"},
        )
        assert res.status_code == 404
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_photo_upload.py::TestUploadMemoryPhotoEndpoint -v
# Expected: FAILED — stub returns "" not the real URL; ownership not checked
```

**Step 3: Full implementation** — replace the stub in `serve.py`:

```python
@app.post("/memories/{token}/photo")
async def upload_memory_photo_endpoint(
    token: str,
    photo: UploadFile = File(...),
    user: dict = Depends(require_auth),
):
    data = await photo.read()
    _validate_image_upload(photo, data)

    check_rate_limit_db(_user_id(user), "image")

    from tools.storage import get_recipe_by_token, patch_recipe, upload_memory_photo
    try:
        recipe = get_recipe_by_token(token)
    except Exception:
        raise HTTPException(status_code=404, detail="Memory not found")

    if recipe.get("user_id") != _user_id(user):
        raise HTTPException(status_code=403, detail="Not your memory")

    content_type = photo.content_type or "image/jpeg"
    image_url = upload_memory_photo(data, content_type)
    patch_recipe(token, {"image_url": image_url})

    return JSONResponse(content={"image_url": image_url})
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_photo_upload.py -v
python -m pytest tests/ -q
# Must stay at 137+ tests
```

**Step 5: Commit**
```bash
git add scripts/serve.py tests/test_photo_upload.py
git commit -m "[Add] [serve]: POST /memories/{token}/photo endpoint with ownership + validation"
```

---

## Block 2 — Frontend

> No unit tests for Next.js components. Verification = `cd frontend && npx next build` after each chunk.

### Chunk 2.1 — `api.memories.uploadPhoto()` in api.ts

**Files:**
- Modify: `frontend/lib/api.ts`

Add a `memories` namespace to the `api` object. The upload uses `FormData` (not JSON) so `authFetch` must not set `Content-Type` — browser sets it automatically with the boundary.

```typescript
// Add inside the `api` object, after `capture`:
memories: {
  async uploadPhoto(token: string, file: File): Promise<{ image_url: string }> {
    const form = new FormData()
    form.append('photo', file)
    return authFetch(`/memories/${token}/photo`, { method: 'POST', body: form })
  },
},
```

**Verify:**
```bash
cd frontend && npx next build 2>&1 | tail -5
```

**Commit:**
```bash
git add frontend/lib/api.ts
git commit -m "[Add] [frontend]: api.memories.uploadPhoto() for photo upload"
```

---

### Chunk 2.2 — Photo section on ReviewWizard Step 3

**Files:**
- Modify: `frontend/components/ReviewWizard.tsx`

**What to change:**

1. Add state: `const [photoFile, setPhotoFile] = useState<File | null>(null)` and `const [photoPreview, setPhotoPreview] = useState<string | null>(draft.image_url ?? null)`

2. In `save()`, after `api.capture.save(...)` returns `saved`, upload the photo if one was selected:
```typescript
async function save() {
  setSaving(true)
  try {
    const saved = await api.capture.save({ ...draft, dish_name: title, ingredients, steps })
    if (photoFile) {
      try {
        const { image_url } = await api.memories.uploadPhoto(saved.token, photoFile)
        // photo attached — image_url is now on the memory
        void image_url
      } catch {
        // non-fatal: memory is saved, photo failed
        setError('Memory saved, but photo upload failed. You can try again from the memory page.')
        setSaving(false)
        router.push(`/memory?token=${saved.token}`)
        return
      }
    }
    router.push(`/memory?token=${saved.token}`)
  } catch (e: unknown) { setError((e as Error).message); setSaving(false) }
}
```

3. Add photo section to the Step 3 render (before the summary line), using a hidden `<input type="file">`:

```tsx
{/* Photo section */}
<div style={{ marginBottom: '1rem' }}>
  <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '0.5rem' }}>
    Photo <span style={{ fontSize: '0.65rem', fontWeight: 400, opacity: 0.7 }}>optional</span>
  </div>
  <input
    id="rw-photo-input"
    type="file"
    accept="image/jpeg,image/png,image/webp"
    style={{ display: 'none' }}
    onChange={e => {
      const f = e.target.files?.[0]
      if (!f) return
      setPhotoFile(f)
      setPhotoPreview(URL.createObjectURL(f))
    }}
  />
  {photoPreview ? (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', height: 140, background: 'var(--cream2)', marginBottom: 4 }}>
      <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <button
        type="button"
        onClick={() => document.getElementById('rw-photo-input')?.click()}
        style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: 8, padding: '4px 10px', color: '#fff', fontSize: '0.78rem', cursor: 'pointer' }}
      >
        Replace
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => document.getElementById('rw-photo-input')?.click()}
      style={{ width: '100%', padding: '1.25rem', border: '1.5px dashed var(--border2)', borderRadius: 10, background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
    >
      📷 Add a photo
      <span style={{ fontSize: '0.7rem' }}>JPEG, PNG or WebP · up to 5 MB</span>
    </button>
  )}
</div>
```

**Verify:**
```bash
cd frontend && npx next build 2>&1 | tail -5
```

**Commit:**
```bash
git add frontend/components/ReviewWizard.tsx
git commit -m "[Add] [frontend]: optional photo upload on ReviewWizard step 3"
```

---

### Chunk 2.3 — "Change photo" / "Add a photo" on memory detail page

**Files:**
- Modify: `frontend/app/(app)/memory/page.tsx`

**What to change:**

1. Add state at the top of the component:
```typescript
const [photoUploading, setPhotoUploading] = useState(false)
const [photoError, setPhotoError] = useState('')
const [localImageUrl, setLocalImageUrl] = useState<string | null>(null)
```

2. Add the upload handler:
```typescript
async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file || !token) return
  const preview = URL.createObjectURL(file)
  setLocalImageUrl(preview)
  setPhotoUploading(true)
  setPhotoError('')
  try {
    const { image_url } = await api.memories.uploadPhoto(token as string, file)
    setLocalImageUrl(image_url)
  } catch (err: unknown) {
    setLocalImageUrl(null)
    setPhotoError((err as Error).message)
  } finally {
    setPhotoUploading(false)
  }
}
```

3. Replace the existing image block (~line 143):

```tsx
{/* Photo section */}
<div style={{ marginBottom: '1.25rem' }}>
  <input id="detail-photo-input" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoChange} />
  {(localImageUrl ?? memory.image_url) ? (
    <div>
      <div style={{ borderRadius: 14, overflow: 'hidden', aspectRatio: '16/9', background: 'var(--cream2)', opacity: photoUploading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        <img src={localImageUrl ?? memory.image_url ?? ''} alt={(display as Memory).dish_name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <button
        type="button"
        onClick={() => document.getElementById('detail-photo-input')?.click()}
        disabled={photoUploading}
        style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text2)' }}
      >
        {photoUploading ? 'Uploading…' : 'Change photo'}
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => document.getElementById('detail-photo-input')?.click()}
      disabled={photoUploading}
      style={{ width: '100%', padding: '1.25rem', border: '1.5px dashed var(--border2)', borderRadius: 12, background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
    >
      📷 Add a photo
      <span style={{ fontSize: '0.7rem' }}>JPEG, PNG or WebP · up to 5 MB</span>
    </button>
  )}
  {photoError && <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--accent)' }}>{photoError}</div>}
</div>
```

**Verify:**
```bash
cd frontend && npx next build 2>&1 | tail -5
```

**Commit:**
```bash
git add frontend/app/(app)/memory/page.tsx
git commit -m "[Add] [frontend]: change/add photo button on memory detail page"
```

---

## Completion gate

1. `python -m pytest tests/ -q` — all tests pass, count ≥ 143
2. `cd frontend && npx next build` — exits 0, no TypeScript errors
3. `/audit` → `/closeout`

---

## Supabase setup (manual, before deploy)

Create `memory-photos` bucket in Supabase Storage:
- Name: `memory-photos`
- Public: **yes** (images served as direct public URLs — no signed URL needed unlike audio)
- File size limit: 5 MB
- Allowed MIME types: `image/jpeg, image/png, image/webp`
