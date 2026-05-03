import os
import mimetypes
import uuid as _uuid
from pathlib import Path
from supabase import create_client, Client
import httpx


def _client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


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


def upload_audio(local_path: str, filename: str) -> str:
    """Upload an audio file to the private 'audio' bucket. Returns the filename (storage path)."""
    mime = mimetypes.guess_type(filename)[0] or "audio/webm"
    with open(local_path, "rb") as f:
        data = f.read()

    sb = _client()
    sb.storage.from_("audio").upload(
        path=filename,
        file=data,
        file_options={"content-type": mime, "upsert": "true"},
    )
    # Store just the filename — signed URLs are generated at serve time
    return filename


def insert_recipe(recipe: dict) -> dict:
    """Insert a recipe row into Supabase. Returns the saved row with id + token."""
    result = _client().table("recipes").insert(recipe).execute()
    return result.data[0]


def get_recipe_by_token(token: str) -> dict:
    """Fetch a single recipe by its share token. audio_url is replaced with a fresh signed URL."""
    sb = _client()
    result = sb.table("recipes").select("*").eq("token", token).single().execute()
    recipe = result.data
    if recipe.get("audio_url"):
        recipe["audio_url"] = _sign_audio(recipe["audio_url"], sb)
    return recipe


def patch_recipe(token: str, fields: dict) -> dict:
    """Update specific fields on a recipe row by token. Returns updated row."""
    result = (
        _client().table("recipes").update(fields).eq("token", token).execute()
    )
    return result.data[0]


def list_recipes(user_id: str) -> list:
    """Fetch recipes for a specific user, ordered by recorded_at desc."""
    sb = _client()
    result = (
        sb.table("recipes")
        .select("id, token, dish_name, narrator, recorded_at, image_url, audio_url")
        .eq("user_id", user_id)
        .order("recorded_at", desc=True)
        .execute()
    )
    recipes = result.data
    for r in recipes:
        if r.get("audio_url"):
            r["audio_url"] = _sign_audio(r["audio_url"], sb)
    return recipes


def get_cached_translation(token: str, lang: str) -> dict | None:
    """Return a cached translation for (token, lang) or None if not yet translated."""
    sb = _client()
    result = sb.table("recipes").select("translations").eq("token", token).single().execute()
    translations = result.data.get("translations") or {}
    return translations.get(lang)


def delete_recipe(token: str) -> None:
    """Hard-delete a recipe row by share token."""
    _client().table("recipes").delete().eq("token", token).execute()


def cache_translation(token: str, lang: str, data: dict) -> None:
    """Merge translated fields into the translations JSONB column for this recipe.

    Fetches existing translations first so other languages are preserved.
    """
    sb = _client()
    result = sb.table("recipes").select("translations").eq("token", token).single().execute()
    existing = result.data.get("translations") or {}
    existing[lang] = data
    sb.table("recipes").update({"translations": existing}).eq("token", token).execute()


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
