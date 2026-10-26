"""
Purpose: Specify how a video is turned into the sound track the existing audio pipeline expects.

What: runs the real ffmpeg on tiny generated videos (with sound, without sound, not a video at all)
and checks the result, the errors, and that failures are named so the user can be told what is wrong.

Why: video upload is a separate path in front of the unchanged audio pipeline. Everything it hands
on must already look like an ordinary small MP3, and every way it can fail must end in a plain,
specific message instead of "something went wrong".
"""
import shutil
import subprocess
from unittest.mock import patch

import pytest

from tools import video

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg is not installed")


def _make(path, *, sound=True, container=None):
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10"]
    if sound:
        cmd += ["-f", "lavfi", "-i", "sine=frequency=440"]
    cmd += ["-t", "2", "-c:v", "mpeg4"] + (["-c:a", "aac"] if sound else [])
    if container:
        cmd += ["-f", container]
    subprocess.run(cmd + [str(path)], check=True)
    return path


@pytest.fixture
def with_sound(tmp_path):
    return _make(tmp_path / "clip.mp4")


class TestExtractAudio:
    def test_a_video_with_sound_becomes_a_small_mp3(self, with_sound, tmp_path):
        out = tmp_path / "out.mp3"
        video.extract_audio(str(with_sound), str(out))
        data = out.read_bytes()
        assert data[:3] == b"ID3" or data[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2")
        assert 0 < len(data) < with_sound.stat().st_size

    def test_an_iphone_style_mov_works_too(self, tmp_path):
        mov = _make(tmp_path / "clip.mov", container="mov")
        out = tmp_path / "out.mp3"
        video.extract_audio(str(mov), str(out))
        assert out.stat().st_size > 0

    def test_the_output_is_mono_like_the_rest_of_the_audio_pipeline(self, with_sound, tmp_path):
        out = tmp_path / "out.mp3"
        video.extract_audio(str(with_sound), str(out))
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=channels", "-of", "csv=p=0", str(out)],
            capture_output=True, text=True, check=True).stdout.strip()
        assert probe == "1"

    def test_a_video_with_no_sound_track_says_so(self, tmp_path):
        silent = _make(tmp_path / "silent.mp4", sound=False)
        with pytest.raises(video.VideoError) as err:
            video.extract_audio(str(silent), str(tmp_path / "out.mp3"))
        assert err.value.kind == "no_audio"
        assert err.value.message == "We couldn't find any sound in this video."

    def test_a_file_that_is_not_a_video_says_so(self, tmp_path):
        junk = tmp_path / "junk.mp4"
        junk.write_bytes(b"\x00\x00\x00\x14ftypmp42" + b"\x01" * 4000)
        with pytest.raises(video.VideoError) as err:
            video.extract_audio(str(junk), str(tmp_path / "out.mp3"))
        assert err.value.kind == "unreadable"
        assert err.value.message == "We couldn't read this video. Please try a different file."

    def test_a_failed_extraction_leaves_no_output_file_behind(self, tmp_path):
        junk = tmp_path / "junk.mp4"
        junk.write_bytes(b"\x00" * 3000)
        out = tmp_path / "out.mp3"
        with pytest.raises(video.VideoError):
            video.extract_audio(str(junk), str(out))
        assert not out.exists()

    def test_ffmpeg_taking_too_long_is_reported_and_cleaned_up(self, with_sound, tmp_path):
        out = tmp_path / "out.mp3"
        out.write_bytes(b"partial")
        with patch.object(video.subprocess, "run", side_effect=subprocess.TimeoutExpired("ffmpeg", 1)):
            with pytest.raises(video.VideoError) as err:
                video.extract_audio(str(with_sound), str(out))
        assert err.value.kind == "timeout"
        assert err.value.message == "This video took too long to process. Please try a shorter one."
        assert not out.exists()

    def test_ffmpeg_missing_is_a_server_problem_not_the_users(self, with_sound, tmp_path):
        with patch.object(video.subprocess, "run", side_effect=FileNotFoundError("ffmpeg")):
            with pytest.raises(video.VideoError) as err:
                video.extract_audio(str(with_sound), str(tmp_path / "out.mp3"))
        assert err.value.kind == "unavailable"

    def test_ffmpeg_never_waits_for_keyboard_input(self, with_sound, tmp_path):
        seen = {}
        real = subprocess.run
        def spy(cmd, **kw):
            seen["cmd"] = cmd
            return real(cmd, **kw)
        with patch.object(video.subprocess, "run", side_effect=spy):
            video.extract_audio(str(with_sound), str(tmp_path / "out.mp3"))
        assert "-nostdin" in seen["cmd"] and "-vn" in seen["cmd"]


class TestRecognisingVideo:
    @pytest.mark.parametrize("head", [b"\x00\x00\x00\x20ftypisom", b"\x00\x00\x00\x14ftypqt  ", b"\x00\x00\x00\x18ftypM4V "])
    def test_mp4_mov_and_m4v_are_recognised(self, head):
        assert video.looks_like_video(head + b"\x00" * 8)

    @pytest.mark.parametrize("head", [b"MZ\x90\x00" + b"\x00" * 12, b"<html><body>", b"ID3\x04\x00" + b"\x00" * 10, b""])
    def test_other_files_are_not(self, head):
        assert not video.looks_like_video(head)


class TestFileTypes:
    def test_only_the_formats_phones_produce_are_accepted(self):
        assert set(video.VIDEO_EXTS) == {".mp4", ".mov", ".m4v"}

    def test_the_size_limit_defaults_to_200_mb_and_can_be_set(self, monkeypatch):
        monkeypatch.delenv("VIDEO_MAX_MB", raising=False)
        assert video.max_video_bytes() == 200 * 1024 * 1024
        monkeypatch.setenv("VIDEO_MAX_MB", "50")
        assert video.max_video_bytes() == 50 * 1024 * 1024
        monkeypatch.setenv("VIDEO_MAX_MB", "nonsense")
        assert video.max_video_bytes() == 200 * 1024 * 1024
