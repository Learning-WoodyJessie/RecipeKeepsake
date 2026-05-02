# Security Hardening — Implementation Plan
*Date: 2026-05-01*

```
Goal:         Close all public API endpoints, move narrator profiles to Supabase, add account deletion.
Layer:        Multi-layer — tools/storage.py, scripts/serve.py, web/app.html
Architecture: Three concerns addressed in order: server auth gates (quickest protection),
              people CRUD to Supabase (most sensitive data), account deletion (right to be forgotten).
              Client changes (async people + parallel load) follow server readiness.
Design doc:   docs/plans/2026-05-01-security-hardening.md
```

**Baseline:** 61 tests passing. Every chunk must keep the suite green.

**Public-by-exception rule** (established in PRD):
- ✅ Public: `GET /` (HTML shell), `GET /privacy` (legal)
- 🔒 Everything else: `Depends(require_auth)`

---

## Block 1 — Auth-gate ungated endpoints

### Chunk 1.1 — Auth-gate 3 server endpoints + fix 2 client fetches

Files:
- Modify: `scripts/serve.py`
- Modify: `web/app.html`

No automated test — no `test_serve.py` pattern exists in this codebase. Verification: deploy + confirm 401 on unauthenticated request.

**Step 1: The change**

In `scripts/serve.py`, add `user: dict = Depends(require_auth)` to three endpoints:

```python
# GET /recipe/{token}  (line ~149)
@app.get("/recipe/{token}")
async def get_recipe_endpoint(token: str, user: dict = Depends(require_auth)):

# GET /recipe/{token}/translate  (line ~406)
@app.get("/recipe/{token}/translate")
async def translate_recipe_endpoint(token: str, lang: str = "en", user: dict = Depends(require_auth)):

# POST /generate-image  (line ~356)
@app.post("/generate-image")
async def generate_image_endpoint(body: ..., user: dict = Depends(require_auth)):
```

In `web/app.html`, two client fetches are missing auth headers — fix them in the same commit:

```javascript
// ~line 2981 — recipe detail fetch
// BEFORE:
const res = await fetch(`/recipe/${token}`);
// AFTER:
const res = await fetch(`/recipe/${token}`, { headers: await getAuthHeaders() });

// ~line 3205 — translate fetch
// BEFORE:
const res = await fetch(`/recipe/${currentRecipe.token}/translate?lang=${lang}`);
// AFTER:
const res = await fetch(`/recipe/${currentRecipe.token}/translate?lang=${lang}`,
  { headers: await getAuthHeaders() });
```

**Step 2: Verify tests still pass (no new tests for this chunk)**
```bash
python -m pytest tests/ -v
# Expected: 61 passed — no regressions
```

**Step 3: Commit**
```bash
git add scripts/serve.py web/app.html
git commit -m "[Security] [serve]: auth-gate recipe + translate + generate-image endpoints"
```

---

## Block 2 — People CRUD in tools/storage.py

### Chunk 2.1 — list_people, create_person, update_person, delete_person

Files:
- Modify: `tools/storage.py`
- Modify: `tests/test_storage.py` (add `TestListPeople`, `TestCreatePerson`, `TestUpdatePerson`, `TestDeletePerson`)

**Step 1: Failing tests**

Add to `tests/test_storage.py`:

```python
from tools.storage import list_people, create_person, update_person, delete_person

class TestListPeople:
    def test_returns_people_for_user(self):
        """list_people(user_id) returns all people belonging to that user."""
        expected = [{"id": "p1", "name": "Ammamma", "user_id": "u1"}]
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = expected
            result = list_people("u1")
        assert result == expected

    def test_returns_empty_list_when_no_people(self):
        """list_people() returns [] when user has no people."""
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
            result = list_people("u1")
        assert result == []


class TestCreatePerson:
    def test_returns_created_record(self):
        """create_person() returns the inserted row."""
        expected = {"id": "p1", "name": "Ammamma", "user_id": "u1"}
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.insert.return_value.execute.return_value.data = [expected]
            result = create_person("u1", {"name": "Ammamma"})
        assert result == expected

    def test_inserts_into_people_table(self):
        """create_person() targets the 'people' table."""
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.insert.return_value.execute.return_value.data = [{"id": "p1"}]
            create_person("u1", {"name": "Ammamma"})
        sb.table.assert_called_with("people")

    def test_merges_user_id_into_data(self):
        """create_person() adds user_id to the insert payload."""
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.insert.return_value.execute.return_value.data = [{"id": "p1"}]
            create_person("u1", {"name": "Ammamma"})
        insert_call = sb.table.return_value.insert.call_args[0][0]
        assert insert_call["user_id"] == "u1"
        assert insert_call["name"] == "Ammamma"


class TestUpdatePerson:
    def test_returns_updated_record(self):
        """update_person() returns the updated row."""
        expected = {"id": "p1", "name": "Peddamma"}
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [expected]
            result = update_person("p1", {"name": "Peddamma"})
        assert result == expected


class TestDeletePerson:
    def test_calls_delete_on_people_table(self):
        """delete_person() deletes the row with the given id."""
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            delete_person("p1")
        sb.table.assert_called_with("people")
        sb.table.return_value.delete.assert_called_once()
        sb.table.return_value.delete.return_value.eq.assert_called_with("id", "p1")
```

