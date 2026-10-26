"""
Purpose: The storage helpers behind background capture, and account deletion's handling of drafts.

Why: an unsaved draft is the user's private voice recording that no memory points at. If
deleting an account leaves it behind, the user asked for deletion and their audio is still
there. And account deletion must keep working on a deployment where the capture_jobs
table has not been created yet.
"""
import pytest

import tools.storage as storage
from tests.fakes.fake_supabase import FakeSupabase
from tests.fakes.jobs_db import new_jobs_db, TABLE
from tools.storage import AccountDeletionIncomplete, delete_account


@pytest.fixture
def use(monkeypatch):
    def _use(db):
        monkeypatch.setattr(storage, "_supabase", db)
        return db
    return _use


class TestAudioHelpers:
    def test_download_reads_from_the_private_audio_bucket(self, use):
        db = use(FakeSupabase()); db.files["audio"] = {"a.mp3": b"bytes"}
        assert storage.download_stored_audio("a.mp3") == b"bytes"

    def test_delete_removes_files_and_ignores_an_empty_list(self, use):
        db = use(FakeSupabase()); db.files["audio"] = {"a.mp3": b"1", "b.mp3": b"2"}
        storage.delete_stored_audio([])
        storage.delete_stored_audio(["a.mp3"])
        assert list(db.files["audio"]) == ["b.mp3"]

    def test_delete_raises_when_storage_refuses_so_callers_keep_their_rows(self, use):
        db = use(FakeSupabase()); db.fail_buckets.add("audio")
        with pytest.raises(RuntimeError):
            storage.delete_stored_audio(["a.mp3"])


class TestAttachGeneratedImage:
    def test_sets_the_image_when_the_memory_has_none(self, use):
        db = use(FakeSupabase({"memories": [{"token": "t", "image_url": ""}, {"token": "n", "image_url": None}]}))
        assert storage.attach_generated_image("t", "http://img/1") is True
        assert storage.attach_generated_image("n", "http://img/2") is True
        assert [r["image_url"] for r in db.rows("memories")] == ["http://img/1", "http://img/2"]

    def test_never_overwrites_a_photo_the_owner_added_meanwhile(self, use):
        db = use(FakeSupabase({"memories": [{"token": "t", "image_url": "http://mine"}]}))
        assert storage.attach_generated_image("t", "http://generated") is False
        assert db.rows("memories")[0]["image_url"] == "http://mine"

    def test_an_empty_url_changes_nothing(self, use):
        db = use(FakeSupabase({"memories": [{"token": "t", "image_url": ""}]}))
        assert storage.attach_generated_image("t", "") is False


class TestAccountDeletionRemovesDrafts:
    def _db(self):
        db = new_jobs_db({
            "memories": [{"token": "m1", "user_id": "alice", "audio_url": "saved.mp3", "image_url": None}],
            "people": [],
            TABLE: [
                {"id": "j1", "user_id": "alice", "audio_path": "draft1.mp3", "status": "ready"},
                {"id": "j2", "user_id": "alice", "audio_path": "draft2.mp3", "status": "failed"},
                {"id": "j3", "user_id": "alice", "audio_path": "saved.mp3", "status": "saved"},
                {"id": "j4", "user_id": "bob", "audio_path": "bobs.mp3", "status": "ready"},
            ],
        })
        db.files["audio"] = {n: b"x" for n in ("saved.mp3", "draft1.mp3", "draft2.mp3", "bobs.mp3")}
        return db

    def test_her_draft_audio_and_rows_are_removed_and_his_are_untouched(self, use):
        db = use(self._db())
        delete_account("alice")
        assert set(db.files["audio"]) == {"bobs.mp3"}
        assert [r["id"] for r in db.rows(TABLE)] == ["j4"]
        assert db.rows("memories") == []

    def test_a_file_shared_by_a_memory_and_a_job_is_only_listed_once(self, use):
        db = use(self._db())
        delete_account("alice")
        assert sorted(db.removed["audio"]) == ["draft1.mp3", "draft2.mp3", "saved.mp3"]

    def test_works_before_the_migration_has_been_run(self, use):
        """The deploy that adds this code can land before 006 is run. Deleting accounts must not break."""
        db = self._db(); db.missing_tables.add(TABLE)
        use(db)
        delete_account("alice")                      # must not raise
        assert db.rows("memories") == []
        assert db.deleted_logins == ["alice"]
        # nothing can know about drafts yet, so only the memory's audio was removed
        assert set(db.files["audio"]) == {"draft1.mp3", "draft2.mp3", "bobs.mp3"}

    def test_a_real_failure_reading_the_drafts_stops_the_deletion(self, use):
        db = self._db(); db.fail_tables.add(TABLE)
        use(db)
        with pytest.raises(AccountDeletionIncomplete):
            delete_account("alice")
        assert db.rows("memories") != []             # nothing was touched, so a retry can still find everything
