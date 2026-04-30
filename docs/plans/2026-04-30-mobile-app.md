# Recipe Keepsake — Mobile App Plan

```
Goal:         Ship Recipe Keepsake on iOS TestFlight and Android Play Store
Layer:        Multi-layer (Python tools + Web JS + Mobile config)
Architecture: Capacitor wraps the existing app.html with a Live URL pointing to Railway.
              Python backend gets 3 hardening changes first (permanent image storage,
              privacy policy, rate limit) then Capacitor shell is built on top.
              Auth uses system browser + Supabase deep link — Google accepts this on
              both platforms. No async queue needed for hundreds of users.
Design doc:   docs/plans/2026-04-30-mobile-app.md  (this file)
```

---

## Pre-requisites (you do these — not code)

| Item | How | Blocks |
|---|---|---|
| Apple Developer Account ($99/yr) | developer.apple.com/programs/enroll — takes 24-48h | iOS build |
| CocoaPods | `sudo gem install cocoapods` in terminal | iOS build |
| Android Studio + JDK 17 | developer.android.com/studio | Android build |
| Google Play Developer ($25 one-time) | play.google.com/console | Android submit |
| Supabase `images` bucket | Dashboard → Storage → New bucket → name: `images`, Public: ON | Chunk A.1 |
| Add deep link to Supabase redirect URLs | Dashboard → Auth → URL Config → add `recipekeepsake://auth/callback` | Chunk C.1 |

---

## Block A — Python backend hardening
*Testable. Deploy to Railway before building native app.*

---

### Chunk A.1 — Permanent image storage

**Problem:** DALL-E image URLs expire in ~1 hour. Every recipe card shows a broken image after that.
**Fix:** After DALL-E generates the URL, immediately download the bytes and upload to Supabase `images` bucket (public). Store the permanent Supabase URL instead.

Files:
- Modify: `tools/storage.py`
- Modify: `tests/test_storage.py`

**Step 1 — Failing test**
```python
# tests/test_storage.py  — add to bottom of file

class TestStoreImage:
    def test_returns_permanent_supabase_url(self, monkeypatch):
        """store_image() downloads DALL-E URL and returns permanent Supabase URL."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        permanent = "https://fake.supabase.co/storage/v1/object/public/images/uuid.png"
        mock_sb = MagicMock()
        mock_sb.storage.from_.return_value.get_public_url.return_value = permanent
        mock_response = MagicMock()
        mock_response.content = b"fake-png-bytes"
        mock_response.raise_for_status = lambda: None

        with patch("tools.storage.create_client", return_value=mock_sb), \
             patch("tools.storage.httpx.get", return_value=mock_response):
            result = store_image("https://dalle.openai.com/img/expiring.png")

        assert result == permanent

    def test_falls_back_to_original_on_download_error(self, monkeypatch):
        """store_image() returns original URL if download fails — never crashes capture."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        original = "https://dalle.openai.com/img/expiring.png"

        with patch("tools.storage.create_client"), \
             patch("tools.storage.httpx.get", side_effect=Exception("timeout")):
            result = store_image(original)

        assert result == original

    def test_returns_empty_string_for_empty_input(self, monkeypatch):
        """store_image() short-circuits on empty URL — no network call."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        assert store_image("") == ""
```

**Step 2 — Watch it fail**
```bash
python -m pytest tests/test_storage.py::TestStoreImage -v
# Expected: ImportError — store_image not defined yet
```

**Step 3 — Minimal implementation**
```python
# tools/storage.py — add after imports, add `import httpx` and `import uuid`

import httpx
import uuid as _uuid


def store_image(image_url: str) -> str:
    """Download a DALL-E image and store it permanently in Supabase 'images' bucket.
    Returns the permanent public URL. Falls back to the original URL on any error.
    """
    if not image_url:
        return image_url
    try:
        resp = httpx.get(image_url, timeout=30, follow_redirects=True)
        resp.raise_for_status()
        sb = _client()
        filename = f"{_uuid.uuid4()}.png"
        sb.storage.from_("images").upload(
            path=filename,
            file=resp.content,
            file_options={"content-type": "image/png", "upsert": "false"},
        )
        return sb.storage.from_("images").get_public_url(filename)
    except Exception:
        return image_url  # graceful fallback — capture never fails due to image
```

