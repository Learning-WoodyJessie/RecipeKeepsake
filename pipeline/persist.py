"""
Stage 3: RecipeData + audio file → SavedRecipe.

Uploads audio to Supabase Storage, then inserts the recipe row.
Both operations are explicit: audio upload failure is non-fatal (logged, not raised)
so a recipe is never lost because of a storage hiccup.
"""
from __future__ import annotations
import logging

from tools.storage import upload_audio, insert_recipe

_logger = logging.getLogger(__name__)
from pipeline.models import RecipeData, SavedRecipe


def run_persist(
    recipe: RecipeData,
    audio_path: str,
    audio_filename: str,
    narrator: str = "Grandma",
    user_id: str = "",
    recorded_by_email: str = "",
    recorded_by_name: str = "",
) -> SavedRecipe:
    """
    Stage 3: upload audio and insert recipe to Supabase.

    Args:
        recipe:             structured recipe from run_transform()
        audio_path:         local path to temp audio file
        audio_filename:     desired filename in Supabase Storage (uuid + extension)
        narrator:           who narrated the recipe (default "Grandma")
        user_id:            Supabase auth user id (empty for unauthenticated)
        recorded_by_email:  user email for attribution
        recorded_by_name:   user display name for attribution

    Returns:
        SavedRecipe with id, token, and audio_url.

    Notes:
        Audio upload failure is non-fatal — the recipe is saved even if audio
        storage fails (e.g. Supabase Storage quota, network hiccup).
    """
    stored_path = ""
    try:
        stored_path = upload_audio(audio_path, audio_filename, user_id=user_id)
    except Exception as e:
        _logger.warning(f"event=audio_upload_failed error={type(e).__name__} msg={e}")

    return _insert(recipe, stored_path, narrator, user_id, recorded_by_email, recorded_by_name)


def run_persist_stored(
    recipe: RecipeData,
    stored_path: str,
    narrator: str = "Grandma",
    user_id: str = "",
    recorded_by_email: str = "",
    recorded_by_name: str = "",
    token: str | None = None,
) -> SavedRecipe:
    """
    Stage 3 for a recording that is already in storage (a reviewed capture job).

    The audio was uploaded once when the job was created, so it is only referenced here:
    no second upload, no copy. Builds exactly the row run_persist() builds.

    `token` lets the caller choose the memory's token. The capture-job save derives it from
    the job id, so saving twice (a double tap, a retry after a dropped response) hits the
    unique constraint instead of creating a duplicate memory.
    """
    return _insert(recipe, stored_path, narrator, user_id, recorded_by_email, recorded_by_name, token)


def _insert(
    recipe: RecipeData,
    stored_path: str,
    narrator: str,
    user_id: str,
    recorded_by_email: str,
    recorded_by_name: str,
    token: str | None = None,
) -> SavedRecipe:
    row = {
        "type": "recipe",
        "title": recipe.title,
        "ingredients": recipe.ingredients,
        "steps": recipe.steps,
        "cook_notes": recipe.cook_notes,
        "review_flags": recipe.review_flags,
        "transcript_raw": recipe.transcript_raw,
        "transcript_english": recipe.transcript_english,
        "image_url": recipe.image_url,
        "audio_url": stored_path,
        "narrator": narrator,
        "user_id": user_id,
        "recorded_by_email": recorded_by_email,
        "recorded_by_name": recorded_by_name,
        "tags": [recipe.category] if recipe.category else [],
    }
    if token:
        row["token"] = token
    saved = insert_recipe(row)
    return SavedRecipe(
        id=saved.get("id", ""),
        token=saved.get("token", ""),
        audio_url=stored_path,
    )
