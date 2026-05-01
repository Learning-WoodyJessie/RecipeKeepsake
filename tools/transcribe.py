"""
Whisper transcription with Telugu cooking glossary injection.

Passes a cooking glossary as initial_prompt so the model spells Telugu terms
correctly (e.g. 'konchem' not 'konjam'). The glossary is loaded from
data/telugu_cooking_terms.yaml at call time — add new terms there, no code change needed.
"""
from openai import OpenAI
from tools.glossary import build_glossary_hint

_WHISPER_PREFIX = (
    "This is a Telugu cooking recipe narration. "
    "Telugu cooking vocabulary: {glossary}"
)


def transcribe_audio(audio_path: str) -> str:
    """Transcribe audio using gpt-4o-transcribe with language='te'.

    whisper-1 rejects language='te' and auto-detects Telugu as Hindi.
    gpt-4o-transcribe supports language='te' and produces correct Telugu script.
    The initial_prompt seeds the model with cooking-specific vocabulary so
    common terms like 'konchem' (a little) are spelled correctly.
    """
    client = OpenAI()
    prompt = _WHISPER_PREFIX.format(glossary=build_glossary_hint())
    with open(audio_path, "rb") as f:
        transcript = client.audio.transcriptions.create(
            model="gpt-4o-transcribe",
            file=f,
            language="te",
            initial_prompt=prompt,
        )
    return transcript.text
