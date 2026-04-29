from openai import OpenAI


def transcribe_audio(audio_path: str) -> str:
    """Call Whisper API — auto-detect language (Telugu + English code-switching).
    Note: Whisper API rejects 'te' as unsupported despite ISO-639-1 being correct.
    Auto-detection handles Telugu reliably in practice.
    """
    client = OpenAI()
    with open(audio_path, "rb") as f:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
        )
    return transcript.text