**Step 2: Watch them fail**
```bash
python -m pytest tests/test_storage.py::TestListPeople -v
# Expected: ImportError — list_people does not exist yet
```

**Step 3: Minimal implementation** — add to `tools/storage.py`:

```python
def list_people(user_id: str) -> list:
    """Return all narrator profiles belonging to this user."""
    result = (
        _client().table("people")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data


def create_person(user_id: str, data: dict) -> dict:
    """Insert a narrator profile. Returns the created row."""
    payload = {**data, "user_id": user_id}
    result = _client().table("people").insert(payload).execute()
    return result.data[0]


def update_person(person_id: str, data: dict) -> dict:
    """Update a narrator profile by id. Returns the updated row."""
    result = _client().table("people").update(data).eq("id", person_id).execute()
    return result.data[0]


def delete_person(person_id: str) -> None:
    """Hard-delete a narrator profile by id."""
    _client().table("people").delete().eq("id", person_id).execute()
```

**Step 4: Watch them pass**
```bash
python -m pytest tests/test_storage.py -v
python -m pytest tests/ -v  # full suite — must stay at 61+
```

**Step 5: Commit**
```bash
git add tools/storage.py tests/test_storage.py
git commit -m "[Add] [tools]: people CRUD — list_people, create_person, update_person, delete_person"
```

---

## Block 3 — People API endpoints (serve.py)

### Chunk 3.1 — GET /people, POST /people, PUT /people/{id}, DELETE /people/{id}

Files:
- Modify: `scripts/serve.py`

No automated test — no `test_serve.py` pattern in codebase.

**Step 1: The change** — add four endpoints to `scripts/serve.py`:

```python
from tools.storage import list_people, create_person, update_person, delete_person

class PersonRequest(BaseModel):
    name: str
    relationship: str | None = None
    emoji: str | None = None
    photo_data: str | None = None   # base64-encoded photo
    bio: str | None = None
    notes: str | None = None

@app.get("/people")
async def list_people_endpoint(user: dict = Depends(require_auth)):
    from tools.storage import list_people
    user_id = user.get("id", "")
    return JSONResponse(content={"people": list_people(user_id)})

@app.post("/people")
async def create_person_endpoint(body: PersonRequest, user: dict = Depends(require_auth)):
    from tools.storage import create_person
    user_id = user.get("id", "")
    person = create_person(user_id, body.model_dump(exclude_none=True))
    return JSONResponse(content={"person": person})

@app.put("/people/{person_id}")
async def update_person_endpoint(person_id: str, body: PersonRequest, user: dict = Depends(require_auth)):
    from tools.storage import update_person, list_people
    user_id = user.get("id", "")
    # Ownership check
    people = list_people(user_id)
    if not any(p["id"] == person_id for p in people):
        raise HTTPException(status_code=403, detail="Not your record")
    person = update_person(person_id, body.model_dump(exclude_none=True))
    return JSONResponse(content={"person": person})

@app.delete("/people/{person_id}")
async def delete_person_endpoint(person_id: str, user: dict = Depends(require_auth)):
    from tools.storage import delete_person, list_people
    user_id = user.get("id", "")
    people = list_people(user_id)
    if not any(p["id"] == person_id for p in people):
        raise HTTPException(status_code=403, detail="Not your record")
    delete_person(person_id)
    return JSONResponse(content={"deleted": person_id})
```

**Step 2: Verify**
```bash
python -m pytest tests/ -v  # must stay green
```

**Step 3: Commit**
```bash
git add scripts/serve.py
git commit -m "[Add] [serve]: people CRUD endpoints — GET/POST /people, PUT/DELETE /people/{id}"
```

---

## Block 4 — Account deletion

### Chunk 4.1 — delete_account in tools/storage.py + DELETE /account endpoint

Files:
- Modify: `tools/storage.py`
- Modify: `tests/test_storage.py` (add `TestDeleteAccount`)
- Modify: `scripts/serve.py`

**Step 1: Failing test**

