ALTER TABLE books
  ADD COLUMN ownership_status TEXT NOT NULL DEFAULT 'owned'
  CHECK(ownership_status IN ('owned', 'disposed'));

ALTER TABLE books
  ADD COLUMN disposed_at TEXT;

CREATE INDEX books_ownership_status_idx ON books(ownership_status);
