"""
Purpose: The capture-jobs feature switch.

Why: the new flow ships dark. It must be off for everyone by default, switchable on for
named testers first, and then for everybody, with one environment variable each.
"""
import pytest

from tools.features import capture_jobs_configured, capture_jobs_enabled_for

USER = {"sub": "u-123", "email": "Me@Example.com"}


def enabled(env, user=USER):
    return capture_jobs_enabled_for(user, env)


class TestSwitch:
    def test_off_by_default(self):
        assert enabled({}) is False

    @pytest.mark.parametrize("value", ["1", "true", "TRUE", "yes", "on", " true "])
    def test_global_switch_turns_it_on_for_everyone(self, value):
        assert enabled({"CAPTURE_JOBS_ENABLED": value}) is True

    @pytest.mark.parametrize("value", ["", "0", "false", "no", "off", "maybe"])
    def test_anything_else_is_off(self, value):
        assert enabled({"CAPTURE_JOBS_ENABLED": value}) is False

    def test_allowlist_matches_email_ignoring_case(self):
        assert enabled({"CAPTURE_JOBS_ALLOWLIST": "someone@else.com, me@example.com"}) is True

    def test_allowlist_matches_user_id(self):
        assert enabled({"CAPTURE_JOBS_ALLOWLIST": "u-123"}) is True

    def test_a_user_not_on_the_allowlist_is_off(self):
        assert enabled({"CAPTURE_JOBS_ALLOWLIST": "someone@else.com"}) is False

    def test_an_empty_allowlist_never_matches_a_user_with_no_email(self):
        assert enabled({"CAPTURE_JOBS_ALLOWLIST": ""}, {"sub": "u1"}) is False
        assert enabled({"CAPTURE_JOBS_ALLOWLIST": " , "}, {"sub": "u1"}) is False

    def test_global_switch_wins_over_the_allowlist(self):
        assert enabled({"CAPTURE_JOBS_ENABLED": "true", "CAPTURE_JOBS_ALLOWLIST": "x@y.z"}) is True


class TestConfigured:
    def test_idle_when_nothing_is_set(self):
        assert capture_jobs_configured({}) is False
        assert capture_jobs_configured({"CAPTURE_JOBS_ENABLED": "false", "CAPTURE_JOBS_ALLOWLIST": " , "}) is False

    def test_active_with_either_setting(self):
        assert capture_jobs_configured({"CAPTURE_JOBS_ENABLED": "true"}) is True
        assert capture_jobs_configured({"CAPTURE_JOBS_ALLOWLIST": "a@b.c"}) is True
