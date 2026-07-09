"""
CLI capture script — local development and testing only.

Runs the full pipeline (transcribe → translate → structure → Supabase insert)
directly from the command line without an HTTP server. Not a production code
path — the HTTP server (scripts/serve.py) handles capture in production via
the /capture and /capture/process + /capture/save endpoints.

Usage: python -m scripts.capture <audio_path> <audio_url>
"""
from pipeline.transcribe import run_transcribe
from pipeline.transform import run_transform
from tools.storage import insert_recipe


def process_recipe(audio_path: str) -> dict:
    """
    Run the pipeline without saving to Supabase.
    Returns: transcript_raw, transcript_english, dish_name, ingredients,
             steps, cook_notes, review_flags.
    No id, token, or audio_url — those come after the user reviews.
    """
    transcript = run_transcribe(audio_path)
    recipe_data = run_transform(transcript)
    return {
        "transcript_raw": recipe_data.transcript_raw,
        "transcript_english": recipe_data.transcript_english,
        "title": recipe_data.title,
        "ingredients": recipe_data.ingredients,
        "steps": recipe_data.steps,
        "cook_notes": recipe_data.cook_notes,
        "review_flags": recipe_data.review_flags,
    }


def capture(audio_path: str, audio_url: str) -> dict:
    """
    Orchestrate the full pipeline:
    audio file → Whisper → translate → structure → Supabase insert.
    Returns the saved recipe row.
    """
    transcript = run_transcribe(audio_path)
    recipe_data = run_transform(transcript)
    recipe = {
        "audio_url": audio_url,
        "transcript_raw": recipe_data.transcript_raw,
        "transcript_english": recipe_data.transcript_english,
        "title": recipe_data.title,
        "ingredients": recipe_data.ingredients,
        "steps": recipe_data.steps,
        "cook_notes": recipe_data.cook_notes,
        "review_flags": recipe_data.review_flags,
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
