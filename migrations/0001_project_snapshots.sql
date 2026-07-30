CREATE TABLE IF NOT EXISTS project_snapshots (
  id TEXT PRIMARY KEY CHECK (id = 'primary'),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  data_json TEXT NOT NULL CHECK (length(data_json) <= 1048576),
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
