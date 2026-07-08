# Phase C — Public Portal Plan

```
Goal:         portal_visible toggle on memories + public /family?p=TOKEN portal page with no auth.
Layer:        Multi-layer — DB → Python tools → FastAPI → Next.js
Architecture: Add portal_visible boolean column to recipes. Extend PatchRecipeRequest so the
              existing PATCH /recipe/{token} endpoint can set it. Add list_portal_recipes() to
              tools/groups.py and a public GET /portal/{token} endpoint (no Depends(require_auth)).
              Frontend: toggle on memory detail; public portal page at /family?p=TOKEN using
              useSearchParams (consistent with static export — no dynamic route segments needed).
              URL format uses ?p= query param so Next.js static export works without generateStaticParams.
Design doc:   docs/plans/2026-07-07-family-sharing-design.md
```

---

## Chunk 3.1 — DB Migration

**Manual step — run in Supabase SQL editor.**

```sql
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS portal_visible boolean NOT NULL DEFAULT false;
```

Verify:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'recipes' AND column_name = 'portal_visible';
```

Also update the server-side portal URL format while we're here — confirm both existing group rows in the dashboard to understand the token shape (should be a UUID string from gen_random_uuid()::text).

Commit when confirmed:
```bash
git commit --allow-empty -m "[DB]: add portal_visible boolean column to recipes (default false)"
```

---

## Chunk 3.2 — Backend: portal_visible patch + portal endpoint

Files:
- Modify: `scripts/serve.py` (PatchRecipeRequest + new endpoint)
- Modify: `tools/groups.py` (two new functions)
- Modify: `tests/test_groups.py` (two new test classes)

### Step 1: Failing tests

```python
# Add to tests/test_groups.py

from tools.groups import get_portal_group, list_portal_recipes   # new imports


class TestGetPortalGroup:
    def test_returns_group_for_valid_token(self, monkeypatch):
        """get_portal_group() returns the group row for a valid portal token."""
        mock = MagicMock()
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"id": "g1", "name": "Lakshmi Family", "portal_token": "pt-abc"}
        ]
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        result = get_portal_group("pt-abc")
        assert result["id"] == "g1"

    def test_returns_none_for_invalid_token(self, monkeypatch):
        """get_portal_group() returns None for an unknown portal token."""
        mock = MagicMock()
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        assert get_portal_group("bad-token") is None


class TestListPortalRecipes:
    def test_returns_only_portal_visible_recipes(self, monkeypatch):
        """list_portal_recipes() filters to portal_visible=true recipes for group members."""
        mock = MagicMock()
        members_select = MagicMock()
        members_select.eq.return_value.execute.return_value.data = [
            {"user_id": "u1"}, {"user_id": "u2"}
        ]
        recipes_select = MagicMock()
        recipes_select.in_.return_value.eq.return_value.order.return_value.execute.return_value.data = [
            {"id": "r1", "dish_name": "Pesarattu", "portal_visible": True},
        ]
        mock.table.return_value.select.side_effect = [members_select, recipes_select]
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        result = list_portal_recipes("g1")
        assert len(result) == 1
        assert result[0]["dish_name"] == "Pesarattu"

    def test_returns_empty_when_no_members(self, monkeypatch):
        """list_portal_recipes() returns [] when the group has no members."""
        mock = MagicMock()
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        assert list_portal_recipes("g1") == []
```

### Step 2: Watch it fail
```bash
python -m pytest tests/test_groups.py::TestGetPortalGroup -v
python -m pytest tests/test_groups.py::TestListPortalRecipes -v
# Expected: ImportError — get_portal_group, list_portal_recipes not yet defined
```

### Step 3: Implementation

**`tools/groups.py`** — add two functions:

```python
def get_portal_group(portal_token: str) -> dict | None:
    """Return a group by its public portal token, or None if not found."""
    rows = (
        _client()
        .table("family_groups")
        .select("*")
        .eq("portal_token", portal_token)
        .execute()
        .data
    )
    return rows[0] if rows else None


def list_portal_recipes(group_id: str) -> list:
    """Return portal_visible=true recipes from all group members, newest first."""
    sb = _client()
    member_rows = (
        sb.table("family_group_members")
        .select("user_id")
        .eq("group_id", group_id)
        .execute()
        .data
    )
    if not member_rows:
        return []
    user_ids = [r["user_id"] for r in member_rows]
    return (
        sb.table("recipes")
        .select("id, token, dish_name, narrator, recorded_at, image_url, audio_url, tags, type, recorded_by_name")
        .in_("user_id", user_ids)
        .eq("portal_visible", True)
        .order("recorded_at", desc=True)
        .execute()
        .data
    )
