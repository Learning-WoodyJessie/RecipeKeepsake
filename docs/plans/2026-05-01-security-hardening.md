# Security Hardening — Design PRD
*Date: 2026-05-01*

## Goal
Ensure that personal family data — voice recordings, transcripts, narrator profiles and photos — is accessible only to the person who captured it, and can be fully deleted on request.

## Audience
You, using Echoes of Home (interactive, human-in-the-loop). This is a personal family archive, not a public platform.

## Why this is a priority
Every memory type we add (Remedies, Stories, Songs) increases the sensitivity of what's stored. Hardening now — before we expand — means every future memory type inherits the correct security posture automatically.

---

## Scope — what we're NOT building
- Invite-only family sharing (Phase 5 — deferred)
- Audit logs / access history
- End-to-end encryption of Supabase data at rest (Supabase AES-256 already handles this)
- Self-hosted LLM to avoid OpenAI data handling (valid future option, not now)
- Two-factor authentication

---

## The four problems we're solving

### Problem 1 — Multiple endpoints are publicly accessible
Three endpoints have no authentication at all:

- `GET /recipe/{token}` — anyone with a token reads the full recipe + receives a working signed audio URL
- `GET /recipe/{token}/translate` — same; also calls OpenAI on your account
- `POST /generate-image` — calls DALL-E with no auth; anyone can burn your OpenAI credits

**Principle going forward: public by exception only.**
Only two routes should ever be public: `GET /` (HTML shell, no user data) and `GET /privacy` (legal requirement). Every other endpoint requires a valid JWT — no exceptions.

### Problem 2 — Narrator profiles live in the browser
`rk_people` in `localStorage` stores names, relationships, bios, personal notes,
and photos as base64 strings — unencrypted, tied to one device, cleared by browser cache wipe.
This is the most sensitive data in the app (real faces, real family relationships).

### Problem 3 — No DB-level ownership enforcement
All Supabase access uses the service role key (bypasses Row Level Security).
Python ownership checks are the only guard. A bug in one endpoint, or a future
endpoint that forgets the check, silently exposes another user's data.

### Problem 4 — No way to delete your data
There is no account deletion flow. A user who wants their grandmother's voice
recordings removed has no path to do so.

---

## Core Requirements

1. `GET /recipe/{token}` — require authentication (add `Depends(require_auth)`)
2. `GET /recipe/{token}/translate` — require authentication
3. `POST /generate-image` — require authentication (currently fully public — OpenAI cost exposure)
3. New `people` table in Supabase — stores narrator profiles server-side, owned by `user_id`
4. New CRUD API endpoints: `GET /people`, `POST /people`, `PUT /people/{id}`, `DELETE /people/{id}`
5. Client migrated — all `_loadPeople()` / `_savePeople()` localStorage calls replaced with API calls
6. Supabase RLS enabled on `recipes` and `people` tables — policy: `user_id = auth.uid()`
7. `DELETE /account` endpoint — removes all recipes (+ audio files from Storage), all people records, and the Supabase auth user record

---

## Supabase schema additions

```sql
-- New table for narrator profiles
CREATE TABLE people (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  name          text not null,
  relationship  text,
  emoji         text,
  photo_data    text,       -- base64-encoded photo (nullable)
  bio           text,
  notes         text,
  created_at    timestamptz default now()
);

-- RLS on people
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON people FOR ALL
  USING (user_id = auth.uid()::text);

-- RLS on recipes (service role bypasses this — it acts as a backstop for anon key access)
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON recipes FOR ALL
  USING (user_id = auth.uid()::text);
```

---

## API changes (serve.py)

### Auth-gating existing endpoints
```python
# Before (public):
@app.get("/recipe/{token}")
async def get_recipe_endpoint(token: str):

# After (auth required):
@app.get("/recipe/{token}")
async def get_recipe_endpoint(token: str, user: dict = Depends(require_auth)):
```
Same change for `/recipe/{token}/translate` and `POST /generate-image`.

### Client-side fixes required in the same chunk
Two client fetches currently send no auth headers and will break when endpoints are gated:
```javascript
// web/app.html line ~2981 — add auth headers
const res = await fetch(`/recipe/${token}`);                           // ❌ today
const res = await fetch(`/recipe/${token}`, { headers: await getAuthHeaders() }); // ✅ fix

// web/app.html line ~3205 — add auth headers
const res = await fetch(`/recipe/${currentRecipe.token}/translate?lang=${lang}`);  // ❌ today
const res = await fetch(`/recipe/${currentRecipe.token}/translate?lang=${lang}`,
  { headers: await getAuthHeaders() });                                            // ✅ fix
```

### New people endpoints
```python
GET    /people              → list all people for authenticated user
POST   /people              → create a person { name, relationship, emoji, photo_data, bio, notes }
PUT    /people/{id}         → update a person (ownership check)
DELETE /people/{id}         → delete a person (ownership check)
```

