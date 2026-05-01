"""
RecipeKeepsake API server — thin HTTP adapter.

Business logic lives in pipeline/. This file handles:
  - HTTP transport (FastAPI routes, multipart forms, JSON responses)
  - Auth (Supabase JWT validation)
  - Rate limiting (in-memory, per-user-per-day)
  - Static file serving

Local dev:
    python -m scripts.serve         → http://localhost:8080

Production (Railway):
    Reads PORT from environment. Set env vars in Railway dashboard.
"""

import json as _json
import os
import tempfile
import uuid
from collections import defaultdict
from datetime import date as _date
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

from pipeline.transcribe import run_transcribe
from pipeline.transform import run_transform
from pipeline.persist import run_persist
from pipeline.models import RecipeData

_WEB_DIR = Path(__file__).parent.parent / "web"

# CORS — allow localhost in dev, Railway URL in prod via ALLOWED_ORIGINS env var
_ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080"
).split(",")


app = FastAPI(title="RecipeKeepsake API")

_bearer = HTTPBearer(auto_error=False)

# ── Rate limiting (in-memory, resets on restart — abuse prevention, not billing) ──
_MAX_RECORDINGS_PER_DAY = int(os.environ.get("MAX_RECORDINGS_PER_DAY", "10"))
_rec_counts: dict[str, int] = defaultdict(int)
_rec_dates: dict[str, _date] = {}


def _check_rate_limit(user_id: str) -> None:
    """Raise HTTP 429 if user has hit today's recording limit."""
    if not user_id:
        return  # unauthenticated dev/local calls pass through
    today = _date.today()
    if _rec_dates.get(user_id) != today:
        _rec_counts[user_id] = 0
        _rec_dates[user_id] = today
    _rec_counts[user_id] += 1
    if _rec_counts[user_id] > _MAX_RECORDINGS_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail=f"Daily limit of {_MAX_RECORDINGS_PER_DAY} recordings reached. Try again tomorrow.",
        )