```

**`scripts/serve.py`** — two changes:

1. Add `portal_visible` to `PatchRecipeRequest`:
```python
class PatchRecipeRequest(BaseModel):
    dish_name: str | None = None
    narrator: str | None = None
    user_notes: str | None = None
    tags: list[str] | None = None
    ingredients: list | None = None
    steps: list[str] | None = None
    cook_notes: str | None = None
    portal_visible: bool | None = None    # ← add
```

2. Add public portal endpoint (no auth — portal_token is the security):
```python
@app.get("/portal/{portal_token}")
async def get_portal_endpoint(portal_token: str):
    """Public endpoint — returns group info + portal_visible recipes. No auth required."""
    from tools.groups import get_portal_group, list_portal_recipes
    group = get_portal_group(portal_token)
    if not group:
        raise HTTPException(status_code=404, detail="Portal not found.")
    recipes = list_portal_recipes(group["id"])
    return JSONResponse(content={
        "group_name": group["name"],
        "recipes": recipes,
    })
```

### Step 4: Watch it pass
```bash
python -m pytest tests/test_groups.py -v
python -m pytest tests/ -q   # must stay at 188+
```

### Step 5: Commit
```bash
git add tools/groups.py scripts/serve.py tests/test_groups.py
git commit -m "[Add] [tools/api]: portal_visible patch + GET /portal/{token} public endpoint"
```

---

## Chunk 3.3 — Memory detail: portal_visible toggle

Files:
- Modify: `frontend/app/(app)/memory/page.tsx`

### What to add

**Memory type** — add `portal_visible`:
```tsx
type Memory = {
  // ...existing fields...
  portal_visible: boolean    // ← add
}
```

**State:**
```tsx
const [inPortal, setInPortal] = useState(false)
const [portalBusy, setPortalBusy] = useState(false)
const [isInGroup, setIsInGroup] = useState(false)
```

**On load** — set from memory data + check group membership:
```tsx
// inside the useEffect that fetches the memory:
setInPortal(m.portal_visible ?? false)

// separate useEffect:
useEffect(() => {
  api.family.getMyGroup().then(() => setIsInGroup(true)).catch(() => {})
}, [])
```

**Toggle function:**
```tsx
async function togglePortal() {
  if (!memory || portalBusy) return
  setPortalBusy(true)
  const next = !inPortal
  try {
    await api.recipes.patch(memory.token, { portal_visible: next })
    setInPortal(next)
  } catch {
    // silent — toggle reverts visually on next load
  } finally {
    setPortalBusy(false)
  }
}
```

**Toggle UI** — add below the type badge, above the image. Only shown when user is in a group:
```tsx
{isInGroup && (
  <button
    onClick={togglePortal}
    disabled={portalBusy}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 14px', borderRadius: 20, fontSize: 13,
      border: '1px solid var(--border)',
      background: inPortal ? 'var(--accent)' : 'transparent',
      color: inPortal ? 'white' : 'var(--muted)',
      cursor: portalBusy ? 'default' : 'pointer',
      marginBottom: '1rem',
    }}
  >
    {inPortal ? '✓ In family portal' : '+ Add to family portal'}
  </button>
)}
```

### Verify
```bash
cd frontend && node_modules/.bin/next build
```

### Commit
```bash
git add frontend/app/\(app\)/memory/page.tsx
git commit -m "[Add] [frontend]: portal_visible toggle on memory detail page"
```

---

## Chunk 3.4 — `api.ts`: portal + public fetch

Files:
- Modify: `frontend/lib/api.ts`

Add a `publicFetch` helper (no auth header) and a `portal` namespace:

```typescript
async function publicFetch(path: string) {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Request failed')
  }
  return res.json()
}
```

Add to the `api` object:
```typescript
  portal: {
    get: (portalToken: string) => publicFetch(`/portal/${portalToken}`),
  },
```

### Verify
```bash
cd frontend && node_modules/.bin/next build
```

### Commit
```bash
git add frontend/lib/api.ts
git commit -m "[Add] [frontend]: publicFetch helper + api.portal.get for unauthenticated portal"
```

---

## Chunk 3.5 — Public portal page `/family?p=TOKEN`

Files:
- Create: `frontend/app/family/page.tsx`

**Why query param, not `/family/[token]`**: Next.js static export (`output: 'export'`) requires `generateStaticParams()` for dynamic route segments — impossible since portal tokens are runtime data. Query param + `useSearchParams()` works identically to the existing `/memory?token=...` and `/shared/detail?token=...` pages.

Update `NEXT_PUBLIC_APP_URL` portal URL generation in backend to use `?p=` instead of `/family/[token]`:
- Modify `scripts/serve.py` — both `create_family_group_endpoint` and `get_my_family_group_endpoint`: change `f"{base}/family/{group['portal_token']}"` → `f"{base}/family?p={group['portal_token']}"`

### Implementation

```tsx
'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'