### Account deletion
```python
DELETE /account             → authenticated; deletes all recipes + audio files + people + auth user
```
Sequence:
1. List all recipes for `user_id`
2. For each recipe: delete audio file from Supabase Storage `audio` bucket
3. Delete all recipe rows for `user_id`
4. Delete all people rows for `user_id`
5. Delete Supabase auth user via admin API (service role)
6. Return `{ "deleted": true }`

---

## tools/storage.py additions

```python
# People CRUD
def list_people(user_id: str) -> list[dict]
def create_person(user_id: str, data: dict) -> dict   # returns created record
def update_person(person_id: str, data: dict) -> dict
def delete_person(person_id: str) -> None

# Account deletion (composite)
def delete_account(user_id: str) -> None
  # deletes all recipes, audio files, and people for the user
```

---

## Client changes (web/app.html)

Replace localStorage people functions with API calls:

```javascript
// OLD
function _loadPeople() {
  return JSON.parse(localStorage.getItem('rk_people') || '[]');
}
function _savePeople(arr) {
  localStorage.setItem('rk_people', JSON.stringify(arr));
}

// NEW — async, backed by /people endpoints
async function _loadPeople()      // GET /people
async function _createPerson(p)   // POST /people
async function _updatePerson(p)   // PUT /people/{id}
async function _deletePerson(id)  // DELETE /people/{id}
```

All callers (renderPeople, savePersonModal, deletePerson) updated to await the API.
A session-level people cache (`_peopleCache`) is loaded once on sign-in and held in
memory — same access pattern as today's localStorage, just the source changes.

### People cache load-on-signin (critical for home screen)
The home screen renders narrator avatars via `_personAvHtml(name, size)` in both the
favorites row and recent memories list. This function reads from `_peopleCache`.
People must be loaded before the home screen renders:

```javascript
// On initAuth() success — run in parallel, then render home
const [recipes, people] = await Promise.all([
  fetchRecipes(),   // GET /recipes → allRecipes
  fetchPeople(),    // GET /people  → _peopleCache
]);
renderHome();
```

Any screen showing a narrator avatar reads from `_peopleCache` (home, all recipes, recipe
detail). People CRUD operations (add/edit/delete) update the cache in-place.

Migration note: on first load after deploy, existing `rk_people` localStorage data is
read, synced to Supabase via POST /people for each entry, then cleared from localStorage.
One-time migration, silent.

---

## Account deletion UI

A "Delete account" option under Account in the sidebar.
Pattern: same two-step confirmation as delete recipe.
- Click → slide-in red banner: *"This will permanently delete all your memories, voice recordings, and family profiles. This cannot be undone."*
- "Delete everything" → calls `DELETE /account` → signs out → returns to landing page

---

## Success Criteria

- [ ] Visiting `/recipe/[any-token]` without a valid JWT returns 401
- [ ] `rk_people` no longer exists in `localStorage` after first load (migrated to Supabase)
- [ ] People survive a browser cache wipe — re-login shows all profiles intact
- [ ] People are visible on both phone and laptop (same account)
- [ ] A second test account cannot read another user's recipes or people via the API
- [ ] Supabase dashboard shows RLS enabled on `recipes` and `people` tables
- [ ] `DELETE /account` removes all audio files from Storage bucket (verified in Supabase dashboard)
- [ ] After account deletion, sign-in with the same Google account shows an empty fresh state

---

## Edge Cases & Failure Modes

| Scenario | Behaviour |
|---|---|
| `DELETE /account` fails mid-way (e.g. Storage delete errors) | Log the error, continue deleting remaining items — partial deletion is safer than no deletion |
| Person has no photo | `photo_data` is null — avatar falls back to emoji or initials, same as today |
| Existing localStorage people on first load after deploy | Silent one-time migration: read localStorage → POST to `/people` for each → clear localStorage |
| Migration fails for one person | Log it, continue — localStorage entry stays as fallback; user sees their data |
| Auth token expires mid-session | 401 on API call → redirect to sign-in (same as existing pattern) |
| Supabase RLS rejects service-role query | Won't happen — service role bypasses RLS by design |

---

## What this deliberately does NOT change
- Audio bucket remains private, signed URLs remain 1-hour expiry — already correct
- DALL-E images remain in public `images` bucket — they are AI-generated, not personal
- OpenAI data handling — API tier policy (no training use, ≤30 day retention) is acceptable for now
- Rate limiting — stays in-memory per-server, acceptable for personal use

---

## Build order (recommended)

1. **Chunk 1** — Auth-gate the two recipe endpoints (smallest, highest impact)
2. **Chunk 2** — `tools/storage.py`: people CRUD + `delete_account()`
3. **Chunk 3** — `serve.py`: people API endpoints + `DELETE /account`
4. **Chunk 4** — `web/app.html`: async people functions + silent localStorage migration
5. **Chunk 5** — Supabase: enable RLS on `recipes` and `people` (manual console step, documented)
6. **Chunk 6** — `web/app.html`: account deletion UI (banner + sign-out flow)
