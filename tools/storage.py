import os
import mimetypes
from pathlib import Path
from supabase import create_client, Client


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
