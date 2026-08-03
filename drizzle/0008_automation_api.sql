CREATE TABLE api_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  result TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);

CREATE INDEX api_audit_logs_at_idx ON api_audit_logs(at DESC);

CREATE TABLE api_idempotency_records (
  actor TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scope TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(actor, key_hash)
);

CREATE INDEX api_idempotency_created_at_idx
  ON api_idempotency_records(created_at);
