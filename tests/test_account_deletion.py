"""
Account deletion must remove the user's data, not just their login.

The old delete_account() removed memories, people, audio files and the login,
but left photos in two storage buckets, family groups/memberships, viewer
invites, reactions, the profile and usage counters — and the endpoint said
"deleted" even when steps failed. These tests run the real functions against
an in-memory fake of Supabase and assert on the rows and files that REMAIN,
which is what actually matters to the person who asked to be deleted.
"""
import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import tools.storage as storage
from scripts.serve import app, require_auth
from tools.storage import AccountDeletionIncomplete, delete_account

PROJECT = "https://proj.supabase.co/storage/v1/object/public"


class FakeQuery:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self.op, self.filters, self.payload = "select", [], None

    def select(self, *_a, **_k): self.op = "select"; return self
    def delete(self): self.op = "delete"; return self
    def update(self, payload): self.op, self.payload = "update", payload; return self
    def eq(self, col, val): self.filters.append(("eq", col, val)); return self
    def in_(self, col, vals): self.filters.append(("in", col, list(vals))); return self

    def _match(self, row):
        for kind, col, val in self.filters:
            if kind == "eq" and row.get(col) != val:
                return False
            if kind == "in" and row.get(col) not in val:
                return False
        return True

    def execute(self):
        if self.table in self.db.fail_tables and self.op != "select":
            raise RuntimeError(f"boom on {self.table}")
        rows = self.db.tables.setdefault(self.table, [])
        hit = [r for r in rows if self._match(r)]
        if self.op == "delete":
            self.db.tables[self.table] = [r for r in rows if r not in hit]
        elif self.op == "update":
            for r in hit:
                r.update(self.payload)
        return type("Res", (), {"data": [dict(r) for r in hit]})()


class FakeStorageBucket:
    def __init__(self, db, name): self.db, self.name = db, name

    def remove(self, names):
        if self.name in self.db.fail_buckets:
            raise RuntimeError(f"storage down: {self.name}")
        self.db.removed.setdefault(self.name, []).extend(names)


class FakeSB:
    def __init__(self, tables):
        self.tables = {k: [dict(r) for r in v] for k, v in tables.items()}
        self.removed, self.deleted_logins = {}, []
        self.fail_tables, self.fail_buckets, self.fail_auth = set(), set(), False
        outer = self
        self.storage = type("S", (), {"from_": lambda _s, name: FakeStorageBucket(outer, name)})()
        self.auth = type("A", (), {"admin": type("Ad", (), {"delete_user": lambda _s, uid: outer._del(uid)})()})()

    def _del(self, uid):
        if self.fail_auth:
            raise RuntimeError("auth down")
        self.deleted_logins.append(uid)

    def table(self, name): return FakeQuery(self, name)

    def ids(self, table, col="user_id"): return [r.get(col) for r in self.tables.get(table, [])]


def seed():
    """Alice (being deleted) and Bob (bystander), each with a full set of data."""
    return {
        "memories": [
            {"token": "a1", "user_id": "alice", "audio_url": "alice1.webm", "image_url": f"{PROJECT}/memory-photos/p1.jpg"},
            {"token": "a2", "user_id": "alice", "audio_url": f"{PROJECT}/audio/alice2.mp3", "image_url": f"{PROJECT}/images/dalle.png"},
            {"token": "a3", "user_id": "alice", "audio_url": "", "image_url": "https://cdn.openai.com/external.png"},
            {"token": "b1", "user_id": "bob", "audio_url": "bob1.webm", "image_url": f"{PROJECT}/images/bobs.png"},
        ],
        "people": [
            {"id": "pa", "user_id": "alice", "photo_url": f"{PROJECT}/images/amma.jpg"},
            {"id": "pb", "user_id": "bob", "photo_url": f"{PROJECT}/images/bobperson.jpg"},
        ],
        "reactions": [
            {"id": 1, "memory_token": "a1", "user_id": "bob", "emoji": "x"},     # bob reacted to alice's memory
            {"id": 2, "memory_token": "b1", "user_id": "alice", "emoji": "x"},   # alice reacted to bob's memory
            {"id": 3, "memory_token": "b1", "user_id": "bob", "emoji": "x"},     # untouched
        ],
        "viewers": [
            {"id": "v1", "owner_user_id": "alice", "email": "friend@x.com", "phone": None},   # alice invited someone
            {"id": "v2", "owner_user_id": "bob", "email": "alice@x.com", "phone": None},      # bob invited alice
            {"id": "v3", "owner_user_id": "bob", "email": "other@x.com", "phone": None},      # unrelated
        ],
        "profiles": [{"user_id": "alice", "is_pro": False}, {"user_id": "bob", "is_pro": True}],
        "rate_limits": [{"user_id": "alice", "endpoint": "capture", "count": 3}, {"user_id": "bob", "endpoint": "capture", "count": 1}],
        "family_groups": [], "family_group_members": [],
    }


