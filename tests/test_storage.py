from unittest.mock import patch, MagicMock
from tools.storage import insert_recipe, get_recipe_by_token, list_recipes


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
        """list_recipes() returns a list of recipe summaries."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        expected = [{"id": "abc", "dish_name": "Pesarattu", "token": "tok-1"}]
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.order.return_value.execute.return_value.data = expected

        with patch("tools.storage.create_client", return_value=mock_client):
            result = list_recipes()

        assert result == expected

    def test_orders_by_recorded_at_desc(self, monkeypatch):
        """list_recipes() orders results newest first."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.order.return_value.execute.return_value.data = []

        with patch("tools.storage.create_client", return_value=mock_client):
            list_recipes()

        order_call = mock_client.table.return_value.select.return_value.order
        order_call.assert_called_once_with("recorded_at", desc=True)
