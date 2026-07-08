"""
Purpose: Family group CRUD — create, join, query membership and shared recipes.

What: Functions for managing family_groups and family_group_members tables in Supabase.

How: Follows the tools/storage.py singleton pattern — _supabase module-level variable,
     lazily initialised by _client(), monkeypatched in tests.

Why: Keeps family group logic separate from recipe storage so each module has a
     single responsibility. The family group is the organizing unit for Phase B/C
     of the sharing feature (Phase B = shared library, Phase C = public portal).
"""
import os
from supabase import create_client, Client

_supabase: Client | None = None


def _client() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_KEY"],
        )
    return _supabase


def create_group(owner_id: str, name: str) -> dict:
    """Create a family group and add the owner as admin. Returns the group row."""
    sb = _client()
    group = sb.table("family_groups").insert({
        "name": name,
        "owner_id": owner_id,
    }).execute().data[0]

    sb.table("family_group_members").insert({
        "group_id": group["id"],
        "user_id": owner_id,
        "role": "admin",
    }).execute()

    return group


def get_group_for_user(user_id: str) -> dict | None:
    """Return the group dict (plus role) for a user, or None if they have no group."""
    sb = _client()
    rows = (
        sb.table("family_group_members")
        .select("group_id, role")
        .eq("user_id", user_id)
        .execute()
        .data
    )
    if not rows:
        return None
    group = (
        sb.table("family_groups")
        .select("*")
        .eq("id", rows[0]["group_id"])
        .single()
        .execute()
        .data
    )
    return {**group, "role": rows[0]["role"]}


def get_group_by_invite(invite_token: str) -> dict | None:
    """Return a group by its invite token, or None if not found."""
    rows = (
        _client()
        .table("family_groups")
        .select("*")
        .eq("invite_token", invite_token)
        .execute()
        .data
    )
    return rows[0] if rows else None


def join_group(group_id: str, user_id: str) -> None:
    """Add a user to a family group as contributor. Silently ignores duplicate."""
    try:
        _client().table("family_group_members").insert({
            "group_id": group_id,
            "user_id": user_id,
            "role": "contributor",
        }).execute()
    except Exception:
        pass  # duplicate PK = already a member


def list_group_members(group_id: str) -> list:
    """Return all member rows for a group."""
    return (
        _client()
        .table("family_group_members")
        .select("user_id, role, joined_at")
        .eq("group_id", group_id)
        .execute()
        .data
    )


def list_group_recipes(group_id: str) -> list:
    """Return all recipes from all members of the group, newest first."""
    sb = _client()
    member_rows = (
        sb.table("family_group_members")
        .select("user_id")
        .eq("group_id", group_id)
        .execute()
        .data
    )
    if not member_rows:
        return []
    user_ids = [r["user_id"] for r in member_rows]
    return (
        sb.table("recipes")
        .select("id, token, dish_name, narrator, recorded_at, image_url, audio_url, tags, type, recorded_by_name")
        .in_("user_id", user_ids)
        .order("recorded_at", desc=True)
        .execute()
        .data
    )
