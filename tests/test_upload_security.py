"""
Tests for upload file validation and content moderation in scripts/serve.py.
"""
import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

import base64
from scripts.serve import _validate_audio_upload, _moderate_transcript, _decode_photo_data, _sniff_image


def _fake_upload(filename):
    m = MagicMock()
    m.filename = filename
    return m


# Representative magic bytes for each accepted format
_WAV   = b"RIFF" + b"\x00" * 100
_MP3   = b"ID3"  + b"\x00" * 100
_WEBM  = b"\x1aE\xdf\xa3" + b"\x00" * 100
_OGG   = b"OggS" + b"\x00" * 100
_FLAC  = b"fLaC" + b"\x00" * 100
_MP4   = b"\x00\x00\x00\x00ftyp" + b"\x00" * 100  # ftyp at offset 4
_AAC   = b"\xff\xf1" + b"\x00" * 100


# ── _validate_audio_upload ────────────────────────────────────────────────────

class TestValidateAudioUpload:
    def test_accepts_wav(self):
        _validate_audio_upload(_fake_upload("test.wav"), _WAV)

    def test_accepts_mp3(self):
        _validate_audio_upload(_fake_upload("test.mp3"), _MP3)

    def test_accepts_webm(self):
        _validate_audio_upload(_fake_upload("test.webm"), _WEBM)

    def test_accepts_ogg(self):
        _validate_audio_upload(_fake_upload("test.ogg"), _OGG)

    def test_accepts_flac(self):
        _validate_audio_upload(_fake_upload("test.flac"), _FLAC)

    def test_accepts_m4a(self):
        _validate_audio_upload(_fake_upload("test.m4a"), _MP4)

    def test_accepts_aac(self):
        _validate_audio_upload(_fake_upload("test.aac"), _AAC)

    def test_rejects_unknown_extension(self):
        with pytest.raises(HTTPException) as exc:
            _validate_audio_upload(_fake_upload("script.exe"), _WAV)
        assert exc.value.status_code == 400
        assert "Unsupported file type" in exc.value.detail

    def test_rejects_html_extension(self):
        with pytest.raises(HTTPException) as exc:
            _validate_audio_upload(_fake_upload("page.html"), b"<html>" + b"\x00" * 50)
        assert exc.value.status_code == 400

    def test_rejects_no_extension(self):
        with pytest.raises(HTTPException) as exc:
            _validate_audio_upload(_fake_upload("noextension"), _WAV)
        assert exc.value.status_code == 400

    def test_rejects_file_too_large(self):
        big = _WAV + b"\x00" * (26 * 1024 * 1024)  # > 25 MB
        with pytest.raises(HTTPException) as exc:
            _validate_audio_upload(_fake_upload("big.wav"), big)
        assert exc.value.status_code == 413
        assert "too large" in exc.value.detail.lower()

    def test_rejects_renamed_executable(self):
        """PE/EXE magic bytes with a .mp3 extension must be rejected."""
        pe_header = b"\x4d\x5a\x90\x00" + b"\x00" * 100  # MZ header
        with pytest.raises(HTTPException) as exc:
            _validate_audio_upload(_fake_upload("audio.mp3"), pe_header)
        assert exc.value.status_code == 400
        assert "valid audio" in exc.value.detail.lower()

    def test_rejects_zip_with_audio_extension(self):
        """ZIP magic bytes with a .wav extension must be rejected."""
        zip_header = b"PK\x03\x04" + b"\x00" * 100
        with pytest.raises(HTTPException) as exc:
            _validate_audio_upload(_fake_upload("audio.wav"), zip_header)
        assert exc.value.status_code == 400

    def test_none_filename_uses_fallback(self):
        """None filename → no ext → rejected at extension check."""
        upload = _fake_upload(None)
        upload.filename = None
        with pytest.raises(HTTPException) as exc:
            _validate_audio_upload(upload, _WEBM)
        assert exc.value.status_code == 400


# ── _moderate_transcript ─────────────────────────────────────────────────────