**Step 4 — Watch it pass**
```bash
python -m pytest tests/test_storage.py::TestStoreImage -v
python -m pytest tests/ -v  # must stay at 27+ — watch for regressions
```

**Step 5 — Wire into serve.py**
```python
# scripts/serve.py — in capture_endpoint, replace:
#   image_url = generate_dish_image(...)
# with:
        image_url = ""
        try:
            from prompts.image import generate_dish_image
            from tools.storage import store_image
            raw_url = generate_dish_image(structured.get("dish_name") or "Indian dish")
            # Download and store permanently — DALL-E URLs expire in ~1hr
            if raw_url and os.environ.get("SUPABASE_URL"):
                image_url = store_image(raw_url)
            else:
                image_url = raw_url
        except Exception as img_err:
            print(f"[serve] Image generation failed (non-fatal): {img_err}")
```

**Step 6 — Commit**
```bash
git add tools/storage.py tests/test_storage.py scripts/serve.py
git commit -m "[Fix] [tools]: store DALL-E images permanently in Supabase Storage"
```

---

### Chunk A.2 — Privacy policy endpoint

Required by Android Play Store. Needed before any public distribution.

Files:
- Create: `web/privacy.html`
- Modify: `scripts/serve.py`

**No unit test needed** — it's a static HTML endpoint. Manual verification: `GET /privacy` returns 200 with HTML.

**Implementation**
```python
# scripts/serve.py — add after the / route

@app.get("/privacy")
async def privacy_policy():
    """Privacy policy — required for App Store and Play Store submissions."""
    from fastapi.responses import HTMLResponse
    privacy = _WEB_DIR / "privacy.html"
    if privacy.exists():
        return FileResponse(privacy)
    # Inline fallback
    return HTMLResponse(content=_PRIVACY_FALLBACK)

_PRIVACY_FALLBACK = """<!DOCTYPE html>
<html><head><title>Privacy Policy – Recipe Keepsake</title>
<style>body{font-family:sans-serif;max-width:700px;margin:3rem auto;padding:0 1.5rem;color:#333;line-height:1.7}</style>
</head><body>
<h1>Privacy Policy</h1>
<p><strong>Last updated: 2026-04-30</strong></p>
<h2>What we collect</h2>
<ul>
  <li><strong>Voice recordings</strong> — audio you record in the app</li>
  <li><strong>Your name and email</strong> — via Google Sign-In</li>
  <li><strong>Recipe data</strong> — dish names, ingredients, steps you capture</li>
</ul>
<h2>How we use it</h2>
<p>Your recordings are transcribed using OpenAI Whisper and structured using GPT-4.
All data belongs to your account only. We do not sell or share your data.</p>
<h2>Storage</h2>
<p>Data is stored in Supabase (PostgreSQL + object storage). Audio files are private;
recipe images are publicly accessible via your recipe's share link.</p>
<h2>Deletion</h2>
<p>Contact us to delete your account and all associated data.</p>
<h2>Contact</h2>
<p>pavaniaiml75@gmail.com</p>
</body></html>"""
```

**Commit**
```bash
git add scripts/serve.py
git commit -m "[Add] [serve]: /privacy endpoint for App Store compliance"
```

---

### Chunk A.3 — Per-user rate limiting

Prevents a single user from burning through OpenAI credits. Simple in-memory counter — resets on Railway restart, which is acceptable for hundreds of users (this is abuse prevention, not billing).

Files:
- Modify: `scripts/serve.py`

**No unit test** — in-memory state is hard to isolate in tests. Manual verification: call `/capture` 6× with the same token, 6th returns 429.

