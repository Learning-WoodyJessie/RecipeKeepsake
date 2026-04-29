from openai import OpenAI


def transcribe_audio(audio_path: str) -> str:
    """Call Whisper API with language='te'. Returns raw transcript text."""
    client = OpenAI()
    with open(audio_path, "rb") as f:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            language="te",
        )
    return transcript.text
