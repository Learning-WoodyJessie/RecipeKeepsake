# Plan: Google Auth (Supabase)

```
Goal:         Every family member signs in with their Google account.
              All recipes are shared across all logged-in users.
              Nothing is visible without a valid session.
Layer:        Frontend HTML + FastAPI middleware
Architecture: Supabase Auth handles Google OAuth. Supabase JS client (CDN,
              no build step) manages the session in the browser. On every
              app load, session is checked — if absent, auth screen is shown.
              FastAPI validates the Supabase JWT on write endpoints (/capture,
              PATCH /recipe) so only authenticated users can add data.
              Reads stay on the service key (server-side, safe).
```

---

## Manual setup BEFORE building (one-time, you do this)

### Step A — Enable Google provider in Supabase
1. Supabase dashboard → Authentication → Providers → Google → Enable
2. You'll need a **Google OAuth Client ID** and **Client Secret** (Step B below)
3. Copy the **Callback URL** shown (looks like `https://PROJECT.supabase.co/auth/v1/callback`)

### Step B — Google Cloud Console
1. Go to https://console.cloud.google.com → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID → Web application
3. Authorised redirect URIs → add the Supabase callback URL from Step A
4. Also add `http://localhost:8080` to Authorised JavaScript origins (for local dev)
5. Copy Client ID + Client Secret → paste into Supabase (Step A)

### Step C — Add redirect URL in Supabase
Supabase dashboard → Authentication → URL Configuration:
- Site URL: `http://localhost:8080` (update to Railway URL when deployed)
- Redirect URLs: add `http://localhost:8080`

---

## Block 1 — Frontend: auth screen + session gate

### Chunk 1.1 — Add Supabase JS client + sign-in screen

Files:
- Modify: `web/app.html`

**What to build:**

1. Add Supabase JS CDN in `<head>`:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
```

2. Add auth screen HTML (before `<aside>` sidebar, outside `.app`):
```html
<div id="auth-wall" style="display:none">
  <!-- full-screen sign-in page -->
</div>
```

Design of auth screen:
- Full viewport, `background: var(--cream)` 
- Centered card (max-width 380px)
- Logo: "Dadi's Recipes" in Playfair Display + tagline "Preserve your family's recipes, forever."
- Decorative illustration: a simple bowl/spoon SVG in terracotta (reuse the bowl from saving screen)
- "Continue with Google" button — white card, Google G logo SVG, dark text
- Fine print: "By signing in, you're joining your family's recipe book."

3. Init Supabase client in JS:
```js
const SUPABASE_URL = 'https://wucsfihcophwqynqkqkf.supabase.co';
const SUPABASE_ANON_KEY = '...';  // anon/public key from Supabase dashboard
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

4. Session gate logic:
```js
let currentUser = null;

async function initAuth() {
  // Handle OAuth redirect (hash contains access_token)
  const { data: { session } } = await _sb.auth.getSession();
  if (session) {
    await onSignedIn(session.user);
  } else {
    showAuthWall();
  }

  // Listen for auth state changes
  _sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') onSignedIn(session.user);
    if (event === 'SIGNED_OUT') showAuthWall();
  });
}

async function onSignedIn(user) {
  currentUser = user;
  hideAuthWall();
  updateUserUI(user);
  loadRecipes();
}

function showAuthWall() {
  document.getElementById('auth-wall').style.display = 'flex';
  document.querySelector('.app').style.display = 'none';
}

function hideAuthWall() {
  document.getElementById('auth-wall').style.display = 'none';
  document.querySelector('.app').style.display = 'flex';
}
```

5. Google sign-in:
```js
async function signInWithGoogle() {
  await _sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
}
```

6. Call `initAuth()` instead of `loadRecipes()` in `DOMContentLoaded`

**Verify:**
- Open http://localhost:8080 → auth screen shown (not the app)
- Click "Continue with Google" → Google account picker → redirect back → app shown
- Refresh → still logged in (session persists in localStorage)

**Commit:**
```bash
git add web/app.html
git commit -m "[Add] [web]: auth screen + Supabase Google OAuth session gate"
```

---

### Chunk 1.2 — Wire user identity into the UI

Files:
- Modify: `web/app.html`

Replace hardcoded "Ananya" everywhere with real user data:

```js
function updateUserUI(user) {
  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'You';
  const firstName = name.split(' ')[0];
  const avatar = user.user_metadata?.avatar_url || '';

  // Topbar greeting
  document.querySelector('.topbar-greeting').textContent = `Namaste, ${firstName} 👋`;

  // Sidebar user pill
  const avEl = document.querySelector('.user-av');
  if (avatar) {
    avEl.innerHTML = `<img src="${avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover"/>`;
  } else {
    avEl.textContent = firstName[0].toUpperCase();
  }
  document.querySelector('.user-name').textContent = firstName;

  // Mobile bottom bar user avatar (if exists)
  const mobileAv = document.getElementById('mobile-user-av');
  if (mobileAv) mobileAv.textContent = avatar ? '' : firstName[0].toUpperCase();
}
```

Add sign-out to the sidebar user pill (click → sign out):
```js
// sidebar-user onclick
async function signOut() {
  await _sb.auth.signOut();
  // onAuthStateChange fires SIGNED_OUT → showAuthWall() is called automatically
}
```

