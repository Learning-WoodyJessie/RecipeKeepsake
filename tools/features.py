"""
Purpose: Decide which users get the background-capture flow.

What: `capture_jobs_enabled_for(user, environ)`.

How: CAPTURE_JOBS_ENABLED=true turns it on for everyone. Otherwise CAPTURE_JOBS_ALLOWLIST
(comma separated emails or user ids, case-insensitive) turns it on for named people.

Why: the flow ships dark. Testing it on production as one trusted user first, and
turning it off again without a deploy, is what keeps the rollout regression-free.
"""
from __future__ import annotations

import os
from typing import Mapping

_TRUE = {"1", "true", "yes", "on"}


def _split(value: str) -> set[str]:
    return {part.strip().lower() for part in value.split(",") if part.strip()}


def capture_jobs_enabled_for(user: dict, environ: Mapping[str, str] | None = None) -> bool:
    env = os.environ if environ is None else environ
    if env.get("CAPTURE_JOBS_ENABLED", "").strip().lower() in _TRUE:
        return True
    allowed = _split(env.get("CAPTURE_JOBS_ALLOWLIST", ""))
    if not allowed:
        return False
    identities = {str(user.get("email") or "").strip().lower(), str(user.get("sub") or user.get("id") or "").strip().lower()}
    return bool(allowed & (identities - {""}))


def capture_jobs_configured(environ: Mapping[str, str] | None = None) -> bool:
    """True if anyone could possibly get the flow. When False the background machinery stays completely idle."""
    env = os.environ if environ is None else environ
    return env.get("CAPTURE_JOBS_ENABLED", "").strip().lower() in _TRUE or bool(_split(env.get("CAPTURE_JOBS_ALLOWLIST", "")))
