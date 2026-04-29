from openai import OpenAI


def transcribe_audio(audio_path: str) -> str:
    """Transcribe audio using gpt-4o-transcribe with language='te'.
    whisper-1 rejects language='te' and auto-detects Telugu as Hindi.
    gpt-4o-transcribe supports language='te' and produces correct Telugu script.
    """
    client = OpenAI()
    with open(audio_path, "rb") as f:
        transcript = client.audio.transcriptions.create(
            model="gpt-4o-transcribe",
            file=f,
            language="te",
        )
    return transcript.text
