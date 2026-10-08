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


def get_portal_group(portal_token: str) -> dict | None:
    """Return a group by its public portal token, or None if not found."""
    rows = (
        _client()
        .table("family_groups")
        .select("*")
        .eq("portal_token", portal_token)
        .execute()
        .data
    )
    return rows[0] if rows else None


def list_portal_recipes(group_id: str) -> list:
    """Return portal_visible=true recipes from all group members, newest first."""
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
        sb.table("memories")
        .select("id, token, title, narrator, recorded_at, image_url, audio_url, tags, type, recorded_by_name")
        .in_("user_id", user_ids)
        .eq("portal_visible", True)
        .order("recorded_at", desc=True)
        .execute()
        .data
    )


def list_group_recipes(group_id: str, fallback_owner_id: str | None = None) -> list:
    """Return all recipes from all members of the group, newest first.

    Falls back to fallback_owner_id if family_group_members has no rows yet
    (e.g. group created before membership backfill).
    """
    sb = _client()
    member_rows = (
        sb.table("family_group_members")
        .select("user_id")
        .eq("group_id", group_id)
        .execute()
        .data
    )
    user_ids = [r["user_id"] for r in member_rows]
    if not user_ids and fallback_owner_id:
        user_ids = [fallback_owner_id]
    if not user_ids:
        return []
    return (
        sb.table("memories")
        .select("id, token, title, narrator, recorded_at, image_url, audio_url, tags, type, recorded_by_name, ingredients, steps, cook_notes, portal_visible")
        .in_("user_id", user_ids)
        .eq("portal_visible", True)
        .order("recorded_at", desc=True)
        .execute()
        .data
    )


def remove_user_from_groups(sb, user_id: str) -> None:
    """Detach a user from every family group before their account is deleted.

    Takes the Supabase client as an argument so it runs against the same
    connection (and the same test double) as delete_account().

    - Last member: the group is deleted outright (nothing left to keep).
    - Other members remain: only the user's membership is removed, so the
      family keeps its portal and invite links. If the user owned the group,
      ownership passes to the next member — an admin first, then whoever
      joined earliest — and that member is promoted to admin.

    Safe to re-run after a partial failure: it only acts on what is left.
    """
    memberships = (
        sb.table("family_group_members").select("group_id").eq("user_id", user_id).execute().data or []
    )
    owned = sb.table("family_groups").select("id").eq("owner_id", user_id).execute().data or []
    group_ids = list(dict.fromkeys([m["group_id"] for m in memberships] + [g["id"] for g in owned]))

    for gid in group_ids:
        members = (
            sb.table("family_group_members").select("user_id, role, joined_at").eq("group_id", gid).execute().data or []
        )
        others = [m for m in members if m["user_id"] != user_id]

        sb.table("family_group_members").delete().eq("group_id", gid).eq("user_id", user_id).execute()

        if not others:
            sb.table("family_groups").delete().eq("id", gid).execute()
            continue

        group_rows = sb.table("family_groups").select("owner_id").eq("id", gid).execute().data or []
        if group_rows and group_rows[0].get("owner_id") == user_id:
            successor = sorted(
                others, key=lambda m: (m.get("role") != "admin", str(m.get("joined_at") or ""))
            )[0]
            sb.table("family_groups").update({"owner_id": successor["user_id"]}).eq("id", gid).execute()
            sb.table("family_group_members").update({"role": "admin"}).eq("group_id", gid).eq(
                "user_id", successor["user_id"]
            ).execute()
