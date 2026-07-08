# Phase B — Family Groups Plan

```
Goal:         Family groups with invite-link join, shared library, and group management UI.
Layer:        Multi-layer — DB → Python tools → FastAPI → Next.js
Architecture: New tools/groups.py follows the tools/storage.py CRUD pattern (monkeypatched
              _supabase singleton). Five new FastAPI endpoints under /family/*. Frontend adds
              a family section to the account page (create + manage group), a public /join
              page (invite-link join flow), and upgrades the home library to show all group
              members' recipes when the user belongs to a group.
Design doc:   docs/plans/2026-07-07-family-sharing-design.md
```

---

## Chunk 2.1 — DB Migration

**Manual step — run in Supabase SQL editor.**

```sql
-- Family groups
CREATE TABLE IF NOT EXISTS family_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  owner_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  portal_token  text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  invite_token  text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  created_at    timestamptz DEFAULT now()
);

-- Members (composite PK prevents duplicate membership)
CREATE TABLE IF NOT EXISTS family_group_members (
  group_id   uuid REFERENCES family_groups(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'contributor'
               CHECK (role IN ('admin', 'contributor')),
  joined_at  timestamptz DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- RLS (service key bypasses, but good practice for dashboard safety)
ALTER TABLE family_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read their group" ON family_groups
  FOR SELECT USING (
    id IN (SELECT group_id FROM family_group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "members can read membership" ON family_group_members
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM family_group_members WHERE user_id = auth.uid())
  );
```

Verify:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('family_groups', 'family_group_members');
```

Commit when confirmed:
```bash
git commit --allow-empty -m "[DB]: add family_groups + family_group_members tables with RLS"
```

---

## Chunk 2.2 — `tools/groups.py` CRUD + tests

Files:
- Create: `tools/groups.py`
- Create: `tests/test_groups.py`

### Step 1: Failing tests

```python
# tests/test_groups.py
from unittest.mock import MagicMock, patch
import tools.groups as _groups_mod
from tools.groups import (
    create_group, get_group_for_user, get_group_by_invite,
    join_group, list_group_members, list_group_recipes,
)


def _mock_sb(table_data=None, single_data=None):
    """Build a minimal Supabase mock for groups tests."""
    mock = MagicMock()
    # insert path
    mock.table.return_value.insert.return_value.execute.return_value.data = [table_data or {}]
    # select → execute path (list)
    mock.table.return_value.select.return_value.execute.return_value.data = table_data or []
    # select → eq → execute (list filtered)
    mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = table_data or []
    # select → eq → single (one row)
    mock.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = single_data or {}
    # in_ path (list_group_recipes inner query)
    mock.table.return_value.select.return_value.in_.return_value.order.return_value.execute.return_value.data = table_data or []
    return mock


class TestCreateGroup:
    def test_returns_group_row(self, monkeypatch):
        """create_group() returns the inserted group row."""
        expected = {"id": "g1", "name": "Lakshmi Family", "invite_token": "inv-abc"}
        monkeypatch.setattr(_groups_mod, "_supabase", _mock_sb(expected))
        result = create_group(owner_id="u1", name="Lakshmi Family")
        assert result["id"] == "g1"

    def test_owner_added_as_admin(self, monkeypatch):
        """create_group() inserts the owner into family_group_members as admin."""
        mock = _mock_sb({"id": "g1", "name": "Fam"})
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        create_group(owner_id="u1", name="Fam")
        # second table() call is for members insert
        calls = mock.table.call_args_list
        tables_called = [c.args[0] for c in calls]
        assert "family_group_members" in tables_called


class TestGetGroupForUser:
    def test_returns_none_when_no_group(self, monkeypatch):
        """get_group_for_user() returns None when user has no group."""
        mock = MagicMock()
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        assert get_group_for_user("u1") is None

    def test_returns_group_when_member(self, monkeypatch):
        """get_group_for_user() returns group dict when user is a member."""
        mock = MagicMock()
        # first call: family_group_members lookup
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"group_id": "g1", "role": "admin"}
        ]
        # second call: family_groups lookup
        mock.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
            "id": "g1", "name": "Lakshmi Family", "portal_token": "pt1", "invite_token": "inv1"
        }
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        result = get_group_for_user("u1")
        assert result is not None
        assert result["id"] == "g1"


class TestJoinGroup:
    def test_inserts_member_row(self, monkeypatch):
        """join_group() inserts a contributor row into family_group_members."""
        mock = MagicMock()
        mock.table.return_value.insert.return_value.execute.return_value.data = [{"group_id": "g1", "user_id": "u2"}]
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        join_group(group_id="g1", user_id="u2")
        mock.table.assert_called_with("family_group_members")


