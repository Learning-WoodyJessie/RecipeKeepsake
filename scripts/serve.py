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
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root — no-op in production (Railway sets env vars directly)
load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Request
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
from tools.storage import check_rate_limit_db

_FRONTEND_OUT = Path(__file__).parent.parent / "frontend" / "out"

# CORS — allow localhost in dev, Railway URL in prod via ALLOWED_ORIGINS env var
_ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080"
).split(",")


app = FastAPI(title="RecipeKeepsake API")

_bearer = HTTPBearer(auto_error=False)

# ── Rate limiting (Postgres — accurate across instances, survives restarts) ──
_LIMITS = {
    "capture":         int(os.environ.get("MAX_CAPTURE_PER_DAY",   "10")),
    "translate":       int(os.environ.get("MAX_TRANSLATE_PER_DAY", "50")),
    "generate-image":  int(os.environ.get("MAX_IMAGE_PER_DAY",     "20")),
}


def _user_id(user: dict) -> str:
    return user.get("sub") or user.get("id", "")


def _check_rate_limit_db_or_raise(user_id: str, endpoint: str, limit: int) -> None:
    """Increment Postgres counter and raise 429 if daily limit exceeded."""
    count = check_rate_limit_db(user_id, endpoint)
    if count > limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily limit of {limit} {endpoint} requests reached. Try again tomorrow.",
        )


def _generate_image(
    dish_name: str,
    ingredients: list | None = None,
    steps: list | None = None,
    cook_notes: str | None = None,
) -> str:
    """Generate + store a DALL-E image for the dish. Returns URL or empty string."""
    try:
        from prompts.image import generate_dish_image
        from tools.storage import store_image
        raw_url = generate_dish_image(
            dish_name or "Indian dish",
            ingredients=ingredients,
            steps=steps,
            cook_notes=cook_notes,
        )
        if raw_url and os.environ.get("SUPABASE_URL"):
            return store_image(raw_url)
        return raw_url or ""
    except Exception as e:
        print(f"[serve] Image generation failed (non-fatal): {e}")
        return ""


# Serve Next.js static export — mounted last so API routes take priority
if _FRONTEND_OUT.exists():
    app.mount("/_next", StaticFiles(directory=_FRONTEND_OUT / "_next"), name="nextjs-assets")


async def decode_auth_user(creds: HTTPAuthorizationCredentials) -> dict:
    """Validate Supabase JWT from bearer credentials (non-optional)."""
    token = creds.credentials
    jwt_secret = os.environ.get("SUPABASE_JWT_SECRET", "")
    supabase_url = os.environ.get("SUPABASE_URL", "")
    anon_key = os.environ.get("SUPABASE_ANON_KEY", "")

    if jwt_secret:
        try:
            import jwt as pyjwt
            payload = pyjwt.decode(token, jwt_secret, algorithms=["HS256"])
            return payload
        except Exception:
            pass

    if not supabase_url:
        env = os.environ.get("ENV", "production")
        if env == "production":
            raise HTTPException(status_code=500, detail="Auth not configured")
        return {}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{supabase_url}/auth/v1/user",
                headers={"apikey": anon_key, "Authorization": f"Bearer {token}"},
                timeout=5,
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        return resp.json()
    except httpx.RequestError:
        raise HTTPException(status_code=401, detail="Could not verify session")


async def require_auth(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    """Validate Supabase JWT. Local PyJWT verification first; Supabase network call as fallback."""
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return await decode_auth_user(creds)


app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "apikey", "X-Client-Info"],
)


_NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}


@app.api_route("/", methods=["GET", "HEAD"])
async def index():
    root = _FRONTEND_OUT / "index.html"
    if root.exists():
        return FileResponse(root, headers=_NO_CACHE_HEADERS)
    return JSONResponse(content={"status": "Echoes of Home API"})


@app.get("/recipe/{token}")
async def get_recipe_endpoint(token: str, user: dict = Depends(require_auth)):
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
    user_id = _user_id(user)
    return JSONResponse(content={"recipes": list_recipes(user_id)})