def run(sb, **kw):
    with patch("tools.storage._client", return_value=sb):
        delete_account("alice", **kw)


class TestWhatGetsDeleted:
    def test_all_of_the_users_rows_are_gone_and_bobs_are_not(self):
        sb = FakeSB(seed())
        run(sb, email="alice@x.com")
        assert "alice" not in sb.ids("memories") and sb.ids("memories") == ["bob"]
        assert sb.ids("people") == ["bob"]
        assert sb.ids("profiles") == ["bob"]
        assert sb.ids("rate_limits") == ["bob"]
        # alice's own invite (v1) and the one naming her email (v2) are gone; bob's unrelated v3 stays
        assert sb.ids("viewers", "owner_user_id") == ["bob"]

    def test_reactions_on_the_users_memories_and_by_the_user_are_removed(self):
        sb = FakeSB(seed())
        run(sb)
        assert [r["id"] for r in sb.tables["reactions"]] == [3]

    def test_invites_naming_the_users_email_in_other_peoples_lists_are_removed(self):
        sb = FakeSB(seed())
        run(sb, email="alice@x.com")
        assert [v["id"] for v in sb.tables["viewers"]] == ["v3"]

    def test_without_an_email_other_peoples_invite_lists_are_left_alone(self):
        sb = FakeSB(seed())
        run(sb)
        assert {v["id"] for v in sb.tables["viewers"]} == {"v2", "v3"}

    def test_the_login_is_deleted_last_and_exactly_once(self):
        sb = FakeSB(seed())
        run(sb)
        assert sb.deleted_logins == ["alice"]


class TestPhotosAndAudioFiles:
    def test_files_removed_from_all_three_buckets_using_the_right_names(self):
        sb = FakeSB(seed())
        run(sb)
        assert sorted(sb.removed["audio"]) == ["alice1.webm", "alice2.mp3"]
        assert sorted(sb.removed["images"]) == ["amma.jpg", "dalle.png"]
        assert sb.removed["memory-photos"] == ["p1.jpg"]

    def test_external_image_urls_and_other_users_files_are_never_touched(self):
        sb = FakeSB(seed())
        run(sb)
        everything = [n for names in sb.removed.values() for n in names]
        assert "external.png" not in everything
        assert not any("bob" in n for n in everything)

    def test_url_encoded_names_are_decoded(self):
        data = seed()
        data["memories"][0]["image_url"] = f"{PROJECT}/memory-photos/my%20photo.jpg"
        sb = FakeSB(data)
        run(sb)
        assert "my photo.jpg" in sb.removed["memory-photos"]

    def test_a_large_account_is_removed_in_batches(self):
        data = seed()
        data["memories"] += [
            {"token": f"m{i}", "user_id": "alice", "audio_url": f"f{i}.webm", "image_url": ""} for i in range(250)
        ]
        sb = FakeSB(data)
        run(sb)
        assert len(sb.removed["audio"]) == 252
        assert sb.ids("memories") == ["bob"]

    def test_object_name_helper_rejects_foreign_and_empty_urls(self):
        f = storage._storage_object_name
        assert f("", "images") is None
        assert f("not-a-url", "images") is None
        assert f("https://elsewhere.com/images/x.png", "images") is None
        assert f(f"{PROJECT}/images/x.png", "memory-photos") is None
        assert f(f"{PROJECT}/images/x.png", "images") == "x.png"


