from unittest.mock import patch, MagicMock
import tools.storage as _storage_mod
from tools.storage import insert_recipe, get_recipe_by_token, list_recipes, store_image
from tools.storage import list_people, create_person, update_person, delete_person, delete_account
from tools.storage import count_memories, is_pro_user, FREE_MEMORY_LIMIT


class TestSupabaseSingleton:
    def test_client_created_once_across_calls(self, monkeypatch):
        """_client() must return the same object across multiple calls."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        monkeypatch.setattr(_storage_mod, "_supabase", None)
        mock_instance = MagicMock()
        with patch("tools.storage.create_client", return_value=mock_instance) as mock_cc:
            c1 = _storage_mod._client()
            c2 = _storage_mod._client()
        assert c1 is c2
        assert mock_cc.call_count == 1


def _mock_supabase(return_data):
    mock_client = MagicMock()
    mock_client.table.return_value.insert.return_value.execute.return_value.data = [return_data]
    mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = return_data
    return mock_client


class TestInsertRecipe:
    def test_returns_inserted_row(self, monkeypatch):
        """insert_recipe() returns the first element of result.data."""
        expected = {"id": "abc-123", "title": "Pesarattu"}
        monkeypatch.setattr(_storage_mod, "_supabase", _mock_supabase(expected))
        result = insert_recipe({"title": "Pesarattu"})
        assert result == expected

    def test_inserts_into_recipes_table(self, monkeypatch):
        """insert_recipe() targets the 'recipes' table."""
        mock_client = _mock_supabase({"id": "abc"})
        monkeypatch.setattr(_storage_mod, "_supabase", mock_client)
        insert_recipe({"title": "Pesarattu"})
        mock_client.table.assert_called_with("memories")


class TestGetRecipeByToken:
    def test_returns_recipe_data(self, monkeypatch):
        """get_recipe_by_token() returns result.data for the matching token."""
        expected = {"id": "abc-123", "token": "tok-xyz", "title": "Pesarattu"}
        monkeypatch.setattr(_storage_mod, "_supabase", _mock_supabase(expected))
        result = get_recipe_by_token("tok-xyz")
        assert result == expected


class TestListRecipes:
    def test_returns_list(self, monkeypatch):
        """list_recipes(user_id) returns a list of recipe summaries for that user."""
        expected = [{"id": "abc", "title": "Pesarattu", "token": "tok-1"}]
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = expected
        monkeypatch.setattr(_storage_mod, "_supabase", mock_client)
        result = list_recipes("user-123")
        assert result == expected

    def test_filters_by_user_id(self, monkeypatch):
        """list_recipes(user_id) filters by the given user_id."""
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
        monkeypatch.setattr(_storage_mod, "_supabase", mock_client)
        list_recipes("user-abc")
        eq_call = mock_client.table.return_value.select.return_value.eq
        eq_call.assert_called_once_with("user_id", "user-abc")

    def test_orders_by_recorded_at_desc(self, monkeypatch):
        """list_recipes() orders results newest first."""
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
        monkeypatch.setattr(_storage_mod, "_supabase", mock_client)
        list_recipes("user-123")
        order_call = mock_client.table.return_value.select.return_value.eq.return_value.order
        order_call.assert_called_once_with("recorded_at", desc=True)


class TestStoreImage:
    def test_returns_permanent_supabase_url(self, monkeypatch):
        """store_image() downloads DALL-E URL and returns permanent Supabase URL."""
        permanent = "https://fake.supabase.co/storage/v1/object/public/images/uuid.png"
        mock_sb = MagicMock()
        mock_sb.storage.from_.return_value.get_public_url.return_value = permanent
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        mock_response = MagicMock()
        mock_response.content = b"fake-png-bytes"
        mock_response.raise_for_status = lambda: None

        with patch("tools.storage.httpx.get", return_value=mock_response):
            result = store_image("https://dalle.openai.com/img/expiring.png")

        assert result == permanent

    def test_falls_back_to_original_on_download_error(self, monkeypatch):
        """store_image() returns original URL if download fails — capture never crashes."""
        original = "https://dalle.openai.com/img/expiring.png"
        monkeypatch.setattr(_storage_mod, "_supabase", MagicMock())

        with patch("tools.storage.httpx.get", side_effect=Exception("timeout")):
            result = store_image(original)

        assert result == original

    def test_returns_empty_string_for_empty_input(self, monkeypatch):
        """store_image() short-circuits on empty URL — no network call made."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        assert store_image("") == ""


