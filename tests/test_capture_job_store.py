"""
Purpose: Specify the capture job store: states, ownership, idempotency and race safety.

What: runs the real CaptureJobStore against an in-memory fake of the jobs table and
asserts on the rows that end up stored.

Why: the store is what makes background capture safe. If two workers can claim the same
job, a retried upload can create two jobs, or a discarded job can come back to life, a
user is charged twice, sees duplicates, or gets a recipe they threw away.
"""
from datetime import datetime, timedelta, timezone

import pytest

from tests.fakes.jobs_db import new_jobs_db, TABLE
from tools.jobs import CaptureJobStore, MAX_ATTEMPTS, public_job

T0 = datetime(2026, 10, 26, 12, 0, 0, tzinfo=timezone.utc)


class Clock:
    def __init__(self):
        self.now = T0

    def __call__(self):
        return self.now

    def advance(self, **kw):
        self.now += timedelta(**kw)


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def db():
    return new_jobs_db()


@pytest.fixture
def store(db, clock):
    return CaptureJobStore(client_factory=lambda: db, clock=clock)


def make(store, user="u1", req="r1", **kw):
    job, _ = store.create(user, req, audio_path="a.mp3", language=kw.get("language", "auto"), narrator=kw.get("narrator"))
    return job


class TestCreate:
    def test_new_job_is_queued_and_owned(self, store):
        job, created = store.create("u1", "r1", audio_path="a.mp3", language="te", narrator="Lakshmi")
        assert created is True
        assert (job["status"], job["user_id"], job["audio_path"]) == ("queued", "u1", "a.mp3")
        assert (job["language"], job["narrator"], job["attempts"]) == ("te", "Lakshmi", 0)

    def test_same_request_id_returns_the_existing_job(self, store, db):
        first, created1 = store.create("u1", "r1", audio_path="a.mp3")
        again, created2 = store.create("u1", "r1", audio_path="b.mp3")
        assert created1 is True and created2 is False
        assert again["id"] == first["id"]
        assert len(db.rows(TABLE)) == 1

    def test_the_same_request_id_from_another_user_is_a_different_job(self, store, db):
        a, _ = store.create("u1", "r1", audio_path="a.mp3")
        b, created = store.create("u2", "r1", audio_path="b.mp3")
        assert created is True and a["id"] != b["id"]

    def test_other_failures_are_not_mistaken_for_duplicates(self, store, db):
        db.fail_tables.add(TABLE)
        with pytest.raises(RuntimeError):
            store.create("u1", "r1", audio_path="a.mp3")


class TestFindByRequest:
    def test_finds_the_job_for_a_repeated_upload_without_creating_one(self, store, db):
        job = make(store, req="r1")
        assert store.find_by_request("u1", "r1")["id"] == job["id"]
        assert store.find_by_request("u1", "other") is None
        assert store.find_by_request("u2", "r1") is None
        assert len(db.rows(TABLE)) == 1


class TestOwnership:
    def test_owner_can_read_their_job(self, store):
        job = make(store)
        assert store.get_for_user(job["id"], "u1")["id"] == job["id"]

    def test_someone_else_gets_nothing(self, store):
        job = make(store)
        assert store.get_for_user(job["id"], "u2") is None

    def test_unknown_id_gets_nothing(self, store):
        assert store.get_for_user("nope", "u1") is None
        assert store.get("nope") is None

    def test_list_shows_only_my_open_jobs_newest_first(self, store, clock):
        old = make(store, req="a"); clock.advance(seconds=5)
        new = make(store, req="b"); clock.advance(seconds=5)
        make(store, user="u2", req="c")
        saved = make(store, req="d"); store.claim(saved["id"]); store.mark_ready(saved["id"], {}); store.mark_saved(saved["id"], "tok")
        ids = [j["id"] for j in store.list_open("u1")]
        assert ids == [new["id"], old["id"]]          # not the other user's, not the saved one


