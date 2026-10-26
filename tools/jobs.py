"""
Purpose: Persistent state for background captures ("capture jobs").

What: `CaptureJobStore` creates a job when a recording is uploaded, moves it through
queued -> processing -> ready -> saved (or failed / discarded), and answers who owns
it, what is stuck and what has expired. `public_job()` shapes a row for the browser.

How: every state change is ONE conditional UPDATE ("set processing WHERE status =
queued"). The rows that come back are the rows that changed, so a caller knows whether
it won. Nothing reads then writes without a guard in the same statement, which is what
keeps two workers, a retry and a discard from trampling each other.

Why: a capture used to live and die inside one HTTP request. Putting its state in the
database lets it survive a locked phone, a dropped connection and a server restart, and
gives retry, recovery and cleanup something to act on. Drafts live here, not in
`memories`, so nothing that lists memories can ever show an unreviewed draft.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Callable

_logger = logging.getLogger(__name__)

TABLE = "capture_jobs"
MAX_ATTEMPTS = 3

# What a user can still act on. Saved and discarded jobs are finished.
OPEN_STATUSES = ("queued", "processing", "ready", "failed")
# Statuses a finished draft can be discarded from (a saved job's audio now belongs to a memory).
_DISCARDABLE = ("queued", "processing", "ready", "failed")
_EXPIRING_DRAFTS = ("ready", "failed", "discarded")

_RECOVERY_FAILURE_MESSAGE = "Something went wrong on our side. Please try again."


def _default_client():
    from tools.storage import _client
    return _client()


def is_duplicate_key(exc: Exception) -> bool:
    """True for a unique-constraint violation (Postgres 23505)."""
    text = str(exc).lower()
    return "23505" in text or "duplicate key" in text


class CaptureJobStore:
    def __init__(
        self,
        client_factory: Callable[[], object] | None = None,
        clock: Callable[[], datetime] | None = None,
    ):
        self._client_factory = client_factory or _default_client
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    # -- helpers ---------------------------------------------------------------

    def _table(self):
        return self._client_factory().table(TABLE)

    def _now(self) -> str:
        return self._clock().isoformat()

    def _update(self, payload: dict, **where) -> list[dict]:
        """One conditional UPDATE. `where` values that are tuples mean "any of"."""
        query = self._table().update({**payload, "updated_at": self._now()})
        for column, value in where.items():
            query = query.in_(column, list(value)) if isinstance(value, tuple) else query.eq(column, value)
        return query.execute().data or []

    # -- create / read ---------------------------------------------------------

    def create(
        self, user_id: str, client_request_id: str, *, audio_path: str,
        language: str = "auto", narrator: str | None = None,
    ) -> tuple[dict, bool]:
        """Insert a queued job. Returns (job, created).

        A repeated (user, client_request_id) returns the original job with created=False,
        so a retried upload never produces a second job or a second charge.
        """
        now = self._now()
        row = {
            "user_id": user_id,
            "client_request_id": client_request_id,
            "audio_path": audio_path,
            "language": language,
            "narrator": narrator,
            "created_at": now,
            "updated_at": now,
        }
        try:
            return self._table().insert(row).execute().data[0], True
        except Exception as exc:
            if not is_duplicate_key(exc):
                raise
        return self.find_by_request(user_id, client_request_id), False

    def get(self, job_id: str) -> dict | None:
        rows = self._table().select("*").eq("id", job_id).limit(1).execute().data
        return rows[0] if rows else None

    def find_by_request(self, user_id: str, client_request_id: str) -> dict | None:
        rows = (
            self._table().select("*").eq("user_id", user_id).eq("client_request_id", client_request_id)
            .limit(1).execute().data
        )
        return rows[0] if rows else None

    def get_for_user(self, job_id: str, user_id: str) -> dict | None:
        rows = self._table().select("*").eq("id", job_id).eq("user_id", user_id).limit(1).execute().data
        return rows[0] if rows else None

    def list_open(self, user_id: str, limit: int = 20) -> list[dict]:
        return (
            self._table().select("*")
            .eq("user_id", user_id).in_("status", list(OPEN_STATUSES))
            .order("created_at", desc=True).limit(limit)
            .execute().data or []
        )

    def list_queued_ids(self, limit: int = 100) -> list[str]:
        rows = (
            self._table().select("id").eq("status", "queued")
            .order("created_at").limit(limit).execute().data or []
        )
        return [r["id"] for r in rows]

    # -- worker transitions ----------------------------------------------------

    def claim(self, job_id: str) -> dict | None:
        """queued -> processing, for exactly one caller. Returns the claimed job or None.

        The attempt counter is bumped with an optimistic guard (status AND the attempts
        value we read), so a worker that read a stale row cannot win.
        """
        job = self.get(job_id)
        if job is None or job["status"] != "queued":
            return None
        rows = self._update(
            {"status": "processing", "stage": "transcribing",
             "attempts": job["attempts"] + 1, "started_at": self._now()},
            id=job_id, status="queued", attempts=job["attempts"],
        )
        return rows[0] if rows else None

    def set_stage(self, job_id: str, stage: str) -> bool:
        return bool(self._update({"stage": stage}, id=job_id, status="processing"))

    def mark_ready(self, job_id: str, result: dict) -> bool:
        return bool(self._update(
            {"status": "ready", "stage": None, "result": result, "finished_at": self._now()},
            id=job_id, status="processing",
        ))

    def mark_failed(self, job_id: str, kind: str, message: str) -> bool:
        return bool(self._update(
            {"status": "failed", "stage": None, "error_kind": kind,
             "error_message": message, "finished_at": self._now()},
            id=job_id, status=("queued", "processing"),
        ))

    def claim_refund(self, job_id: str) -> bool:
        """Flip quota_refunded false -> true. True only for the one caller that flipped it."""
        return bool(self._update({"quota_refunded": True}, id=job_id, quota_refunded=False))

    # -- user transitions ------------------------------------------------------

    def mark_saved(self, job_id: str, memory_token: str) -> bool:
        return bool(self._update({"status": "saved", "memory_token": memory_token}, id=job_id, status="ready"))

    def requeue_failed(self, job_id: str, user_id: str) -> dict | None:
        """failed -> queued for the owner, with a fresh crash-recovery budget and a new quota charge due."""
        rows = self._update(
            {"status": "queued", "stage": None, "error_kind": None, "error_message": None,
             "attempts": 0, "quota_refunded": False, "finished_at": None},
            id=job_id, user_id=user_id, status="failed",
        )
        return rows[0] if rows else None

    def mark_discarded(self, job_id: str, user_id: str) -> dict | None:
        """Owner throws the draft away. Returns the job (so the caller can delete its audio) or None."""
        rows = self._update(
            {"status": "discarded", "stage": None},
            id=job_id, user_id=user_id, status=_DISCARDABLE,
        )
        return rows[0] if rows else None

    # -- housekeeping ----------------------------------------------------------

    def recover_stale(self, stale_after_seconds: int) -> tuple[list[str], list[str]]:
        """Handle jobs a dead process left 'processing'. Returns (requeued_ids, failed_ids).

        A job that has already been attempted MAX_ATTEMPTS times is failed rather than
        retried: it is probably what is crashing the server.
        """
        cutoff = (self._clock() - timedelta(seconds=stale_after_seconds)).isoformat()
        stuck = (
            self._table().select("*").eq("status", "processing").lt("updated_at", cutoff)
            .execute().data or []
        )
        requeued: list[str] = []
        failed: list[str] = []
        for job in stuck:
            if job["attempts"] >= MAX_ATTEMPTS:
                won = self._update(
                    {"status": "failed", "stage": None, "error_kind": "internal",
                     "error_message": _RECOVERY_FAILURE_MESSAGE, "finished_at": self._now()},
                    id=job["id"], status="processing",
                )
                if won:
                    failed.append(job["id"])
            elif self._update({"status": "queued", "stage": None}, id=job["id"], status="processing"):
                requeued.append(job["id"])
        return requeued, failed

    def find_expired(self, draft_days: int, saved_days: int) -> list[dict]:
        """Jobs past their retention. Unsaved drafts keep `draft_days`; saved rows only `saved_days`.

        Queued and processing jobs never expire here: recover_stale deals with them.
        """
        now = self._clock()
        draft_cutoff = (now - timedelta(days=draft_days)).isoformat()
        saved_cutoff = (now - timedelta(days=saved_days)).isoformat()
        drafts = (
            self._table().select("*").in_("status", list(_EXPIRING_DRAFTS)).lt("updated_at", draft_cutoff)
            .execute().data or []
        )
        saved = self._table().select("*").eq("status", "saved").lt("updated_at", saved_cutoff).execute().data or []
        return drafts + saved

    def delete_rows(self, job_ids: list[str]) -> None:
        if not job_ids:
            return
        self._table().delete().in_("id", list(job_ids)).execute()


def public_job(job: dict, include_result: bool = False) -> dict:
    """The shape the browser may see: no owner, audio path or internal counters."""
    result = job.get("result") or {}
    view = {
        "id": job["id"],
        "status": job["status"],
        "stage": job.get("stage"),
        "language": job.get("language"),
        "narrator": job.get("narrator"),
        "title": result.get("title") or None,
        "error_kind": job.get("error_kind"),
        "error_message": job.get("error_message"),
        "memory_token": job.get("memory_token"),
        "created_at": job.get("created_at"),
        "updated_at": job.get("updated_at"),
    }
    if include_result:
        view["result"] = job.get("result")
    return view
