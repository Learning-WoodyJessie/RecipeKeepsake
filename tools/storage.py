import logging
import os
import re
import subprocess
import mimetypes
import tempfile
import uuid as _uuid
from pathlib import Path
from supabase import create_client, Client
import httpx

_logger = logging.getLogger(__name__)


_supabase: "Client | None" = None


def _client() -> Client:
    global _supabase
    if _supabase is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_KEY"]
        _supabase = create_client(url, key)
    return _supabase


_SIGNED_URL_EXPIRY = 3600  # 1 hour


def _audio_filename(audio_url: str) -> str:
    """Extract the storage filename from an audio_url (works for both old public URLs and bare filenames)."""
    # Bare filename: "abc123.webm"
    if not audio_url.startswith("http"):
        return audio_url
    # Legacy public URL: https://.../object/public/audio/FILENAME
    # Signed URL:        https://.../object/sign/audio/FILENAME?token=...
    for marker in ("/public/audio/", "/sign/audio/"):
        if marker in audio_url:
            return audio_url.split(marker)[-1].split("?")[0]
    # Fallback: last path segment
    return audio_url.rstrip("/").split("/")[-1].split("?")[0]


def _sign_audio(audio_url: str, sb) -> str:
    """Return a fresh signed URL for an audio file. Falls back to original on error."""
    if not audio_url:
        return audio_url
    try:
        filename = _audio_filename(audio_url)
        result = sb.storage.from_("audio").create_signed_url(filename, _SIGNED_URL_EXPIRY)
        return result.get("signedURL") or result.get("signed_url") or audio_url
    except Exception:
        return audio_url


