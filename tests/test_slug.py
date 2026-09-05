"""
Tests for tools/storage.py's _to_slug() — memory-title -> URL slug conversion.

Telugu (and other abugida scripts) carry vowel sounds via combining marks:
vowel signs and the virama, both Unicode category Mn. A \\w-based regex only
matches letters, not marks, so it silently drops them instead of preserving
the word — turning "కోకోనట్ జెల్లీ" (coconut jelly) into "కకనట-జలల", a
different and wrong string that still looks like a plausible slug.
"""
from tools.storage import _to_slug


class TestToSlugAsciiUnchanged:
    def test_lowercases_and_hyphenates(self):
        assert _to_slug("Gongura Pachadi") == "gongura-pachadi"

    def test_strips_punctuation(self):
        assert _to_slug("Chinthapandu Chutney's Recipe!") == "chinthapandu-chutneys-recipe"

    def test_collapses_repeated_separators(self):
        assert _to_slug("Dad's   song -- 1") == "dads-song-1"

    def test_truncates_to_80_chars(self):
        assert len(_to_slug("a" * 200)) == 80


class TestToSlugPreservesAbugidaScripts:
    def test_telugu_vowel_signs_and_virama_survive(self):
        # Coconut Jelly. Regression test for the bug reported against
        # /memory/కకనట-జలల-d6478a5b — the vowel signs and virama vanished.
        assert _to_slug("కోకోనట్ జెల్లీ") == "కోకోనట్-జెల్లీ"

    def test_telugu_recipe_titles_from_production_data(self):
        assert _to_slug("బియ్యప్పోశ") == "బియ్యప్పోశ"

    def test_mixed_script_title(self):
        assert _to_slug("Amma's బియ్యప్పోశ Recipe") == "ammas-బియ్యప్పోశ-recipe"
