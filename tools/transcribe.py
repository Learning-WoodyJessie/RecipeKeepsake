"""
Gemini-based Telugu audio transcription with OpenAI Whisper fallback.

Primary: gemini-2.5-flash — best Telugu dialect coverage (Telangana, Andhra,
Rayalaseema, Hyderabadi). The dialect-aware prompt preserves regional verb forms
and cooking vocabulary that generic transcription models normalise away.

Fallback chain on 503/capacity errors:
  1. gemini-2.5-flash  (best quality)
  2. gemini-2.0-flash  (still strong Telugu, usually less congested)
  3. OpenAI whisper-1  (lower Telugu accuracy but highly available)

D-002: _strip_hallucination_loops() is kept as a post-processing safety net —
Gemini can still occasionally loop on silence, though far less than Whisper.
"""
import logging
import mimetypes
import os
import time

from google import genai
from openai import OpenAI

from tools.glossary import build_glossary_terms_list

_logger = logging.getLogger(__name__)

_MODEL_PRIMARY  = "gemini-2.5-flash"
_MODEL_FALLBACK = "gemini-2.0-flash"

_PROMPT_TELUGU = """\
Transcribe the following Telugu audio recording accurately.

Rules:
- The speaker may use Telangana, Andhra, Rayalaseema, or Hyderabadi dialect.
- Use your knowledge of Telugu dialects to write the CORRECT Telugu spelling of \
dialect words — even when they sound phonetically different from standard Telugu. \
For example: if you hear "thaida pindi" recognise it as తైదా పిండి (ragi flour), \
not a phonetic guess. If you hear "poshi pettali" write పోషి పెట్టాలి, not వోష్.
- Preserve dialectal verb forms exactly (e.g. Telangana -లి endings: పెట్టాలి, చేయాలి).
- Return only the transcription in Telugu script. No English explanations, no \
translation, no commentary.
- If the speaker code-switches into English mid-sentence, transcribe those words \
in English as spoken.
- Telugu cooking vocabulary that may appear: {glossary}
"""

_PROMPT_ENGLISH = """\
Transcribe the following audio recording accurately in English.

Rules:
- Return only the transcription. No explanations, no commentary.
- Preserve the speaker's exact words including hesitations and pauses if meaningful.
- If the speaker uses any Telugu or Indian language words, transcribe them phonetically.
"""

_PROMPT_AUTO = """\
Transcribe the following audio recording accurately.

Rules:
- Detect the spoken language automatically and transcribe in that language.
- If the speaker is speaking Telugu (Telangana, Andhra, Rayalaseema, or Hyderabadi \
dialect), transcribe in Telugu script and preserve dialectal forms exactly. \
Telugu cooking vocabulary that may appear: {glossary}
- If the speaker is speaking English, transcribe in English.
- If the speaker code-switches between languages mid-sentence, reflect that in the \
transcription (Telugu words in Telugu script, English words in English).
- Return only the transcription. No explanations, no translation, no commentary.
"""

# If any word/phrase appears more than this many times consecutively it's a
# hallucination loop (model fabricating into silence). Collapse the run.
_MAX_CONSECUTIVE_REPEATS = 1


def _collapse_ngram_runs(words: list[str], n: int) -> list[str]:
    """Collapse consecutive runs of identical n-grams to _MAX_CONSECUTIVE_REPEATS copies.

    Works for any phrase length n. Running for n=1..6 catches:
      n=1 — "మోటియింది మోటియింది మోటియింది"  (single word repeating)
      n=2 — "పిండీ కలపాలు పిండీ కలపాలు"      (bigram alternating, no punctuation)
      n=3+ — longer phrase loops
    """
    result: list[str] = []
    i = 0
    while i <= len(words) - n:
        phrase = tuple(words[i:i + n])
        j = i
        while j + n <= len(words) and tuple(words[j:j + n]) == phrase:
            j += n
        reps = (j - i) // n
        if reps > _MAX_CONSECUTIVE_REPEATS:
            for _ in range(_MAX_CONSECUTIVE_REPEATS):
                result.extend(phrase)
            i = j
        else:
            result.append(words[i])
            i += 1
    result.extend(words[i:])
    return result


