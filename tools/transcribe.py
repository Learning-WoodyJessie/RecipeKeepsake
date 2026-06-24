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
    return transcript.text
