"""
Tests for tools/groups.py — family group CRUD.
"""
from unittest.mock import MagicMock, call
import tools.groups as _groups_mod
from tools.groups import (
    create_group, get_group_for_user, get_group_by_invite,
    join_group, list_group_members, list_group_recipes,
    get_portal_group, list_portal_recipes,
)


def _mock_sb():
    """Minimal Supabase mock wired for the most common call chains."""
    return MagicMock()


class TestCreateGroup:
    def test_returns_group_row(self, monkeypatch):
        """create_group() returns the inserted group row."""
        mock = _mock_sb()
        mock.table.return_value.insert.return_value.execute.return_value.data = [
            {"id": "g1", "name": "Lakshmi Family", "invite_token": "inv-abc", "portal_token": "pt1"}
        ]
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        result = create_group(owner_id="u1", name="Lakshmi Family")
        assert result["id"] == "g1"
        assert result["name"] == "Lakshmi Family"

    def test_inserts_into_family_groups_table(self, monkeypatch):
        """create_group() inserts into family_groups first."""
        mock = _mock_sb()
        mock.table.return_value.insert.return_value.execute.return_value.data = [
            {"id": "g1", "name": "Fam"}
        ]
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        create_group(owner_id="u1", name="Fam")
        assert mock.table.call_args_list[0] == call("family_groups")

    def test_owner_added_as_admin_member(self, monkeypatch):
        """create_group() inserts the owner into family_group_members with role=admin."""
        mock = _mock_sb()
        mock.table.return_value.insert.return_value.execute.return_value.data = [
            {"id": "g1", "name": "Fam"}
        ]
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        create_group(owner_id="u1", name="Fam")
        tables_called = [c.args[0] for c in mock.table.call_args_list]
        assert "family_group_members" in tables_called


class TestGetGroupForUser:
    def test_returns_none_when_no_group(self, monkeypatch):
        """get_group_for_user() returns None when user has no membership row."""
        mock = _mock_sb()
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        assert get_group_for_user("u1") is None

    def test_returns_group_dict_when_member(self, monkeypatch):
        """get_group_for_user() returns the group dict when user is a member."""
        mock = _mock_sb()
        # First query: family_group_members
        first_select = MagicMock()
        first_select.eq.return_value.execute.return_value.data = [{"group_id": "g1", "role": "admin"}]
        # Second query: family_groups single
        second_select = MagicMock()
        second_select.eq.return_value.single.return_value.execute.return_value.data = {
            "id": "g1", "name": "Lakshmi Family", "portal_token": "pt1", "invite_token": "inv1"
        }
        mock.table.return_value.select.side_effect = [first_select, second_select]
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        result = get_group_for_user("u1")
        assert result is not None
        assert result["id"] == "g1"
        assert result["role"] == "admin"


class TestGetGroupByInvite:
    def test_returns_group_when_found(self, monkeypatch):
        """get_group_by_invite() returns the group row for a valid invite token."""
        mock = _mock_sb()
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"id": "g1", "name": "Fam", "invite_token": "inv-abc"}
        ]
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        result = get_group_by_invite("inv-abc")
        assert result["id"] == "g1"

    def test_returns_none_when_not_found(self, monkeypatch):
        """get_group_by_invite() returns None for an unknown token."""
        mock = _mock_sb()
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        assert get_group_by_invite("bad-token") is None


class TestJoinGroup:
    def test_inserts_contributor_row(self, monkeypatch):
        """join_group() inserts a contributor membership row."""
        mock = _mock_sb()
        mock.table.return_value.insert.return_value.execute.return_value.data = [
            {"group_id": "g1", "user_id": "u2", "role": "contributor"}
        ]
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        join_group(group_id="g1", user_id="u2")
        mock.table.assert_called_with("family_group_members")

    def test_silently_ignores_duplicate(self, monkeypatch):
        """join_group() does not raise if the user is already a member."""
        mock = _mock_sb()
        mock.table.return_value.insert.return_value.execute.side_effect = Exception("duplicate key")
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        join_group(group_id="g1", user_id="u2")  # must not raise


class TestListGroupMembers:
    def test_returns_member_list(self, monkeypatch):
        """list_group_members() returns rows from family_group_members."""
        mock = _mock_sb()
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"user_id": "u1", "role": "admin"},
            {"user_id": "u2", "role": "contributor"},
        ]
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        result = list_group_members("g1")
        assert len(result) == 2
        assert result[0]["role"] == "admin"


class TestListGroupRecipes:
    def test_returns_empty_when_no_members(self, monkeypatch):
        """list_group_recipes() returns [] when the group has no members."""
        mock = _mock_sb()
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        assert list_group_recipes("g1") == []

    def test_returns_recipes_for_all_members(self, monkeypatch):
        """list_group_recipes() fetches recipes for all member user_ids."""
        mock = _mock_sb()
        members_select = MagicMock()
        members_select.eq.return_value.execute.return_value.data = [
            {"user_id": "u1"}, {"user_id": "u2"}
        ]
        recipes_select = MagicMock()
        recipes_select.in_.return_value.order.return_value.execute.return_value.data = [
            {"id": "r1", "title": "Pesarattu", "user_id": "u1"},
            {"id": "r2", "title": "Biryani", "user_id": "u2"},
        ]
        mock.table.return_value.select.side_effect = [members_select, recipes_select]
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        result = list_group_recipes("g1")
        assert len(result) == 2
        assert recipes_select.in_.call_args.args[0] == "user_id"
        assert set(recipes_select.in_.call_args.args[1]) == {"u1", "u2"}


class TestGetPortalGroup:
    def test_returns_group_for_valid_token(self, monkeypatch):
        """get_portal_group() returns the group row for a valid portal token."""
        mock = MagicMock()
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"id": "g1", "name": "Lakshmi Family", "portal_token": "pt-abc"}
        ]
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        result = get_portal_group("pt-abc")
        assert result["id"] == "g1"

    def test_returns_none_for_invalid_token(self, monkeypatch):
        """get_portal_group() returns None for an unknown portal token."""
        mock = MagicMock()
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        assert get_portal_group("bad-token") is None


class TestListPortalRecipes:
    def test_returns_only_portal_visible_recipes(self, monkeypatch):
        """list_portal_recipes() filters to portal_visible=true recipes for group members."""
        mock = MagicMock()
        members_select = MagicMock()
        members_select.eq.return_value.execute.return_value.data = [
            {"user_id": "u1"}, {"user_id": "u2"}
        ]
        recipes_select = MagicMock()
        recipes_select.in_.return_value.eq.return_value.order.return_value.execute.return_value.data = [
            {"id": "r1", "title": "Pesarattu", "portal_visible": True},
        ]
        mock.table.return_value.select.side_effect = [members_select, recipes_select]
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        result = list_portal_recipes("g1")
        assert len(result) == 1
        assert result[0]["title"] == "Pesarattu"

    def test_returns_empty_when_no_members(self, monkeypatch):
        """list_portal_recipes() returns [] when the group has no members."""
        mock = MagicMock()
        mock.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        monkeypatch.setattr(_groups_mod, "_supabase", mock)
        assert list_portal_recipes("g1") == []
