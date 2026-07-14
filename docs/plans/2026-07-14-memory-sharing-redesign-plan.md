Goal:         Close the PATCH ownership gap, give non-owner viewers of a shared memory a correct read-only experience, fix the share-button portal substitution bug, and close the loop on "Add to Family Collection".
Layer:        Multi-layer (FastAPI backend — Block A; Next.js frontend — Blocks B, C, D)
Architecture: Block A is a small, fully-testable backend fix (mirrors the existing `DELETE` ownership check) done first and independently. Blocks B–D are frontend-only, built on top of two pieces of data already available client-side (`memory.user_id` from the existing GET, and `api.family.members()` / `api.family.getMyGroup()` which already exist in `frontend/lib/api.ts`) — no new endpoints. The frontend has no automated test harness (confirmed: `tests/` is Python/pytest only), so each frontend chunk's "RED" step is a manual repro in the Browser pane against the local dev server, and "GREEN" is the same repro fixed — per this project's `verify` workflow, not invented unit tests.
Design doc:   docs/plans/2026-07-14-memory-sharing-redesign-design.md

---

## Block A — Backend: ownership check on PATCH /recipe/{token}

### Chunk A.1 — 403 for non-owner PATCH

Files:
- Modify: `scripts/serve.py:1190-1204` (`patch_recipe_endpoint`)
- Create: `tests/test_recipe_patch.py`

**Step 1: Failing test**
```python
# tests/test_recipe_patch.py
"""
Tests for PATCH /recipe/{token} — ownership enforcement.
Mirrors the existing ownership check pattern in DELETE /recipe/{token}
and tests/test_photo_upload.py's TestUploadMemoryPhotoEndpoint.
"""
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from scripts.serve import app, require_auth


async def _auth_u1():
    return {"sub": "u1"}


class TestPatchRecipeEndpoint:
    def teardown_method(self):
        app.dependency_overrides.pop(require_auth, None)

    def test_returns_403_for_wrong_user(self):
        recipe = {"token": "tok1", "user_id": "other_user"}
        with patch("tools.storage.get_recipe_by_token", return_value=recipe), \
             patch("tools.storage.patch_recipe") as mock_patch:
            app.dependency_overrides[require_auth] = _auth_u1
            client = TestClient(app)
            res = client.patch(
                "/recipe/tok1",
                json={"title": "Hijacked title"},
                headers={"Authorization": "Bearer fake"},
            )
        assert res.status_code == 403
        mock_patch.assert_not_called()

    def test_owner_can_patch(self):
        recipe = {"token": "tok1", "user_id": "u1"}
        with patch("tools.storage.get_recipe_by_token", return_value=recipe), \
             patch("tools.storage.patch_recipe", return_value={**recipe, "title": "New title"}) as mock_patch:
            app.dependency_overrides[require_auth] = _auth_u1
            client = TestClient(app)
            res = client.patch(
                "/recipe/tok1",
                json={"title": "New title"},
                headers={"Authorization": "Bearer fake"},
            )
        assert res.status_code == 200
        mock_patch.assert_called_once()
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_recipe_patch.py -v
# Expected: test_returns_403_for_wrong_user FAILS (endpoint returns 200 today — no ownership check exists)
```

**Step 3: Minimal implementation**
```python
# scripts/serve.py — patch_recipe_endpoint, mirrors delete_recipe_endpoint's existing check
@app.patch("/recipe/{token}")
async def patch_recipe_endpoint(token: str, body: PatchRecipeRequest, user: dict = Depends(require_auth)):
    """Update editable fields on a recipe. Only non-None fields are written. Caller must own the recipe."""
    if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")):
        raise HTTPException(status_code=503, detail="Storage not configured")
    from tools.storage import get_recipe_by_token, patch_recipe
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        recipe = get_recipe_by_token(token)
    except Exception:
        raise HTTPException(status_code=404, detail="Recipe not found")
    user_id = _user_id(user)
    if user_id and recipe.get("user_id") and recipe["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not your recipe")
    try:
        updated = patch_recipe(token, fields)
        return JSONResponse(content=updated)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_recipe_patch.py -v
python -m pytest tests/ -q   # full suite — must stay green (137+ passing before this chunk)
```

**Step 5: Commit**
```bash
git add scripts/serve.py tests/test_recipe_patch.py
git commit -m "[Fix] [backend]: enforce ownership check on PATCH /recipe/{token}"
```

---

## Block B — Frontend: non-owner viewer-mode branch

All chunks in this block touch `frontend/app/(app)/memory/page.tsx`. No automated frontend tests exist in this repo — each chunk's verification is a manual repro against `npm run dev` in the Browser pane (per the project's `verify` skill), using the same already-authenticated token flow validated earlier this session (`/memory?token=42329f17-fcd6-453f-b34e-c901fb0dcf10`, a memory not owned by the signed-in test account).

