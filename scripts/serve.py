"""
Local dev server for testing the full voice → recipe pipeline.

Usage:
    export OPENAI_API_KEY=sk-...
    export SUPABASE_URL=...          # optional — skip to test without storing
    export SUPABASE_SERVICE_KEY=...  # optional
    python -m scripts.serve

Then open http://localhost:8000 in your browser (or on your phone via local IP).
"""

import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from tools.transcribe import transcribe_audio
from prompts.translate import translate_to_english
from prompts.structure import structure_recipe
from prompts.llm import OpenAIProvider

import yaml

_CONFIG_PATH = Path(__file__).parent.parent / "data" / "config.yaml"
_WEB_DIR = Path(__file__).parent.parent / "web"


def _load_config() -> dict:
    with open(_CONFIG_PATH) as f:
        return yaml.safe_load(f)


app = FastAPI(title="RecipeKeepsake")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def index():
    return FileResponse(_WEB_DIR / "index.html")


@app.post("/capture")
async def capture_endpoint(audio: UploadFile = File(...)):
    """
    Accept an audio file, run the full pipeline, return structured recipe JSON.
    Supabase storage is optional — if env vars are missing, result is returned
    without storing (useful for testing without a live DB).
    """
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

    config = _load_config()
    provider = OpenAIProvider(model=config["llm"]["model"])

    # Save uploaded audio to a temp file
    suffix = Path(audio.filename).suffix if audio.filename else ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        # Step 1 — Transcribe
        print(f"[serve] Transcribing {audio.filename}...")
        transcript_raw = transcribe_audio(tmp_path)
        print(f"[serve] Raw transcript: {transcript_raw[:120]}...")

        # Step 2 — Translate
        print("[serve] Translating...")
        transcript_english = translate_to_english(transcript_raw, provider)
        print(f"[serve] English: {transcript_english[:120]}...")

        # Step 3 — Structure
        print("[serve] Structuring...")
        structured = structure_recipe(transcript_english, provider)
        print(f"[serve] Dish: {structured.get('dish_name')}")

        recipe = {
            "transcript_raw": transcript_raw,
            "transcript_english": transcript_english,
            **structured,
        }

        # Step 4 — Store (optional)
        if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY"):
            from tools.storage import insert_recipe
            audio_url = ""  # no Supabase Storage upload in this prototype
            stored = insert_recipe({**recipe, "audio_url": audio_url})
            recipe["id"] = stored.get("id")
            recipe["token"] = stored.get("token")
            print(f"[serve] Saved to Supabase: {recipe.get('id')}")
        else:
            print("[serve] Supabase env vars not set — skipping storage")

        return JSONResponse(content=recipe)

    except Exception as e:
        print(f"[serve] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        os.unlink(tmp_path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("scripts.serve:app", host="0.0.0.0", port=8000, reload=True)
