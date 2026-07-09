from pipeline.models import TranscriptResult, RecipeData, SavedRecipe


class TestTranscriptResult:
    def test_fields(self):
        t = TranscriptResult(raw="raw", english="eng")
        assert t.raw == "raw"
        assert t.english == "eng"


class TestRecipeData:
    def test_fields(self):
        r = RecipeData(
            title="Pesarattu",
            ingredients=[{"item": "moong dal", "quantity": "1 cup"}],
            steps=["Soak dal", "Grind"],
            cook_notes="konchem salt",
            review_flags=[],
            transcript_raw="raw",
            transcript_english="eng",
        )
        assert r.title == "Pesarattu"
        assert r.image_url == ""       # default
        assert r.category == "Other"   # default

    def test_category_explicit(self):
        r = RecipeData(
            title="Idli",
            ingredients=[],
            steps=[],
            cook_notes="",
            review_flags=[],
            transcript_raw="",
            transcript_english="",
            category="Breakfast",
        )
        assert r.category == "Breakfast"

    def test_ingredients_list(self):
        r = RecipeData(
            title="Test",
            ingredients=[{"item": "oil", "quantity": "konchem"}],
            steps=[],
            cook_notes="",
            review_flags=[],
            transcript_raw="",
            transcript_english="",
        )
        assert r.ingredients[0]["quantity"] == "konchem"


class TestSavedRecipe:
    def test_fields(self):
        s = SavedRecipe(id="uuid-123", token="tok", audio_url="https://example.com/a.webm")
        assert s.id == "uuid-123"
        assert s.token == "tok"
        assert s.audio_url == "https://example.com/a.webm"