@app.post("/capture")
async def capture_endpoint(audio: UploadFile = File(...), user: dict = Depends(require_auth)):
    """
    Full pipeline: transcribe → translate → structure → image → save.
    Returns saved recipe JSON. Use /capture/process for review-before-save flow.
    """
    _check_rate_limit_db_or_raise(_user_id(user), "capture", _LIMITS["capture"])
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
        recipe_data.image_url = _generate_image(
            recipe_data.dish_name,
            ingredients=recipe_data.ingredients,
            steps=recipe_data.steps,
            cook_notes=recipe_data.cook_notes,
        )

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
                user_id=_user_id(user),
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
    _check_rate_limit_db_or_raise(_user_id(user), "capture", _LIMITS["capture"])
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
        recipe_data.image_url = _generate_image(
            recipe_data.dish_name,
            ingredients=recipe_data.ingredients,
            steps=recipe_data.steps,
            cook_notes=recipe_data.cook_notes,
        )

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
            user_id=_user_id(user),
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


# ── People endpoints ─────────────────────────────────────────────────────────

class PersonRequest(BaseModel):
    name: str
    relationship: str | None = None
    emoji: str | None = None
    photo_data: str | None = None   # base64-encoded photo
    bio: str | None = None
    notes: str | None = None


def _people_spa_path() -> Path:
    """Static Next export for the People UI (same path as JSON list — see handler)."""
    return _FRONTEND_OUT / "people" / "index.html"


@app.api_route("/people", methods=["GET", "HEAD"])
async def list_people_endpoint(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
):
    """JSON list when Bearer auth is present; static People page for typical browser requests.

    Next uses ``trailingSlash: true`` (``/people/``) for the UI, but users often open ``/people``.
    Without this split, ``GET /people`` hit the API and showed raw ``Not authenticated`` JSON.
    """
    from tools.storage import list_people

    if creds is not None:
        user = await decode_auth_user(creds)
        return JSONResponse(content={"people": list_people(_user_id(user))})

    accept = request.headers.get("accept", "")
    if request.method == "HEAD" or request.headers.get("sec-fetch-dest") == "document" or "text/html" in accept:
        spa = _people_spa_path()
        if spa.exists():
            return FileResponse(spa, headers=_NO_CACHE_HEADERS)
        raise HTTPException(status_code=404, detail="Not found")

    raise HTTPException(status_code=401, detail="Not authenticated")


@app.post("/people")
async def create_person_endpoint(body: PersonRequest, user: dict = Depends(require_auth)):
    """Create a narrator profile."""
    from tools.storage import create_person
    user_id = _user_id(user)
    person = create_person(user_id, body.model_dump(exclude_none=True))
    return JSONResponse(content={"person": person})


@app.put("/people/{person_id}")
async def update_person_endpoint(person_id: str, body: PersonRequest, user: dict = Depends(require_auth)):
    """Update a narrator profile (ownership enforced)."""
    from tools.storage import update_person, list_people
    user_id = _user_id(user)
    people = list_people(user_id)
    if not any(p["id"] == person_id for p in people):
        raise HTTPException(status_code=403, detail="Not your record")
    person = update_person(person_id, body.model_dump(exclude_none=True))
    return JSONResponse(content={"person": person})


@app.delete("/people/{person_id}")
async def delete_person_endpoint(person_id: str, user: dict = Depends(require_auth)):
    """Delete a narrator profile (ownership enforced)."""
    from tools.storage import delete_person, list_people
    user_id = _user_id(user)
    people = list_people(user_id)
    if not any(p["id"] == person_id for p in people):
        raise HTTPException(status_code=403, detail="Not your record")
    delete_person(person_id)
    return JSONResponse(content={"deleted": person_id})


# ── Account deletion ──────────────────────────────────────────────────────────

@app.delete("/account")
async def delete_account_endpoint(user: dict = Depends(require_auth)):
    """Permanently delete all data for the authenticated user."""
    from tools.storage import delete_account
    user_id = _user_id(user)
    if not user_id:
        raise HTTPException(status_code=400, detail="Cannot identify user")
    delete_account(user_id)
    return JSONResponse(content={"deleted": True})


# ── Image generation ──────────────────────────────────────────────────────────

