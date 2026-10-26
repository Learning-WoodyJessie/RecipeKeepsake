"""
Purpose: Turn an uploaded video into the plain sound file the capture pipeline already understands.

What: `extract_audio()` runs ffmpeg to keep only the sound of a video as a small mono MP3;
`looks_like_video()` and `VIDEO_EXTS` say which files are accepted; `VideoError` carries a
reason and a message that is safe to show the user.

How: one ffmpeg call (`-vn` drops the picture). ffmpeg's own wording tells "this video has no
sound track" apart from "this is not a readable video"; a timeout or a missing ffmpeg are
reported separately because the second one is our problem, not the user's.

Why: people record family memories on a phone and often have the video, not a separate audio
file. Extracting the sound at the door means everything after it (storage, transcription,
review, playback) stays exactly as it is for audio, and the video itself is never kept.
"""
from __future__ import annotations

import logging
import os
import subprocess

_logger = logging.getLogger(__name__)

VIDEO_EXTS = (".mp4", ".mov", ".m4v")
DEFAULT_MAX_MB = 200
EXTRACT_TIMEOUT_SECONDS = 300

MSG_NO_AUDIO = "We couldn't find any sound in this video."
MSG_UNREADABLE = "We couldn't read this video. Please try a different file."
MSG_TIMEOUT = "This video took too long to process. Please try a shorter one."
MSG_NOT_VIDEO = "File does not appear to be a valid video file. Please upload an actual video."
MSG_UNSUPPORTED_TYPE = "Unsupported file type '{ext}'. Upload an MP4, MOV or M4V video."
MSG_TOO_LARGE = "File too large. Maximum size is {mb} MB."
MSG_UNAVAILABLE = "Something went wrong on our side. Please try again."


class VideoError(Exception):
    """Why a video could not be used. `message` is safe to show; `kind` is for logs and routing."""

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind
        self.message = message


def max_video_bytes() -> int:
    """The largest video accepted. Set VIDEO_MAX_MB to change it; anything unusable falls back to 200."""
    try:
        mb = int(os.environ.get("VIDEO_MAX_MB", DEFAULT_MAX_MB))
    except ValueError:
        mb = DEFAULT_MAX_MB
    return (mb if mb > 0 else DEFAULT_MAX_MB) * 1024 * 1024


def looks_like_video(head: bytes) -> bool:
    """True for the MP4 family (MP4, MOV, M4V): the file type box 'ftyp' sits at byte 4."""
    return len(head) >= 8 and head[4:8] == b"ftyp"


def _remove(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        pass


def extract_audio(src: str, dst: str, timeout: int = EXTRACT_TIMEOUT_SECONDS) -> None:
    """Write the sound of the video at `src` to `dst` as a mono MP3. Raises VideoError, leaving no `dst`."""
    cmd = [
        "ffmpeg", "-nostdin", "-y", "-v", "error", "-i", src,
        "-vn", "-ac", "1", "-ar", "44100", "-b:a", "32k", dst,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=timeout)
    except FileNotFoundError as exc:
        _remove(dst)
        _logger.error("event=video_extract_unavailable reason=ffmpeg_not_found")
        raise VideoError("unavailable", MSG_UNAVAILABLE) from exc
    except subprocess.TimeoutExpired as exc:
        _remove(dst)
        _logger.warning(f"event=video_extract_timeout seconds={timeout}")
        raise VideoError("timeout", MSG_TIMEOUT) from exc

    produced = os.path.exists(dst) and os.path.getsize(dst) > 0
    if result.returncode == 0 and produced:
        return

    _remove(dst)
    stderr = (result.stderr or b"").decode("utf-8", "replace")
    _logger.warning(f"event=video_extract_failed returncode={result.returncode} stderr={stderr[:300]!r}")
    if "does not contain any stream" in stderr or "matches no streams" in stderr:
        raise VideoError("no_audio", MSG_NO_AUDIO)
    raise VideoError("unreadable", MSG_UNREADABLE)
