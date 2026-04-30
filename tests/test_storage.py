from unittest.mock import patch, MagicMock
from tools.storage import insert_recipe, get_recipe_by_token, list_recipes, store_image


def _mock_supabase(return_data):
    mock_client = MagicMock()
    mock_client.table.return_value.insert.return_value.execute.return_value.data = [return_data]
    mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = return_data
    return mock_client


class TestInsertRecipe:
    def test_returns_inserted_row(self, monkeypatch):
        """insert_recipe() returns the first element of result.data."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        expected = {"id": "abc-123", "dish_name": "Pesarattu"}

        with patch("tools.storage.create_client", return_value=_mock_supabase(expected)):
            result = insert_recipe({"dish_name": "Pesarattu"})

        assert result == expected

    def test_inserts_into_recipes_table(self, monkeypatch):
        """insert_recipe() targets the 'recipes' table."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        mock_client = _mock_supabase({"id": "abc"})

        with patch("tools.storage.create_client", return_value=mock_client):
            insert_recipe({"dish_name": "Pesarattu"})

        mock_client.table.assert_called_with("recipes")


class TestGetRecipeByToken:
    def test_returns_recipe_data(self, monkeypatch):
        """get_recipe_by_token() returns result.data for the matching token."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        expected = {"id": "abc-123", "token": "tok-xyz", "dish_name": "Pesarattu"}

        with patch("tools.storage.create_client", return_value=_mock_supabase(expected)):
            result = get_recipe_by_token("tok-xyz")

        assert result == expected


class TestListRecipes:
    def test_returns_list(self, monkeypatch):
        """list_recipes(user_id) returns a list of recipe summaries for that user."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        expected = [{"id": "abc", "dish_name": "Pesarattu", "token": "tok-1"}]
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = expected

        with patch("tools.storage.create_client", return_value=mock_client):
            result = list_recipes("user-123")

        assert result == expected

    def test_filters_by_user_id(self, monkeypatch):
        """list_recipes(user_id) filters by the given user_id."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []

        with patch("tools.storage.create_client", return_value=mock_client):
            list_recipes("user-abc")

        eq_call = mock_client.table.return_value.select.return_value.eq
        eq_call.assert_called_once_with("user_id", "user-abc")

    def test_orders_by_recorded_at_desc(self, monkeypatch):
        """list_recipes() orders results newest first."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []

        with patch("tools.storage.create_client", return_value=mock_client):
            list_recipes("user-123")

        order_call = mock_client.table.return_value.select.return_value.eq.return_value.order
        order_call.assert_called_once_with("recorded_at", desc=True)


class TestStoreImage:
    def test_returns_permanent_supabase_url(self, monkeypatch):
        """store_image() downloads DALL-E URL and returns permanent Supabase URL."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        permanent = "https://fake.supabase.co/storage/v1/object/public/images/uuid.png"
        mock_sb = MagicMock()
        mock_sb.storage.from_.return_value.get_public_url.return_value = permanent
        mock_response = MagicMock()
        mock_response.content = b"fake-png-bytes"
        mock_response.raise_for_status = lambda: None

        with patch("tools.storage.create_client", return_value=mock_sb), \
             patch("tools.storage.httpx.get", return_value=mock_response):
            result = store_image("https://dalle.openai.com/img/expiring.png")

        assert result == permanent

    def test_falls_back_to_original_on_download_error(self, monkeypatch):
        """store_image() returns original URL if download fails — capture never crashes."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        original = "https://dalle.openai.com/img/expiring.png"

        with patch("tools.storage.create_client"), \
             patch("tools.storage.httpx.get", side_effect=Exception("timeout")):
            result = store_image(original)

        assert result == original

    def test_returns_empty_string_for_empty_input(self, monkeypatch):
        """store_image() short-circuits on empty URL — no network call made."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        assert store_image("") == ""
