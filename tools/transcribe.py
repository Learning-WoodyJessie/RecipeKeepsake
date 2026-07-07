"""
Gemini-based Telugu audio transcription.

Uses gemini-2.5-flash instead of gpt-4o-transcribe because Gemini was trained
on significantly more South Asian language data and handles Telugu regional
dialects (Telangana, Andhra, Rayalaseema, Hyderabadi) far better than a model
primarily optimised for English. The dialect-aware prompt gives the model
explicit context that gpt-4o-transcribe's `initial_prompt` parameter cannot
express.

D-002: _strip_hallucination_loops() is kept as a post-processing safety net —
Gemini can still occasionally loop on silence, though far less than Whisper.
"""
import mimetypes
import os

from google import genai

from tools.glossary import build_glossary_terms_list

_MODEL = "gemini-2.5-flash"

_TRANSCRIPTION_PROMPT = """\
Transcribe the following Telugu audio recording exactly as spoken.

Rules:
- The speaker may use Telangana, Andhra, Rayalaseema, or Hyderabadi dialect — \
preserve all dialect-specific words, verb forms, and Urdu/Persian loanwords exactly \
as spoken (e.g. Telangana -లి endings like పెట్టాలి, చేయాలి; words like పోషి, పెన్నం).
- Return only the transcription in Telugu script. No English explanations, no \
translation, no commentary.
- If the speaker code-switches into English mid-sentence, transcribe those words \
in English as spoken.
- Do not correct, standardise, or normalise dialect words to formal Telugu.
- Telugu cooking vocabulary that may appear: {glossary}
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
    # m4a files report as None or video/mp4 — force correct audio MIME
    if not mime or mime == "video/mp4":
        ext = os.path.splitext(audio_path)[1].lower()
        return {"m4a": "audio/mp4", ".m4a": "audio/mp4", ".mp3": "audio/mpeg",
                ".wav": "audio/wav", ".webm": "audio/webm", ".ogg": "audio/ogg"}.get(ext, "audio/mp4")
    return mime


def transcribe_audio(audio_path: str) -> str:
    """Transcribe audio using Gemini 2.5 Flash with a dialect-aware Telugu prompt.

    Gemini handles Telugu regional dialects (Telangana, Andhra, Rayalaseema,
    Hyderabadi) far better than gpt-4o-transcribe because its training data
    includes far more South Asian language content. The prompt explicitly tells
    the model to preserve dialectal verb forms (-లి endings), Urdu borrowings,
    and domain-specific cooking vocabulary rather than normalising to formal Telugu.

    Audio is uploaded via the Gemini File API (size-independent) and the file
    reference passed to generate_content alongside the transcription prompt.
    """
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    prompt = _TRANSCRIPTION_PROMPT.format(glossary=build_glossary_terms_list())

    audio_file = client.files.upload(
        file=audio_path,
        config={"mime_type": _mime_type(audio_path)},
    )

    response = client.models.generate_content(
        model=_MODEL,
        contents=[prompt, audio_file],
    )

    return _strip_hallucination_loops(response.text)