def _generate_image(dish_name: str) -> str:
    """Generate + store a DALL-E image for the dish. Returns URL or empty string."""
    try:
        from prompts.image import generate_dish_image
        from tools.storage import store_image
        raw_url = generate_dish_image(dish_name or "Indian dish")
        if raw_url and os.environ.get("SUPABASE_URL"):
            return store_image(raw_url)
        return raw_url or ""
    except Exception as e:
        print(f"[serve] Image generation failed (non-fatal): {e}")
        return ""


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
    Full pipeline: transcribe → translate → structure → image → save.
    Returns saved recipe JSON. Use /capture/process for review-before-save flow.
    """
    _check_rate_limit(user.get("id", ""))
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

    suffix = Path(audio.filename).suffix if audio.filename else ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        print(f"[serve/capture] Processing {audio.filename}...")

        transcript = run_transcribe(tmp_path)
        recipe_data = run_transform(transcript)
        recipe_data.image_url = _generate_image(recipe_data.dish_name)

        recipe = {
            "transcript_raw": recipe_data.transcript_raw,
            "transcript_english": recipe_data.transcript_english,
            "dish_name": recipe_data.dish_name,
            "ingredients": recipe_data.ingredients,
            "steps": recipe_data.steps,
            "cook_notes": recipe_data.cook_notes,
            "review_flags": recipe_data.review_flags,
            "image_url": recipe_data.image_url,
        }

        if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY"):
            audio_filename = f"{uuid.uuid4()}{suffix}"
            saved = run_persist(
                recipe_data,
                audio_path=tmp_path,
                audio_filename=audio_filename,
                user_id=user.get("id", ""),
                recorded_by_email=user.get("email", ""),
                recorded_by_name=(user.get("user_metadata") or {}).get("full_name", ""),
            )
            recipe["id"] = saved.id
            recipe["token"] = saved.token
            # Return signed URL so browser can play immediately
            if saved.audio_url:
                from tools.storage import _sign_audio, _client as _sb
                recipe["audio_url"] = _sign_audio(saved.audio_url, _sb())
            print(f"[serve/capture] Saved: {saved.id}")
        else:
            print("[serve/capture] No Supabase env — skipping storage")

        return JSONResponse(content=recipe)

    except Exception as e:
        print(f"[serve/capture] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@app.post("/capture/process")
async def capture_process_endpoint(
    audio: UploadFile = File(...),
    user: dict = Depends(require_auth),
):
    """
    Stage 1 + 2 only: transcribe → translate → structure → image.
    Does NOT save to Supabase. Returns structured JSON for client review.
    Client calls /capture/save after user edits.
    """
    _check_rate_limit(user.get("id", ""))
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

    suffix = Path(audio.filename).suffix if audio.filename else ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        print(f"[serve/process] Processing {audio.filename}...")

        transcript = run_transcribe(tmp_path)
        recipe_data = run_transform(transcript)
        recipe_data.image_url = _generate_image(recipe_data.dish_name)

        result = {
            "transcript_raw": recipe_data.transcript_raw,
            "transcript_english": recipe_data.transcript_english,
            "dish_name": recipe_data.dish_name,
            "ingredients": recipe_data.ingredients,
            "steps": recipe_data.steps,
            "cook_notes": recipe_data.cook_notes,
            "review_flags": recipe_data.review_flags,
            "image_url": recipe_data.image_url,
        }
        print(f"[serve/process] Done: {recipe_data.dish_name}")
        return JSONResponse(content=result)

    except Exception as e:
        print(f"[serve/process] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@app.post("/capture/save")
async def capture_save_endpoint(
    audio: UploadFile = File(...),
    recipe: str = File(...),
    narrator: str = File(default="Grandma"),
    user: dict = Depends(require_auth),
):
    """
    Stage 3 only: save a reviewed + edited recipe to Supabase.
    Receives: audio file + recipe JSON string (edited by user) + narrator name.
    """
    try:
        recipe_dict = _json.loads(recipe)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid recipe JSON")

    if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_KEY"):
        raise HTTPException(status_code=500, detail="Supabase not configured")

    suffix = Path(audio.filename).suffix if audio.filename else ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        # Rebuild a RecipeData from the client-edited dict
        recipe_data = RecipeData(
            dish_name=recipe_dict.get("dish_name", ""),
            ingredients=recipe_dict.get("ingredients", []),
            steps=recipe_dict.get("steps", []),
            cook_notes=recipe_dict.get("cook_notes", ""),
            review_flags=recipe_dict.get("review_flags", []),
            transcript_raw=recipe_dict.get("transcript_raw", ""),
            transcript_english=recipe_dict.get("transcript_english", ""),
            image_url=recipe_dict.get("image_url", ""),
        )

        audio_filename = f"{uuid.uuid4()}{suffix}"
        saved = run_persist(
            recipe_data,
            audio_path=tmp_path,
            audio_filename=audio_filename,
            narrator=narrator,
            user_id=user.get("id", ""),
            recorded_by_email=user.get("email", ""),
            recorded_by_name=(user.get("user_metadata") or {}).get("full_name", ""),
        )

        result = {**recipe_dict, "id": saved.id, "token": saved.token}
        if saved.audio_url:
            from tools.storage import _sign_audio, _client as _sb
            result["audio_url"] = _sign_audio(saved.audio_url, _sb())

        print(f"[serve/save] Saved: {saved.id}")
        return JSONResponse(content=result)

    except Exception as e:
        print(f"[serve/save] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


class ImageRequest(BaseModel):
    dish_name: str


@app.post("/generate-image")
async def generate_image_endpoint(body: ImageRequest):
    """Generate a DALL-E image for a dish name. Returns image URL."""
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")
    url = _generate_image(body.dish_name)
    return JSONResponse(content={"image_url": url})


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


_TRANSLATE_SUPPORTED = {"en", "te", "hi", "kn", "es", "fr"}


@app.get("/recipe/{token}/translate")
async def translate_recipe_endpoint(token: str, lang: str = "en"):
    """
    Return recipe fields translated into the requested language.

    First call per language translates via LLM (~2-3s); subsequent calls
    return from Supabase cache instantly. English always returns stored
    fields directly — no LLM call.
    """
    lang = lang.lower()
    if lang not in _TRANSLATE_SUPPORTED:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {lang}")

    if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")):
        raise HTTPException(status_code=503, detail="Storage not configured")

    from tools.storage import get_recipe_by_token, get_cached_translation, cache_translation
    from prompts.translate_recipe import translate_recipe_fields
    from prompts.llm import OpenAIProvider
    from data.config import load_config

    try:
        recipe = get_recipe_by_token(token)
    except Exception:
        raise HTTPException(status_code=404, detail="Recipe not found")

    # English is always available — return stored fields directly, no LLM call
    if lang == "en":
        return JSONResponse(content={
            "lang": "en",
            "dish_name": recipe.get("dish_name", ""),
            "ingredients": recipe.get("ingredients", []),
            "steps": recipe.get("steps", []),
            "cook_notes": recipe.get("cook_notes", ""),
        })

    # Check server-side cache first
    try:
        cached = get_cached_translation(token, lang)
        if cached:
            return JSONResponse(content={"lang": lang, **cached})
    except Exception as e:
        print(f"[translate] Cache read failed (non-fatal): {e}")

    # Translate via LLM
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not set")

    config = load_config()
    model = config.get("llm", {}).get("model", "gpt-4o")
    provider = OpenAIProvider(model=model)

    fields = {
        "dish_name": recipe.get("dish_name", ""),
        "ingredients": recipe.get("ingredients", []),
        "steps": recipe.get("steps", []),
        "cook_notes": recipe.get("cook_notes", ""),
    }

    try:
        translated = translate_recipe_fields(fields, lang, provider)
    except Exception as e:
        print(f"[translate] LLM error: {e}")
        raise HTTPException(status_code=500, detail="Translation failed — try again")

    # Write to cache — non-fatal, don't fail the request if Supabase write fails
    try:
        cache_translation(token, lang, translated)
    except Exception as e:
        print(f"[translate] Cache write failed (non-fatal): {e}")

    return JSONResponse(content={"lang": lang, **translated})


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("scripts.serve:app", host="0.0.0.0", port=port, reload=False)
