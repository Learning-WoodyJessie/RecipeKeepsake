# Plan — Family Portal Login Gate + Emoji Reactions MVP

```
Goal:         Gate the family portal behind login and add emoji reactions visible to owners.
Layer:        Multi-layer — Supabase DDL, Python backend, Next.js frontend
Architecture: New `reactions` table + 2 API endpoints (toggle/get) + shared ReactionBar
              component consumed by both the portal page and the memory detail page.
              Portal gets a lightweight auth gate via session check on mount.
Design doc:   docs/plans/2026-07-19-portal-reactions-design.md
```

---

## Block A — Database

### Chunk A.1 — Create `reactions` table

**No test needed — DDL only.**

Run this SQL in the Supabase dashboard (SQL editor):

```sql
CREATE TABLE reactions (
  id            uuid primary key default gen_random_uuid(),
  memory_token  text not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  emoji         text not null check (emoji in ('❤️', '🙏', '😢', '😄')),
  created_at    timestamptz default now(),
  unique (memory_token, user_id, emoji)
);

CREATE INDEX reactions_memory_token_idx ON reactions(memory_token);
```

Verify in the Supabase Table Editor that `reactions` appears with the 5 columns before moving on.

---

## Block B — Backend

### Chunk B.1 — Storage functions: `toggle_reaction` + `get_reactions`

Files:
- Modify: `tools/storage.py` (append two functions)
- Create: `tests/test_reactions.py`

**Step 1: Failing tests**

```python
# tests/test_reactions.py
from unittest.mock import MagicMock
import tools.storage as _storage_mod


class TestGetReactions:
    def test_returns_zero_counts_when_no_rows(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import get_reactions
        result = get_reactions("tok-1", user_id=None)
        assert result["counts"] == {"❤️": 0, "🙏": 0, "😢": 0, "😄": 0}
        assert result["user_reactions"] == []

    def test_counts_each_emoji(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"emoji": "❤️", "user_id": "u1"},
            {"emoji": "❤️", "user_id": "u2"},
            {"emoji": "🙏", "user_id": "u1"},
        ]
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import get_reactions
        result = get_reactions("tok-1", user_id=None)
        assert result["counts"]["❤️"] == 2
        assert result["counts"]["🙏"] == 1
        assert result["counts"]["😢"] == 0

    def test_identifies_current_user_reactions(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"emoji": "❤️", "user_id": "u1"},
            {"emoji": "🙏", "user_id": "u2"},
        ]
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import get_reactions
        result = get_reactions("tok-1", user_id="u1")
        assert "❤️" in result["user_reactions"]
        assert "🙏" not in result["user_reactions"]


class TestToggleReaction:
    def test_inserts_when_not_present(self, monkeypatch):
        mock_sb = MagicMock()
        # existing check returns empty
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
        # get_reactions after toggle
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"emoji": "❤️", "user_id": "u1"},
        ]
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import toggle_reaction
        result = toggle_reaction("tok-1", "u1", "❤️")
        mock_sb.table.return_value.insert.assert_called_once()
        assert result["counts"]["❤️"] == 1

    def test_deletes_when_already_present(self, monkeypatch):
        mock_sb = MagicMock()
        # existing check returns a row
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
            {"id": "r1"}
        ]
        # get_reactions after toggle returns empty
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import toggle_reaction
        result = toggle_reaction("tok-1", "u1", "❤️")
        mock_sb.table.return_value.delete.assert_called_once()
        assert result["counts"]["❤️"] == 0

    def test_rejects_invalid_emoji(self, monkeypatch):
        import pytest
        mock_sb = MagicMock()
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import toggle_reaction
        with pytest.raises(ValueError, match="Invalid emoji"):
            toggle_reaction("tok-1", "u1", "🔥")
```

**Step 2: Watch them fail**
```bash
python -m pytest tests/test_reactions.py -v
# Expected: ImportError or AttributeError — functions don't exist yet
```

**Step 3: Implementation — append to `tools/storage.py`**

