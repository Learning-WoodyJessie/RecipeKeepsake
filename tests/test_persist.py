"""
Tests for pipeline/persist.py — Stage 3: audio upload + recipe insert.
"""
from unittest.mock import patch
from pipeline.persist import run_persist
from pipeline.models import RecipeData


def _recipe(**kwargs):
    defaults = dict(
        title="Pesarattu", ingredients=[], steps=[],
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


class TestRunPersistStored:
    """Saving a reviewed capture job: the audio is already in storage, so it is only referenced."""

    def test_references_the_stored_audio_and_never_uploads(self):
        from pipeline.persist import run_persist_stored
        captured = {}
        with patch("pipeline.persist.upload_audio") as upload, \
             patch("pipeline.persist.insert_recipe", side_effect=_fake_insert(captured)):
            saved = run_persist_stored(_recipe(), stored_path="abc.mp3", narrator="Lakshmi", user_id="u1")
        upload.assert_not_called()
        assert captured["audio_url"] == "abc.mp3"
        assert saved.audio_url == "abc.mp3" and saved.token == "t"

    def test_builds_exactly_the_same_row_as_run_persist(self):
        """The two paths must not drift: same fields, same values, apart from where the audio came from."""
        from pipeline.persist import run_persist_stored
        recipe = _recipe(title="Gongura", category="Pickles", ingredients=[{"item": "x"}], steps=["a"], cook_notes="n",
                         review_flags=["f"], transcript_raw="r", transcript_english="e", image_url="http://img")
        kwargs = dict(narrator="Lakshmi", user_id="u1", recorded_by_email="a@b.c", recorded_by_name="A B")
        old, new = {}, {}
        with patch("pipeline.persist.upload_audio", return_value="abc.mp3"), \
             patch("pipeline.persist.insert_recipe", side_effect=_fake_insert(old)):
            run_persist(recipe, audio_path="/tmp/a.mp3", audio_filename="abc.mp3", **kwargs)
        with patch("pipeline.persist.insert_recipe", side_effect=_fake_insert(new)):
            run_persist_stored(recipe, stored_path="abc.mp3", **kwargs)
        assert new == old
