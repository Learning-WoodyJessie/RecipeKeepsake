"""
Tests for pipeline/persist.py — Stage 3: audio upload + recipe insert.
"""
from unittest.mock import patch
from pipeline.persist import run_persist
from pipeline.models import RecipeData


def _recipe(**kwargs):
    defaults = dict(
        dish_name="Pesarattu", ingredients=[], steps=[],
        cook_notes="", review_flags=[], transcript_raw="",
        transcript_english="", image_url="", category="",
    )
    return RecipeData(**{**defaults, **kwargs})


def _fake_insert(captured: dict):
    def _inner(row):
        captured.update(row)
        return {"id": "x", "token": "t", "audio_url": ""}
    return _inner


class TestRunPersist:
    def test_inserts_type_recipe(self):
        """run_persist() always writes type='recipe' — only used for the AI pipeline."""
        captured = {}
        with patch("pipeline.persist.upload_audio"), \
             patch("pipeline.persist.insert_recipe", side_effect=_fake_insert(captured)):
            run_persist(_recipe(), audio_path="/tmp/a.m4a", audio_filename="a.m4a")

        assert captured["type"] == "recipe"

    def test_type_independent_of_category(self):
        """Category goes into tags; type is always 'recipe' regardless of category."""
        captured = {}
        with patch("pipeline.persist.upload_audio"), \
             patch("pipeline.persist.insert_recipe", side_effect=_fake_insert(captured)):
            run_persist(_recipe(category="Snacks"), audio_path="/tmp/a.m4a", audio_filename="a.m4a")

        assert captured["type"] == "recipe"
        assert "Snacks" in captured["tags"]

    def test_returns_saved_recipe_with_id_and_token(self):
        """run_persist() returns a SavedRecipe with the id and token from the DB row."""
        with patch("pipeline.persist.upload_audio"), \
             patch("pipeline.persist.insert_recipe", return_value={"id": "abc", "token": "tok", "audio_url": "f.m4a"}):
            result = run_persist(_recipe(), audio_path="/tmp/a.m4a", audio_filename="a.m4a")

        assert result.id == "abc"
        assert result.token == "tok"
