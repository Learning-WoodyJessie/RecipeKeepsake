"""
RecipeKeepsake API server.

Local dev:
    python -m scripts.serve         → http://localhost:8080

Production (Railway):
    Reads PORT from environment. Set env vars in Railway dashboard.
"""

import os
import tempfile
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root — no-op in production (Railway sets env vars directly)
load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from tools.transcribe import transcribe_audio
from prompts.translate import translate_to_english
from prompts.structure import structure_recipe
from prompts.llm import OpenAIProvider

import yaml

_CONFIG_PATH = Path(__file__).parent.parent / "data" / "config.yaml"
_WEB_DIR = Path(__file__).parent.parent / "web"

# CORS — allow localhost in dev, Vercel URL in prod via ALLOWED_ORIGINS env var
_ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080"
).split(",")


def _load_config() -> dict:
    with open(_CONFIG_PATH) as f:
        return yaml.safe_load(f)


app = FastAPI(title="RecipeKeepsake API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def index():
    html = _WEB_DIR / "prototype.html"
    if html.exists():
        return FileResponse(html)
    return JSONResponse(content={"status": "RecipeKeepsake API running"})


@app.get("/recipes")
async def list_recipes_endpoint():
    """Return all recipes for the blog home page."""
    if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")):
        return JSONResponse(content={"recipes": []})
    from tools.storage import list_recipes
    return JSONResponse(content={"recipes": list_recipes()})


@app.post("/capture")
async def capture_endpoint(audio: UploadFile = File(...)):
    """
    Accept an audio file, run the full pipeline, return structured recipe JSON.
    Supabase storage is optional — skip by omitting env vars (useful for local testing).
    """
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

    config = _load_config()
    provider = OpenAIProvider(model=config["llm"]["model"])

    suffix = Path(audio.filename).suffix if audio.filename else ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        print(f"[serve] Transcribing {audio.filename}...")
        transcript_raw = transcribe_audio(tmp_path)
        print(f"[serve] Transcript: {transcript_raw[:120]}...")

        print("[serve] Translating...")
        transcript_english = translate_to_english(transcript_raw, provider)

        print("[serve] Structuring...")
        structured = structure_recipe(transcript_english, provider)
        print(f"[serve] Dish: {structured.get('dish_name')}")

        print("[serve] Generating image...")
        image_url = ""
        try:
            from prompts.image import generate_dish_image
            image_url = generate_dish_image(structured.get("dish_name") or "Indian dish")
        except Exception as img_err:
            print(f"[serve] Image generation failed (non-fatal): {img_err}")

        recipe = {
            "transcript_raw": transcript_raw,
            "transcript_english": transcript_english,
            "image_url": image_url,
            **structured,
        }

        if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY"):
            from tools.storage import insert_recipe
            stored = insert_recipe({**recipe, "audio_url": ""})
            recipe["id"] = stored.get("id")
            recipe["token"] = stored.get("token")
            print(f"[serve] Saved: {recipe.get('id')}")
        else:
            print("[serve] No Supabase env — skipping storage")

        return JSONResponse(content=recipe)

    except Exception as e:
        print(f"[serve] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        os.unlink(tmp_path)


class ImageRequest(BaseModel):
    dish_name: str


@app.post("/generate-image")
async def generate_image_endpoint(body: ImageRequest):
    """Generate a DALL-E image for a dish name. Returns image URL."""
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

    from prompts.image import generate_dish_image
    try:
        url = generate_dish_image(body.dish_name)
        return JSONResponse(content={"image_url": url})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("scripts.serve:app", host="0.0.0.0", port=port, reload=False)