class TestClaim:
    def test_claim_moves_queued_to_processing_and_counts_the_attempt(self, store):
        job = make(store)
        claimed = store.claim(job["id"])
        assert (claimed["status"], claimed["attempts"], claimed["stage"]) == ("processing", 1, "transcribing")

    def test_only_one_claimer_wins(self, store):
        job = make(store)
        assert store.claim(job["id"]) is not None
        assert store.claim(job["id"]) is None

    def test_a_job_that_is_not_queued_cannot_be_claimed(self, store):
        job = make(store)
        store.claim(job["id"]); store.mark_ready(job["id"], {"title": "x"})
        assert store.claim(job["id"]) is None

    def test_losing_a_race_between_read_and_write_returns_none(self, store, db, monkeypatch):
        job = make(store)
        stale_snapshot = store.get(job["id"])                          # what the slower worker read
        db.rows(TABLE)[0].update(status="processing", attempts=1)      # the faster worker got there first
        monkeypatch.setattr(store, "get", lambda _id: stale_snapshot)
        assert store.claim(job["id"]) is None
        assert db.rows(TABLE)[0]["attempts"] == 1                      # the loser changed nothing


class TestProgressAndResult:
    def test_stage_updates_only_while_processing(self, store):
        job = make(store)
        assert store.set_stage(job["id"], "structuring") is False       # still queued
        store.claim(job["id"])
        assert store.set_stage(job["id"], "structuring") is True
        assert store.get(job["id"])["stage"] == "structuring"

    def test_ready_stores_the_draft_and_clears_the_stage(self, store):
        job = make(store); store.claim(job["id"])
        assert store.mark_ready(job["id"], {"title": "Pesarattu"}) is True
        got = store.get(job["id"])
        assert (got["status"], got["stage"], got["result"]["title"]) == ("ready", None, "Pesarattu")
        assert got["finished_at"] is not None

    def test_a_discarded_job_is_not_revived_by_a_late_result(self, store):
        job = make(store); store.claim(job["id"])
        store.mark_discarded(job["id"], "u1")
        assert store.mark_ready(job["id"], {"title": "late"}) is False
        assert store.get(job["id"])["status"] == "discarded"
        assert store.get(job["id"])["result"] is None

    def test_failure_keeps_a_user_safe_reason(self, store):
        job = make(store); store.claim(job["id"])
        assert store.mark_failed(job["id"], "provider_busy", "Our processing is busy right now.") is True
        got = store.get(job["id"])
        assert (got["status"], got["error_kind"]) == ("failed", "provider_busy")
        assert got["error_message"] == "Our processing is busy right now."

    def test_a_saved_job_cannot_be_failed_afterwards(self, store):
        job = make(store); store.claim(job["id"]); store.mark_ready(job["id"], {}); store.mark_saved(job["id"], "tok")
        assert store.mark_failed(job["id"], "internal", "x") is False
        assert store.get(job["id"])["status"] == "saved"


class TestSave:
    def test_save_only_works_on_a_ready_job_and_records_the_memory(self, store):
        job = make(store)
        assert store.mark_saved(job["id"], "tok") is False               # queued
        store.claim(job["id"]); store.mark_ready(job["id"], {})
        assert store.mark_saved(job["id"], "tok") is True
        got = store.get(job["id"])
        assert (got["status"], got["memory_token"]) == ("saved", "tok")

    def test_saving_twice_does_not_overwrite_the_first_memory(self, store):
        job = make(store); store.claim(job["id"]); store.mark_ready(job["id"], {})
        assert store.mark_saved(job["id"], "first") is True
        assert store.mark_saved(job["id"], "second") is False
        assert store.get(job["id"])["memory_token"] == "first"


class TestRetryAndDiscard:
    def test_retry_requeues_a_failed_job_with_a_fresh_attempt_budget(self, store):
        job = make(store); store.claim(job["id"]); store.mark_failed(job["id"], "internal", "m")
        again = store.requeue_failed(job["id"], "u1")
        assert (again["status"], again["attempts"], again["error_kind"], again["quota_refunded"]) == ("queued", 0, None, False)

    def test_only_the_owner_can_retry_and_only_a_failed_job(self, store):
        job = make(store)
        assert store.requeue_failed(job["id"], "u1") is None             # queued, not failed
        store.claim(job["id"]); store.mark_failed(job["id"], "internal", "m")
        assert store.requeue_failed(job["id"], "u2") is None             # someone else's

    def test_discard_marks_it_and_returns_the_audio_to_delete(self, store):
        job = make(store); store.claim(job["id"]); store.mark_ready(job["id"], {})
        gone = store.mark_discarded(job["id"], "u1")
        assert gone["audio_path"] == "a.mp3"
        assert store.get(job["id"])["status"] == "discarded"

    def test_nobody_else_can_discard_my_job(self, store):
        job = make(store)
        assert store.mark_discarded(job["id"], "u2") is None
        assert store.get(job["id"])["status"] == "queued"

    def test_a_saved_job_cannot_be_discarded_so_its_audio_survives(self, store):
        job = make(store); store.claim(job["id"]); store.mark_ready(job["id"], {}); store.mark_saved(job["id"], "tok")
        assert store.mark_discarded(job["id"], "u1") is None


