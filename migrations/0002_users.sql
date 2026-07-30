-- Add per-user credentials for multi-user authentication.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Production has no existing project data to preserve.
DROP TABLE IF EXISTS project_snapshots;

CREATE TABLE IF NOT EXISTS project_snapshots (
  id TEXT NOT NULL DEFAULT 'primary',
  user_id TEXT NOT NULL REFERENCES users(id),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  data_json TEXT NOT NULL CHECK (length(data_json) <= 1048576),
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_project_snapshots_user ON project_snapshots(user_id);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
