"""
Echoes of Home API server — thin HTTP adapter.

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

import base64
import json as _json
import json as _json_stdlib
import logging
import contextvars
import os
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root — no-op in production (Railway sets env vars directly)
load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import httpx

from pipeline.transcribe import run_transcribe
from pipeline.transform import run_transform, VALID_CATEGORIES
from pipeline.persist import run_persist
from pipeline.models import RecipeData
from tools.storage import check_rate_limit_db
from prompts.translate_audio import translate_to_english
from prompts.llm import OpenAIProvider
from tools.config import load_config

_FRONTEND_OUT = Path(__file__).parent.parent / "frontend" / "out"
_WWW = Path(__file__).parent.parent / "www"

# ── Structured logging ────────────────────────────────────────────────────────

_request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


class _JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return _json_stdlib.dumps({
            "ts":    datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "level": record.levelname,
            "req":   _request_id.get("-"),
            "event": record.getMessage(),
        }, ensure_ascii=False)


def _setup_logging() -> logging.Logger:
    handler = logging.StreamHandler()
    handler.setFormatter(_JSONFormatter())
    logger = logging.getLogger("serve")
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    return logger


_logger = _setup_logging()

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


# ── Upload safety ─────────────────────────────────────────────────────────────

# Maximum audio file size accepted (bytes). 25 MB covers ~2 h of compressed audio.
_MAX_AUDIO_BYTES = int(os.environ.get("MAX_AUDIO_BYTES", str(25 * 1024 * 1024)))

_VALID_MEMORY_TYPES = {"recipe", "song", "story", "fable", "wisdom", "poem"}

# Allowed file extensions.
_ALLOWED_AUDIO_EXTS = {
    ".mp3", ".mp4", ".m4a", ".wav", ".webm",
    ".ogg", ".oga", ".opus", ".flac", ".aac", ".aiff",
}

# Whisper doesn't recognise .opus as an extension even though it's OGG/Opus.
# Map any such extensions to the equivalent Whisper-accepted extension.
_WHISPER_EXT_MAP = {".opus": ".ogg"}


def _whisper_suffix(ext: str) -> str:
    """Return the extension Whisper will accept for this audio file."""
    return _WHISPER_EXT_MAP.get(ext, ext)

# Magic-byte signatures for the same formats.
# Each entry: (byte_offset, bytes_to_match)
_MAGIC: list[tuple[int, bytes]] = [
    (0, b"ID3"),           # MP3 with ID3 tag
    (0, b"\xff\xfb"),      # MP3 frame sync (MPEG1 Layer3 CBR)
    (0, b"\xff\xfa"),      # MP3 frame sync (MPEG1 Layer3 VBR)
    (0, b"\xff\xf3"),      # MP3 frame sync variant
    (0, b"\xff\xf2"),      # MP3 frame sync variant
    (0, b"\xff\xe3"),      # MP3 frame sync variant
    (0, b"\xff\xe2"),      # MP3 frame sync variant
    (0, b"RIFF"),          # WAV / AIFF container
    (0, b"\x1aE\xdf\xa3"), # WebM / MKV
    (0, b"OggS"),          # OGG
    (0, b"fLaC"),          # FLAC
    (4, b"ftyp"),          # MP4 / M4A (ISO base media box at offset 4)
    (0, b"\xff\xf1"),      # AAC ADTS
    (0, b"\xff\xf9"),      # AAC ADTS variant
    (0, b"FORM"),          # AIFF
]


def _validate_audio_upload(audio: UploadFile, data: bytes) -> None:
    """
    Raise HTTP 400/413 if the uploaded file looks unsafe.

    Checks (in order):
      1. Extension is in the allowlist — rejects .exe, .html, .php, etc.
      2. File size ≤ MAX_AUDIO_BYTES — rejects oversized payloads.
      3. Magic bytes match a known audio/video container — rejects renamed
         executables or HTML files that happen to have an audio extension.
    """
    ext = Path(audio.filename or "").suffix.lower()
    if ext not in _ALLOWED_AUDIO_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Upload MP3, M4A, WAV, WebM, OGG, Opus, FLAC, AAC, or MP4.",
        )

    if len(data) > _MAX_AUDIO_BYTES:
        mb = _MAX_AUDIO_BYTES // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {mb} MB.")

    matched = any(data[offset: offset + len(sig)] == sig for offset, sig in _MAGIC)
    if not matched:
        _logger.warning(f"event=upload_magic_fail filename={audio.filename} size={len(data)}")
        raise HTTPException(
            status_code=400,
            detail="File does not appear to be a valid audio file. Please upload an actual audio recording.",
        )


# ── Image upload validation ───────────────────────────────────────────────────

# Maximum photo upload size (bytes). 8 MB comfortably covers a phone camera photo.
_MAX_IMAGE_BYTES = int(os.environ.get("MAX_IMAGE_UPLOAD_BYTES", str(8 * 1024 * 1024)))

# (magic bytes, extension, content-type) — checked in order; magic bytes are
# the authoritative check, the declared data-URI MIME type is not trusted.
_IMAGE_MAGIC: list[tuple[bytes, str, str]] = [
    (b"\xff\xd8\xff", ".jpg", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", ".png", "image/png"),
    (b"RIFF", ".webp", "image/webp"),
]
_IMAGE_MAGIC_OFFSET4 = (b"ftyp", ".heic", "image/heic")  # ISO base media box at offset 4


def _sniff_image(data: bytes) -> tuple[str, str]:
    """Identify (ext, content_type) from magic bytes, or raise HTTP 400."""
    for sig, ext, content_type in _IMAGE_MAGIC:
        if data[: len(sig)] == sig:
            return ext, content_type
    if data[4:4 + len(_IMAGE_MAGIC_OFFSET4[0])] == _IMAGE_MAGIC_OFFSET4[0]:
        return _IMAGE_MAGIC_OFFSET4[1], _IMAGE_MAGIC_OFFSET4[2]
    raise HTTPException(
        status_code=400,
        detail="File does not appear to be a valid image. Please upload an actual photo (JPG, PNG, HEIC, or WebP).",
    )


def _decode_photo_data(photo_data: str) -> tuple[bytes, str, str]:
    """Decode a `data:<mime>;base64,<...>` URI into (bytes, ext, content_type).

    The declared MIME in the URI is ignored for validation purposes — ext/
    content_type are derived from sniffing the decoded bytes' magic number,
    same discipline as audio uploads.
    """
    if "," not in photo_data:
        raise HTTPException(status_code=400, detail="Invalid photo data.")
    _, _, b64 = photo_data.partition(",")
    try:
        data = base64.b64decode(b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid photo data.")

    if len(data) > _MAX_IMAGE_BYTES:
        mb = _MAX_IMAGE_BYTES // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Photo too large. Maximum size is {mb} MB.")

    ext, content_type = _sniff_image(data)
    return data, ext, content_type


_ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


def _validate_image_upload(photo: UploadFile, data: bytes) -> None:
    """Raise HTTP 400/413 for multipart image uploads that look unsafe."""
    ext = Path(photo.filename or "").suffix.lower()
    if ext not in _ALLOWED_IMAGE_EXTS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'. Upload JPEG, PNG, WebP, or HEIC.")
    if len(data) > _MAX_IMAGE_BYTES:
        mb = _MAX_IMAGE_BYTES // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Photo too large. Maximum size is {mb} MB.")
    _sniff_image(data)  # raises HTTP 400 if not a recognised image format


# ── Content moderation ────────────────────────────────────────────────────────

def _moderate_transcript(text: str) -> None:
    """
    Run the OpenAI Moderation API on the English transcript.

    Raises HTTP 422 if the content is flagged (hate, harassment, violence,
    sexual, self-harm). Free endpoint — no token cost. Non-fatal if the API
    itself errors (transient failures should not block legitimate recordings).
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key or not text.strip():
        return
    try:
        from openai import OpenAI as _OAI
        result = _OAI(api_key=api_key).moderations.create(input=text)
        flagged_cats = [
            cat for cat, flagged in result.results[0].categories.__dict__.items() if flagged
        ]
        if flagged_cats:
            _logger.warning(f"event=moderation_flagged categories={flagged_cats}")
            raise HTTPException(
                status_code=422,
                detail=(
                    "This recording contains content that can't be saved on Echoes of Home. "
                    "Please keep recordings focused on family recipes and stories."
                ),
            )
    except HTTPException:
        raise
    except Exception as exc:
        # Moderation API failure is non-fatal — log and continue rather than
        # blocking a legitimate recording due to a transient API error.
        _logger.warning(f"event=moderation_api_error error={type(exc).__name__} msg={exc}")