class TestFamilyGroups:
    def groups(self, members, owner="alice"):
        data = seed()
        data["family_groups"] = [{"id": "g1", "owner_id": owner, "name": "Fam"}]
        data["family_group_members"] = members
        return data

    def test_last_member_deletes_the_whole_group(self):
        sb = FakeSB(self.groups([{"group_id": "g1", "user_id": "alice", "role": "admin", "joined_at": "1"}]))
        run(sb)
        assert sb.tables["family_groups"] == [] and sb.tables["family_group_members"] == []

    def test_group_survives_for_the_others_and_ownership_moves_to_an_admin_first(self):
        sb = FakeSB(self.groups([
            {"group_id": "g1", "user_id": "alice", "role": "admin", "joined_at": "1"},
            {"group_id": "g1", "user_id": "carol", "role": "contributor", "joined_at": "2"},
            {"group_id": "g1", "user_id": "dave", "role": "admin", "joined_at": "9"},
        ]))
        run(sb)
        assert sb.tables["family_groups"][0]["owner_id"] == "dave"
        assert {m["user_id"]: m["role"] for m in sb.tables["family_group_members"]} == {"carol": "contributor", "dave": "admin"}

    def test_with_no_admin_left_the_earliest_member_inherits_and_is_promoted(self):
        sb = FakeSB(self.groups([
            {"group_id": "g1", "user_id": "alice", "role": "admin", "joined_at": "1"},
            {"group_id": "g1", "user_id": "late", "role": "contributor", "joined_at": "8"},
            {"group_id": "g1", "user_id": "early", "role": "contributor", "joined_at": "3"},
        ]))
        run(sb)
        assert sb.tables["family_groups"][0]["owner_id"] == "early"
        assert {m["user_id"]: m["role"] for m in sb.tables["family_group_members"]}["early"] == "admin"

    def test_a_non_owner_member_just_leaves(self):
        sb = FakeSB(self.groups([
            {"group_id": "g1", "user_id": "alice", "role": "contributor", "joined_at": "5"},
            {"group_id": "g1", "user_id": "carol", "role": "admin", "joined_at": "1"},
        ], owner="carol"))
        run(sb)
        assert sb.tables["family_groups"][0]["owner_id"] == "carol"
        assert sb.ids("family_group_members") == ["carol"]

    def test_other_members_memories_are_untouched(self):
        sb = FakeSB(self.groups([
            {"group_id": "g1", "user_id": "alice", "role": "admin", "joined_at": "1"},
            {"group_id": "g1", "user_id": "bob", "role": "contributor", "joined_at": "2"},
        ]))
        run(sb)
        assert [m["token"] for m in sb.tables["memories"]] == ["b1"]

    def test_a_group_owned_by_the_user_with_no_membership_row_is_still_cleaned_up(self):
        data = seed()
        data["family_groups"] = [{"id": "g9", "owner_id": "alice", "name": "Orphan"}]
        sb = FakeSB(data)
        run(sb)
        assert sb.tables["family_groups"] == []