const TYPE_ICONS: Record<string, string> = {
  recipe: '🍛', song: '🎵', story: '📖', fable: '✨', moral: '🙏',
}
const TYPE_LABELS = ['All', 'recipe', 'song', 'story', 'fable', 'moral']

type PortalMemory = {
  token: string
  dish_name: string | null
  narrator: string | null
  recorded_at: string
  audio_url: string | null
  image_url: string | null
  type: string | null
  recorded_by_name: string | null
}

function PortalContent() {
  const params = useSearchParams()
  const portalToken = params.get('p') ?? ''
  const [groupName, setGroupName] = useState('')
  const [memories, setMemories] = useState<PortalMemory[]>([])
  const [filter, setFilter] = useState('All')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState<string | null>(null)

  useEffect(() => {
    if (!portalToken) { setError('Invalid portal link.'); setLoading(false); return }
    api.portal.get(portalToken)
      .then((d: unknown) => {
        const data = d as { group_name: string; recipes: PortalMemory[] }
        setGroupName(data.group_name)
        setMemories(data.recipes)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [portalToken])

  const displayed = filter === 'All'
    ? memories
    : memories.filter(m => m.type === filter)

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
  if (error) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--error, #c00)' }}>{error}</div>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', padding: '1.5rem 1rem' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎙️</p>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.8rem', color: 'var(--text)', marginBottom: '0.25rem' }}>
            {groupName}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
          </p>
        </div>

        {/* Filter tabs */}
        {memories.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.5rem', justifyContent: 'center' }}>
            {TYPE_LABELS.filter(t => t === 'All' || memories.some(m => m.type === t)).map(t => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 13,
                  border: '1px solid var(--border)',
                  background: filter === t ? 'var(--accent)' : 'var(--surface)',
                  color: filter === t ? 'white' : 'var(--muted)',
                  cursor: 'pointer', fontFamily: 'var(--sans)',
                }}
              >{t === 'All' ? 'All' : `${TYPE_ICONS[t] ?? ''} ${t}`}</button>
            ))}
          </div>
        )}

        {/* Memory cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {displayed.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
              No memories here yet.
            </p>
          )}
          {displayed.map(m => (
            <div key={m.token} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '1rem 1.25rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: '1rem', color: 'var(--text)', marginBottom: 2 }}>
                    {TYPE_ICONS[m.type ?? ''] ?? ''} {m.dish_name ?? 'Untitled'}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {m.narrator && <>{m.narrator} · </>}
                    {fmtDate(m.recorded_at)}
                    {m.recorded_by_name && <> · by {m.recorded_by_name}</>}
                  </p>
                </div>
              </div>

              {m.audio_url && (
                <div style={{ marginTop: '0.85rem' }}>
                  {playing === m.token ? (
                    <audio
                      src={m.audio_url}
                      autoPlay
                      controls
                      onEnded={() => setPlaying(null)}
                      style={{ width: '100%', height: 36 }}
                    />
                  ) : (
                    <button
                      onClick={() => setPlaying(m.token)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 16px', borderRadius: 20, fontSize: 13,
                        background: 'var(--accent)', color: 'white', border: 'none',
                        cursor: 'pointer', fontFamily: 'var(--sans)',
                      }}
                    >▶ Play</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Join nudge */}
        <div style={{ textAlign: 'center', marginTop: '3rem', padding: '1.5rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
          <p style={{ marginBottom: '0.5rem' }}>Want to contribute your own memories?</p>
          <a href="/" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
            Join Echoes of Home →
          </a>
        </div>
      </div>
    </div>
  )
}

export default function FamilyPortalPage() {
  return (
    <Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>}>
      <PortalContent />
    </Suspense>
  )
}
```

Also update `scripts/serve.py` portal_url to use `?p=` query param:
```python
# In both create_family_group_endpoint and get_my_family_group_endpoint:
"portal_url": f"{base}/family?p={group['portal_token']}",
```

### Verify
```bash
cd frontend && node_modules/.bin/next build
python -m pytest tests/ -q   # must stay at 192+
```

### Commit
```bash
git add frontend/app/family/page.tsx scripts/serve.py
git commit -m "[Add] [frontend/api]: public family portal page at /family?p=TOKEN"
```

---

## Completion gate

- [ ] `portal_visible` column in Supabase confirmed (Chunk 3.1)
- [ ] `python -m pytest tests/ -q` — 192+ passing, 0 failures
- [ ] `cd frontend && node_modules/.bin/next build` — clean
- [ ] Memory detail: "Add to family portal" toggle visible (only when in a group), toggles correctly
- [ ] `GET /portal/{token}` returns only portal_visible=true memories, no auth required
- [ ] `/family?p=TOKEN` page loads without login, shows group name + memory cards
- [ ] Filter tabs appear for present content types, filter correctly
- [ ] Audio plays inline with ▶ Play button
- [ ] "Join Echoes of Home →" nudge at bottom
