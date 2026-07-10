# Photo Upload — Design

*2026-07-09*

---

## Goal

Let the Keeper attach a real photo to any memory — during the review wizard (before saving) and at any time on the memory detail page (after saving).

---

## Audience

The Keeper (you, authenticated, interactive). Not automation.

---

## Scope — what we're NOT building

- **Cropping or resizing UI** — accept the image as-is; Storage handles size limits
- **Multiple photos per memory** — single `image_url` field only; gallery is Phase 6+
- **Photo upload during text capture ("Their words" tab)** — that flow has no wizard; post-save detail page covers it
- **Photo upload on the People / narrator cards** — that already exists via `tools/people.py`
- **Photo compression client-side** — browser files are passed directly; server enforces the 5 MB cap
- **Bulk photo management** — no "Photos" tab or album view

---

## How the current flow works (baseline)

### Review Wizard (3 steps, `ReviewWizard.tsx`)
1. **Step 1** — Confirm title
2. **Step 2** — Edit ingredients & steps (recipe only)
3. **Step 3** — Save memory → `api.capture.save()` → redirect to `/memory?token=`

`draft.image_url` arrives pre-set for recipes (DALL-E ran during capture/upload). It is `null` for all other memory types.

### Memory detail page (`memory/page.tsx`)
Shows `memory.image_url` as a full-width hero image if present. No way to change it.

---

## Core Requirements

1. **Review Wizard — optional photo step on Step 3**
   - Show the AI-generated image preview if `draft.image_url` is set (recipes)
   - Show a "Add a photo" upload zone if `image_url` is null (songs, stories, etc.)
   - Show "Replace photo" affordance if `image_url` is set
   - Local preview via `URL.createObjectURL()` before commit
   - Photo is uploaded *after* the memory saves (holds `File` in state; upload uses the returned `token`)
   - If photo upload fails, memory is still saved — show a toast-style error, not a blocker

2. **Memory detail page — "Change photo" button**
   - Appears below the current image (if set) or as a card in the image slot (if not)
   - File input (hidden), triggered by button click
   - On select: immediate preview swap + silent upload to `/memories/{token}/photo`
   - On error: revert to previous image + show inline error

3. **Backend — `POST /memories/{token}/photo`**
   - Auth required (`Depends(require_auth)`)
   - Ownership check: token must belong to the requesting `user_id`
   - Multipart upload: single field `photo`
   - Validation: extension + magic-byte check (JPEG/PNG/WebP), ≤ 5 MB cap
   - Upload to Supabase Storage bucket `memory-photos` (create if not exists; private, signed URLs)
   - PATCH `memories.image_url` for that token
   - Returns `{ image_url: string }` (the new signed URL)
   - Rate limit: share the existing `MAX_IMAGE_PER_DAY` bucket (same endpoint class as DALL-E)

---

## File-by-file changes

### Backend
- `scripts/serve.py` — add `POST /memories/{token}/photo` endpoint + `_validate_image_upload()` helper
- `tools/storage.py` — add `upload_memory_photo(token, user_id, file_bytes, content_type) -> str`
- `tests/test_photo_upload.py` — new test file, ~6 tests (auth, ownership, bad type, too large, happy path, storage error)

### Frontend
- `frontend/components/ReviewWizard.tsx` — add photo section to Step 3; hold `photoFile: File | null` in state; upload after `api.capture.save()`
- `frontend/app/(app)/memory/page.tsx` — add "Change photo" / "Upload photo" button + hidden file input + upload handler
- `frontend/lib/api.ts` — add `api.memories.uploadPhoto(token, file): Promise<{ image_url: string }>`

---

## Success Criteria

- [ ] Keeper can record a memory, optionally select a photo on Step 3, hit Save — memory and photo both appear on the detail page
- [ ] Keeper can skip photo on Step 3 and still save without issue
- [ ] Keeper can open an existing memory and tap "Change photo" to replace or add an image
- [ ] Non-recipe memory types (songs, stories, wisdom, poems, fables) can have a user photo for the first time
- [ ] `POST /memories/{token}/photo` returns 403 if the token belongs to a different user
- [ ] Files > 5 MB rejected with a clear error message
- [ ] Non-image file types (PDF, MP3, EXE) rejected at the validation layer, not silently
- [ ] Photo upload failure on Step 3 does not prevent the memory from being saved
- [ ] 137 existing tests still pass; 6 new tests added

---

## Edge Cases & Failure Modes

| Scenario | Handling |
|---|---|
| User selects a 20 MB photo | Server returns 413; frontend shows "Photo must be under 5 MB" |
| User selects a PDF renamed `.jpg` | Magic-byte check catches it; 400 with clear error |
| Supabase Storage upload fails | DB not updated; return 500; frontend reverts to previous image |
| Token not found or wrong user | 404 or 403 respectively |
| Photo upload fails after save in wizard | Memory saved successfully; inline error "Photo upload failed — you can try again from the memory page" |
| Memory has no `image_url` (non-recipe types) | Detail page shows "Add a photo" card instead of blank hero slot |
| User replaces DALL-E image then deletes memory | Memory delete already cascades audio; extend it to also delete from `memory-photos` bucket |

---

## Key Decision

**Upload after save in wizard, not before.** The memory token is generated server-side on save. Uploading before save would require a temporary token or two-phase commit. Upload-after is simpler and safe: the memory exists before the photo, so a failed upload doesn't orphan anything.

[2026-07-09] Photo Upload — Decision: upload photo after memory save in wizard (using returned token). Rejected: pre-save upload with temp token. Because: token is generated server-side; pre-save upload would require two-phase commit or temp token → unnecessary complexity.

[2026-07-09] Photo Upload — Decision: separate `memory-photos` Supabase Storage bucket. Rejected: reusing audio bucket. Because: different access patterns (images served as direct public/signed URL vs audio as short-lived signed URLs); easier to set independent CORS and cache headers per bucket.

[2026-07-09] Photo Upload — Decision: share `MAX_IMAGE_PER_DAY` rate limit bucket with DALL-E endpoint. Rejected: no rate limit. Because: Storage writes have cost; photo uploads count toward the same daily image budget.