### Chunk B.1 — Ownership + same-group detection

Files:
- Modify: `frontend/app/(app)/memory/page.tsx` (top of `MemoryDetail`, near the existing `isInGroup`/`portalUrl` effect at line ~164)

**Step 1: Manual repro (RED)**
- Start dev server, sign in as an account that does NOT own the test token, open `/memory?token=...`.
- Confirm today's behavior: full owner-style editable layout renders regardless of who's viewing (no `isOwner` concept exists at all).

**Step 2: Minimal implementation**
- Add `const [currentUserId, setCurrentUserId] = useState<string | null>(null)` populated via `supabase.auth.getUser()` (same pattern already used in `AppTopBar.tsx` and `Sidebar.tsx`).
- Add `const isOwner = !!currentUserId && !!memory && memory.user_id === currentUserId` (requires `user_id` added to the `Memory` type, which the API already returns — confirmed in the raw response captured this session).
- Add `const [sameGroupIds, setSameGroupIds] = useState<string[]>([])`, populated from `api.family.members()` (`.then(d => setSameGroupIds(d.members.map(m => m.user_id))).catch(() => {})` — mirrors the existing `.catch(() => {})` pattern already used for `getMyGroup()` two lines below it).
- Derive `const isSameGroup = !isOwner && !!memory && sameGroupIds.includes(memory.user_id)`.

**Step 3: Manual verify (GREEN)**
- Log the three derived booleans temporarily (`console.log`) while reloading as: (a) the owner account, (b) an account in the same family group as the owner, (c) an unrelated account. Confirm each resolves correctly. Remove the temporary log before committing.

**Step 4: Commit**
```bash
git add "frontend/app/(app)/memory/page.tsx"
git commit -m "[Add] [frontend]: detect owner / same-family-group viewer state on memory page"
```

### Chunk B.2 — Read-only rendering, audio-memory layout

Files:
- Modify: `frontend/app/(app)/memory/page.tsx` (audio layout branch, ~lines 310-690)

**Step 1: Manual repro (RED)** — as a non-owner, confirm title/narrator edit pencils, delete button, and notes textarea are all visible and (post Block A) would 403 if used.

**Step 2: Minimal implementation** — gate each of the following behind `isOwner`:
- Title: render plain `<h1>{titleValue}</h1>` with no edit button when `!isOwner`.
- Narrator: render plain text, no edit button, when `!isOwner`.
- Delete button: `{isOwner && <button onClick={...}>Delete</button>}`.
- "Your notes" section: `{isOwner && <section>...</section>}`.
- Favorite button: gate behind `isOwner` (per PRD — favoriting a memory you don't own doesn't surface anywhere for you).

**Step 3: Manual verify (GREEN)** — reload as non-owner; confirm only Share button, audio player, transcript remain interactive.

**Step 4: Commit**
```bash
git commit -am "[Fix] [frontend]: strip owner-only controls from audio-memory layout for non-owner viewers"
```

### Chunk B.3 — Read-only rendering, recipe layout

Files:
- Modify: `frontend/app/(app)/memory/page.tsx` (recipe layout branch, ~lines 695-1087)

**Step 1: Manual repro (RED)** — as a non-owner viewing a recipe-type memory, confirm category picker, photo upload, delete, edit pencils, and notes are all present.

**Step 2: Minimal implementation** — same gating pattern as B.2, applied to: category `<select>`, photo upload/"Change photo" button, title/narrator edit pencils, delete button, "Your notes" section, Favorite button.

**Step 3: Manual verify (GREEN)** — reload as non-owner on a recipe-type memory; confirm read-only.

**Step 4: Commit**
```bash
git commit -am "[Fix] [frontend]: strip owner-only controls from recipe layout for non-owner viewers"
```

### Chunk B.4 — Back-link removed for non-owners

Files:
- Modify: `frontend/app/(app)/memory/page.tsx:69-71` (`backHref`/`backLabel`) and both `<Link href={backHref}>` usages

**Step 1: Manual repro (RED)** — as a non-owner arriving via a bare `/memory?token=` link (no `?from=`), confirm "All Recipes" back-link shows and points at the viewer's own (unrelated) recipe list.

**Step 2: Minimal implementation** — wrap both back-link renders in `{isOwner && ...}` (or `from` is set — a link with an explicit `from` still implies in-app navigation and can keep the back-link even for a non-owner, e.g. clicking into a family-portal-surfaced memory from `/home`). Simplest correct rule: show the back-link if `from` is present OR `isOwner`; hide it only for the bare non-owner case.

**Step 3: Manual verify (GREEN)** — confirm bare shared link (no `from`) shows no back-link for a non-owner; confirm in-app navigation (`?from=home` etc.) still shows it.

