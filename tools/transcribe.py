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

_WHISPER_PREFIX = "తెలుగు వంటకాలు: {glossary}"

# If any word/phrase appears more than this many times consecutively it's a
# hallucination loop (Whisper fabricating into silence). Collapse the run.
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
    """Collapse consecutive repeated tokens caused by Whisper hallucinating into silence.

    Whisper (including gpt-4o-transcribe) locks onto the last real word or phrase
    and repeats it hundreds of times when the recording ends with silence. Three
    patterns handled:
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
