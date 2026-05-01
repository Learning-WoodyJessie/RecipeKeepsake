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
    def test_writes_merged_translations(self):
        """cache_translation() merges new lang entry into existing translations and updates row."""
        existing = {"hi": {"dish_name": "रागी मुद्दा"}}
        new_data = {"dish_name": "ರಾಗಿ ಮುದ್ದೆ", "ingredients": [], "steps": [], "cook_notes": ""}

        with patch("tools.storage._client") as mock_client:
            sb = _mock_sb()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "translations": existing
            }
            cache_translation("abc", "kn", new_data)

            update_call = sb.table.return_value.update.call_args
            written = update_call[0][0]["translations"]
            assert "hi" in written
            assert "kn" in written
            assert written["kn"]["dish_name"] == "ರಾಗಿ ಮುದ್ದೆ"
