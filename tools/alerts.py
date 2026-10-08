"""
Purpose: Tell the operator by email when something fails that the user cannot fix.

What: send_alert() — a best-effort notification used for failures that need a
human, such as an account deletion that could not finish.

How: One HTTPS call to the Resend email API using httpx (already a dependency).
     Configured with RESEND_API_KEY and ALERT_EMAIL_TO; ALERT_EMAIL_FROM is
     optional. Every alert is also written to the log, so nothing is lost when
     email is not configured. Repeat alerts for the same key are suppressed for
     a cooldown so a retrying user cannot flood the inbox.

Why: User-facing errors are deliberately generic, which means the operator
     would otherwise never find out. A failure here must never make the user's
     request worse, so this module never raises.
"""
import logging
import os
import time

import httpx

_logger = logging.getLogger(__name__)

_RESEND_URL = "https://api.resend.com/emails"
_DEFAULT_FROM = "Echoes of Home alerts <onboarding@resend.dev>"
COOLDOWN_SECONDS = 600
_last_sent: dict[str, float] = {}


def send_alert(key: str, subject: str, body: str) -> bool:
    """Email the operator. Best-effort: never raises, returns True only if sent.

    key identifies the thing being reported (for example the user id) so a
    repeat within COOLDOWN_SECONDS is logged but not emailed again. Put only
    what is needed to find and fix the problem in subject/body — identifiers
    and step names, not personal details.
    """
    _logger.error(f"event=ALERT key={key} subject={subject!r} body={body!r}")

    api_key = os.environ.get("RESEND_API_KEY")
    to = os.environ.get("ALERT_EMAIL_TO")
    if not api_key or not to:
        _logger.warning("event=alert_email_not_configured hint=set RESEND_API_KEY and ALERT_EMAIL_TO")
        return False

    now = time.monotonic()
    last = _last_sent.get(key)
    if last is not None and now - last < COOLDOWN_SECONDS:
        _logger.info(f"event=alert_suppressed key={key} reason=cooldown")
        return False

    try:
        resp = httpx.post(
            _RESEND_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "from": os.environ.get("ALERT_EMAIL_FROM") or _DEFAULT_FROM,
                "to": [addr.strip() for addr in to.split(",") if addr.strip()],
                "subject": subject,
                "text": body,
            },
            timeout=5.0,
        )
        resp.raise_for_status()
    except Exception as e:
        _logger.error(f"event=alert_email_failed error={type(e).__name__} msg={e}")
        return False

    _last_sent[key] = now
    return True
