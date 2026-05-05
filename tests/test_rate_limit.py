import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

import tools.storage as _storage_mod


class TestCheckRateLimitDb:
    def test_returns_count_after_increment(self, monkeypatch):
        """check_rate_limit_db() returns the post-increment count from Postgres."""
        mock_sb = MagicMock()
        mock_sb.rpc.return_value.execute.return_value.data = 3
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import check_rate_limit_db
        result = check_rate_limit_db("user-123", "capture")
        assert result == 3

    def test_calls_rpc_with_correct_args(self, monkeypatch):
        """check_rate_limit_db() calls increment_rate_limit RPC with user_id and endpoint."""
        mock_sb = MagicMock()
        mock_sb.rpc.return_value.execute.return_value.data = 1
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import check_rate_limit_db
        check_rate_limit_db("user-123", "capture")
        mock_sb.rpc.assert_called_once_with(
            "increment_rate_limit",
            {"p_user_id": "user-123", "p_endpoint": "capture"},
        )

    def test_returns_zero_on_db_failure(self, monkeypatch):
        """check_rate_limit_db() returns 0 (fail open) when DB raises — rate limiting is best-effort."""
        mock_sb = MagicMock()
        mock_sb.rpc.side_effect = Exception("DB down")
        monkeypatch.setattr(_storage_mod, "_supabase", mock_sb)
        from tools.storage import check_rate_limit_db
        result = check_rate_limit_db("user-123", "capture")
        assert result == 0


class TestCheckRateLimitDbOrRaise:
    def test_raises_429_when_count_exceeds_limit(self):
        """_check_rate_limit_db_or_raise() raises 429 when Postgres count exceeds daily limit."""
        with patch("scripts.serve.check_rate_limit_db", return_value=6):
            from scripts.serve import _check_rate_limit_db_or_raise
            with pytest.raises(HTTPException) as exc:
                _check_rate_limit_db_or_raise("user-123", "capture", 5)
            assert exc.value.status_code == 429

    def test_does_not_raise_when_within_limit(self):
        """_check_rate_limit_db_or_raise() does not raise when count is within limit."""
        with patch("scripts.serve.check_rate_limit_db", return_value=3):
            from scripts.serve import _check_rate_limit_db_or_raise
            _check_rate_limit_db_or_raise("user-123", "capture", 10)  # no exception

    def test_translate_endpoint_rate_limited(self):
        """translate endpoint is also rate-limited via Postgres."""
        with patch("scripts.serve.check_rate_limit_db", return_value=51):
            from scripts.serve import _check_rate_limit_db_or_raise
            with pytest.raises(HTTPException) as exc:
                _check_rate_limit_db_or_raise("user-123", "translate", 50)
            assert exc.value.status_code == 429

    def test_generate_image_endpoint_rate_limited(self):
        """generate-image endpoint is also rate-limited via Postgres."""
        with patch("scripts.serve.check_rate_limit_db", return_value=21):
            from scripts.serve import _check_rate_limit_db_or_raise
            with pytest.raises(HTTPException) as exc:
                _check_rate_limit_db_or_raise("user-123", "generate-image", 20)
            assert exc.value.status_code == 429