class TestListGroupRecipes:
    def test_returns_empty_when_no_members(self, monkeypatch):
        """list_group_recipes() returns [] when group has no members."""
        mock = MagicMock()
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        result = list_group_recipes("g1")
        assert result == []
```

### Step 2: Watch it fail
```bash
python -m pytest tests/test_groups.py -v
# Expected: FAILED — ModuleNotFoundError: tools.groups
```

### Step 3: Implementation

```python
# tools/groups.py
"""
Purpose: Family group CRUD — create, join, query membership and shared recipes.

What: Functions for managing family_groups and family_group_members tables.

How: Follows the tools/storage.py singleton pattern — _supabase module-level
     variable, lazily initialised by _client(), monkeypatched in tests.

Why: Keeps family group logic separate from recipe storage so each module has
     a single responsibility.
"""
import os
from supabase import create_client, Client

_supabase: Client | None = None


def _client() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_KEY"],
        )
    return _supabase


def create_group(owner_id: str, name: str) -> dict:
    """Create a new family group and add the owner as admin. Returns the group row."""
    sb = _client()
    group = sb.table("family_groups").insert({
        "name": name,
        "owner_id": owner_id,
    }).execute().data[0]

    sb.table("family_group_members").insert({
        "group_id": group["id"],
        "user_id": owner_id,
        "role": "admin",
    }).execute()

    return group


def get_group_for_user(user_id: str) -> dict | None:
    """Return the group dict for a user, or None if they have no group."""
    sb = _client()
    rows = (
        sb.table("family_group_members")
        .select("group_id, role")
        .eq("user_id", user_id)
        .execute()
        .data
    )
    if not rows:
        return None
    group_id = rows[0]["group_id"]
    group = (
        sb.table("family_groups")
        .select("*")
        .eq("id", group_id)
        .single()
        .execute()
        .data
    )
    return {**group, "role": rows[0]["role"]}


def get_group_by_invite(invite_token: str) -> dict | None:
    """Return a group by its invite token, or None if not found."""
    rows = (
        _client()
        .table("family_groups")
        .select("*")
        .eq("invite_token", invite_token)
        .execute()
        .data
    )
    return rows[0] if rows else None


def join_group(group_id: str, user_id: str) -> None:
    """Add a user to a family group as contributor. Idempotent — ignores duplicate."""
    try:
        _client().table("family_group_members").insert({
            "group_id": group_id,
            "user_id": user_id,
            "role": "contributor",
        }).execute()
    except Exception:
        pass  # duplicate PK = already a member, that's fine


def list_group_members(group_id: str) -> list:
    """Return all member rows for a group."""
    return (
        _client()
        .table("family_group_members")
        .select("user_id, role, joined_at")
        .eq("group_id", group_id)
        .execute()
        .data
    )


def list_group_recipes(group_id: str) -> list:
    """Return all recipes from all members of the group, newest first."""
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
        .order("recorded_at", desc=True)
        .execute()
        .data
    )
```

### Step 4: Watch it pass
```bash
python -m pytest tests/test_groups.py -v
python -m pytest tests/ -q   # full suite — must stay at 176+
```

### Step 5: Commit
```bash
git add tools/groups.py tests/test_groups.py
git commit -m "[Add] [tools]: groups.py — family group CRUD (create, join, list members + recipes)"
```

---

## Chunk 2.3 — FastAPI endpoints for family groups

Files:
- Modify: `scripts/serve.py`

Five new endpoints added after the `/recipes` endpoint block:

```python
# ── Family groups ─────────────────────────────────────────────────────────────

@app.post("/family/groups")
async def create_family_group(
    body: dict,
    user: dict = Depends(require_auth),
):
    """Create a new family group. Body: {name: string}"""
    from tools.groups import create_group, get_group_for_user
    user_id = _user_id(user)
    if get_group_for_user(user_id):
        raise HTTPException(status_code=409, detail="Already in a family group.")
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required.")
    group = create_group(owner_id=user_id, name=name)
    base = os.environ.get("NEXT_PUBLIC_APP_URL", "https://echoes.home")
    return JSONResponse(content={
        "group": group,
        "portal_url": f"{base}/family/{group['portal_token']}",
        "invite_url": f"{base}/join?invite={group['invite_token']}",
    })


@app.get("/family/groups/me")
async def get_my_family_group(user: dict = Depends(require_auth)):
    """Return the authenticated user's family group, or 404."""
    from tools.groups import get_group_for_user
    group = get_group_for_user(_user_id(user))
    if not group:
        raise HTTPException(status_code=404, detail="Not in a family group.")
    base = os.environ.get("NEXT_PUBLIC_APP_URL", "https://echoes.home")
    return JSONResponse(content={
        "group": group,
        "portal_url": f"{base}/family/{group['portal_token']}",
        "invite_url": f"{base}/join?invite={group['invite_token']}",
    })