```python
# ── Reactions ─────────────────────────────────────────────────────────────

_VALID_EMOJIS = {"❤️", "🙏", "😢", "😄"}


def get_reactions(memory_token: str, user_id: str | None = None) -> dict:
    """Return emoji counts and the current user's reactions for a memory."""
    sb = _client()
    rows = (
        sb.table("reactions")
        .select("emoji, user_id")
        .eq("memory_token", memory_token)
        .execute()
        .data
    ) or []
    counts: dict[str, int] = {e: 0 for e in _VALID_EMOJIS}
    for row in rows:
        if row["emoji"] in counts:
            counts[row["emoji"]] += 1
    user_reactions = [r["emoji"] for r in rows if r.get("user_id") == user_id] if user_id else []
    return {"counts": counts, "user_reactions": user_reactions}


def toggle_reaction(memory_token: str, user_id: str, emoji: str) -> dict:
    """Toggle an emoji reaction. Returns updated counts and user's reactions."""
    if emoji not in _VALID_EMOJIS:
        raise ValueError(f"Invalid emoji: {emoji!r}")
    sb = _client()
    existing = (
        sb.table("reactions")
        .select("id")
        .eq("memory_token", memory_token)
        .eq("user_id", user_id)
        .eq("emoji", emoji)
        .execute()
    )
    if existing.data:
        sb.table("reactions").delete().eq("id", existing.data[0]["id"]).execute()
    else:
        sb.table("reactions").insert(
            {"memory_token": memory_token, "user_id": user_id, "emoji": emoji}
        ).execute()
    return get_reactions(memory_token, user_id)
```

**Step 4: Watch them pass**
```bash
python -m pytest tests/test_reactions.py -v
python -m pytest tests/ -q  # full suite — must stay green
```

**Step 5: Commit**
```bash
git add tools/storage.py tests/test_reactions.py
git commit -m "[Add] [tools]: get_reactions and toggle_reaction storage functions"
```

---

### Chunk B.2 — API endpoints: `POST /reaction/{token}` + `GET /reactions/{token}`

Files:
- Modify: `scripts/serve.py` (2 new endpoints, 1 new Pydantic model)
- Modify: `tests/test_reactions.py` (append API tests)

**Step 1: Failing tests — append to `tests/test_reactions.py`**

```python
# append to tests/test_reactions.py
from fastapi.testclient import TestClient
from scripts.serve import app

_client_app = TestClient(app)

def _auth_headers():
    return {"Authorization": "Bearer test-token"}


class TestGetReactionsEndpoint:
    def test_returns_counts(self, monkeypatch):
        import tools.storage as _s
        monkeypatch.setattr(_s, "get_reactions", lambda token, user_id=None: {
            "counts": {"❤️": 2, "🙏": 0, "😢": 0, "😄": 1},
            "user_reactions": ["❤️"],
        })
        import scripts.serve as _serve
        monkeypatch.setattr(_serve, "require_auth", lambda: {"sub": "u1"})
        res = _client_app.get("/reactions/tok-1", headers=_auth_headers())
        assert res.status_code == 200
        assert res.json()["counts"]["❤️"] == 2

    def test_returns_401_without_auth(self):
        res = _client_app.get("/reactions/tok-1")
        assert res.status_code == 401


class TestToggleReactionEndpoint:
    def test_toggles_and_returns_counts(self, monkeypatch):
        import tools.storage as _s
        monkeypatch.setattr(_s, "toggle_reaction", lambda token, user_id, emoji: {
            "counts": {"❤️": 1, "🙏": 0, "😢": 0, "😄": 0},
            "user_reactions": ["❤️"],
        })
        import scripts.serve as _serve
        monkeypatch.setattr(_serve, "require_auth", lambda: {"sub": "u1"})
        res = _client_app.post(
            "/reaction/tok-1",
            json={"emoji": "❤️"},
            headers=_auth_headers(),
        )
        assert res.status_code == 200
        assert res.json()["user_reactions"] == ["❤️"]

    def test_rejects_invalid_emoji(self, monkeypatch):
        import tools.storage as _s
        monkeypatch.setattr(_s, "toggle_reaction", lambda *a, **kw: (_ for _ in ()).throw(ValueError("Invalid emoji")))
        import scripts.serve as _serve
        monkeypatch.setattr(_serve, "require_auth", lambda: {"sub": "u1"})
        res = _client_app.post(
            "/reaction/tok-1",
            json={"emoji": "🔥"},
            headers=_auth_headers(),
        )
        assert res.status_code == 400
```

