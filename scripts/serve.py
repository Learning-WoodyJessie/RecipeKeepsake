"""
RecipeKeepsake API server.

Local dev:
    python -m scripts.serve         → http://localhost:8080

Production (Railway):
    Reads PORT from environment. Set env vars in Railway dashboard.
"""

import os
import tempfile
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root — no-op in production (Railway sets env vars directly)
load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import httpx

from tools.transcribe import transcribe_audio
from tools.config import load_config
from prompts.translate import translate_to_english
from prompts.structure import structure_recipe
from prompts.llm import OpenAIProvider

_WEB_DIR = Path(__file__).parent.parent / "web"

# CORS — allow localhost in dev, Railway URL in prod via ALLOWED_ORIGINS env var
_ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080"
).split(",")


app = FastAPI(title="RecipeKeepsake API")

_bearer = HTTPBearer(auto_error=False)

app.mount("/assets", StaticFiles(directory=_WEB_DIR / "assets"), name="assets")


async def require_auth(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    """Validate Supabase JWT. Returns the user dict or raises 401."""
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    anon_key = os.environ.get("SUPABASE_ANON_KEY", "")
    supabase_url = os.environ.get("SUPABASE_URL", "")
    if not supabase_url:
        # Auth not configured — allow through (local dev without Supabase)
        return {}
    try:
        resp = httpx.get(
            f"{supabase_url}/auth/v1/user",
            headers={"apikey": anon_key, "Authorization": f"Bearer {creds.credentials}"},
            timeout=5,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        return resp.json()
    except httpx.RequestError:
        raise HTTPException(status_code=401, detail="Could not verify session")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def index():
    html = _WEB_DIR / "app.html"
    if html.exists():
        return FileResponse(html)
    return JSONResponse(content={"status": "RecipeKeepsake API running"})


@app.get("/privacy")
async def privacy_policy():
    """Privacy policy — required for Play Store and App Store submissions."""
    from fastapi.responses import HTMLResponse
    privacy = _WEB_DIR / "privacy.html"
    if privacy.exists():
        return FileResponse(privacy)
    return HTMLResponse(content="<h1>Privacy Policy</h1><p>Contact pavaniaiml75@gmail.com for privacy inquiries.</p>")


@app.get("/recipe/{token}")
async def get_recipe_endpoint(token: str):
    """Fetch a single recipe by share token."""
    if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")):
        raise HTTPException(status_code=503, detail="Storage not configured")
    from tools.storage import get_recipe_by_token
    try:
        recipe = get_recipe_by_token(token)
        return JSONResponse(content=recipe)
    except Exception:
        raise HTTPException(status_code=404, detail="Recipe not found")


@app.get("/recipes")
async def list_recipes_endpoint(user: dict = Depends(require_auth)):
    """Return recipes belonging to the authenticated user."""
    if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")):
        return JSONResponse(content={"recipes": []})
    from tools.storage import list_recipes
    user_id = user.get("id", "")
    return JSONResponse(content={"recipes": list_recipes(user_id)})


@app.post("/capture")
async def capture_endpoint(audio: UploadFile = File(...), user: dict = Depends(require_auth)):
    """
    Accept an audio file, run the full pipeline, return structured recipe JSON.
    Supabase storage is optional — skip by omitting env vars (useful for local testing).
    """
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

    config = load_config()
    provider = OpenAIProvider(model=config["llm"]["model"])

    suffix = Path(audio.filename).suffix if audio.filename else ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        print(f"[serve] Transcribing {audio.filename}...")
        transcript_raw = transcribe_audio(tmp_path)
        print(f"[serve] Transcript: {transcript_raw[:120]}...")

        print("[serve] Translating...")
        transcript_english = translate_to_english(transcript_raw, provider)

        print("[serve] Structuring...")
        structured = structure_recipe(transcript_english, provider)
        print(f"[serve] Dish: {structured.get('dish_name')}")

        print("[serve] Generating image...")
        image_url = ""
        try:
            from prompts.image import generate_dish_image
            from tools.storage import store_image
            raw_url = generate_dish_image(structured.get("dish_name") or "Indian dish")
            # Download and store permanently — DALL-E CDN URLs expire in ~1hr
            if raw_url and os.environ.get("SUPABASE_URL"):
                print("[serve] Storing image permanently...")
                image_url = store_image(raw_url)
            else:
                image_url = raw_url
        except Exception as img_err:
            print(f"[serve] Image generation failed (non-fatal): {img_err}")

        recipe = {
            "transcript_raw": transcript_raw,
            "transcript_english": transcript_english,
            "image_url": image_url,
            **structured,
        }

        if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY"):
            from tools.storage import insert_recipe, upload_audio, _sign_audio, _client as _sb
            import uuid
            audio_filename = f"{uuid.uuid4()}{Path(audio.filename).suffix if audio.filename else '.webm'}"
            print(f"[serve] Uploading audio as {audio_filename}...")
            try:
                stored_path = upload_audio(tmp_path, audio_filename)
                print(f"[serve] Audio stored: {stored_path}")
            except Exception as audio_err:
                print(f"[serve] Audio upload failed (non-fatal): {audio_err}")
                stored_path = ""
            stored = insert_recipe({
                **recipe,
                "audio_url": stored_path,
                "user_id": user.get("id", ""),
                "recorded_by_email": user.get("email", ""),
                "recorded_by_name": (user.get("user_metadata") or {}).get("full_name", ""),
            })
            recipe["id"] = stored.get("id")
            recipe["token"] = stored.get("token")
            # Return a signed URL so the browser can play immediately
            if stored_path:
                recipe["audio_url"] = _sign_audio(stored_path, _sb())
            print(f"[serve] Saved: {recipe.get('id')}")
        else:
            print("[serve] No Supabase env — skipping storage")

        return JSONResponse(content=recipe)

    except Exception as e:
        print(f"[serve] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        os.unlink(tmp_path)


class ImageRequest(BaseModel):
    dish_name: str


@app.post("/generate-image")
async def generate_image_endpoint(body: ImageRequest):
    """Generate a DALL-E image for a dish name. Returns image URL."""
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

    from prompts.image import generate_dish_image
    try:
        url = generate_dish_image(body.dish_name)
        return JSONResponse(content={"image_url": url})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class PatchRecipeRequest(BaseModel):
    user_notes: str = ""


@app.patch("/recipe/{token}")
async def patch_recipe_endpoint(token: str, body: PatchRecipeRequest, user: dict = Depends(require_auth)):
    """Update user_notes on a recipe."""
    if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")):
        raise HTTPException(status_code=503, detail="Storage not configured")
    from tools.storage import patch_recipe
    try:
        updated = patch_recipe(token, {"user_notes": body.user_notes})
        return JSONResponse(content=updated)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("scripts.serve:app", host="0.0.0.0", port=port, reload=False)