@app.post("/family/groups/join/{invite_token}")
async def join_family_group(invite_token: str, user: dict = Depends(require_auth)):
    """Join a family group via invite token."""
    from tools.groups import get_group_by_invite, join_group, get_group_for_user
    user_id = _user_id(user)
    if get_group_for_user(user_id):
        raise HTTPException(status_code=409, detail="Already in a family group.")
    group = get_group_by_invite(invite_token)
    if not group:
        raise HTTPException(status_code=404, detail="Invite link not found or expired.")
    join_group(group_id=group["id"], user_id=user_id)
    return JSONResponse(content={"joined": True, "group_name": group["name"]})


@app.get("/family/members")
async def list_family_members(user: dict = Depends(require_auth)):
    """List all members of the authenticated user's family group."""
    from tools.groups import get_group_for_user, list_group_members
    group = get_group_for_user(_user_id(user))
    if not group:
        raise HTTPException(status_code=404, detail="Not in a family group.")
    return JSONResponse(content={"members": list_group_members(group["id"])})


@app.get("/family/recipes")
async def list_family_recipes(user: dict = Depends(require_auth)):
    """List all recipes from all members of the user's family group."""
    from tools.groups import get_group_for_user, list_group_recipes
    group = get_group_for_user(_user_id(user))
    if not group:
        return JSONResponse(content={"recipes": []})
    return JSONResponse(content={"recipes": list_group_recipes(group["id"])})