**Implementation**
```python
# scripts/serve.py — add near top, after imports

from collections import defaultdict
from datetime import date as _date

_recording_counts: dict[str, int] = defaultdict(int)
_recording_dates: dict[str, _date] = {}
MAX_RECORDINGS_PER_DAY = 10  # generous for family use


def _check_rate_limit(user_id: str) -> None:
    """Raise 429 if user has hit today's recording limit."""
    if not user_id:
        return  # unauthenticated dev calls pass through
    today = _date.today()
    if _recording_dates.get(user_id) != today:
        _recording_counts[user_id] = 0
        _recording_dates[user_id] = today
    _recording_counts[user_id] += 1
    if _recording_counts[user_id] > MAX_RECORDINGS_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail=f"Daily limit of {MAX_RECORDINGS_PER_DAY} recordings reached. Try again tomorrow."
        )

# In capture_endpoint — add as FIRST line inside the function:
#   _check_rate_limit(user.get("id", ""))
```

**Commit**
```bash
git add scripts/serve.py
git commit -m "[Add] [serve]: per-user daily recording rate limit (10/day)"
```

---

## Block B — Capacitor project setup
*Configuration and tooling. No unit tests. Verify by running the app.*

---

### Chunk B.1 — npm init + Capacitor install

```bash
cd /Users/pavanibayappu/RecipeKeepsake

# Initialize npm at project root (NOT inside web/nextjs)
npm init -y

# Install Capacitor core + CLI + platforms + browser plugin
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios @capacitor/android
npm install @capacitor/browser @capacitor/app
npm install @capacitor/splash-screen @capacitor/status-bar

# Initialize Capacitor
npx cap init "Recipe Keepsake" "com.recipekeepsake.app" --web-dir web
```

Add to `.gitignore`:
```
node_modules/
ios/
android/
```

**Commit**
```bash
git add package.json package-lock.json .gitignore capacitor.config.json
git commit -m "[Add] [config]: Capacitor project init for Recipe Keepsake"
```

---

### Chunk B.2 — capacitor.config.json (Live URL + plugins)

Replace the auto-generated `capacitor.config.json` with:

```json
{
  "appId": "com.recipekeepsake.app",
  "appName": "Recipe Keepsake",
  "webDir": "web",
  "server": {
    "url": "https://vibrant-spontaneity-production-9f92.up.railway.app",
    "cleartext": false,
    "androidScheme": "https"
  },
  "plugins": {
    "SplashScreen": {
      "launchShowDuration": 2500,
      "backgroundColor": "#FAF6F0",
      "androidSplashResourceName": "splash",
      "showSpinner": false,
      "splashFullScreen": true,
      "splashImmersive": true
    },
    "StatusBar": {
      "style": "DARK",
      "backgroundColor": "#FAF6F0"
    }
  },
  "ios": {
    "scheme": "familykeepsake",
    "contentInset": "automatic"
  },
  "android": {
    "allowMixedContent": false,
    "captureInput": true,
    "webContentsDebuggingEnabled": false
  }
}
```

**Commit**
```bash
git add capacitor.config.json
git commit -m "[Add] [config]: Capacitor Live URL config pointing to Railway"
```

---

### Chunk B.3 — App icon + splash screen

**Icon requirements:**
- iOS: 1024×1024 PNG, no alpha, no rounded corners (iOS applies them)
- Android: 1024×1024 PNG
- Source: `web/assets/icon-source.png` — YOU need to provide/approve this

**Generate all sizes automatically once you have the source:**
```bash
npm install --save-dev @capacitor/assets
npx cap add ios
npx cap add android
# Place your 1024×1024 icon at web/assets/icon.png
# Place a 2732×2732 splash image at web/assets/splash.png
npx capacitor-assets generate
```

**Splash screen:** warm cream (`#FAF6F0`) background + centered logo. The script in `scripts/make_assets.py` generates these from `landing-logo.png`.

