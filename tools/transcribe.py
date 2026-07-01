"""
Whisper transcription with Telugu cooking glossary injection.

Passes a terse cooking vocabulary list as initial_prompt so the model spells
Telugu terms correctly (e.g. 'konchem' not 'konjam'). The glossary is loaded from
data/telugu_cooking_terms.yaml at call time — add new terms there, no code change needed.

D-002: the prompt deliberately omits term meanings/definitions (see
build_glossary_terms_list) and temperature is pinned to 0 — both reduce the
model's tendency to fabricate a plausible-sounding continuation when the
narrator stops mid-sentence.
"""
from openai import OpenAI
from tools.glossary import build_glossary_terms_list

_WHISPER_PREFIX = "Telugu cooking terms: {glossary}"

# If any sentence appears more than this many times consecutively it's a
# hallucination loop (Whisper fabricating into silence). Collapse the run.
_MAX_CONSECUTIVE_REPEATS = 2


def _strip_hallucination_loops(text: str) -> str:
    """Collapse consecutive repeated tokens caused by Whisper hallucinating into silence.

    Whisper (including gpt-4o-transcribe) sometimes locks onto the last real
    word or sentence and repeats it hundreds of times when the recording ends
    with silence. Handles two patterns:
      - Word-level: "మోటియింది మోటియింది మోటియింది ..." (no punctuation)
      - Sentence-level: "Add sugar. Add sugar. Add sugar. ..."
    Both are collapsed to at most _MAX_CONSECUTIVE_REPEATS copies.
    """
    import re

    # Pass 1: collapse consecutive identical word runs (catches unpunctuated loops)
    words = text.split()
    deduped: list[str] = []
    run = 0
    prev: str | None = None
    for w in words:
        if w == prev:
            run += 1
            if run <= _MAX_CONSECUTIVE_REPEATS:
                deduped.append(w)
        else:
            run = 1
            prev = w
            deduped.append(w)
    text = ' '.join(deduped)

    # Pass 2: collapse consecutive identical sentence runs (catches punctuated loops)
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    out: list[str] = []
    run = 0
    prev_s: str | None = None
    for s in sentences:
        if s == prev_s:
            run += 1
            if run <= _MAX_CONSECUTIVE_REPEATS:
                out.append(s)
        else:
            run = 1
            prev_s = s
            out.append(s)
    return ' '.join(out)


def transcribe_audio(audio_path: str) -> str:
    """Transcribe audio using gpt-4o-transcribe with language='te'.

    whisper-1 rejects language='te' and auto-detects Telugu as Hindi.
    gpt-4o-transcribe supports language='te' and produces correct Telugu script.
    The initial_prompt seeds the model with cooking-specific vocabulary so
    common terms like 'konchem' (a little) are spelled correctly. temperature=0
    keeps transcription deterministic and avoids the model "filling in" content
    that wasn't actually spoken (D-002).
    """
    client = OpenAI()
    prompt = _WHISPER_PREFIX.format(glossary=build_glossary_terms_list())
    with open(audio_path, "rb") as f:
        transcript = client.audio.transcriptions.create(
            model="gpt-4o-transcribe",
            file=f,
            language="te",
            prompt=prompt,
            temperature=0,
        )
    return _strip_hallucination_loops(transcript.text)