class TestQuotaRefundFlag:
    def test_the_refund_can_be_claimed_exactly_once(self, store):
        job = make(store)
        assert store.claim_refund(job["id"]) is True
        assert store.claim_refund(job["id"]) is False


class TestRecovery:
    def test_a_stuck_job_goes_back_to_the_queue(self, store, clock):
        job = make(store); store.claim(job["id"])
        clock.advance(minutes=11)
        requeued, failed = store.recover_stale(stale_after_seconds=600)
        assert requeued == [job["id"]] and failed == []
        assert store.get(job["id"])["status"] == "queued"

    def test_a_recent_job_is_left_alone(self, store, clock):
        job = make(store); store.claim(job["id"])
        clock.advance(minutes=2)
        assert store.recover_stale(stale_after_seconds=600) == ([], [])
        assert store.get(job["id"])["status"] == "processing"

    def test_a_job_that_keeps_crashing_the_server_is_failed_not_retried_forever(self, store, clock):
        job = make(store)
        for _ in range(MAX_ATTEMPTS):
            store.claim(job["id"]); clock.advance(minutes=11)
            store.recover_stale(stale_after_seconds=600)
        got = store.get(job["id"])
        assert got["status"] == "failed" and got["error_kind"] == "internal"
        assert got["attempts"] == MAX_ATTEMPTS

    def test_queued_jobs_are_listed_for_rescheduling(self, store):
        a = make(store, req="a"); b = make(store, req="b"); store.claim(b["id"])
        assert store.list_queued_ids() == [a["id"]]


class TestExpiry:
    def _finish(self, store, req, how):
        job = make(store, req=req)
        if how == "queued":
            return job
        store.claim(job["id"])
        if how == "failed":
            store.mark_failed(job["id"], "internal", "m")
        else:
            store.mark_ready(job["id"], {})
            if how == "saved":
                store.mark_saved(job["id"], "tok")
            if how == "discarded":
                store.mark_discarded(job["id"], "u1")
        return job

    def test_which_jobs_expire_after_two_weeks(self, store, clock):
        jobs = {how: self._finish(store, how, how) for how in ("ready", "failed", "discarded", "saved", "queued")}
        clock.advance(days=15)
        fresh = make(store, req="fresh")
        expired = {j["id"]: j["status"] for j in store.find_expired(draft_days=14, saved_days=7)}
        assert expired == {jobs[s]["id"]: s for s in ("ready", "failed", "discarded", "saved")}
        assert fresh["id"] not in expired and jobs["queued"]["id"] not in expired   # recovery handles queued ones

    def test_saved_rows_are_kept_for_less_time_than_drafts(self, store, clock):
        ready = self._finish(store, "r", "ready")
        saved = self._finish(store, "s", "saved")
        clock.advance(days=8)
        assert {j["id"] for j in store.find_expired(draft_days=14, saved_days=7)} == {saved["id"]}
        assert ready["id"] not in {j["id"] for j in store.find_expired(draft_days=14, saved_days=7)}

    def test_delete_rows_removes_only_the_given_jobs(self, store, db):
        a = make(store, req="a"); b = make(store, req="b")
        store.delete_rows([a["id"]])
        assert [r["id"] for r in db.rows(TABLE)] == [b["id"]]

    def test_deleting_nothing_is_a_no_op(self, store, db):
        make(store)
        store.delete_rows([])
        assert len(db.rows(TABLE)) == 1


class TestPublicView:
    def test_hides_internals_and_includes_the_draft_only_when_asked(self, store):
        job = make(store, narrator="Lakshmi"); store.claim(job["id"]); store.mark_ready(job["id"], {"title": "Pesarattu", "steps": ["a"]})
        got = store.get(job["id"])
        summary = public_job(got)
        assert "result" not in summary and summary["title"] == "Pesarattu"
        for hidden in ("user_id", "audio_path", "attempts", "quota_refunded", "client_request_id"):
            assert hidden not in summary
        full = public_job(got, include_result=True)
        assert full["result"]["steps"] == ["a"]

    def test_a_job_without_a_result_has_no_title(self, store):
        job = make(store)
        assert public_job(store.get(job["id"]))["title"] is None