**Step 2: Watch them fail**
```bash
python -m pytest tests/test_reactions.py::TestGetReactionsEndpoint tests/test_reactions.py::TestToggleReactionEndpoint -v
```

**Step 3: Implementation — add to `scripts/serve.py`**

Add Pydantic model near the other request models:
```python
class ReactionRequest(BaseModel):
    emoji: str
```

Add endpoints (before the final catch-all or after `/recipe/{token}` block):
```python
@app.get("/reactions/{memory_token}")
async def get_reactions_endpoint(memory_token: str, user: dict = Depends(require_auth)):
    """Return emoji reaction counts for a memory."""
    from tools.storage import get_reactions
    user_id = _user_id(user)
    return JSONResponse(content=get_reactions(memory_token, user_id=user_id))


@app.post("/reaction/{memory_token}")
async def toggle_reaction_endpoint(
    memory_token: str, body: ReactionRequest, user: dict = Depends(require_auth)
):
    """Toggle an emoji reaction on a memory. Returns updated counts."""
    from tools.storage import toggle_reaction
    user_id = _user_id(user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        result = toggle_reaction(memory_token, user_id, body.emoji)
        return JSONResponse(content=result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

**Step 4: Watch them pass**
```bash
python -m pytest tests/test_reactions.py -v
python -m pytest tests/ -q
```

**Step 5: Commit**
```bash
git add scripts/serve.py tests/test_reactions.py
git commit -m "[Add] [backend]: GET /reactions and POST /reaction toggle endpoints"
```

---

## Block C — Frontend

### Chunk C.1 — Portal login gate

Files:
- Modify: `frontend/app/family/page.tsx`

**No Python test. Verify by visiting `/family?p=TOKEN` in an incognito window.**

Add session check at the top of `PortalContent`:

```tsx
// At the top of PortalContent(), before existing useState declarations:
const router = useRouter()

useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) {
      const here = window.location.pathname + window.location.search
      localStorage.setItem('returnTo', here)
      router.replace(`/?next=${encodeURIComponent(here)}`)
    }
  })
}, [router])
```

Also add `import { useRouter } from 'next/navigation'` and `import { supabase } from '@/lib/supabase'` if not already present.

**Verify:** incognito → portal URL → redirected to login → sign in → back on portal.

**Commit:**
```bash
git add frontend/app/family/page.tsx
git commit -m "[Add] [frontend]: gate family portal behind login — redirect to sign-in if no session"
```

---

### Chunk C.2 — `ReactionBar` component + `api.reactions` methods

Files:
- Create: `frontend/components/ReactionBar.tsx`
- Modify: `frontend/lib/api.ts` (add `reactions` key)

**`frontend/components/ReactionBar.tsx`:**

```tsx
'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

const EMOJIS = ['❤️', '🙏', '😢', '😄'] as const

type ReactionData = {
  counts: Record<string, number>
  user_reactions: string[]
}

type Props = {
  token: string
  initialData: ReactionData
}

