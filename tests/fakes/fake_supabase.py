"""
Purpose: A small in-memory stand-in for the parts of supabase-py that the job store uses.

What: tables with insert / select / update / delete, the filters eq, neq, in_, lt, lte,
is_, order, limit and single, unique constraints, and a storage bucket with
upload / download / remove.

How: every query records its filters and applies them when execute() runs. Updates and
deletes apply the filters at write time, which is what makes conditional updates
("claim this job only if it is still queued") behave like the real database: the
returned rows are exactly the rows that changed.

Why: tests should assert on the rows and files that actually end up in the store, not on
which mock methods were called.
"""
from __future__ import annotations

import copy
import uuid
from types import SimpleNamespace


class DuplicateKey(Exception):
    """Mimics postgrest's unique-violation error text."""

    def __init__(self, constraint: str):
        super().__init__(f'duplicate key value violates unique constraint "{constraint}" (23505)')


class FakeQuery:
    def __init__(self, db: "FakeSupabase", table: str):
        self.db, self.table = db, table
        self.op, self.payload = "select", None
        self.filters: list[tuple] = []
        self._order: tuple[str, bool] | None = None
        self._limit: int | None = None
        self._single = False

    # -- builders
    def select(self, *_a, **_k): self.op = "select"; return self
    def insert(self, payload): self.op, self.payload = "insert", payload; return self
    def update(self, payload): self.op, self.payload = "update", payload; return self
    def delete(self): self.op = "delete"; return self
    def eq(self, col, val): self.filters.append(("eq", col, val)); return self
    def neq(self, col, val): self.filters.append(("neq", col, val)); return self
    def in_(self, col, vals): self.filters.append(("in", col, list(vals))); return self
    def lt(self, col, val): self.filters.append(("lt", col, val)); return self
    def lte(self, col, val): self.filters.append(("lte", col, val)); return self
    def is_(self, col, val): self.filters.append(("is", col, val)); return self
    def ilike(self, col, pattern): self.filters.append(("ilike", col, pattern)); return self
    def order(self, col, desc=False): self._order = (col, bool(desc)); return self
    def limit(self, n): self._limit = n; return self
    def single(self): self._single = True; return self

    # -- evaluation
    def _match(self, row: dict) -> bool:
        for kind, col, val in self.filters:
            have = row.get(col)
            if kind == "eq" and have != val: return False
            if kind == "neq" and have == val: return False
            if kind == "in" and have not in val: return False
            if kind == "lt" and not (have is not None and have < val): return False
            if kind == "lte" and not (have is not None and have <= val): return False
            if kind == "ilike" and str(have or "").lower() != str(val).lower().strip("%"): return False
            if kind == "is" and have != (None if val in ("null", None) else val): return False
        return True

    def execute(self):
        db = self.db
        if self.table in db.missing_tables:
            raise RuntimeError(f"PGRST205: Could not find the table 'public.{self.table}' in the schema cache")
        if self.table in db.fail_tables:
            raise RuntimeError(f"boom on {self.table}")
        rows = db.tables.setdefault(self.table, [])

        if self.op == "insert":
            new = copy.deepcopy(self.payload)
            new.setdefault("id", str(uuid.uuid4()))
            for cols in db.unique.get(self.table, []):
                if any(all(r.get(c) == new.get(c) for c in cols) for r in rows):
                    raise DuplicateKey(f"{self.table}_{'_'.join(cols)}")
            for col, default in db.defaults.get(self.table, {}).items():
                new.setdefault(col, default() if callable(default) else default)
            rows.append(new)
            return SimpleNamespace(data=[copy.deepcopy(new)], count=1)

        hit = [r for r in rows if self._match(r)]
        if self.op == "update":
            for r in hit:
                r.update(copy.deepcopy(self.payload))
        elif self.op == "delete":
            db.tables[self.table] = [r for r in rows if r not in hit]

        out = [copy.deepcopy(r) for r in hit]
        if self._order:
            col, desc = self._order
            out.sort(key=lambda r: (r.get(col) is None, r.get(col)), reverse=desc)
        if self._limit is not None:
            out = out[: self._limit]
        if self._single:
            if not out:
                raise RuntimeError("no rows (single)")
            return SimpleNamespace(data=out[0], count=1)
        return SimpleNamespace(data=out, count=len(hit))


class FakeBucket:
    def __init__(self, db: "FakeSupabase", name: str):
        self.db, self.name = db, name

    def upload(self, path, file, file_options=None):
        if self.name in self.db.fail_buckets:
            raise RuntimeError(f"storage down: {self.name}")
        self.db.files.setdefault(self.name, {})[path] = file
        return {"path": path}

    def download(self, path):
        try:
            return self.db.files[self.name][path]
        except KeyError:
            raise RuntimeError(f"object not found: {path}")

    def remove(self, names):
        if self.name in self.db.fail_buckets:
            raise RuntimeError(f"storage down: {self.name}")
        for n in names:
            self.db.files.get(self.name, {}).pop(n, None)
        self.db.removed.setdefault(self.name, []).extend(names)


class FakeSupabase:
    def __init__(self, tables: dict | None = None):
        self.tables = {k: copy.deepcopy(v) for k, v in (tables or {}).items()}
        self.files: dict[str, dict[str, bytes]] = {}
        self.removed: dict[str, list[str]] = {}
        self.unique: dict[str, list[tuple[str, ...]]] = {}
        self.defaults: dict[str, dict] = {}
        self.fail_tables: set[str] = set()
        self.missing_tables: set[str] = set()      # tables whose migration has not been run
        self.fail_buckets: set[str] = set()
        outer = self
        self.storage = SimpleNamespace(from_=lambda name: FakeBucket(outer, name))
        self.deleted_logins: list[str] = []
        self.auth = SimpleNamespace(admin=SimpleNamespace(delete_user=self.deleted_logins.append))

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self, name)

    def rows(self, table: str) -> list[dict]:
        """The live list of rows (created on first use), so tests can append to it."""
        return self.tables.setdefault(table, [])