Update sidebar HTML:
```html
<div class="sidebar-user" onclick="signOut()" title="Sign out">
  <div class="user-av" id="sidebar-av">?</div>
  <div class="user-name" id="sidebar-name">Loading…</div>
  <div style="margin-left:auto;font-size:.65rem;color:var(--muted)">↪</div>
</div>
```

**Verify:**
- Sign in → greeting shows real first name, avatar shows Google profile photo
- Click user pill in sidebar → signs out → auth screen reappears

**Commit:**
```bash
git add web/app.html
git commit -m "[Add] [web]: real user name + avatar in UI, sign-out from sidebar"
```

---

### Chunk 1.3 — Pass JWT to backend on writes

Files:
- Modify: `web/app.html` — add `Authorization` header to `/capture` and `PATCH /recipe`
- Modify: `scripts/serve.py` — validate JWT on protected endpoints

**Frontend — attach token to requests:**

In `submitAudio()`:
```js
const session = (await _sb.auth.getSession()).data.session;
const headers = session ? { 'Authorization': `Bearer ${session.access_token}` } : {};
const res = await fetch('/capture', { method: 'POST', body: form, headers });
```

In `saveUserNotes()`:
```js
const session = (await _sb.auth.getSession()).data.session;
const headers = { 'Content-Type': 'application/json' };
if (session) headers['Authorization'] = `Bearer ${session.access_token}`;
```

**Backend — validate JWT on protected endpoints:**

Add a helper to `scripts/serve.py`:
```python
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

_bearer = HTTPBearer(auto_error=False)

async def require_auth(creds: HTTPAuthorizationCredentials = Depends(_bearer)):
    """Validate Supabase JWT. Raises 401 if invalid or missing."""
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = creds.credentials
    # Verify by calling Supabase auth — no need to store JWT secret
    import httpx
    url = os.environ["SUPABASE_URL"] + "/auth/v1/user"
    resp = httpx.get(url, headers={
        "apikey": os.environ.get("SUPABASE_ANON_KEY", ""),
        "Authorization": f"Bearer {token}"
    })
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return resp.json()
```

Add `SUPABASE_ANON_KEY` to `.env` (public key, safe to include).

Apply to write endpoints:
```python
@app.post("/capture")
async def capture_endpoint(audio: UploadFile = File(...), user=Depends(require_auth)):
    ...

@app.patch("/recipe/{token}")
async def patch_recipe_endpoint(token: str, body: PatchRecipeRequest, user=Depends(require_auth)):
    ...
```

**Verify:**
```bash
# Without auth header → 401
curl -X POST http://localhost:8080/capture -F "audio=@test.webm"
# Expected: {"detail": "Not authenticated"}

# With valid session → processes normally (test via browser)
```

**Commit:**
```bash
git add web/app.html scripts/serve.py
git commit -m "[Add] [auth]: JWT validation on /capture and PATCH /recipe endpoints"
```

---

## Block 2 — Database: track who recorded what

### Chunk 2.1 — Add recorded_by to recipes

**SQL migration** (run in Supabase SQL Editor):
```sql
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS recorded_by_email text;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS recorded_by_name  text;
```

Files:
- Modify: `scripts/serve.py` — attach user identity to recipe on capture

In `capture_endpoint`, after `require_auth` gives us `user`:
```python
recipe["recorded_by_email"] = user.get("email", "")
recipe["recorded_by_name"]  = user.get("user_metadata", {}).get("full_name", "")
```

This lets you show "Recorded by Ananya" on each recipe.

**Verify:** Record a new recipe → check Supabase table → `recorded_by_email` and `recorded_by_name` populated.

**Commit:**
```bash
git add scripts/serve.py
git commit -m "[Add] [serve]: attach recorder identity (email + name) to new recipes"
```

---

## Auth screen design spec

```
Background: var(--cream) — full viewport
Card: white, border-radius 20px, padding 2.5rem, max-width 380px, centered
      box-shadow: 0 4px 32px rgba(196,82,42,.10)

Top:    Bowl SVG illustration (terracotta, ~80px)
Title:  "Dadi's Recipes" — Playfair Display, 2rem, var(--text)
Sub:    "Your family's recipe book" — Inter, .88rem, var(--muted)
Gap

Button: "Continue with Google"
        white background, 1px solid #dadce0, border-radius 10px
        padding .75rem 1.25rem, full width
        Google G SVG on left, "Continue with Google" in dark text
        hover: box-shadow 0 1px 6px rgba(0,0,0,.12)

Bottom: "Only family members can access this app."
        .68rem, var(--muted), text-align center
```

---

## Files changed summary

| File | Change |
|---|---|
| `web/app.html` | Auth screen UI, Supabase JS client, session gate, user identity in header/sidebar, JWT on writes |
| `scripts/serve.py` | `require_auth` dependency, JWT validation on `/capture` + `PATCH /recipe`, `SUPABASE_ANON_KEY` env var, `recorded_by_*` fields |
| `.env` | Add `SUPABASE_ANON_KEY` |
| Supabase SQL | `recorded_by_email`, `recorded_by_name` columns |

**No new npm packages. No new services. One new env var.**

---

## Verification after all chunks

1. Open http://localhost:8080 → auth wall shown
2. Click "Continue with Google" → Google picker → redirected back → app shown with real name
3. Refresh → still logged in
4. Try POST /capture without token → 401
5. Record via UI → recipe saved with `recorded_by_name`
6. Click sidebar user pill → signed out → auth wall reappears
7. Second family member signs in → sees same recipes

---

Ready to build? Use `/build`.