def _strip_hallucination_loops(text: str) -> str:
    """Collapse consecutive repeated tokens caused by the model hallucinating into silence.

    Three patterns handled:
      - Sentence-level: "Add sugar. Add sugar. Add sugar. ..."  (punctuated)
      - Word-level:     "మోటియింది మోటియింది ..."              (single word, no punctuation)
      - Bigram-level:   "పిండీ కలపాలు పిండీ కలపాలు ..."       (alternating pair, no punctuation)
    """
    import re

    # Pass 1: sentence-level dedup (punctuated loops)
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    out: list[str] = []
    prev_s: str | None = None
    for s in sentences:
        if s != prev_s:
            out.append(s)
        prev_s = s
    text = ' '.join(out)

    # Pass 2: n-gram run dedup for n=1..6 (unpunctuated alternating loops)
    words = text.split()
    for n in range(1, 7):
        words = _collapse_ngram_runs(words, n)
    return ' '.join(words)


def _mime_type(audio_path: str) -> str:
    mime, _ = mimetypes.guess_type(audio_path)
    # Python's mimetypes registers .webm as video/webm and .m4a as None or
    # video/mp4. Gemini File API rejects audio sent as a video MIME type.
    # Force the correct audio MIME for all formats we record from browsers.
    if not mime or mime in ("video/mp4", "video/webm"):
        ext = os.path.splitext(audio_path)[1].lower()
        return {".m4a": "audio/mp4", ".mp3": "audio/mpeg",
                ".wav": "audio/wav", ".webm": "audio/webm", ".ogg": "audio/ogg"}.get(ext, "audio/mp4")
    return mime


def _is_overloaded(e: Exception) -> bool:
    msg = str(e).lower()
    return any(k in msg for k in ("unavailable", "high demand", "try again later", "resource_exhausted", "overloaded", "503"))


def _gemini_transcribe(audio_path: str, model: str, prompt: str) -> str:
    """Upload audio to Gemini Files API and run transcription with the given model."""
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    audio_file = client.files.upload(
        file=audio_path,
        config={"mime_type": _mime_type(audio_path)},
    )

    for _ in range(20):
        audio_file = client.files.get(name=audio_file.name)
        if audio_file.state.name == "ACTIVE":
            break
        if audio_file.state.name == "FAILED":
            raise RuntimeError(f"Gemini file processing failed: {audio_file.name}")
        time.sleep(2)
    else:
        raise RuntimeError(f"Gemini file never became ACTIVE: {audio_file.name}")

    response = client.models.generate_content(model=model, contents=[prompt, audio_file])
    if not response.text:
        raise RuntimeError(f"Gemini ({model}) returned empty transcription — possible content filter or unsupported audio")
    return _strip_hallucination_loops(response.text)


def _whisper_transcribe(audio_path: str, language: str) -> str:
    """Fallback: OpenAI Whisper transcription."""
    glossary = build_glossary_terms_list()
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    whisper_lang = "te" if language in ("te", "auto") else "en"
    with open(audio_path, "rb") as f:
        resp = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            language=whisper_lang,
            # glossary hint improves Telugu cooking term recognition
            prompt=f"Telugu cooking vocabulary: {glossary[:300]}" if whisper_lang == "te" else None,
        )
    return resp.text


def transcribe_audio(audio_path: str, language: str = "auto") -> str:
    """Transcribe audio with automatic fallback on capacity errors.

    Tries gemini-2.5-flash first (best Telugu dialect quality), falls back to
    gemini-2.0-flash, then OpenAI whisper-1 as a last resort.
    """
    glossary = build_glossary_terms_list()
    if language == "en":
        prompt = _PROMPT_ENGLISH
    elif language == "te":
        prompt = _PROMPT_TELUGU.format(glossary=glossary)
    else:
        prompt = _PROMPT_AUTO.format(glossary=glossary)

    # 1. Primary: gemini-2.5-flash
    primary_error: Exception | None = None
    try:
        result = _gemini_transcribe(audio_path, _MODEL_PRIMARY, prompt)
        _logger.info("event=transcribe_model model=gemini-2.5-flash")
        return result
    except Exception as e:
        primary_error = e
        _logger.warning(f"event=transcribe_fallback model={_MODEL_PRIMARY} error={type(e).__name__}: {e}")

    # 2. Fallback: gemini-2.0-flash
    try:
        result = _gemini_transcribe(audio_path, _MODEL_FALLBACK, prompt)
        _logger.info("event=transcribe_model model=gemini-2.0-flash")
        return result
    except Exception as e:
        _logger.warning(f"event=transcribe_fallback model={_MODEL_FALLBACK} error={type(e).__name__}: {e}")

    # 3. Last resort: OpenAI Whisper
    _logger.warning("event=transcribe_fallback model=whisper-1")
    return _whisper_transcribe(audio_path, language)