def store_image(image_url: str) -> str:
    """Download a DALL-E image and store it permanently in Supabase 'images' bucket (public).
    Returns the permanent public URL. Falls back to the original URL on any error —
    image failure must never crash the capture pipeline.
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
        return image_url  # graceful fallback


def upload_user_photo(data: bytes, ext: str, content_type: str) -> str:
    """Upload a user-provided photo (e.g. a narrator's picture) to the public
    'images' bucket. Unlike store_image(), this is a direct upload of bytes
    already in hand — no download step, no fallback-to-original since there
    is no "original URL" to fall back to. Raises on failure rather than
    swallowing it, since a narrator photo upload failing should be visible
    to the user, not silently dropped the way a DALL-E image failure is.
    """
    sb = _client()
    filename = f"{_uuid.uuid4()}{ext}"
    sb.storage.from_("images").upload(
        path=filename,
        file=data,
        file_options={"content-type": content_type, "upsert": "false"},
    )
    return sb.storage.from_("images").get_public_url(filename)


def upload_memory_photo(image_bytes: bytes, content_type: str) -> str:
    """Upload a memory photo to the public 'memory-photos' bucket. Returns the public URL."""
    sb = _client()
    ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}.get(content_type, ".jpg")
    filename = f"{_uuid.uuid4()}{ext}"
    sb.storage.from_("memory-photos").upload(
        path=filename,
        file=image_bytes,
        file_options={"content-type": content_type, "upsert": "false"},
    )
    return sb.storage.from_("memory-photos").get_public_url(filename)


# Python's mimetypes returns video/webm and video/mp4 for these extensions.
# Supabase then serves stored files with those content-types, causing Chrome on
# Windows/Android to refuse to decode them in an <audio> element (shows correct
# duration but produces no sound). Map explicitly to audio/* types instead.
_AUDIO_MIME: dict[str, str] = {
    ".webm": "audio/webm",
    ".mp4":  "audio/mp4",
    ".m4a":  "audio/mp4",
    ".ogg":  "audio/ogg",
    ".oga":  "audio/ogg",
    ".opus": "audio/ogg",
    ".wav":  "audio/wav",
    ".flac": "audio/flac",
    ".mp3":  "audio/mpeg",
    ".aac":  "audio/aac",
}


def _transcode_to_mp3(local_path: str) -> tuple[str, bool]:
    """Convert audio to MP3 via ffmpeg for universal browser playback (iOS Safari compatibility).
    Returns (mp3_path, True) on success or (local_path, False) if ffmpeg is unavailable/fails.
    Caller is responsible for deleting the returned mp3_path when done.
    """
    mp3_tmp = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
    mp3_path = mp3_tmp.name
    mp3_tmp.close()
    try:
        result = subprocess.run(
            ['ffmpeg', '-y', '-i', local_path, '-ar', '44100', '-ac', '1', '-b:a', '32k', mp3_path],
            capture_output=True,
            timeout=60,
        )
        if result.returncode == 0 and Path(mp3_path).stat().st_size > 0:
            return mp3_path, True
        _logger.warning(f'event=transcode_failed returncode={result.returncode} stderr={result.stderr[:200]}')
    except FileNotFoundError:
        _logger.warning('event=transcode_skip reason=ffmpeg_not_found')
    except Exception as e:
        _logger.warning(f'event=transcode_error error={e}')
    try:
        os.unlink(mp3_path)
    except Exception:
        pass
    return local_path, False


def upload_audio(local_path: str, filename: str, user_id: str = "") -> str:
    """Upload an audio file to the private 'audio' bucket. Returns the stored filename.
    WebM and OGG files are transcoded to MP3 first for iOS Safari compatibility.
    """
    ext = Path(filename).suffix.lower()

    mp3_path = None
    if ext in ('.webm', '.ogg'):
        transcoded, ok = _transcode_to_mp3(local_path)
        if ok:
            mp3_path = transcoded
            local_path = mp3_path
            filename = Path(filename).stem + '.mp3'
            ext = '.mp3'

    mime = _AUDIO_MIME.get(ext) or mimetypes.guess_type(filename)[0] or "audio/mpeg"
    with open(local_path, "rb") as f:
        data = f.read()

    _logger.info(f"event=upload_audio filename={filename} ext={ext} mime={mime} size={len(data)} user_id={user_id}")
    sb = _client()
    sb.storage.from_("audio").upload(
        path=filename,
        file=data,
        file_options={"content-type": mime, "upsert": "true"},
    )

    if mp3_path:
        try:
            os.unlink(mp3_path)
        except Exception:
            pass

    # Store just the filename — signed URLs are generated at serve time
    return filename


def _to_slug(text: str) -> str:
    """Convert a title to a URL-safe kebab-case slug (max 80 chars)."""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-{2,}', '-', text)
    return text.strip('-')[:80]


def _unique_slug(base: str, sb) -> str:
    """Return base slug if unclaimed in the memories table, else base-2, base-3, …"""
    slug = base or 'memory'
    i = 2
    while True:
        exists = sb.table("memories").select("id").eq("slug", slug).execute()
        if not exists.data:
            return slug
        slug = f"{base}-{i}"
        i += 1


FREE_MEMORY_LIMIT = 9999


def count_memories(user_id: str) -> int:
    """Return the number of memories saved by this user."""
    result = _client().table("memories").select("id", count="exact").eq("user_id", user_id).execute()
    return result.count or 0


def is_pro_user(user_id: str) -> bool:
    """Return True if the user has an active pro profile row."""
    rows = _client().table("profiles").select("is_pro").eq("user_id", user_id).execute().data
    return bool(rows and rows[0].get("is_pro"))


def insert_recipe(recipe: dict) -> dict:
    """Insert a recipe row into Supabase. Generates a slug from title if not already set."""
    sb = _client()
    if not recipe.get("slug") and recipe.get("title"):
        base = _to_slug(recipe["title"])
        recipe = {**recipe, "slug": _unique_slug(base, sb)}
    result = sb.table("memories").insert(recipe).execute()
    return result.data[0]


def get_recipe_by_token(token: str) -> dict:
    """Fetch a single recipe by its share token. audio_url is replaced with a fresh signed URL."""
    sb = _client()
    result = sb.table("memories").select("*").eq("token", token).single().execute()
    recipe = result.data
    if recipe.get("audio_url"):
        recipe["audio_url"] = _sign_audio(recipe["audio_url"], sb)
    return recipe


def get_recipe_by_token_prefix(prefix: str) -> dict:
    """Fetch a memory by the first 8 chars of its token (used by short share URLs)."""
    sb = _client()
    result = sb.table("memories").select("*").like("token", f"{prefix}%").limit(1).execute()
    if not result.data:
        raise ValueError(f"No memory found for token prefix {prefix!r}")
    recipe = result.data[0]
    if recipe.get("audio_url"):
        recipe["audio_url"] = _sign_audio(recipe["audio_url"], sb)
    return recipe


def get_recipe_by_slug(slug: str) -> dict:
    """Fetch a single recipe by its human-readable slug. audio_url replaced with a fresh signed URL."""
    sb = _client()
    result = sb.table("memories").select("*").eq("slug", slug).single().execute()
    recipe = result.data
    if recipe.get("audio_url"):
        recipe["audio_url"] = _sign_audio(recipe["audio_url"], sb)
    return recipe


def patch_recipe(token: str, fields: dict) -> dict:
    """Update specific fields on a recipe row by token. Returns updated row."""
    result = (
        _client().table("memories").update(fields).eq("token", token).execute()
    )
    return result.data[0]


def list_recipes(user_id: str) -> list:
    """Fetch recipes for a specific user, ordered by recorded_at desc."""
    sb = _client()
    result = (
        sb.table("memories")
        .select("id, token, title, narrator, recorded_at, image_url, audio_url, tags, type, language, portal_visible, slug")
        .eq("user_id", user_id)
        .order("recorded_at", desc=True)
        .execute()
    )
    recipes = result.data
    for r in recipes:
        if r.get("audio_url"):
            r["audio_url"] = _sign_audio(r["audio_url"], sb)
    # For records with no ASCII in the title, fetch the English dish name from content
    _enrich_content_titles(recipes, sb)
    return recipes


def _enrich_content_titles(recipes: list, sb) -> None:
    """Fetch content->>'title' for records whose stored title has no ASCII letters.

    Runs a single targeted query rather than pulling full JSONB blobs for every card.
    """
    def _needs_english(r: dict) -> bool:
        t = r.get("title") or ""
        return bool(t) and not any(c.isalpha() and c.isascii() for c in t)

    tokens = [r["token"] for r in recipes if _needs_english(r)]
    if not tokens:
        return
    try:
        rows = (
            sb.table("memories")
            .select("token, content")
            .in_("token", tokens)
            .execute()
        ).data
        title_map = {}
        for row in rows:
            c = row.get("content")
            if isinstance(c, dict):
                title_map[row["token"]] = c.get("title")
        for r in recipes:
            if r["token"] in title_map:
                r["content_title"] = title_map[r["token"]]
    except Exception:
        pass  # non-fatal: card falls back to bowl without letter


def get_cached_translation(token: str, lang: str) -> dict | None:
    """Return a cached translation for (token, lang) or None if not yet translated."""
    sb = _client()
    result = sb.table("memories").select("translations").eq("token", token).single().execute()
    translations = result.data.get("translations") or {}
    return translations.get(lang)


def delete_recipe(token: str) -> None:
    """Hard-delete a recipe row by share token."""
    _client().table("memories").delete().eq("token", token).execute()


def cache_translation(token: str, lang: str, data: dict) -> None:
    """Atomically set one language in the recipe translations JSONB.

    Uses a Postgres RPC function with the || merge operator so two concurrent
    writes for different languages never overwrite each other.
    Requires set_recipe_translation() to be created in Supabase SQL editor first.
    """
    _client().rpc(
        "set_recipe_translation",
        {"p_token": token, "p_lang": lang, "p_data": data},
    ).execute()


def clear_translation_cache(lang: str) -> int:
    """Wipe cached translations for a given language across ALL recipes.

    Used when translation quality changes (e.g. prompt fixes) so stale
    cached translations are regenerated on next request.
    Returns the number of rows updated.
    """
    sb = _client()
    # Fetch all recipes that have a cached translation for this lang
    result = (
        sb.table("memories")
        .select("token, translations")
        .not_.is_("translations", "null")
        .execute()
    )
    updated = 0
    for row in result.data:
        translations = row.get("translations") or {}
        if lang in translations:
            del translations[lang]
            sb.table("memories").update({"translations": translations}).eq("token", row["token"]).execute()
            updated += 1
    return updated


# ── People (narrator profiles) ────────────────────────────────────────────────

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


# ── Account deletion ──────────────────────────────────────────────────────────

def delete_account(user_id: str) -> None:
    """Delete ALL data for a user: audio files, recipe rows, people rows, auth user.

    Errors on individual steps are logged but do not halt the sequence —
    partial deletion is safer than abandoning mid-way.
    """
    sb = _client()

    # 1. Delete audio files from Storage for each recipe
    recipes = (
        sb.table("memories")
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
                _logger.warning(f"event=delete_account_audio_failed error={type(e).__name__} msg={e}")

    # 2. Delete all recipe rows for this user
    try:
        sb.table("memories").delete().eq("user_id", user_id).execute()
    except Exception as e:
        _logger.error(f"event=delete_account_recipes_failed error={type(e).__name__} msg={e}")

    # 3. Delete all people rows for this user
    try:
        sb.table("people").delete().eq("user_id", user_id).execute()
    except Exception as e:
        _logger.error(f"event=delete_account_people_failed error={type(e).__name__} msg={e}")

    # 4. Delete the Supabase auth user (service role required)
    try:
        sb.auth.admin.delete_user(user_id)
    except Exception as e:
        _logger.warning(f"event=delete_account_auth_failed error={type(e).__name__} msg={e}")


def check_rate_limit_db(user_id: str, endpoint: str) -> int:
    """Atomically increment the rate limit counter for (user, today, endpoint).

    Returns the new count, or 0 on DB failure (fail open — rate limiting is
    abuse prevention, not billing enforcement).
    """
    try:
        sb = _client()
        result = sb.rpc(
            "increment_rate_limit",
            {"p_user_id": user_id, "p_endpoint": endpoint},
        ).execute()
        return result.data or 0
    except Exception as e:
        _logger.warning(f"event=rate_limit_db_error error={type(e).__name__} msg={e}")
        return 0


# ── Viewer role (Phase 5, Epic 16) ────────────────────────────────────────────

def add_viewer(owner_user_id: str, email: str | None, phone: str | None) -> dict:
    """Approve an email or phone for read-only access to owner_user_id's archive."""
    result = (
        _client()
        .table("viewers")
        .insert({"owner_user_id": owner_user_id, "email": email or None, "phone": phone or None})
        .execute()
    )
    return result.data[0]


def list_viewers(owner_user_id: str) -> list:
    """List this owner's viewer invites (active and revoked)."""
    result = (
        _client()
        .table("viewers")
        .select("id, email, phone, created_at, revoked_at")
        .eq("owner_user_id", owner_user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


def revoke_viewer(owner_user_id: str, viewer_id: str) -> None:
    """Revoke a viewer invite. Scoped to owner_user_id so one owner can't revoke another's invite."""
    from datetime import datetime, timezone
    (
        _client()
        .table("viewers")
        .update({"revoked_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", viewer_id)
        .eq("owner_user_id", owner_user_id)
        .execute()
    )


def get_owners_for_viewer(email: str | None, phone: str | None) -> list[str]:
    """Return owner_user_ids that have approved this email or phone, and not revoked it."""
    sb = _client()
    owner_ids: set[str] = set()
    if email:
        result = sb.table("viewers").select("owner_user_id").eq("email", email).is_("revoked_at", "null").execute()
        owner_ids.update(r["owner_user_id"] for r in result.data)
    if phone:
        result = sb.table("viewers").select("owner_user_id").eq("phone", phone).is_("revoked_at", "null").execute()
        owner_ids.update(r["owner_user_id"] for r in result.data)
    return list(owner_ids)


def list_recipes_for_owners(owner_user_ids: list[str]) -> list:
    """Read-only recipe list across multiple owners — used for the viewer's shared-with-me view."""
    if not owner_user_ids:
        return []
    sb = _client()
    result = (
        sb.table("memories")
        .select("id, token, title, narrator, recorded_at, image_url, audio_url, tags, type, language")
        .in_("user_id", owner_user_ids)
        .order("recorded_at", desc=True)
        .execute()
    )
    recipes = result.data
    for r in recipes:
        if r.get("audio_url"):
            r["audio_url"] = _sign_audio(r["audio_url"], sb)
    return recipes


# ── Reactions ─────────────────────────────────────────────────────────────────

_VALID_EMOJIS = {"😊", "🥹", "🏆", "🙏"}


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
    user_reactions = (
        [r["emoji"] for r in rows if r.get("user_id") == user_id] if user_id else []
    )
    return {"counts": counts, "user_reactions": user_reactions}


def toggle_reaction(memory_token: str, user_id: str, emoji: str) -> dict:
    """Toggle an emoji reaction. Inserts if absent, deletes if present. Returns updated counts."""
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