```

No separate test file — the endpoint logic delegates entirely to `tools/groups.py` which is already tested.

### Verify
```bash
python -m pytest tests/ -q   # must stay at 176+
```

### Commit
```bash
git add scripts/serve.py
git commit -m "[Add] [api]: /family/* endpoints — create group, join, list members + recipes"
```

---

## Chunk 2.4 — `frontend/lib/api.ts`: family namespace

Files:
- Modify: `frontend/lib/api.ts`

Add after the `viewers` block:

```typescript
  family: {
    createGroup: (name: string) =>
      authFetch('/family/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    getMyGroup: () => authFetch('/family/groups/me'),
    join: (inviteToken: string) =>
      authFetch(`/family/groups/join/${inviteToken}`, { method: 'POST' }),
    members: () => authFetch('/family/members'),
    recipes: async () => {
      const data: unknown = await authFetch('/family/recipes')
      if (data && typeof data === 'object' && 'recipes' in data) {
        const rows = (data as { recipes: unknown }).recipes
        return Array.isArray(rows) ? rows : []
      }
      return []
    },
  },
```

### Verify
```bash
cd frontend && node_modules/.bin/next build
```

### Commit
```bash
git add frontend/lib/api.ts
git commit -m "[Add] [frontend]: api.family namespace — createGroup, join, members, recipes"
```

---

## Chunk 2.5 — Account page: create + manage family group

Files:
- Modify: `frontend/app/(app)/account/page.tsx`

### What to add

At the bottom of the account page, add a "Family Group" section.

**State needed:**
```tsx
const [group, setGroup] = useState<FamilyGroup | null>(null)
const [groupLoading, setGroupLoading] = useState(true)
const [groupName, setGroupName] = useState('')
const [groupError, setGroupError] = useState('')
const [copied, setCopied] = useState<'portal' | 'invite' | null>(null)

type FamilyGroup = {
  group: { id: string; name: string; portal_token: string; invite_token: string }
  portal_url: string
  invite_url: string
}
```

**On mount:** `api.family.getMyGroup()` → setGroup or null (404 = no group yet).

**No group UI:**
```
┌──────────────────────────────────────┐
│  Family Group                        │
│  Invite your family to share and     │
│  browse memories together.           │
│                                      │
│  [Group name input]  [Create →]      │
└──────────────────────────────────────┘
```

**Has group UI:**
```
┌──────────────────────────────────────┐
│  Family Group · Lakshmi Family       │
│                                      │
│  Portal URL  [link]  [Copy]          │
│  Invite link [link]  [Copy]          │
│                                      │
│  Share the invite link in your       │
│  WhatsApp group so family members    │
│  can join and contribute.            │
└──────────────────────────────────────┘
```

Use the same card style as the rest of the account page. Copy button uses `navigator.clipboard.writeText`.

### Verify
```bash
cd frontend && node_modules/.bin/next build
```

### Commit
```bash
git add frontend/app/\(app\)/account/page.tsx
git commit -m "[Add] [frontend]: family group create + manage UI on account page"
```

---

## Chunk 2.6 — Public join page

Files:
- Create: `frontend/app/join/page.tsx`

URL: `/join?invite=TOKEN`

**Flow:**
1. Page reads `invite` from `useSearchParams()`
2. Checks auth: `supabase.auth.getSession()`
3. **If logged in:** calls `api.family.join(invite)` → on success, redirects to `/home`
4. **If not logged in:** shows what the group is + sign-in/sign-up button that redirects back to `/join?invite=TOKEN` after auth

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'

export default function JoinPage() {
  const params = useSearchParams()
  const router = useRouter()
  const invite = params.get('invite') ?? ''
  const [status, setStatus] = useState<'loading' | 'joining' | 'done' | 'error' | 'needsAuth'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!invite) { setStatus('error'); setMessage('Invalid invite link.'); return }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setStatus('needsAuth'); return }
      setStatus('joining')
      try {
        const res = await api.family.join(invite) as { group_name: string }
        setMessage(`You've joined ${res.group_name}!`)
        setStatus('done')
        setTimeout(() => router.push('/home'), 1500)
      } catch (e: unknown) {
        setStatus('error')
        setMessage((e as Error).message)
      }
    })
  }, [invite])

  if (status === 'loading' || status === 'joining') return (
    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
      {status === 'joining' ? 'Joining your family group…' : 'Loading…'}
    </div>
  )

  if (status === 'done') return (
    <div style={{ padding: '3rem', textAlign: 'center' }}>
      <p style={{ fontSize: '2rem' }}>🎉</p>
      <p>{message}</p>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Taking you to your family's memories…</p>
    </div>
  )

  if (status === 'needsAuth') return (
    <div style={{ padding: '3rem', maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
      <p style={{ fontSize: '1.5rem', fontFamily: 'var(--serif)', marginBottom: '1rem' }}>
        You've been invited to a family memory group
      </p>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem', lineHeight: 1.6 }}>
        Sign in or create an account to join — then you'll be able to record and share
        memories with your whole family.
      </p>
      <a
        href={`/auth/callback?next=/join?invite=${invite}`}
        style={{
          display: 'inline-block',
          padding: '0.75rem 1.75rem',
          background: 'var(--accent)',
          color: 'white',
          borderRadius: 10,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Sign in to join →
      </a>
    </div>
  )

  return (
    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--error, #c00)' }}>
      {message || 'Something went wrong. Ask the group admin to resend the invite link.'}
    </div>
  )
}
```

### Verify
```bash
cd frontend && node_modules/.bin/next build
```

### Commit
```bash
git add frontend/app/join/page.tsx
git commit -m "[Add] [frontend]: /join page — invite-link family group join flow"
```

---

## Chunk 2.7 — Family library on home page

Files:
- Modify: `frontend/app/(app)/home/page.tsx`

### What changes

**Memory type** — add `recorded_by_name`:
```tsx
type Memory = {
  // ...existing fields...
  recorded_by_name: string | null   // ← add
}
```

**On mount** — try to fetch family recipes; fall back to own recipes:
```tsx
const [isFamily, setIsFamily] = useState(false)

// inside the existing useEffect that fetches recipes:
try {
  const familyData = await api.family.recipes()
  if (Array.isArray(familyData) && familyData.length > 0) {
    setMemories(familyData)
    setIsFamily(true)
    return
  }
} catch {
  // not in a group — fall through to own recipes
}
// existing: const own = await api.recipes.list(); setMemories(own)
```

**Card** — show contributor name when in family mode:
```tsx
{isFamily && memory.recorded_by_name && (
  <span style={{ fontSize: 10, color: 'var(--muted)' }}>
    by {memory.recorded_by_name}
  </span>
)}
```

**Section header** — when in family mode, label changes:
```tsx
<h2>
  {isFamily ? 'Family Memories' : 'Your Memories'}
</h2>
```

### Verify
```bash
cd frontend && node_modules/.bin/next build
python -m pytest tests/ -q   # must stay at 176+
```

### Commit
```bash
git add frontend/app/\(app\)/home/page.tsx
git commit -m "[Add] [frontend]: family library on home page — shows all group members' memories"
```

---

## Completion gate

- [ ] Supabase `family_groups` + `family_group_members` tables confirmed (Chunk 2.1)
- [ ] `python -m pytest tests/ -q` — 180+ passing, 0 failures
- [ ] `cd frontend && node_modules/.bin/next build` — clean
- [ ] Create group: name input + create button on account page works
- [ ] After creating: portal URL + invite link shown with copy buttons
- [ ] Invite link `/join?invite=TOKEN`: unauthenticated sees sign-in prompt; authenticated auto-joins + redirects
- [ ] Home page shows "Family Memories" heading + all group members' recipes when in a group
- [ ] Cards show contributor name in family mode