def _generate_image(
    title: str,
    ingredients: list | None = None,
    steps: list | None = None,
    cook_notes: str | None = None,
) -> str:
    """Generate + store a DALL-E image for the dish. Returns URL or empty string."""
    try:
        from prompts.image import generate_dish_image
        from tools.storage import store_image
        t0 = time.perf_counter()
        raw_url = generate_dish_image(
            title or "Indian dish",
            ingredients=ingredients,
            steps=steps,
            cook_notes=cook_notes,
        )
        if raw_url and os.environ.get("SUPABASE_URL"):
            result = store_image(raw_url)
        else:
            result = raw_url or ""
        _logger.info(f"event=image_done duration={time.perf_counter()-t0:.2f}s")
        return result
    except Exception as e:
        _logger.warning(f"event=image_failed error={type(e).__name__} msg={e}")
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


class _RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = uuid.uuid4().hex[:8]
        request.state.request_id = request_id
        _request_id.set(request_id)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        if response.status_code >= 400:
            _logger.warning(
                f"event=request_error status={response.status_code} "
                f"method={request.method} path={request.url.path}"
            )
        return response


class _ApexRedirectMiddleware(BaseHTTPMiddleware):
    """301-redirect the bare apex domain to www, preserving path and query.

    GoDaddy's domain forwarding only redirects the root path ("/"), not
    subpaths like "/capture/" - those 404 directly against GoDaddy's
    forwarding servers without ever reaching this app. This middleware only
    takes effect once the apex domain's DNS A records point here (Railway)
    instead of GoDaddy's forwarding IPs - it guarantees every route redirects
    correctly, since path-preserving redirect logic lives in code we control
    rather than a third-party forwarding product's UI.
    """
    async def dispatch(self, request, call_next):
        host = request.url.hostname or ""
        if host == "theechoesofhome.com":
            target = f"https://www.theechoesofhome.com{request.url.path}"
            if request.url.query:
                target += f"?{request.url.query}"
            return RedirectResponse(target, status_code=301)
        return await call_next(request)