class TestListPeople:
    def test_returns_people_for_user(self):
        """list_people(user_id) returns all people belonging to that user."""
        expected = [{"id": "p1", "name": "Ammamma", "user_id": "u1"}]
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = expected
            result = list_people("u1")
        assert result == expected

    def test_returns_empty_list_when_no_people(self):
        """list_people() returns [] when user has no people."""
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
            result = list_people("u1")
        assert result == []


class TestCreatePerson:
    def test_returns_created_record(self):
        """create_person() returns the inserted row."""
        expected = {"id": "p1", "name": "Ammamma", "user_id": "u1"}
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.insert.return_value.execute.return_value.data = [expected]
            result = create_person("u1", {"name": "Ammamma"})
        assert result == expected

    def test_inserts_into_people_table(self):
        """create_person() targets the 'people' table."""
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.insert.return_value.execute.return_value.data = [{"id": "p1"}]
            create_person("u1", {"name": "Ammamma"})
        sb.table.assert_called_with("people")

    def test_merges_user_id_into_data(self):
        """create_person() adds user_id to the insert payload."""
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.insert.return_value.execute.return_value.data = [{"id": "p1"}]
            create_person("u1", {"name": "Ammamma"})
        insert_call = sb.table.return_value.insert.call_args[0][0]
        assert insert_call["user_id"] == "u1"
        assert insert_call["name"] == "Ammamma"


class TestUpdatePerson:
    def test_returns_updated_record(self):
        """update_person() returns the updated row."""
        expected = {"id": "p1", "name": "Peddamma"}
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [expected]
            result = update_person("p1", {"name": "Peddamma"})
        assert result == expected


class TestDeletePerson:
    def test_calls_delete_on_people_table(self):
        """delete_person() deletes the row with the given id."""
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            delete_person("p1")
        sb.table.assert_called_with("people")
        sb.table.return_value.delete.assert_called_once()
        sb.table.return_value.delete.return_value.eq.assert_called_with("id", "p1")


class TestDeleteAccount:
    def test_deletes_all_recipes_for_user(self):
        """delete_account() deletes every recipe row belonging to the user."""
        fake_recipes = [
            {"token": "tok1", "audio_url": "file1.webm"},
            {"token": "tok2", "audio_url": ""},
        ]
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = fake_recipes
            delete_account("u1")
        delete_call = sb.table.return_value.delete.return_value.eq
        delete_call.assert_called()

    def test_deletes_all_people_for_user(self):
        """delete_account() deletes all people rows for the user."""
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
            delete_account("u1")
        assert sb.table.call_count >= 2


class TestCountMemories:
    def test_returns_count_from_supabase(self):
        """count_memories() returns the exact count Supabase reports."""
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.execute.return_value.count = 7
            assert count_memories("u1") == 7

    def test_returns_zero_when_count_is_none(self):
        """count_memories() returns 0 when Supabase returns count=None."""
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.execute.return_value.count = None
            assert count_memories("u1") == 0


class TestIsProUser:
    def test_returns_true_when_profile_is_pro(self):
        """is_pro_user() returns True when profiles row has is_pro=True."""
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [{"is_pro": True}]
            assert is_pro_user("u1") is True

    def test_returns_false_when_profile_is_not_pro(self):
        """is_pro_user() returns False when profiles row has is_pro=False."""
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [{"is_pro": False}]
            assert is_pro_user("u1") is False

    def test_returns_false_when_no_profile_row(self):
        """is_pro_user() returns False when user has no profiles row."""
        with patch("tools.storage._client") as mock_client:
            sb = MagicMock()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
            assert is_pro_user("u1") is False


class TestFreeMemoryLimit:
    def test_limit_is_ten(self):
        """FREE_MEMORY_LIMIT is 10."""
        assert FREE_MEMORY_LIMIT == 10
