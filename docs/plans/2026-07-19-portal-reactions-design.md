# Family Portal — Login Gate + Emoji Reactions MVP

*Designed 2026-07-19*

---

## Goal

Gate the family portal behind authentication and let any logged-in visitor leave an emoji reaction on a memory, visible to the owner on their memory detail page.

---

## Audience

Family members (non-owners) who receive the portal link via WhatsApp. Owner who captures and curates memories.

---

## Scope — what we are NOT building

- Text comments (future phase)
- Reaction notifications / push alerts
- Per-reaction identity ("who reacted") shown to viewers
- Reaction editing or deletion by viewers
- Moderation or reporting
- Group membership check before reacting — any authenticated user with the URL can react
- Separate "family member" account tier or invite flow

---

## Core Requirements

1. **Portal login gate** — `/family?p=TOKEN` redirects unauthenticated visitors to login, preserving the full URL as `returnTo` so they land back on the portal after sign-in.

2. **Reaction bar on portal** — each memory card on the portal shows 4 emoji reactions (❤️ 🙏 😢 😄) with aggregate counts. Tapping an emoji toggles it (add if absent, remove if present). One reaction per emoji per user per memory.

3. **Reaction bar on memory detail** — owner sees the same 4 emoji with counts on their memory detail page (read-only aggregate, no toggle for the owner's own memories — they can react too but the display is the same component).

4. **Persistence** — reactions stored in Supabase `reactions` table; survive page refresh.

5. **Optimistic UI** — count updates immediately on tap; silently reverts on API failure.

---

## Data Model

```sql
CREATE TABLE reactions (
  id            uuid primary key default gen_random_uuid(),
  memory_token  text not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  emoji         text not null check (emoji in ('❤️', '🙏', '😢', '😄')),
  created_at    timestamptz default now(),
  unique (memory_token, user_id, emoji)
);

-- Fast lookup by token (portal page fetches all reactions for N memories)
CREATE INDEX reactions_memory_token_idx ON reactions(memory_token);
```

---

## API Surface (2 new endpoints in serve.py)

### `POST /reaction/{memory_token}`
Body: `{ "emoji": "❤️" }`
Behaviour: toggle — inserts if absent, deletes if present (upsert + conflict = delete).
Returns: `{ "counts": { "❤️": 5, "🙏": 2, "😢": 0, "😄": 1 }, "user_reactions": ["❤️"] }`
Auth: `Depends(require_auth)` — any authenticated user.

### `GET /reactions/{memory_token}`
Returns: same shape as above.
Auth: `Depends(require_auth)`.

No ownership check on either endpoint — the token is the access key, same as `GET /recipe/{token}`.

---

## Frontend Changes

### 1. Portal login gate (`frontend/app/family/page.tsx`)
- On mount, call `supabase.auth.getSession()`.
- If no session → `localStorage.setItem('returnTo', window.location.href)` → `router.replace('/?next=' + encodeURIComponent(window.location.href))`.
- Show "Loading…" until session resolves (same pattern as AuthGuard).
- After login, auth callback already reads `returnTo` → user lands back on portal. ✓

### 2. `ReactionBar` component (`frontend/components/ReactionBar.tsx`)
Props: `{ token: string; initialCounts: Record<string, number>; initialUserReactions: string[]; readonly?: boolean }`

- Renders 4 buttons: ❤️ 🙏 😢 😄 each with count.
- Optimistic toggle on tap (update local state immediately).
- Calls `api.reactions.toggle(token, emoji)` in background; reverts on error.
- `readonly` prop disables tap (reserved for future non-owner contexts; not used in MVP).
- Highlighted state for emojis the current user has already reacted with.

### 3. Portal page — fetch reactions per memory
- After fetching portal data, batch-fetch reactions for all `memory_token`s.
- Pass `initialCounts` and `initialUserReactions` to each memory card's `ReactionBar`.
- Single API call per memory (no bulk endpoint needed for MVP — portal has ≤ ~20 memories typically).

### 4. Memory detail page — owner view
- On the memory detail page, add `ReactionBar` below the audio player (moments) / below the recipe content (recipes).
- Fetch reactions via `GET /reactions/{token}` alongside the existing memory fetch.
- Owner can also react (same toggle behaviour — they're authenticated too).

---

## Success Criteria

- [ ] Unauthenticated user clicks portal link → redirected to login → lands back on portal after sign-in.
- [ ] Logged-in family member taps ❤️ on a memory → count increments immediately → persists on refresh.
- [ ] Tapping same emoji again removes it → count decrements.
- [ ] Owner opens memory detail page → sees correct reaction counts matching portal.
- [ ] Two different users reacting independently → counts accumulate correctly.

---

## Edge Cases & Failure Modes

| Scenario | Behaviour |
|---|---|
| API toggle fails (network) | Optimistic update reverts silently — no error toast (non-critical action) |
| User reacts while portal is loading | Button disabled until initial counts load |
| Memory with 0 reactions | All 4 emojis show with count "0" (or hidden count if 0) |
| Same user opens portal on two tabs, reacts on one | Second tab shows stale count until refresh — acceptable for MVP |
| Portal token invalid / expired | Existing error state unchanged — reactions never reached |
| Supabase `reactions` table missing on deploy | `GET /reactions` returns `{"counts": {}, "user_reactions": []}` — portal renders with empty counts rather than crashing |

---

## Migration Note

The `reactions` table must be created in Supabase before deploy. No RLS needed for MVP — the API layer enforces auth via `require_auth`. Add RLS in Phase 5 when per-row ownership policies are set up.

---

## What this unblocks

- Text comments (same table pattern, new `comments` table)
- Reaction notifications to owner
- "Most loved" sort order on portal