Create `scripts/make_assets.py`:
```python
"""Generate app icon and splash screen from existing assets.
Run: python -m scripts.make_assets
Requires: pip install Pillow
"""
from PIL import Image, ImageDraw

ROOT = __import__('pathlib').Path(__file__).parent.parent
ASSETS = ROOT / "web" / "assets"
BG = (250, 246, 240, 255)  # #FAF6F0

def make_icon():
    img = Image.new("RGBA", (1024, 1024), BG)
    logo = Image.open(ASSETS / "landing-logo.png").convert("RGBA")
    lw, lh = logo.size
    scale = min(700 / lw, 350 / lh)
    logo = logo.resize((int(lw * scale), int(lh * scale)), Image.LANCZOS)
    x = (1024 - logo.width) // 2
    y = (1024 - logo.height) // 2
    img.paste(logo, (x, y), logo)
    out = ASSETS / "icon.png"
    img.convert("RGB").save(out)
    print(f"Icon saved: {out}")

def make_splash():
    img = Image.new("RGBA", (2732, 2732), BG)
    logo = Image.open(ASSETS / "landing-logo.png").convert("RGBA")
    lw, lh = logo.size
    scale = min(900 / lw, 450 / lh)
    logo = logo.resize((int(lw * scale), int(lh * scale)), Image.LANCZOS)
    x = (2732 - logo.width) // 2
    y = (2732 - logo.height) // 2
    img.paste(logo, (x, y), logo)
    out = ASSETS / "splash.png"
    img.convert("RGB").save(out)
    print(f"Splash saved: {out}")

if __name__ == "__main__":
    make_icon()
    make_splash()
```

```bash
pip install Pillow
python -m scripts.make_assets
npx capacitor-assets generate --iconBackgroundColor '#FAF6F0' --splashBackgroundColor '#FAF6F0'
```

**Commit**
```bash
git add scripts/make_assets.py web/assets/icon.png web/assets/splash.png
git commit -m "[Add] [config]: App icon and splash screen for Recipe Keepsake"
```

---

### Chunk B.4 — iOS permissions (Info.plist)

After `npx cap add ios`, edit `ios/App/App/Info.plist`:

```xml
<!-- Microphone — required for recording narrations -->
<key>NSMicrophoneUsageDescription</key>
<string>Recipe Keepsake records voice narrations of family recipes. Your recordings are stored privately in your account.</string>

<!-- URL scheme for Google OAuth deep link -->
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>familykeepsake</string>
    </array>
    <key>CFBundleURLName</key>
    <string>com.recipekeepsake.app</string>
  </dict>
</array>
```

**Verify:** In Xcode → Info tab → URL Types and Privacy entries visible.

---

### Chunk B.5 — Android permissions (AndroidManifest.xml)

After `npx cap add android`, edit `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Add inside <manifest> -->
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />

<!-- Add inside <activity> tag -->
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="familykeepsake" android:host="auth" />
</intent-filter>
```

---

## Block C — Auth fix for native

Google blocks OAuth in embedded WebViews. Fix: detect Capacitor, open system browser for OAuth, handle deep link callback.

---

### Chunk C.1 — signInWithGoogle() native flow

Files:
- Modify: `web/app.html` (signInWithGoogle function)

**How it works:**
```
Native app:
  1. signInWithOAuth with skipBrowserRedirect: true → get the auth URL
  2. window.open(url, '_system') → opens Safari/Chrome (Google accepts this)
  3. User signs in → Google redirects to recipekeepsake://auth/callback#access_token=...
  4. App receives deep link → sets Supabase session → onSignedIn()

Web browser (unchanged):
  signInWithOAuth → standard redirect → works as before
```

Find and replace `signInWithGoogle()` in `web/app.html`:

```javascript
async function signInWithGoogle() {
  document.getElementById('auth-loading').style.display = 'block';
  const isNative = !!(window.Capacitor?.isNativePlatform?.());

  if (isNative) {
    // Native: open system browser — Google accepts WKWebView's SFSafariViewController
    const { data, error } = await _sbClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'recipekeepsake://auth/callback',
        skipBrowserRedirect: true,
      },
    });
    if (error || !data?.url) {
      document.getElementById('auth-loading').style.display = 'none';
      return;
    }
    // Opens Safari on iOS, Chrome on Android — Google allows this
    window.open(data.url, '_system');
  } else {
    // Web: existing flow unchanged
    await _sbClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }
}
```

---

### Chunk C.2 — Deep link handler

Add inside the `<script>` block of `web/app.html`, before `initAuth()`:

```javascript
// Handle deep link auth callback (native only)
// Fires when system browser redirects back to recipekeepsake://auth/callback#access_token=...
document.addEventListener('DOMContentLoaded', () => {
  if (window.Capacitor?.isNativePlatform?.()) {
    // Capacitor App plugin listens for URL opens
    if (window.Capacitor.Plugins?.App) {
      window.Capacitor.Plugins.App.addListener('appUrlOpen', async ({ url }) => {
        if (url.includes('auth/callback')) {
          const hashPart = url.split('#')[1] || url.split('?')[1] || '';
          const params = new URLSearchParams(hashPart);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          if (access_token) {
            const { data, error } = await _sbClient.auth.setSession({
              access_token,
              refresh_token: refresh_token || '',
            });
            if (data?.user) await onSignedIn(data.user);
          }
        }
      });
    }
  }
});
```

**Commit**
```bash
git add web/app.html
git commit -m "[Fix] [web]: Google OAuth native flow + deep link handler for Capacitor"
```

---

## Block D — iOS TestFlight

*Manual steps in Xcode. No code changes.*

### Chunk D.1 — Build + Archive + Upload

```bash
# Sync web app and native projects
npx cap sync ios

# Open Xcode
npx cap open ios
```

**In Xcode:**
1. Select `App` target → Signing & Capabilities
2. Set Team → your Apple Developer team
3. Bundle Identifier: `com.recipekeepsake.app`
4. Set minimum deployment target: iOS 15.0
5. Product → Scheme → App (not App-Runner)
6. Set device to "Any iOS Device (arm64)"
7. Product → Archive
8. Window → Organizer → click your archive → Distribute App
9. Choose "TestFlight & App Store" → upload
10. Wait ~5 min → go to App Store Connect → TestFlight
11. Add your email as internal tester

**Verify:** TestFlight app on your iPhone → install → app opens → landing page visible.

**TestFlight internal link:** App Store Connect → TestFlight → Your build → copy invite link.

---

## Block E — Android Play Store

### Chunk E.1 — Build + Play Console

```bash
npx cap sync android
npx cap open android
```

**In Android Studio:**
1. Build → Generate Signed Bundle/APK
2. Choose "Android App Bundle (.aab)"
3. Create a new keystore (SAVE THIS FILE — losing it means you can never update the app)
4. Build → release `.aab` in `android/app/release/`

**Play Console:**
1. play.google.com/console → Create app
2. App name: "Recipe Keepsake"
3. Create internal testing track → upload `.aab`
4. Fill in store listing (description, screenshots)
5. Privacy policy URL: `https://vibrant-spontaneity-production-9f92.up.railway.app/privacy`
6. Content rating questionnaire → complete
7. Publish to internal testing → share link with testers

---

## Test checklist (each platform)

After installing on device:

- [ ] Landing page loads (food image, hero, feature grid)
- [ ] "Record Grandma" → system browser opens for Google sign-in
- [ ] After Google sign-in → redirected back into app
- [ ] Home screen shows (first login welcome modal appears)
- [ ] Add narrator via welcome modal → saved
- [ ] Tap "Capture a memory" → mic permissions requested
- [ ] Record 5 seconds → tap stop → processing screen appears
- [ ] Recipe result returns with dish name, ingredients, steps
- [ ] Image shows (not broken — permanent Supabase URL)
- [ ] Recipe detail → Listen tab → audio plays
- [ ] Sign out visible in topbar → tapping it signs out → landing page returns

---

## Deployment notes

- **Every UI change** in `web/app.html`: `git push` → Railway auto-deploys → app updates automatically (no App Store submission needed)
- **Every Python/backend change**: same — `git push` → Railway
- **Only need a new App Store build for:** Capacitor config changes, native permissions, new plugins, major version bumps

---

## Open questions before starting

1. **Supabase `images` bucket** — confirm created as **Public** in dashboard (Chunk A.1 needs this)
2. **Apple Developer account** — enrolled? (24-48h activation blocks D.1)
3. **App icon design** — approve the `make_assets.py` output or provide a custom 1024×1024 PNG
4. **Supabase redirect URL** — add `recipekeepsake://auth/callback` in dashboard before C.1

Once these 4 are confirmed → `/build`
