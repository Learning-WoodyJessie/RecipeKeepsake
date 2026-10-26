"""
Purpose: Turn any exception from the capture pipeline into a safe user message
and a decision about whether the operator must be told.

What: `classify_failure(exc)` returns a `Failure` (HTTP status, user-facing
message, alert flag, kind). No web-framework imports, so it is trivially testable.

How: Looks at the exception's status code and text for the tell-tale signs of
exhausted provider credits, a rejected API key, a busy provider, or a provider
outage. Anything unrecognised is an internal error.

Why: A user once saw OpenAI's raw "no credits remaining" error, a billing URL
and a request code, while the operator had no idea anything was wrong. Users
need a calm message that exposes nothing; the operator needs the real cause.
"""
from dataclasses import dataclass

_QUOTA_SIGNS = (
    "insufficient_quota", "credit_balance", "exceeded your current quota",
    "no credits", "billing", "resource_exhausted",
)
_AUTH_SIGNS = (
    "incorrect api key", "invalid api key", "api key not valid",
    "permission_denied", "authenticationerror",
)
_UNREADABLE_SIGNS = ("empty transcription", "refused transcription")
_UNAVAILABLE_SIGNS = (
    "timeout", "timed out", "overloaded", "unavailable", "apiconnectionerror",
)

_MSG_BLOCKED = (
    "We can't process new recordings right now. We've been notified and are "
    "working on it. Please try again later."
)
_MSG_BUSY = "Our processing is busy right now. Please try again in a minute."
_MSG_UNREADABLE = "We couldn't read this recording. Please try a different file or format."
_MSG_INTERNAL = "Something went wrong on our side. Please try again."


@dataclass(frozen=True)
class Failure:
    status_code: int
    message: str          # safe to show to any user
    alert: bool           # should the operator be emailed?
    kind: str             # provider_quota | provider_auth | provider_busy | provider_unavailable | unreadable_audio | internal


def _status_of(exc: Exception) -> int | None:
    for attr in ("status_code", "code", "status"):
        value = getattr(exc, attr, None)
        if isinstance(value, int):
            return value
    return None


def classify_failure(exc: Exception) -> Failure:
    text = f"{type(exc).__name__}: {exc}".lower()
    status = _status_of(exc)

    # The recording itself could not be understood: the user can fix this, nobody needs paging.
    if any(sign in text for sign in _UNREADABLE_SIGNS):
        return Failure(422, _MSG_UNREADABLE, False, "unreadable_audio")
    if any(sign in text for sign in _QUOTA_SIGNS):
        return Failure(503, _MSG_BLOCKED, True, "provider_quota")
    if status in (401, 403) or any(sign in text for sign in _AUTH_SIGNS):
        return Failure(503, _MSG_BLOCKED, True, "provider_auth")
    if status == 429 or "rate limit" in text:
        return Failure(503, _MSG_BUSY, False, "provider_busy")
    if status in (500, 502, 503, 504) or any(sign in text for sign in _UNAVAILABLE_SIGNS):
        return Failure(503, _MSG_BUSY, False, "provider_unavailable")
    return Failure(500, _MSG_INTERNAL, True, "internal")