class TestModerateTranscript:
    def test_empty_text_is_noop(self):
        """Empty transcript skips the API entirely."""
        _moderate_transcript("")  # must not raise

    def test_no_api_key_is_noop(self):
        """Missing OPENAI_API_KEY skips moderation silently."""
        with patch.dict("os.environ", {}, clear=True):
            _moderate_transcript("some text here")  # must not raise

    def test_clean_text_passes(self):
        """A clean transcript with no flagged categories does not raise."""
        mock_result = MagicMock()
        mock_result.results[0].categories.__dict__ = {
            "hate": False, "harassment": False, "violence": False,
            "sexual": False, "self_harm": False,
        }
        with patch.dict("os.environ", {"OPENAI_API_KEY": "fake-key"}):
            with patch("scripts.serve._OAI" if False else "openai.OpenAI"):
                pass  # handled below
            with patch("scripts.serve.os.environ.get", return_value="fake-key"):
                with patch("builtins.__import__", side_effect=lambda n, *a, **k: __import__(n, *a, **k)):
                    pass
        # Simpler: patch the OpenAI class at import-time within the function
        import importlib, sys
        import scripts.serve as serve_mod
        mock_oai_cls = MagicMock()
        mock_oai_cls.return_value.moderations.create.return_value = mock_result
        with patch.dict("os.environ", {"OPENAI_API_KEY": "fake-key"}):
            with patch.dict(sys.modules, {"openai": MagicMock(OpenAI=mock_oai_cls)}):
                _moderate_transcript("Today we are making biryani with rice and spices.")

    def test_flagged_content_raises_422(self):
        """Content flagged by the API raises HTTP 422."""
        import sys
        mock_result = MagicMock()
        mock_result.results[0].categories.__dict__ = {
            "hate": True, "harassment": False,
        }
        mock_oai_cls = MagicMock()
        mock_oai_cls.return_value.moderations.create.return_value = mock_result
        with patch.dict("os.environ", {"OPENAI_API_KEY": "fake-key"}):
            with patch.dict(sys.modules, {"openai": MagicMock(OpenAI=mock_oai_cls)}):
                with pytest.raises(HTTPException) as exc:
                    _moderate_transcript("flagged content")
                assert exc.value.status_code == 422
                assert "can't be saved" in exc.value.detail

    def test_api_error_is_nonfatal(self):
        """Transient Moderation API errors do not block the recording."""
        import sys
        mock_oai_cls = MagicMock()
        mock_oai_cls.return_value.moderations.create.side_effect = Exception("timeout")
        with patch.dict("os.environ", {"OPENAI_API_KEY": "fake-key"}):
            with patch.dict(sys.modules, {"openai": MagicMock(OpenAI=mock_oai_cls)}):
                _moderate_transcript("some recipe text")  # must not raise


# ── _sniff_image / _decode_photo_data (narrator photo upload) ────────────────

_JPEG = b"\xff\xd8\xff" + b"\x00" * 100
_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
_WEBP = b"RIFF" + b"\x00" * 100
_HEIC = b"\x00\x00\x00\x00ftyp" + b"\x00" * 100  # ftyp at offset 4


def _data_uri(mime: str, data: bytes) -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


class TestSniffImage:
    def test_identifies_jpeg(self):
        assert _sniff_image(_JPEG) == (".jpg", "image/jpeg")

    def test_identifies_png(self):
        assert _sniff_image(_PNG) == (".png", "image/png")

    def test_identifies_webp(self):
        assert _sniff_image(_WEBP) == (".webp", "image/webp")

    def test_identifies_heic(self):
        assert _sniff_image(_HEIC) == (".heic", "image/heic")

    def test_rejects_unrecognised_bytes(self):
        with pytest.raises(HTTPException) as exc:
            _sniff_image(b"not an image" + b"\x00" * 100)
        assert exc.value.status_code == 400


class TestDecodePhotoData:
    def test_decodes_valid_jpeg_data_uri(self):
        """Even if the declared MIME is wrong, ext/content_type come from sniffing the bytes."""
        uri = _data_uri("image/jpeg", _JPEG)
        data, ext, content_type = _decode_photo_data(uri)
        assert data == _JPEG
        assert ext == ".jpg"
        assert content_type == "image/jpeg"

    def test_rejects_missing_comma(self):
        with pytest.raises(HTTPException) as exc:
            _decode_photo_data("not-a-data-uri")
        assert exc.value.status_code == 400

    def test_rejects_invalid_base64(self):
        with pytest.raises(HTTPException) as exc:
            _decode_photo_data("data:image/jpeg;base64,!!!not-base64!!!")
        assert exc.value.status_code == 400

    def test_rejects_oversized_photo(self, monkeypatch):
        import scripts.serve as serve_mod
        monkeypatch.setattr(serve_mod, "_MAX_IMAGE_BYTES", 50)
        uri = _data_uri("image/jpeg", _JPEG)
        with pytest.raises(HTTPException) as exc:
            _decode_photo_data(uri)
        assert exc.value.status_code == 413

    def test_rejects_non_image_bytes(self):
        uri = _data_uri("image/jpeg", b"not an image" + b"\x00" * 100)
        with pytest.raises(HTTPException) as exc:
            _decode_photo_data(uri)
        assert exc.value.status_code == 400