```python
class TestDeleteAccount:
    def test_deletes_all_recipes_for_user(self):
        """delete_account() deletes every recipe row belonging to the user."""
        fake_recipes = [
            {"token": "tok1", "audio_url": "file1.webm"},
            {"token": "tok2", "audio_url": ""},
        ]
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            # list_recipes returns two rows
            sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = fake_recipes
            delete_account("u1")
        # delete called on recipes table
        delete_call = sb.table.return_value.delete.return_value.eq
        delete_call.assert_called()

    def test_deletes_all_people_for_user(self):
        """delete_account() deletes all people rows for the user."""
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
            delete_account("u1")
        # Called table() — at minimum once for recipes, once for people
        assert sb.table.call_count >= 2
```

**Step 2: Watch fail**
```bash
python -m pytest tests/test_storage.py::TestDeleteAccount -v
# Expected: ImportError — delete_account not defined
```

**Step 3: Minimal implementation** — add to `tools/storage.py`:

```python
def delete_account(user_id: str) -> None:
    """Delete ALL data for a user: audio files, recipe rows, people rows.

    Errors on individual steps are logged but do not halt the sequence —
    partial deletion is safer than abandoning mid-way.
    """
    sb = _client()

    # 1. Delete audio files from Storage for each recipe
    recipes = (
        sb.table("recipes")
        .select("token, audio_url")
        .eq("user_id", user_id)
        .order("recorded_at", desc=False)
        .execute()
        .data
    )
    for r in recipes:
        audio = r.get("audio_url", "")
        if audio:
            try:
                filename = _audio_filename(audio)
                sb.storage.from_("audio").remove([filename])
            except Exception as e:
                print(f"[delete_account] audio remove failed (non-fatal): {e}")

    # 2. Delete all recipe rows for this user
    try:
        sb.table("recipes").delete().eq("user_id", user_id).execute()
    except Exception as e:
        print(f"[delete_account] recipe delete failed: {e}")

    # 3. Delete all people rows for this user
    try:
        sb.table("people").delete().eq("user_id", user_id).execute()
    except Exception as e:
        print(f"[delete_account] people delete failed: {e}")

    # 4. Delete the Supabase auth user (service role required)
    try:
        sb.auth.admin.delete_user(user_id)
    except Exception as e:
        print(f"[delete_account] auth user delete failed (non-fatal): {e}")
```

Add endpoint in `scripts/serve.py`:

```python
@app.delete("/account")
async def delete_account_endpoint(user: dict = Depends(require_auth)):
    """Permanently delete all data for the authenticated user."""
    from tools.storage import delete_account
    user_id = user.get("id", "")
    if not user_id:
        raise HTTPException(status_code=400, detail="Cannot identify user")
    delete_account(user_id)
    return JSONResponse(content={"deleted": True})
```

**Step 4: Watch pass**
```bash
python -m pytest tests/test_storage.py -v
python -m pytest tests/ -v  # must stay at 61+
```

**Step 5: Commit**
```bash
git add tools/storage.py tests/test_storage.py scripts/serve.py
git commit -m "[Add] [tools+serve]: delete_account() — purges all recipes, audio files, people, auth user"
```

---

## Block 5 — Client: async people + session cache + localStorage migration

### Chunk 5.1 — Replace localStorage people with API-backed cache

Files:
- Modify: `web/app.html`

No automated test — client JS, no test framework.

**Step 1: Replace people functions**

Find and replace the two localStorage people functions and all callers. The new pattern:

```javascript
// Session cache — loaded once on sign-in, held in memory
let _peopleCache = [];

async function _fetchPeople() {
  const headers = await getAuthHeaders();
  const res = await fetch('/people', { headers });
  if (!res.ok) return;
  const json = await res.json();
  _peopleCache = json.people || [];
}

// Synchronous cache read (used by home, all-recipes, recipe-detail renders)
function _loadPeople() {
  return _peopleCache;
}

async function _createPersonApi(data) {
  const headers = { 'Content-Type': 'application/json', ...(await getAuthHeaders()) };
  const res = await fetch('/people', { method: 'POST', headers, body: JSON.stringify(data) });
  const json = await res.json();
  if (res.ok) _peopleCache.push(json.person);
  return json;
}

async function _updatePersonApi(id, data) {
  const headers = { 'Content-Type': 'application/json', ...(await getAuthHeaders()) };
  const res = await fetch(`/people/${id}`, { method: 'PUT', headers, body: JSON.stringify(data) });
  const json = await res.json();
  if (res.ok) {
    const idx = _peopleCache.findIndex(p => p.id === id);
    if (idx !== -1) _peopleCache[idx] = json.person;
  }
  return json;
}

async function _deletePersonApi(id) {
  const headers = await getAuthHeaders();
  await fetch(`/people/${id}`, { method: 'DELETE', headers });
  _peopleCache = _peopleCache.filter(p => p.id !== id);
}
```

**Step 2: One-time silent migration** — in `initAuth()` success callback, after `_fetchPeople()`:

```javascript
async function _migrateLocalPeople() {
  const raw = localStorage.getItem('rk_people');
  if (!raw) return;
  try {
    const local = JSON.parse(raw);
    for (const p of local) {
      // Only migrate if not already in Supabase (match by name)
      if (!_peopleCache.find(sp => sp.name === p.name)) {
        await _createPersonApi(p);
      }
    }
    localStorage.removeItem('rk_people');
  } catch (e) {
    console.warn('[migrate] people migration failed (non-fatal):', e);
  }
}
```

**Step 3: Load in parallel with recipes on sign-in**

In `initAuth()` success block, replace sequential loads with parallel:

```javascript
// Before (sequential):
await fetchRecipes();
renderHome();

// After (parallel):
await Promise.all([fetchRecipes(), _fetchPeople()]);
await _migrateLocalPeople();
renderHome();
```

**Step 4: Update people CRUD callers**

- `savePersonModal()` — call `_createPersonApi()` or `_updatePersonApi()` depending on mode
- `deletePerson(name)` — find id from `_peopleCache`, call `_deletePersonApi(id)`
- `renderPeople()` — reads from `_loadPeople()` (synchronous, same as before)

**Step 5: Commit**
```bash
git add web/app.html
git commit -m "[Security] [web]: people profiles — API-backed cache replaces localStorage"
```

---

## Block 6 — Account deletion UI

### Chunk 6.1 — Delete account banner in sidebar Account section

Files:
- Modify: `web/app.html`

**Step 1: Add sidebar item and confirmation banner**

In the Account nav section, add a "Delete account" item:
```html
<div class="nav-item nav-item-danger" onclick="openDeleteAccountConfirm()">
  <span class="nav-icon">🗑</span> Delete account
</div>
```

Confirmation banner (same slide-in pattern as delete recipe):
```html
<div class="delete-account-banner" id="delete-account-banner">
  <div class="dab-icon">⚠️</div>
  <div class="dab-body">
    <div class="dab-title">Delete everything?</div>
    <div class="dab-sub">
      This permanently deletes all your memories, voice recordings, and family profiles.
      This cannot be undone.
    </div>
    <div class="dab-actions">
      <button class="dcb-cancel" onclick="closeDeleteAccountConfirm()">Cancel</button>
      <button class="dcb-delete" id="dab-confirm-btn" onclick="confirmDeleteAccount()">
        Delete everything
      </button>
    </div>
  </div>
</div>
```

JS:
```javascript
function openDeleteAccountConfirm() {
  document.getElementById('delete-account-banner')?.classList.add('open');
}
function closeDeleteAccountConfirm() {
  document.getElementById('delete-account-banner')?.classList.remove('open');
}
async function confirmDeleteAccount() {
  const btn = document.getElementById('dab-confirm-btn');
  btn.textContent = 'Deleting…';
  btn.disabled = true;
  try {
    const res = await fetch('/account', { method: 'DELETE', headers: await getAuthHeaders() });
    if (res.ok) {
      signOut();  // clears session, returns to landing
    } else {
      btn.textContent = 'Delete everything';
      btn.disabled = false;
      showToast('Could not delete account. Please try again.');
    }
  } catch {
    btn.textContent = 'Delete everything';
    btn.disabled = false;
  }
}
```

**Step 2: Commit**
```bash
git add web/app.html
git commit -m "[Add] [web]: account deletion UI — banner with irreversible warning + DELETE /account call"
```

---

## Block 7 — Supabase RLS (manual console step)

### Chunk 7.1 — Enable Row Level Security on recipes and people tables

This is a one-time manual step in the Supabase dashboard. No code change required.

**Instructions:**
1. Go to Supabase dashboard → Table Editor (or SQL Editor)
2. Run:

```sql
-- Enable RLS on recipes
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON recipes FOR ALL
  USING (user_id = auth.uid()::text);

-- Enable RLS on people
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON people FOR ALL
  USING (user_id = auth.uid()::text);
```

3. Verify: Supabase dashboard → Authentication → Policies — both tables should show the policy.

**Note:** Server uses the service role key which bypasses RLS — server operations are unaffected.
RLS protects against direct database access using the anon/public key.

**No commit required** — this is a database configuration change. Document completion in PROJECT_HISTORY.

---

## Completion gate

- [ ] All 61+ tests green after every chunk
- [ ] Deploy to Railway — confirm unauthenticated `curl /recipe/{token}` returns 401
- [ ] Sign in on phone + laptop — people profiles appear on both (Supabase-backed)
- [ ] Clear browser cache — re-sign-in shows all profiles intact (survived cache wipe)
- [ ] Second Google account cannot access first account's recipes or people
- [ ] `DELETE /account` confirmed in Supabase dashboard — all rows and audio files removed
- [ ] Supabase RLS policies visible in dashboard for both tables