export default function ReactionBar({ token, initialData }: Props) {
  const [counts, setCounts] = useState<Record<string, number>>(initialData.counts)
  const [userReactions, setUserReactions] = useState<Set<string>>(
    new Set(initialData.user_reactions)
  )

  async function toggle(emoji: string) {
    const reacted = userReactions.has(emoji)
    // Optimistic update
    const nextCounts = { ...counts, [emoji]: (counts[emoji] ?? 0) + (reacted ? -1 : 1) }
    const nextUser = new Set(userReactions)
    if (reacted) nextUser.delete(emoji); else nextUser.add(emoji)
    setCounts(nextCounts)
    setUserReactions(nextUser)
    try {
      const res = await api.reactions.toggle(token, emoji) as ReactionData
      setCounts(res.counts)
      setUserReactions(new Set(res.user_reactions))
    } catch {
      // Revert on failure
      setCounts(counts)
      setUserReactions(userReactions)
    }
  }

  return (
    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
      {EMOJIS.map(emoji => {
        const active = userReactions.has(emoji)
        const count = counts[emoji] ?? 0
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => toggle(emoji)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.3rem 0.65rem', borderRadius: 20, cursor: 'pointer',
              border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'var(--accent-light)' : 'var(--surface)',
              fontSize: '1rem', fontFamily: 'var(--sans)',
              transition: 'border-color 0.12s, background 0.12s',
            }}
          >
            {emoji}
            {count > 0 && (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text2)' }}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
```

**Add to `frontend/lib/api.ts`** (inside the `api` object):

```ts
reactions: {
  get: (token: string) => authFetch(`/reactions/${token}`),
  toggle: (token: string, emoji: string) =>
    authFetch(`/reaction/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    }),
},
```

**Commit:**
```bash
git add frontend/components/ReactionBar.tsx frontend/lib/api.ts
git commit -m "[Add] [frontend]: ReactionBar component and api.reactions methods"
```

---

### Chunk C.3 — Wire `ReactionBar` into the portal page

Files:
- Modify: `frontend/app/family/page.tsx`

After fetching portal data, fetch reactions for each memory in parallel:

```tsx
// After setData(d) in the useEffect:
const tokens = (d.recipes ?? []).map((m: PortalMemory) => m.token)
const reactionResults = await Promise.all(
  tokens.map((t: string) =>
    api.reactions.get(t).catch(() => ({ counts: { '❤️': 0, '🙏': 0, '😢': 0, '😄': 0 }, user_reactions: [] }))
  )
)
const reactionMap: Record<string, { counts: Record<string, number>; user_reactions: string[] }> = {}
tokens.forEach((t: string, i: number) => { reactionMap[t] = reactionResults[i] as { counts: Record<string, number>; user_reactions: string[] } })
setReactions(reactionMap)
```

Add state: `const [reactions, setReactions] = useState<Record<string, { counts: Record<string, number>; user_reactions: string[] }>>({}).`

In each memory card render, below the audio player / recipe content:

```tsx
{reactions[m.token] && (
  <div style={{ marginTop: '0.75rem' }}>
    <ReactionBar token={m.token} initialData={reactions[m.token]} />
  </div>
)}
```

**Commit:**
```bash
git add frontend/app/family/page.tsx
git commit -m "[Add] [frontend]: emoji reactions on family portal memory cards"
```

---

### Chunk C.4 — Wire `ReactionBar` into the owner's memory detail page

Files:
- Modify: `frontend/app/(app)/memory/page.tsx`

Add reaction state and fetch alongside the existing memory fetch:

```tsx
const [reactionData, setReactionData] = useState<{ counts: Record<string, number>; user_reactions: string[] }>({
  counts: { '❤️': 0, '🙏': 0, '😢': 0, '😄': 0 },
  user_reactions: [],
})

// Inside the useEffect that fetches the memory, after setMemory(...):
api.reactions.get(token)
  .then((r: unknown) => setReactionData(r as typeof reactionData))
  .catch(() => {}) // non-fatal — reactions are additive, not core
```

In the **audio/moments layout**, add after the audio player block:
```tsx
<div style={{ marginBottom: '1rem' }}>
  <ReactionBar token={token} initialData={reactionData} />
</div>
```

In the **recipe layout**, add after the recipe content block (before the actions strip):
```tsx
<div style={{ marginBottom: '1.25rem' }}>
  <ReactionBar token={token} initialData={reactionData} />
</div>
```

Import `ReactionBar` at the top of the file.

**Commit:**
```bash
git add frontend/app/(app)/memory/page.tsx
git commit -m "[Add] [frontend]: show emoji reaction counts on memory detail page for owner"
```

---

## Do NOT break list

- `require_auth` on both new endpoints — no exceptions
- `toggle_reaction` must validate emoji against `_VALID_EMOJIS` before hitting Supabase
- Portal reaction fetch failure must be silent (`.catch(() => {})`) — never crash the portal
- Optimistic update must revert on API failure
- Full test suite must stay green after every chunk: `python -m pytest tests/ -q`

## Deploy gate

Chunk A.1 (Supabase DDL) **must be run before** deploying Block B. Otherwise `toggle_reaction` will get a Supabase 400 on table-not-found — the API returns 500 and the frontend silently shows 0 counts (acceptable degradation), but it's avoidable.

Ready to build? Use `/build`.
