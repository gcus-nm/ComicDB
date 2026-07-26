CREATE TABLE google_integrations (
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

CREATE TABLE google_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX google_oauth_states_expires_idx
  ON google_oauth_states(expires_at);
