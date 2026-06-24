from tools.glossary import load_glossary, build_glossary_hint, build_glossary_terms_list


class TestLoadGlossary:
    def test_returns_dict(self):
        g = load_glossary()
        assert isinstance(g, dict)

    def test_konchem_present(self):
        g = load_glossary()
        assert "konchem" in g

    def test_variants_listed(self):
        g = load_glossary()
        assert "konjam" in g["konchem"]["variants"]


class TestBuildGlossaryHint:
    def test_returns_string(self):
        hint = build_glossary_hint()
        assert isinstance(hint, str)

    def test_contains_konchem(self):
        hint = build_glossary_hint()
        assert "konchem" in hint.lower()

    def test_contains_meaning(self):
        hint = build_glossary_hint()
        assert "little" in hint.lower() or "small amount" in hint.lower()


class TestBuildGlossaryTermsList:
    """D-002: Whisper's initial_prompt uses a terse term list, not full meanings."""

    def test_returns_string(self):
        terms = build_glossary_terms_list()
        assert isinstance(terms, str)

    def test_contains_konchem(self):
        terms = build_glossary_terms_list()
        assert "konchem" in terms.lower()

    def test_omits_meanings(self):
        terms = build_glossary_terms_list()
        assert "little" not in terms.lower()
        assert "small amount" not in terms.lower()
