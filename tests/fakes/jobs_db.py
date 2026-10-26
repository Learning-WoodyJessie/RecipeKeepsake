"""
Purpose: Build a FakeSupabase that behaves like the real `capture_jobs` table.

What: unique (user_id, client_request_id) and the column defaults from migration 006.

Why: the store and the API tests must share one definition of the table so they cannot
drift apart from the migration.
"""
from datetime import datetime, timezone

from tests.fakes.fake_supabase import FakeSupabase

TABLE = "capture_jobs"


def new_jobs_db(extra_tables: dict | None = None) -> FakeSupabase:
    db = FakeSupabase(extra_tables)
    db.unique[TABLE] = [("user_id", "client_request_id")]
    db.defaults[TABLE] = {
        "status": "queued",
        "stage": None,
        "language": "auto",
        "narrator": None,
        "result": None,
        "error_kind": None,
        "error_message": None,
        "attempts": 0,
        "quota_refunded": False,
        "memory_token": None,
        "created_at": lambda: datetime.now(timezone.utc).isoformat(),
        "updated_at": lambda: datetime.now(timezone.utc).isoformat(),
        "started_at": None,
        "finished_at": None,
    }
    return db