**Step 4: Commit**
```bash
git commit -am "[Fix] [frontend]: hide misleading 'All Recipes' back-link for non-owners arriving via a bare share link"
```

### Chunk B.5 — Onboarding banner for outsider + zero-memories viewers

Files:
- Modify: `frontend/app/(app)/memory/page.tsx`

**Step 1: Manual repro (RED)** — as a brand-new outsider account with zero memories, confirm no onboarding nudge appears anywhere on the page.

**Step 2: Minimal implementation**
- Add `const [ownMemoryCount, setOwnMemoryCount] = useState<number | null>(null)`, populated via `api.recipes.list().then(r => setOwnMemoryCount(r.length)).catch(() => setOwnMemoryCount(0))`.
- `const showOnboardingBanner = !isOwner && !isSameGroup && ownMemoryCount === 0`.
- Render a simple banner (reuse existing `justSavedBanner`-style fixed/inline card pattern already in this file) when `showOnboardingBanner`: "❤️ Loved this? Start preserving your own family's memories" linking to `/` (landing page).

**Step 3: Manual verify (GREEN)** — confirm banner shows only for outsider+zero-memories; confirm it does NOT show for the same-group case or for an outsider who already has their own memories.

**Step 4: Commit**
```bash
git commit -am "[Add] [frontend]: onboarding banner for first-time outsider viewers of a shared memory"
```

---

## Block C — Share button fix

### Chunk C.1 — Non-owners never substitute their own portal URL

Files:
- Modify: `frontend/app/(app)/memory/page.tsx:275-282` (`openWhatsApp`)

**Step 1: Manual repro (RED)** — sign in as an account that (a) belongs to its own family group and (b) is viewing someone else's shared memory. Click Share. Confirm the generated WhatsApp message links to the viewer's own family portal, not the memory being viewed.

**Step 2: Minimal implementation**
```js
function openWhatsApp() {
  const memoryUrl = memory?.slug
    ? `${window.location.origin}/memory/${memory.slug}`
    : `${window.location.origin}/memory?token=${token}`
  const url = (isOwner && portalUrl) || memoryUrl
  const msg = buildMemoryShareMessage(memory?.type, memory?.title, memory?.narrator, url)
  window.open(toWhatsAppUrl(msg), '_blank')
}
```

**Step 3: Manual verify (GREEN)** — same repro as Step 1; confirm the shared link now always points at the specific memory when the viewer isn't its owner. Confirm the owner's existing behavior (portal URL substitution) is unchanged.

**Step 4: Commit**
```bash
git commit -am "[Fix] [frontend]: non-owners always share the direct memory link, never their own family portal"
```

---

## Block D — Close the loop on "Add to Family Collection"

### Chunk D.1 — Explanatory caption + invite-link confirmation

Files:
- Modify: `frontend/app/(app)/memory/page.tsx` (`togglePortal`, the `portalUrl` effect at ~line 164, and both Family Collection toggle button renders at ~lines 555-585 and ~961-991)

**Step 1: Manual repro (RED)** — as the owner, in a family group, click "Add to Family Collection." Confirm nothing explains what just happened or how to share the resulting access.

**Step 2: Minimal implementation**
- Capture `invite_url` from the existing `api.family.getMyGroup()` response (already returned by the endpoint; today only `portal_url` is read) into a new `inviteUrl` state alongside the existing `portalUrl` state.
- Add a static caption under the toggle button (owner + `isInGroup` only): "Visible to anyone who joins your family via invite link."
- On successful `togglePortal()` (toggle turning on), extend the existing `flash()`/`SavedBadge` confirmation pattern to show, briefly, a "Copy invite link" affordance using `inviteUrl` (reuse the `copy`-to-clipboard pattern already present in `account/page.tsx` and `people/page.tsx`).
- On toggle-off, show the existing flash with different copy: "Removed — no longer visible to your family."

**Step 3: Manual verify (GREEN)** — as owner, toggle on: confirm caption is visible beforehand, confirmation + copy action appear after. Toggle off: confirm the removal confirmation. Confirm copied text matches the account page's own invite link for the same group.

**Step 4: Commit**
```bash
git commit -am "[Add] [frontend]: explain and confirm what 'Add to Family Collection' does, with a same-place invite-link copy action"
```

---

## Completion gate

Not done until:
1. `/build` — all chunks (A.1, B.1–B.5, C.1, D.1) executed and committed
2. `/audit` — Python test suite green (`python -m pytest tests/ -q`), frontend build clean (`npm run build` — must pass, per Warmly-style build-gate convention adapted to this repo's Next.js static export)
3. `/closeout` — `docs/ROADMAP.md` and `docs/BUGS.md` updated (D-019/D-020 already logged during `/brainstorm`), pushed
