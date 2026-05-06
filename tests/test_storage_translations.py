from unittest.mock import patch, MagicMock
from tools.storage import get_cached_translation, cache_translation


def _mock_sb():
    """Return a MagicMock that mimics the Supabase client chain."""
    return MagicMock()


class TestGetCachedTranslation:
    def test_returns_cached_data_when_present(self):
        """get_cached_translation() returns the stored dict when lang key exists."""
        fake_data = {"translations": {"hi": {"dish_name": "रागी मुद्दा", "ingredients": [], "steps": [], "cook_notes": ""}}}
        with patch("tools.storage._client") as mock_client:
            sb = _mock_sb()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = fake_data
            result = get_cached_translation("abc", "hi")
        assert result["dish_name"] == "रागी मुद्दा"

    def test_returns_none_when_lang_not_cached(self):
        """get_cached_translation() returns None when the lang key is absent."""
        fake_data = {"translations": {}}
        with patch("tools.storage._client") as mock_client:
            sb = _mock_sb()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = fake_data
            result = get_cached_translation("abc", "te")
        assert result is None

    def test_returns_none_when_translations_column_null(self):
        """get_cached_translation() handles recipes with translations=None gracefully."""
        fake_data = {"translations": None}
        with patch("tools.storage._client") as mock_client:
            sb = _mock_sb()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = fake_data
            result = get_cached_translation("abc", "fr")
        assert result is None


class TestCacheTranslation:
    def test_cache_translation_uses_rpc(self, monkeypatch):
        """cache_translation() calls set_recipe_translation RPC, not table read-modify-write."""
        import tools.storage as s
        mock_sb = MagicMock()
        monkeypatch.setattr(s, "_supabase", mock_sb)
        s.cache_translation("tok-abc", "te", {"dish_name": "పెసరట్టు"})
        mock_sb.rpc.assert_called_once_with(
            "set_recipe_translation",
            {"p_token": "tok-abc", "p_lang": "te", "p_data": {"dish_name": "పెసరట్టు"}},
        )
        mock_sb.table.assert_not_called()

    def test_cache_translation_different_langs_use_separate_rpc_calls(self, monkeypatch):
        """Two cache_translation() calls for different langs each call set_recipe_translation once."""
        import tools.storage as s
        mock_sb = MagicMock()
        monkeypatch.setattr(s, "_supabase", mock_sb)
        s.cache_translation("tok-xyz", "hi", {"dish_name": "पेसरट्टू"})
        s.cache_translation("tok-xyz", "kn", {"dish_name": "ರಾಗಿ ಮುದ್ದೆ"})
        assert mock_sb.rpc.call_count == 2
        mock_sb.table.assert_not_called()
