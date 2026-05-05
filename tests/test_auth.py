import asyncio
import time

import jwt as pyjwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from unittest.mock import AsyncMock, MagicMock, patch


class TestRequireAuthLocalJWT:
    def test_valid_jwt_does_not_call_supabase(self, monkeypatch):
        """Happy path: valid JWT verified locally — no Supabase network call made."""
        secret = "test-jwt-secret"
        monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_ANON_KEY", "fake-anon")
        token = pyjwt.encode(
            {"sub": "user-123", "exp": int(time.time()) + 3600},
            secret,
            algorithm="HS256",
        )
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        with patch("scripts.serve.httpx.AsyncClient") as mock_async:
            from scripts.serve import require_auth
            result = asyncio.run(require_auth(creds))

        mock_async.assert_not_called()
        assert result["sub"] == "user-123"

    def test_invalid_jwt_falls_back_to_supabase(self, monkeypatch):
        """Bad signature: local verify fails, falls back to Supabase network call."""
        monkeypatch.setenv("SUPABASE_JWT_SECRET", "wrong-secret")
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_ANON_KEY", "fake-anon")
        # Token signed with a different secret
        token = pyjwt.encode(
            {"sub": "user-123", "exp": int(time.time()) + 3600},
            "correct-secret",
            algorithm="HS256",
        )
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"id": "user-123"}
        async_cm = AsyncMock()
        async_cm.__aenter__.return_value.get = AsyncMock(return_value=mock_response)

        with patch("scripts.serve.httpx.AsyncClient", return_value=async_cm):
            from scripts.serve import require_auth
            result = asyncio.run(require_auth(creds))

        assert result["id"] == "user-123"

    def test_no_credentials_raises_401(self, monkeypatch):
        """Missing auth header raises 401."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        from scripts.serve import require_auth
        with pytest.raises(HTTPException) as exc:
            asyncio.run(require_auth(None))
        assert exc.value.status_code == 401

    def test_supabase_returns_non_200_raises_401(self, monkeypatch):
        """Supabase fallback returning non-200 raises 401."""
        monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_ANON_KEY", "fake-anon")
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="expired-token")

        mock_response = MagicMock()
        mock_response.status_code = 401
        async_cm = AsyncMock()
        async_cm.__aenter__.return_value.get = AsyncMock(return_value=mock_response)

        with patch("scripts.serve.httpx.AsyncClient", return_value=async_cm):
            from scripts.serve import require_auth
            with pytest.raises(HTTPException) as exc:
                asyncio.run(require_auth(creds))
        assert exc.value.status_code == 401


class TestRequireAuthFailClosed:
    def test_missing_supabase_url_in_production_raises_500(self, monkeypatch):
        """Missing SUPABASE_URL in production must raise HTTP 500, not silently pass."""
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)
        monkeypatch.setenv("ENV", "production")
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="any-token")
        from scripts.serve import require_auth
        with pytest.raises(HTTPException) as exc:
            asyncio.run(require_auth(creds))
        assert exc.value.status_code == 500

    def test_missing_supabase_url_outside_production_passes_through(self, monkeypatch):
        """Missing SUPABASE_URL outside production allows through (local dev)."""
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)
        monkeypatch.setenv("ENV", "development")
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="any-token")
        from scripts.serve import require_auth
        result = asyncio.run(require_auth(creds))
        assert result == {}


class TestCORSExplicit:
    def test_cors_methods_not_wildcard(self):
        """CORS allow_methods must be an explicit list — no wildcard."""
        from scripts.serve import app
        cors = next(
            m for m in app.user_middleware
            if "CORSMiddleware" in str(m.cls)
        )
        allow_methods = cors.kwargs.get("allow_methods", ["*"])
        assert "*" not in allow_methods

    def test_cors_headers_not_wildcard(self):
        """CORS allow_headers must be an explicit list — no wildcard."""
        from scripts.serve import app
        cors = next(
            m for m in app.user_middleware
            if "CORSMiddleware" in str(m.cls)
        )
        allow_headers = cors.kwargs.get("allow_headers", ["*"])
        assert "*" not in allow_headers
