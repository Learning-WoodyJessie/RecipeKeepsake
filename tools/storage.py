import os
from supabase import create_client, Client


def _client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


def insert_recipe(recipe: dict) -> dict:
    """Insert a recipe row into Supabase. Returns the saved row with id + token."""
    result = _client().table("recipes").insert(recipe).execute()
    return result.data[0]


def get_recipe_by_token(token: str) -> dict:
    """Fetch a single recipe by its share token."""
    result = (
        _client().table("recipes").select("*").eq("token", token).single().execute()
    )
    return result.data


def list_recipes() -> list:
    """Fetch all recipes ordered by recorded_at desc (newest first)."""
    result = (
        _client()
        .table("recipes")
        .select("id, token, dish_name, narrator, recorded_at, image_url")
        .order("recorded_at", desc=True)
        .execute()
    )
    return result.data
