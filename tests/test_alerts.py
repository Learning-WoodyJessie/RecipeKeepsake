"""
send_alert() emails the operator when something fails that the user cannot fix.

It runs on failure paths, so the one rule above all others is that it must
never raise or make things worse. Email goes out through the Resend API with
httpx, so the HTTP call is mocked here — no network, no real email.
"""
from unittest.mock import MagicMock, patch

import httpx
import pytest

import tools.alerts as alerts

ENV = {"RESEND_API_KEY": "re_test", "ALERT_EMAIL_TO": "owner@example.com"}


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    alerts._last_sent.clear()
    for name in ("RESEND_API_KEY", "ALERT_EMAIL_TO", "ALERT_EMAIL_FROM"):
        monkeypatch.delenv(name, raising=False)


def configure(monkeypatch, **extra):
    for k, v in {**ENV, **extra}.items():
        monkeypatch.setenv(k, v)


def ok_response():
    resp = MagicMock()
    resp.raise_for_status.return_value = None
    return resp


class TestSending:
    def test_posts_to_resend_with_the_key_recipient_subject_and_body(self, monkeypatch):
        configure(monkeypatch)
        with patch("tools.alerts.httpx.post", return_value=ok_response()) as post:
            assert alerts.send_alert("k", "Subject line", "Body text") is True
        url = post.call_args.args[0]
        kwargs = post.call_args.kwargs
        assert url == "https://api.resend.com/emails"
        assert kwargs["headers"]["Authorization"] == "Bearer re_test"
        assert kwargs["json"]["to"] == ["owner@example.com"]
        assert kwargs["json"]["subject"] == "Subject line"
        assert kwargs["json"]["text"] == "Body text"
        assert kwargs["timeout"] <= 10

    def test_several_recipients_can_be_comma_separated(self, monkeypatch):
        configure(monkeypatch, ALERT_EMAIL_TO="a@x.com, b@x.com ,")
        with patch("tools.alerts.httpx.post", return_value=ok_response()) as post:
            alerts.send_alert("k", "s", "b")
        assert post.call_args.kwargs["json"]["to"] == ["a@x.com", "b@x.com"]

    def test_a_custom_sender_is_used_when_set(self, monkeypatch):
        configure(monkeypatch, ALERT_EMAIL_FROM="Ops <ops@echoes.com>")
        with patch("tools.alerts.httpx.post", return_value=ok_response()) as post:
            alerts.send_alert("k", "s", "b")
        assert post.call_args.kwargs["json"]["from"] == "Ops <ops@echoes.com>"


class TestNeverMakesThingsWorse:
    def test_not_configured_makes_no_network_call_and_returns_false(self):
        with patch("tools.alerts.httpx.post") as post:
            assert alerts.send_alert("k", "s", "b") is False
        post.assert_not_called()

    def test_half_configured_is_treated_as_not_configured(self, monkeypatch):
        monkeypatch.setenv("RESEND_API_KEY", "re_test")
        with patch("tools.alerts.httpx.post") as post:
            assert alerts.send_alert("k", "s", "b") is False
        post.assert_not_called()

    @pytest.mark.parametrize("exc", [
        httpx.ConnectTimeout("slow"),
        httpx.ConnectError("down"),
        RuntimeError("anything at all"),
    ])
    def test_network_errors_are_swallowed(self, monkeypatch, exc):
        configure(monkeypatch)
        with patch("tools.alerts.httpx.post", side_effect=exc):
            assert alerts.send_alert("k", "s", "b") is False

    def test_a_rejected_request_is_swallowed(self, monkeypatch):
        configure(monkeypatch)
        resp = MagicMock()
        resp.raise_for_status.side_effect = httpx.HTTPStatusError("401", request=MagicMock(), response=MagicMock())
        with patch("tools.alerts.httpx.post", return_value=resp):
            assert alerts.send_alert("k", "s", "b") is False

    def test_a_failed_send_does_not_start_the_cooldown(self, monkeypatch):
        configure(monkeypatch)
        with patch("tools.alerts.httpx.post", side_effect=httpx.ConnectError("down")):
            alerts.send_alert("k", "s", "b")
        with patch("tools.alerts.httpx.post", return_value=ok_response()) as post:
            assert alerts.send_alert("k", "s", "b") is True
        post.assert_called_once()


class TestCooldown:
    def test_a_repeat_for_the_same_key_is_not_emailed_again(self, monkeypatch):
        configure(monkeypatch)
        with patch("tools.alerts.httpx.post", return_value=ok_response()) as post:
            assert alerts.send_alert("user-1", "s", "b") is True
            assert alerts.send_alert("user-1", "s", "b") is False
        assert post.call_count == 1

    def test_a_different_key_is_still_emailed(self, monkeypatch):
        configure(monkeypatch)
        with patch("tools.alerts.httpx.post", return_value=ok_response()) as post:
            alerts.send_alert("user-1", "s", "b")
            alerts.send_alert("user-2", "s", "b")
        assert post.call_count == 2

    def test_the_same_key_can_be_emailed_again_after_the_cooldown(self, monkeypatch):
        configure(monkeypatch)
        with patch("tools.alerts.httpx.post", return_value=ok_response()) as post, \
             patch("tools.alerts.time.monotonic", side_effect=[1000.0, 1000.0 + alerts.COOLDOWN_SECONDS + 1]):
            alerts.send_alert("user-1", "s", "b")
            assert alerts.send_alert("user-1", "s", "b") is True
        assert post.call_count == 2


class TestAlwaysLogged:
    def test_every_alert_is_logged_even_when_email_is_off_or_suppressed(self, caplog):
        with caplog.at_level("ERROR", logger="tools.alerts"):
            alerts.send_alert("user-1", "Account deletion failed", "details here")
        assert "event=ALERT" in caplog.text and "user-1" in caplog.text