app.add_middleware(_RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "apikey", "X-Client-Info", "X-Request-ID"],
)
app.add_middleware(_ApexRedirectMiddleware)


_NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}


@app.get("/health")
async def health():
    from tools.storage import _client
    try:
        _client().table("memories").select("id").limit(1).execute()
        return {"status": "ok", "db": "ok", "version": "1"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "db": str(e)},
        )


@app.post("/admin/clear-translation-cache")
async def admin_clear_translation_cache(lang: str, secret: str):
    """Clear cached translations for one language across all recipes.

    Protected by ADMIN_SECRET env var (operator action, not user JWT).
    Usage: POST /admin/clear-translation-cache?lang=te&secret=xxx
    """
    admin_secret = os.environ.get("ADMIN_SECRET")
    if not admin_secret:
        raise HTTPException(status_code=503, detail="ADMIN_SECRET not configured")
    if secret != admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden")
    from tools.storage import clear_translation_cache
    cleared = clear_translation_cache(lang)
    _logger.info(f"event=cache_cleared lang={lang} rows={cleared}")
    return {"cleared": cleared, "lang": lang}


class ClientErrorRequest(BaseModel):
    error: str
    component_stack: str = ""
    url: str = ""


@app.post("/client-error")
async def client_error_endpoint(body: ClientErrorRequest):
    """Receive frontend error reports and log them to Railway stdout.

    Called by ErrorBoundary.componentDidCatch — no auth required,
    fire-and-forget from the browser.
    """
    _logger.error(
        f"event=client_error error={body.error!r} "
        f"url={body.url!r} component_stack={body.component_stack!r}"
    )
    return {"ok": True}


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

    data = await audio.read()
    _validate_audio_upload(audio, data)

    suffix = Path(audio.filename or "").suffix.lower() or ".webm"
    with tempfile.NamedTemporaryFile(suffix=_whisper_suffix(suffix), delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name

    try:
        _logger.info(f"event=capture_start file={audio.filename}")

        transcript = run_transcribe(tmp_path)
        _moderate_transcript(transcript.english)
        recipe_data = run_transform(transcript)
        recipe_data.image_url = _generate_image(
            recipe_data.title,
            ingredients=recipe_data.ingredients,
            steps=recipe_data.steps,
            cook_notes=recipe_data.cook_notes,
        )

        recipe = {
            "transcript_raw": recipe_data.transcript_raw,
            "transcript_english": recipe_data.transcript_english,
            "title": recipe_data.title,
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
            _logger.info(f"event=capture_saved id={saved.id} dish={recipe_data.title}")
        else:
            _logger.warning("event=capture_no_db")

        return JSONResponse(content=recipe)

    except Exception as e:
        _logger.error(f"event=capture_failed stage=persist error={type(e).__name__} msg={e}")
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

    data = await audio.read()
    _validate_audio_upload(audio, data)

    suffix = Path(audio.filename or "").suffix.lower() or ".webm"
    with tempfile.NamedTemporaryFile(suffix=_whisper_suffix(suffix), delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name

    try:
        _logger.info(f"event=process_start file={audio.filename}")

        transcript = run_transcribe(tmp_path)
        _moderate_transcript(transcript.english)
        recipe_data = run_transform(transcript)
        recipe_data.image_url = _generate_image(
            recipe_data.title,
            ingredients=recipe_data.ingredients,
            steps=recipe_data.steps,
            cook_notes=recipe_data.cook_notes,
        )

        result = {
            "transcript_raw": recipe_data.transcript_raw,
            "transcript_english": recipe_data.transcript_english,
            "title": recipe_data.title,
            "ingredients": recipe_data.ingredients,
            "steps": recipe_data.steps,
            "cook_notes": recipe_data.cook_notes,
            "review_flags": recipe_data.review_flags,
            "image_url": recipe_data.image_url,
            "category": recipe_data.category,
        }
        _logger.info(f"event=process_done dish={recipe_data.title}")
        return JSONResponse(content=result)

    except Exception as e:
        _logger.error(f"event=process_failed error={type(e).__name__} msg={e}")
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

    data = await audio.read()
    _validate_audio_upload(audio, data)

    suffix = Path(audio.filename or "").suffix.lower() or ".webm"
    with tempfile.NamedTemporaryFile(suffix=_whisper_suffix(suffix), delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name

    try:
        # Rebuild a RecipeData from the client-edited dict
        raw_category = recipe_dict.get("category", "Other")
        recipe_data = RecipeData(
            title=recipe_dict.get("title", ""),
            ingredients=recipe_dict.get("ingredients", []),
            steps=recipe_dict.get("steps", []),
            cook_notes=recipe_dict.get("cook_notes", ""),
            review_flags=recipe_dict.get("review_flags", []),
            transcript_raw=recipe_dict.get("transcript_raw", ""),
            transcript_english=recipe_dict.get("transcript_english", ""),
            image_url=recipe_dict.get("image_url", ""),
            category=raw_category if raw_category in VALID_CATEGORIES else "Other",
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

        _logger.info(f"event=save_done id={saved.id}")
        return JSONResponse(content=result)

    except Exception as e:
        _logger.error(f"event=save_failed error={type(e).__name__} msg={e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


# ── Direct tale/song save (no pipeline) ──────────────────────────────────────

@app.post("/save-audio")
async def save_audio_endpoint(
    audio: UploadFile | None = File(default=None),
    title: str = File(default=""),
    narrator: str = File(default=""),
    description: str = File(default=""),
    original_text: str = File(default=""),
    memory_type: str = File(default="song"),
    user: dict = Depends(require_auth),
):
    """
    Save a tale/song/poem directly — no transcription or LLM pipeline.
    Use for AI-generated audio (e.g. Suno), any recording the user wants to
    store and share without processing, or a piece of writing with no audio
    at all (e.g. a poem typed out, with or without an English translation).

    At least one of `audio` or `original_text`/`description` must be given —
    an entry with no audio and no text would have nothing to preserve.
    """
    if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_KEY"):
        raise HTTPException(status_code=500, detail="Supabase not configured")

    if audio is None and not original_text.strip() and not description.strip():
        raise HTTPException(status_code=400, detail="Provide audio, original_text, or description.")

    tmp_path = None
    audio_filename = None
    if audio is not None:
        data = await audio.read()
        _validate_audio_upload(audio, data)
        suffix = Path(audio.filename or "").suffix.lower() or ".mp3"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        audio_filename = f"{uuid.uuid4()}{suffix}"

    try:
        from tools.storage import upload_audio, insert_recipe, _sign_audio, _client as _sb

        tags = ["tale"]
        if audio_filename:
            upload_audio(tmp_path, audio_filename)
            tags.append("audio")

        # Auto-transcribe when audio is present, no user-supplied text, and not a recipe
        # (recipes use /capture/process which runs the full 3-step pipeline)
        transcript_raw = original_text.strip()
        transcript_english = description.strip()
        if tmp_path and not transcript_raw and memory_type != "recipe":
            try:
                result = run_transcribe(tmp_path)
                transcript_raw = result.raw
                transcript_english = result.english
            except Exception as _te:
                _logger.warning(f"event=save_audio_transcribe_failed error={type(_te).__name__} msg={_te}")
                # Non-fatal — audio is saved regardless; user can see it on the memory page

        row = insert_recipe({
            "type": memory_type if memory_type in _VALID_MEMORY_TYPES else "song",
            "title": title.strip() or "Untitled",
            "narrator": narrator.strip() or None,
            "user_id": _user_id(user),
            "recorded_by_email": user.get("email", ""),
            "recorded_by_name": (user.get("user_metadata") or {}).get("full_name", ""),
            "audio_url": audio_filename,
            "tags": tags,
            "ingredients": [],
            "steps": [],
            "cook_notes": "",
            "transcript_raw": transcript_raw,
            "transcript_english": transcript_english,
        })

        audio_url = _sign_audio(row.get("audio_url", ""), _sb()) if audio_filename else None
        _logger.info(f"event=save_audio_done id={row.get('id')} has_audio={bool(audio_filename)}")
        return JSONResponse(content={
            "token": row["token"],
            "audio_url": audio_url,
            "transcript_raw": transcript_raw,
            "transcript_english": transcript_english,
        })

    except Exception as e:
        _logger.error(f"event=save_audio_failed error={type(e).__name__} msg={e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


# ── Text-only memory endpoint ─────────────────────────────────────────────────

class SaveTextRequest(BaseModel):
    title: str
    text: str
    memory_type: str = "poem"
    narrator: str = ""


@app.post("/save-text")
async def save_text_endpoint(body: SaveTextRequest, user: dict = Depends(require_auth)):
    user_id = _user_id(user)
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="title is required")
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    if body.memory_type not in _VALID_MEMORY_TYPES:
        raise HTTPException(status_code=400, detail=f"invalid memory_type: {body.memory_type}")

    _check_rate_limit_db_or_raise(user_id, "capture", _LIMITS["capture"])

    from tools.storage import insert_recipe

    english = ""
    try:
        config = load_config()
        model = config["llm"].get("translate_model", config["llm"]["model"])
        provider = OpenAIProvider(model=model)
        english = translate_to_english(body.text.strip(), provider)
    except Exception:
        pass

    row = insert_recipe({
        "title": body.title.strip(),
        "narrator": body.narrator.strip() or None,
        "transcript_raw": body.text.strip(),
        "transcript_english": english,
        "type": body.memory_type,
        "user_id": user_id,
    })

    return JSONResponse(content={
        "token": row["token"],
        "transcript_raw": body.text.strip(),
        "transcript_english": english,
    })


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


def _person_payload(body: "PersonRequest") -> dict:
    """Build the dict to persist, uploading photo_data (base64) to storage and
    swapping it for a real photo_url - the people table has no photo_data
    column, so this must never be passed through as-is.
    """
    from tools.storage import upload_user_photo
    payload = body.model_dump(exclude_none=True, exclude={"photo_data"})
    if body.photo_data:
        data, ext, content_type = _decode_photo_data(body.photo_data)
        payload["photo_url"] = upload_user_photo(data, ext, content_type)
    return payload


@app.post("/people")
async def create_person_endpoint(body: PersonRequest, user: dict = Depends(require_auth)):
    """Create a narrator profile."""
    from tools.storage import create_person
    user_id = _user_id(user)
    person = create_person(user_id, _person_payload(body))
    return JSONResponse(content={"person": person})


@app.put("/people/{person_id}")
async def update_person_endpoint(person_id: str, body: PersonRequest, user: dict = Depends(require_auth)):
    """Update a narrator profile (ownership enforced)."""
    from tools.storage import update_person, list_people
    user_id = _user_id(user)
    people = list_people(user_id)
    if not any(p["id"] == person_id for p in people):
        raise HTTPException(status_code=403, detail="Not your record")
    person = update_person(person_id, _person_payload(body))
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


# ── Viewer role (Phase 5, Epic 16) ───────────────────────────────────────────
# Read-only access to an owner's whole archive for a pre-approved email or
# phone, no full account needed — but still a real, revocable, authenticated
# identity (via Supabase OTP), not a public link.

class ViewerRequest(BaseModel):
    email: str | None = None
    phone: str | None = None


@app.post("/viewers")
async def add_viewer_endpoint(body: ViewerRequest, user: dict = Depends(require_auth)):
    """Owner approves an email or phone for read-only access to their archive."""
    if not body.email and not body.phone:
        raise HTTPException(status_code=400, detail="Provide an email or phone.")
    from tools.storage import add_viewer
    viewer = add_viewer(_user_id(user), body.email, body.phone)
    return JSONResponse(content={"viewer": viewer})


@app.get("/viewers")
async def list_viewers_endpoint(user: dict = Depends(require_auth)):
    """Owner lists everyone they've approved to view their archive."""
    from tools.storage import list_viewers
    return JSONResponse(content={"viewers": list_viewers(_user_id(user))})


@app.delete("/viewers/{viewer_id}")
async def revoke_viewer_endpoint(viewer_id: str, user: dict = Depends(require_auth)):
    """Owner revokes a previously approved viewer."""
    from tools.storage import revoke_viewer
    revoke_viewer(_user_id(user), viewer_id)
    return JSONResponse(content={"revoked": viewer_id})


@app.get("/viewers/shared-with-me")
async def shared_with_me_endpoint(user: dict = Depends(require_auth)):
    """Read-only archive for whichever owner(s) approved the signed-in user's email/phone."""
    from tools.storage import get_owners_for_viewer, list_recipes_for_owners
    owner_ids = get_owners_for_viewer(user.get("email"), user.get("phone"))
    return JSONResponse(content={"recipes": list_recipes_for_owners(owner_ids), "is_viewer": bool(owner_ids)})


# ── Family groups ─────────────────────────────────────────────────────────────

@app.post("/family/groups")
async def create_family_group_endpoint(request: Request, user: dict = Depends(require_auth)):
    """Create a new family group. Body: {name: string}"""
    from tools.groups import create_group, get_group_for_user
    body = await request.json()
    user_id = _user_id(user)
    if get_group_for_user(user_id):
        raise HTTPException(status_code=409, detail="Already in a family group.")
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required.")
    group = create_group(owner_id=user_id, name=name)
    base = os.environ.get("NEXT_PUBLIC_APP_URL", "")
    return JSONResponse(content={
        "group": group,
        "portal_url": f"{base}/family?p={group['portal_token']}",
        "invite_url": f"{base}/join?invite={group['invite_token']}",
    })


@app.get("/family/groups/me")
async def get_my_family_group_endpoint(user: dict = Depends(require_auth)):
    """Return the authenticated user's family group, or 404."""
    from tools.groups import get_group_for_user
    group = get_group_for_user(_user_id(user))
    if not group:
        raise HTTPException(status_code=404, detail="Not in a family group.")
    base = os.environ.get("NEXT_PUBLIC_APP_URL", "")
    return JSONResponse(content={
        "group": group,
        "portal_url": f"{base}/family?p={group['portal_token']}",
        "invite_url": f"{base}/join?invite={group['invite_token']}",
    })


@app.post("/family/groups/join/{invite_token}")
async def join_family_group_endpoint(invite_token: str, user: dict = Depends(require_auth)):
    """Join a family group via invite token."""
    from tools.groups import get_group_by_invite, join_group, get_group_for_user
    user_id = _user_id(user)
    if get_group_for_user(user_id):
        raise HTTPException(status_code=409, detail="Already in a family group.")
    group = get_group_by_invite(invite_token)
    if not group:
        raise HTTPException(status_code=404, detail="Invite link not found.")
    join_group(group_id=group["id"], user_id=user_id)
    return JSONResponse(content={"joined": True, "group_name": group["name"]})


@app.get("/family/members")
async def list_family_members_endpoint(user: dict = Depends(require_auth)):
    """List all members of the authenticated user's family group."""
    from tools.groups import get_group_for_user, list_group_members
    group = get_group_for_user(_user_id(user))
    if not group:
        raise HTTPException(status_code=404, detail="Not in a family group.")
    return JSONResponse(content={"members": list_group_members(group["id"])})


@app.get("/family/recipes")
async def list_family_recipes_endpoint(user: dict = Depends(require_auth)):
    """List all recipes from all members of the user's family group."""
    from tools.groups import get_group_for_user, list_group_recipes
    group = get_group_for_user(_user_id(user))
    if not group:
        return JSONResponse(content={"recipes": []})
    return JSONResponse(content={"recipes": list_group_recipes(group["id"])})


@app.get("/portal/{portal_token}")
async def get_portal_endpoint(portal_token: str):
    """Public endpoint — no auth required. Returns group name + portal_visible recipes."""
    from tools.groups import get_portal_group, list_portal_recipes
    group = get_portal_group(portal_token)
    if not group:
        raise HTTPException(status_code=404, detail="Portal not found.")
    recipes = list_portal_recipes(group["id"])
    return JSONResponse(content={
        "group_name": group["name"],
        "recipes": recipes,
    })


# ── Image generation ──────────────────────────────────────────────────────────

class ImageRequest(BaseModel):
    title: str
    ingredients: list | None = None
    steps: list | None = None
    cook_notes: str | None = None


@app.post("/generate-image")
async def generate_image_endpoint(body: ImageRequest, user: dict = Depends(require_auth)):
    """Generate a DALL-E image for a dish. Accepts full recipe fields for enriched prompt."""
    _check_rate_limit_db_or_raise(_user_id(user), "generate-image", _LIMITS["generate-image"])
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")
    url = _generate_image(body.title, ingredients=body.ingredients, steps=body.steps, cook_notes=body.cook_notes)
    return JSONResponse(content={"image_url": url})


class PatchRecipeRequest(BaseModel):
    title: str | None = None
    narrator: str | None = None
    user_notes: str | None = None
    tags: list[str] | None = None
    ingredients: list | None = None
    steps: list[str] | None = None
    cook_notes: str | None = None
    portal_visible: bool | None = None


@app.patch("/recipe/{token}")
async def patch_recipe_endpoint(token: str, body: PatchRecipeRequest, user: dict = Depends(require_auth)):
    """Update editable fields on a recipe. Only non-None fields are written."""
    if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")):
        raise HTTPException(status_code=503, detail="Storage not configured")
    from tools.storage import patch_recipe
    # Build patch dict from only the fields that were explicitly provided
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        updated = patch_recipe(token, fields)
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


@app.post("/memories/{token}/photo")
async def upload_memory_photo_endpoint(
    token: str,
    photo: UploadFile = File(...),
    user: dict = Depends(require_auth),
):
    """Attach or replace a user photo on any memory. Validates, uploads to storage, patches image_url."""
    data = await photo.read()
    _validate_image_upload(photo, data)

    check_rate_limit_db(_user_id(user), "image")

    from tools.storage import get_recipe_by_token, patch_recipe, upload_memory_photo
    try:
        recipe = get_recipe_by_token(token)
    except Exception:
        raise HTTPException(status_code=404, detail="Memory not found")

    if recipe.get("user_id") != _user_id(user):
        raise HTTPException(status_code=403, detail="Not your memory")

    content_type = photo.content_type or "image/jpeg"
    image_url = upload_memory_photo(data, content_type)
    patch_recipe(token, {"image_url": image_url})

    return JSONResponse(content={"image_url": image_url})


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
    from prompts.translate_fields import translate_recipe_fields
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
            "title": recipe.get("title", ""),
            "ingredients": recipe.get("ingredients", []),
            "steps": recipe.get("steps", []),
            "cook_notes": recipe.get("cook_notes", ""),
        })

    # Check server-side cache first (skip if ?force=true)
    if not force:
        try:
            cached = get_cached_translation(token, lang)
            if cached:
                _logger.info(f"event=translation_cache_hit lang={lang} token={token}")
                return JSONResponse(content={"lang": lang, **cached})
        except Exception as e:
            _logger.warning(f"event=translation_cache_read_error error={type(e).__name__} msg={e}")

    _logger.info(f"event=translation_cache_miss lang={lang} token={token}")

    # Translate via LLM
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not set")

    config = load_config()
    model = config.get("llm", {}).get("model", "gpt-4o")
    provider = OpenAIProvider(model=model)

    fields = {
        "title": recipe.get("title", ""),
        "ingredients": recipe.get("ingredients", []),
        "steps": recipe.get("steps", []),
        "cook_notes": recipe.get("cook_notes", ""),
    }

    t_llm = time.perf_counter()
    try:
        translated = translate_recipe_fields(fields, lang, provider)
        _logger.info(f"event=translation_llm_done lang={lang} duration={time.perf_counter()-t_llm:.2f}s")
    except Exception as e:
        _logger.error(f"event=translation_llm_error error={type(e).__name__} msg={e}")
        raise HTTPException(status_code=500, detail=f"Translation failed: {e}")

    # Write to cache — non-fatal, don't fail the request if Supabase write fails
    try:
        cache_translation(token, lang, translated)
    except Exception as e:
        _logger.warning(f"event=translation_cache_write_error error={type(e).__name__} msg={e}")

    return JSONResponse(content={"lang": lang, **translated})


@app.api_route("/privacy-policy", methods=["GET", "HEAD"])
async def public_privacy_policy():
    """Public privacy policy HTML for App Store Connect (no authentication)."""
    path = _WWW / "privacy-policy.html"
    if path.is_file():
        return FileResponse(path, media_type="text/html", headers=_NO_CACHE_HEADERS)
    raise HTTPException(status_code=503, detail="Privacy policy unavailable")


@app.api_route("/support", methods=["GET", "HEAD"])
async def public_support_page():
    """Public support page for App Store Connect (no authentication)."""
    path = _WWW / "support.html"
    if path.is_file():
        return FileResponse(path, media_type="text/html", headers=_NO_CACHE_HEADERS)
    raise HTTPException(status_code=503, detail="Support page unavailable")


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
