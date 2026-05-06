"""
Pipeline stage interfaces.

Each stage transforms one model into the next:

  audio_path: str
      └─ Stage 1 (transcribe)  → TranscriptResult
          └─ Stage 2 (transform) → RecipeData
              └─ Stage 3 (persist)   → SavedRecipe

Design principle: stages are pure functions — they receive typed input and return
typed output. HTTP concerns (temp files, multipart forms, auth) live in serve.py only.
"""
from dataclasses import dataclass, field


@dataclass
class TranscriptResult:
    """Output of Stage 1: Whisper transcription + faithful English translation."""
    raw: str      # Verbatim Whisper output (Telugu script + code-switching)
    english: str  # Faithful English translation (Call A — no normalisation)


@dataclass
class RecipeData:
    """Output of Stage 2: structured recipe ready for human review."""
    dish_name: str
    ingredients: list          # [{"item": str, "quantity": str}]
    steps: list                # ["step text", ...]
    cook_notes: str            # vague instructions preserved verbatim
    review_flags: list         # ["possible implied step: drain water", ...]
    transcript_raw: str
    transcript_english: str
    image_url: str = ""        # populated post-structure by image stage in serve.py
    category: str = "Other"    # meal category assigned by Call B LLM


@dataclass
class SavedRecipe:
    """Output of Stage 3: Supabase insert result."""
    id: str
    token: str
    audio_url: str