class ImageRequest(BaseModel):
    dish_name: str
    ingredients: list | None = None
    steps: list | None = None
    cook_notes: str | None = None


@app.post("/generate-image")
async def generate_image_endpoint(body: ImageRequest, user: dict = Depends(require_auth)):
    """Generate a DALL-E image for a dish. Accepts full recipe fields for enriched prompt."""
    _check_rate_limit_db_or_raise(_user_id(user), "generate-image", _LIMITS["generate-image"])
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")
    url = _generate_image(body.dish_name, ingredients=body.ingredients, steps=body.steps, cook_notes=body.cook_notes)
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


@app.delete("/recipe/{token}")
async def delete_recipe_endpoint(token: str, user: dict = Depends(require_auth)):
    """Hard-delete a recipe. Caller must own the recipe (user_id check)."""
    if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")):
        raise HTTPException(status_code=503, detail="Storage not configured")
    from tools.storage import get_recipe_by_token, delete_recipe
    try:
        recipe = get_recipe_by_token(token)
    except Exception:
        raise HTTPException(status_code=404, detail="Recipe not found")
    # Ownership check — unauthenticated local dev (empty user dict) skips check
    user_id = _user_id(user)
    if user_id and recipe.get("user_id") and recipe["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not your recipe")
    try:
        delete_recipe(token)
        return JSONResponse(content={"deleted": token})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


_TRANSLATE_SUPPORTED = {"en", "te", "hi", "kn", "es", "fr"}


@app.get("/recipe/{token}/translate")
async def translate_recipe_endpoint(token: str, lang: str = "en", force: bool = False, user: dict = Depends(require_auth)):
    """
    Return recipe fields translated into the requested language.

    First call per language translates via LLM (~2-3s); subsequent calls
    return from Supabase cache instantly. English always returns stored
    fields directly — no LLM call.
    Pass ?force=true to bypass cache and re-translate (useful after prompt fixes).
    """
    _check_rate_limit_db_or_raise(_user_id(user), "translate", _LIMITS["translate"])
    lang = lang.lower()
    if lang not in _TRANSLATE_SUPPORTED:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {lang}")

    if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")):
        raise HTTPException(status_code=503, detail="Storage not configured")

    from tools.storage import get_recipe_by_token, get_cached_translation, cache_translation
    from prompts.translate_recipe import translate_recipe_fields
    from prompts.llm import OpenAIProvider
    from tools.config import load_config

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

    # Check server-side cache first (skip if ?force=true)
    if not force:
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
        print(f"[translate] LLM error ({type(e).__name__}): {e}")
        raise HTTPException(status_code=500, detail=f"Translation failed: {e}")

    # Write to cache — non-fatal, don't fail the request if Supabase write fails
    try:
        cache_translation(token, lang, translated)
    except Exception as e:
        print(f"[translate] Cache write failed (non-fatal): {e}")

    return JSONResponse(content={"lang": lang, **translated})


# ── Frontend catch-all — must be last so all API routes take priority ──────
# Next.js prefetches <Link> targets with HEAD; plain @app.get does not register HEAD (405).
@app.api_route("/{path:path}", methods=["GET", "HEAD"])
async def serve_frontend(path: str):
    """Serve Next.js static export pages and public assets.

    Priority:
    1. Direct file in out/ (images, fonts, icons, manifests, etc.)
    2. out/{path}/index.html  (Next.js page directory)
    3. out/index.html          (SPA fallback)
    """
    # 1. Direct file (e.g. hero-people.png, favicon.ico, echoes-logo.png)
    direct = _FRONTEND_OUT / path
    if direct.is_file():
        return FileResponse(direct)

    # 2. Next.js page
    candidate = _FRONTEND_OUT / path / "index.html"
    if candidate.exists():
        return FileResponse(candidate, headers=_NO_CACHE_HEADERS)

    # 3. SPA fallback
    root = _FRONTEND_OUT / "index.html"
    if root.exists():
        return FileResponse(root, headers=_NO_CACHE_HEADERS)

    raise HTTPException(status_code=404, detail="Not found")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("scripts.serve:app", host="0.0.0.0", port=port, reload=False)
