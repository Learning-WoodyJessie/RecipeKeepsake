"""
CLI capture script — local development and testing only.

Runs the full pipeline (transcribe → translate → structure → Supabase insert)
directly from the command line without an HTTP server. Not a production code
path — the HTTP server (scripts/serve.py) handles capture in production via
the /capture and /capture/process + /capture/save endpoints.

Usage: python -m scripts.capture <audio_path> <audio_url>
"""
from tools.whisper import transcribe_audio
from tools.config import load_config
from prompts.translate_audio import translate_to_english
from prompts.structure import structure_recipe
from prompts.llm import OpenAIProvider
from tools.storage import insert_recipe


def process_recipe(audio_path: str) -> dict:
    """
    Run the pipeline without saving to Supabase.
    Returns: transcript_raw, transcript_english, dish_name, ingredients,
             steps, cook_notes, review_flags.
    No id, token, or audio_url — those come after the user reviews.
    """
    config = load_config()
    provider = OpenAIProvider(model=config["llm"]["model"])

    print("Transcribing...")
    transcript_raw = transcribe_audio(audio_path)

    print("Translating...")
    transcript_english = translate_to_english(transcript_raw, provider)

    print("Structuring...")
    structured = structure_recipe(transcript_english, provider)

    return {
        "transcript_raw": transcript_raw,
        "transcript_english": transcript_english,
        **structured,
    }


def capture(audio_path: str, audio_url: str) -> dict:
    """
    Orchestrate the full pipeline:
    audio file → Whisper → translate → structure → Supabase insert.
    Returns the saved recipe row.
    """
    config = load_config()
    provider = OpenAIProvider(model=config["llm"]["model"])

    print("Transcribing...")
    transcript_raw = transcribe_audio(audio_path)

    print("Translating...")
    transcript_english = translate_to_english(transcript_raw, provider)

    print("Structuring...")
    structured = structure_recipe(transcript_english, provider)

    recipe = {
        "audio_url": audio_url,
        "transcript_raw": transcript_raw,
        "transcript_english": transcript_english,
        **structured,
    }

    print("Storing...")
    return insert_recipe(recipe)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python -m scripts.capture <audio_path> <audio_url>")
        sys.exit(1)
    result = capture(sys.argv[1], sys.argv[2])
    print(f"\nRecipe saved!")
    print(f"  ID:    {result.get('id')}")
    print(f"  Dish:  {result.get('dish_name')}")
    print(f"  Token: {result.get('token')}")
