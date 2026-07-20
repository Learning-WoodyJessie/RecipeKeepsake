"""Tests for emoji reactions: storage functions and API endpoints."""
from unittest.mock import MagicMock, patch
import pytest
import tools.storage as _storage_mod
from fastapi.testclient import TestClient
from scripts.serve import app, require_auth

_http = TestClient(app)


async def _auth_u1():
    return {"sub": "u1"}


# ── Storage layer ─────────────────────────────────────────────────────────────

class TestGetReactions:
    def test_returns_zero_counts_when_no_rows(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import get_reactions
        result = get_reactions("tok-1", user_id=None)
        assert result["counts"] == {"❤️": 0, "🙏": 0, "😢": 0, "😄": 0}
        assert result["user_reactions"] == []

    def test_counts_each_emoji(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"emoji": "❤️", "user_id": "u1"},
            {"emoji": "❤️", "user_id": "u2"},
            {"emoji": "🙏", "user_id": "u1"},
        ]
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import get_reactions
        result = get_reactions("tok-1", user_id=None)
        assert result["counts"]["❤️"] == 2
        assert result["counts"]["🙏"] == 1
        assert result["counts"]["😢"] == 0
        assert result["counts"]["😄"] == 0

    def test_identifies_current_user_reactions(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"emoji": "❤️", "user_id": "u1"},
            {"emoji": "🙏", "user_id": "u2"},
        ]
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import get_reactions
        result = get_reactions("tok-1", user_id="u1")
        assert "❤️" in result["user_reactions"]
        assert "🙏" not in result["user_reactions"]

    def test_no_user_reactions_when_user_id_none(self, monkeypatch):
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"emoji": "❤️", "user_id": "u1"},
        ]
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import get_reactions
        result = get_reactions("tok-1", user_id=None)
        assert result["user_reactions"] == []


class TestToggleReaction:
    def test_inserts_when_not_present(self, monkeypatch):
        mock_sb = MagicMock()
        # existing-check returns empty (reaction not present)
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
        # get_reactions call after toggle returns one row
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"emoji": "❤️", "user_id": "u1"},
        ]
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import toggle_reaction
        result = toggle_reaction("tok-1", "u1", "❤️")
        mock_sb.table.return_value.insert.assert_called_once()
        assert result["counts"]["❤️"] == 1

    def test_deletes_when_already_present(self, monkeypatch):
        mock_sb = MagicMock()
        # existing-check returns a row (already reacted)
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
            {"id": "r1"}
        ]
        # get_reactions after delete returns empty
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import toggle_reaction
        result = toggle_reaction("tok-1", "u1", "❤️")
        mock_sb.table.return_value.delete.assert_called_once()
        assert result["counts"]["❤️"] == 0

    def test_rejects_invalid_emoji(self, monkeypatch):
        mock_sb = MagicMock()
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import toggle_reaction
        with pytest.raises(ValueError, match="Invalid emoji"):
            toggle_reaction("tok-1", "u1", "🔥")

    def test_all_valid_emojis_accepted(self, monkeypatch):
        for emoji in ["❤️", "🙏", "😢", "😄"]:
            mock_sb = MagicMock()
            mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
            mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
            monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
            from tools.storage import toggle_reaction
            result = toggle_reaction("tok-1", "u1", emoji)
            assert "counts" in result


# ── API endpoints ─────────────────────────────────────────────────────────────

class TestGetReactionsEndpoint:
    def teardown_method(self):
        app.dependency_overrides.pop(require_auth, None)

    def test_returns_counts_for_memory(self):
        fake_data = {
            "counts": {"❤️": 2, "🙏": 0, "😢": 0, "😄": 1},
            "user_reactions": ["❤️"],
        }
        app.dependency_overrides[require_auth] = _auth_u1
        with patch("tools.storage.get_reactions", return_value=fake_data):
            res = _http.get("/reactions/tok-1", headers={"Authorization": "Bearer fake"})
        assert res.status_code == 200
        assert res.json()["counts"]["❤️"] == 2
        assert "❤️" in res.json()["user_reactions"]

    def test_returns_401_without_auth(self):
        res = _http.get("/reactions/tok-1")
        assert res.status_code == 401

    def test_returns_zero_counts_when_no_reactions(self):
        fake_data = {
            "counts": {"❤️": 0, "🙏": 0, "😢": 0, "😄": 0},
            "user_reactions": [],
        }
        app.dependency_overrides[require_auth] = _auth_u1
        with patch("tools.storage.get_reactions", return_value=fake_data):
            res = _http.get("/reactions/tok-99", headers={"Authorization": "Bearer fake"})
        assert res.status_code == 200
        assert res.json()["user_reactions"] == []


class TestToggleReactionEndpoint:
    def teardown_method(self):
        app.dependency_overrides.pop(require_auth, None)

    def test_toggles_and_returns_updated_counts(self):
        after = {
            "counts": {"❤️": 1, "🙏": 0, "😢": 0, "😄": 0},
            "user_reactions": ["❤️"],
        }
        app.dependency_overrides[require_auth] = _auth_u1
        with patch("tools.storage.toggle_reaction", return_value=after):
            res = _http.post(
                "/reaction/tok-1",
                json={"emoji": "❤️"},
                headers={"Authorization": "Bearer fake"},
            )
        assert res.status_code == 200
        assert res.json()["counts"]["❤️"] == 1
        assert "❤️" in res.json()["user_reactions"]

    def test_rejects_invalid_emoji_with_400(self):
        app.dependency_overrides[require_auth] = _auth_u1
        with patch("tools.storage.toggle_reaction", side_effect=ValueError("Invalid emoji: '🔥'")):
            res = _http.post(
                "/reaction/tok-1",
                json={"emoji": "🔥"},
                headers={"Authorization": "Bearer fake"},
            )
        assert res.status_code == 400
        assert "Invalid emoji" in res.json()["detail"]

    def test_returns_401_without_auth(self):
        res = _http.post("/reaction/tok-1", json={"emoji": "❤️"})
        assert res.status_code == 401
