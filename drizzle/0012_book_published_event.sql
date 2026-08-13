ALTER TABLE books
  ADD COLUMN published_event_id TEXT REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX books_published_event_idx ON books(published_event_id);
