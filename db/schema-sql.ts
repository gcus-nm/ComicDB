export const INITIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT NOT NULL,
  blocked_until TEXT
);

CREATE TABLE IF NOT EXISTS storage_locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(name, parent_id)
);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  adult_rating TEXT NOT NULL DEFAULT 'general' CHECK(adult_rating IN ('general', 'r18')),
  published_on TEXT,
  published_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  edition TEXT NOT NULL DEFAULT '',
  storage_location_id TEXT REFERENCES storage_locations(id) ON DELETE SET NULL,
  read_status TEXT NOT NULL DEFAULT 'unread' CHECK(read_status IN ('unread', 'reading', 'read')),
  ownership_status TEXT NOT NULL DEFAULT 'owned' CHECK(ownership_status IN ('owned', 'disposed')),
  disposed_at TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  links TEXT NOT NULL DEFAULT '[]',
  cover_path TEXT,
  thumbnail_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS books_normalized_title_idx ON books(normalized_title);
CREATE INDEX IF NOT EXISTS books_published_event_idx ON books(published_event_id);
CREATE INDEX IF NOT EXISTS books_ownership_status_idx ON books(ownership_status);
CREATE INDEX IF NOT EXISTS books_updated_idx ON books(updated_at);

CREATE TABLE IF NOT EXISTS circles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS book_circles (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(book_id, circle_id)
);
CREATE INDEX IF NOT EXISTS book_circles_circle_idx ON book_circles(circle_id);

CREATE TABLE IF NOT EXISTS creators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS book_creators (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  PRIMARY KEY(book_id, creator_id)
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom' CHECK(type IN ('fandom', 'character', 'pairing', 'genre', 'custom')),
  parent_tag_id TEXT REFERENCES tags(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  CHECK(type IN ('character', 'pairing') OR parent_tag_id IS NULL)
);
CREATE INDEX IF NOT EXISTS tags_type_idx ON tags(type);
CREATE INDEX IF NOT EXISTS tags_parent_idx ON tags(parent_tag_id);
CREATE UNIQUE INDEX IF NOT EXISTS tags_root_name_type_uq
  ON tags(normalized_name, type) WHERE parent_tag_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tags_child_name_type_parent_uq
  ON tags(normalized_name, type, parent_tag_id) WHERE parent_tag_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS book_tags (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(book_id, tag_id)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  venue TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  links TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_starts_on_idx ON events(starts_on);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  book_id TEXT REFERENCES books(id) ON DELETE SET NULL,
  event_day INTEGER NOT NULL DEFAULT 1 CHECK(event_day >= 1),
  title TEXT NOT NULL,
  circle TEXT NOT NULL DEFAULT '',
  creators TEXT NOT NULL DEFAULT '',
  fandom_tag_ids TEXT NOT NULL DEFAULT '[]',
  character_tag_ids TEXT NOT NULL DEFAULT '[]',
  pairing_tag_ids TEXT NOT NULL DEFAULT '[]',
  genres TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  adult_rating TEXT NOT NULL DEFAULT 'general' CHECK(adult_rating IN ('general', 'r18')),
  published_on TEXT,
  edition TEXT NOT NULL DEFAULT '',
  cover_path TEXT,
  thumbnail_path TEXT,
  booth TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  price_yen INTEGER CHECK(price_yen IS NULL OR price_yen >= 0),
  notes TEXT NOT NULL DEFAULT '',
  links TEXT NOT NULL DEFAULT '[]',
  purchased INTEGER NOT NULL DEFAULT 0 CHECK(purchased IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS wishlist_items_event_idx
  ON wishlist_items(event_id);
CREATE INDEX IF NOT EXISTS wishlist_items_book_idx
  ON wishlist_items(book_id);
CREATE INDEX IF NOT EXISTS wishlist_items_event_purchased_idx
  ON wishlist_items(event_id, purchased);

CREATE TABLE IF NOT EXISTS acquisitions (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  purchased_on TEXT,
  price_yen INTEGER,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS acquisitions_book_idx ON acquisitions(book_id);
CREATE INDEX IF NOT EXISTS acquisitions_event_idx ON acquisitions(event_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS google_integrations (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_subject TEXT NOT NULL,
  google_email TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  granted_scopes TEXT NOT NULL,
  spreadsheet_id TEXT,
  spreadsheet_name TEXT,
  sheet_id INTEGER,
  sheet_title TEXT,
  last_push_at TEXT,
  last_pull_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS google_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS google_oauth_states_expires_idx
  ON google_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS api_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  result TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS api_audit_logs_at_idx
  ON api_audit_logs(at DESC);

CREATE TABLE IF NOT EXISTS api_idempotency_records (
  actor TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scope TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(actor, key_hash)
);
CREATE INDEX IF NOT EXISTS api_idempotency_created_at_idx
  ON api_idempotency_records(created_at);
`;