class TestFailuresAreReportedAndRetryable:
    def test_a_storage_failure_stops_before_any_row_is_deleted_and_keeps_the_login(self):
        sb = FakeSB(seed())
        sb.fail_buckets = {"images"}
        with pytest.raises(AccountDeletionIncomplete) as exc:
            run(sb)
        assert "files in images" in exc.value.failures
        assert len(sb.tables["memories"]) == 4 and len(sb.tables["people"]) == 2
        assert sb.deleted_logins == []

    def test_a_database_failure_still_runs_the_other_steps_but_keeps_the_login(self):
        sb = FakeSB(seed())
        sb.fail_tables = {"profiles"}
        with pytest.raises(AccountDeletionIncomplete) as exc:
            run(sb)
        assert exc.value.failures == ["profile"]
        assert sb.ids("memories") == ["bob"]            # the rest was still deleted
        assert sb.deleted_logins == []                  # but the login stays so they can retry

    def test_retrying_after_the_failure_clears_succeeds_and_finishes_the_job(self):
        sb = FakeSB(seed())
        sb.fail_tables = {"profiles"}
        with pytest.raises(AccountDeletionIncomplete):
            run(sb)
        sb.fail_tables = set()
        run(sb)
        assert sb.ids("profiles") == ["bob"] and sb.deleted_logins == ["alice"]

    def test_a_login_deletion_failure_is_reported_not_swallowed(self):
        sb = FakeSB(seed())
        sb.fail_auth = True
        with pytest.raises(AccountDeletionIncomplete) as exc:
            run(sb)
        assert exc.value.failures == ["login"]

    def test_failing_to_read_the_account_deletes_nothing(self):
        sb = FakeSB(seed())
        class Boom(FakeQuery):
            def execute(self):
                raise RuntimeError("db down")
        sb.table = lambda name: Boom(sb, name)
        with pytest.raises(AccountDeletionIncomplete):
            run(sb)
        assert sb.deleted_logins == [] and len(sb.tables["memories"]) == 4


class TestEndpoint:
    def teardown_method(self):
        app.dependency_overrides.pop(require_auth, None)

    def call(self, side_effect=None):
        async def fake_user():
            return {"sub": "alice", "email": "alice@x.com", "phone": "+15550001"}
        app.dependency_overrides[require_auth] = fake_user
        with patch("tools.storage.delete_account", side_effect=side_effect) as m, \
             patch("tools.alerts.send_alert") as alert:
            res = TestClient(app).delete("/account", headers={"Authorization": "Bearer x"})
        return res, m, alert

    def test_success_reports_deleted_passes_email_and_phone_and_sends_no_alert(self):
        res, m, alert = self.call()
        assert res.status_code == 200 and res.json() == {"deleted": True}
        m.assert_called_once_with("alice", email="alice@x.com", phone="+15550001")
        alert.assert_not_called()

    def test_an_incomplete_deletion_is_a_500_not_a_false_success(self):
        res, _, _ = self.call(AccountDeletionIncomplete(["profile"]))
        assert res.status_code == 500
        assert res.json().get("deleted") is None

    def test_the_user_sees_a_generic_message_with_no_internal_detail(self):
        res, _, _ = self.call(AccountDeletionIncomplete(["files in images", "profile"]))
        detail = res.json()["detail"]
        assert "Something went wrong" in detail
        for leak in ("profile", "images", "files", "alice", "still active", "removed", "step"):
            assert leak not in detail

    def test_the_operator_is_alerted_with_the_user_id_and_failed_steps(self):
        res, _, alert = self.call(AccountDeletionIncomplete(["files in images", "profile"]))
        alert.assert_called_once()
        key, subject, body = alert.call_args.args
        assert key == "delete-account:alice"
        assert "Account deletion failed" in subject
        assert "alice" in body and "files in images" in body and "profile" in body

    def test_the_alert_does_not_include_the_users_email_or_phone(self):
        _, _, alert = self.call(AccountDeletionIncomplete(["profile"]))
        _, subject, body = alert.call_args.args
        for pii in ("alice@x.com", "+15550001"):
            assert pii not in subject and pii not in body

    def test_an_unexpected_crash_gets_the_same_generic_message_and_an_alert(self):
        res, _, alert = self.call(RuntimeError("kaboom with secrets"))
        assert res.status_code == 500
        assert "kaboom" not in res.json()["detail"]
        assert "unexpected RuntimeError" in alert.call_args.args[2]
