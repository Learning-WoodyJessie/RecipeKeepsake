from unittest.mock import MagicMock
import tools.storage as _storage_mod


class TestAddViewer:
    def test_inserts_with_owner_and_email(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.table.return_value.insert.return_value.execute.return_value.data = [
            {"id": "v1", "owner_user_id": "owner-1", "email": "fam@example.com", "phone": None}
        ]
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import add_viewer
        result = add_viewer("owner-1", "fam@example.com", None)
        mock_sb.table.assert_called_with("viewers")
        mock_sb.table.return_value.insert.assert_called_once_with(
            {"owner_user_id": "owner-1", "email": "fam@example.com", "phone": None}
        )
        assert result["email"] == "fam@example.com"

    def test_inserts_with_phone(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.table.return_value.insert.return_value.execute.return_value.data = [
            {"id": "v2", "owner_user_id": "owner-1", "email": None, "phone": "+15551234567"}
        ]
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import add_viewer
        result = add_viewer("owner-1", None, "+15551234567")
        assert result["phone"] == "+15551234567"


class TestListViewers:
    def test_filters_by_owner(self, monkeypatch):
        mock_sb = MagicMock()
        chain = mock_sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value
        chain.data = [{"id": "v1", "email": "fam@example.com", "phone": None, "created_at": "now", "revoked_at": None}]
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import list_viewers
        result = list_viewers("owner-1")
        mock_sb.table.return_value.select.return_value.eq.assert_called_once_with("owner_user_id", "owner-1")
        assert len(result) == 1


class TestRevokeViewer:
    def test_scopes_update_to_owner_and_viewer_id(self, monkeypatch):
        mock_sb = MagicMock()
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import revoke_viewer
        revoke_viewer("owner-1", "v1")
        update_call = mock_sb.table.return_value.update
        assert update_call.called
        eq_chain = update_call.return_value.eq
        eq_chain.assert_any_call("id", "v1")
        eq_chain.return_value.eq.assert_any_call("owner_user_id", "owner-1")


class TestGetOwnersForViewer:
    def test_returns_owner_ids_matching_email(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.is_.return_value.execute.return_value.data = [
            {"owner_user_id": "owner-1"}
        ]
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import get_owners_for_viewer
        result = get_owners_for_viewer("fam@example.com", None)
        assert result == ["owner-1"]

    def test_returns_empty_list_when_no_email_or_phone(self, monkeypatch):
        mock_sb = MagicMock()
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import get_owners_for_viewer
        result = get_owners_for_viewer(None, None)
        assert result == []

    def test_merges_email_and_phone_matches_without_duplicates(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.is_.return_value.execute.return_value.data = [
            {"owner_user_id": "owner-1"}
        ]
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import get_owners_for_viewer
        result = get_owners_for_viewer("fam@example.com", "+15551234567")
        assert result == ["owner-1"]


class TestListRecipesForOwners:
    def test_returns_empty_list_for_no_owners(self, monkeypatch):
        mock_sb = MagicMock()
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import list_recipes_for_owners
        assert list_recipes_for_owners([]) == []
        mock_sb.table.assert_not_called()

    def test_queries_with_in_filter(self, monkeypatch):
        mock_sb = MagicMock()
        chain = mock_sb.table.return_value.select.return_value.in_.return_value.order.return_value.execute.return_value
        chain.data = [{"token": "t1", "title": "Song", "audio_url": None, "tags": ["tale"]}]
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import list_recipes_for_owners
        result = list_recipes_for_owners(["owner-1", "owner-2"])
        mock_sb.table.return_value.select.return_value.in_.assert_called_once_with("user_id", ["owner-1", "owner-2"])
        assert result[0]["token"] == "t1"
