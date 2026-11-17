-- Per-key request counters (fixed one-minute windows) for AI-agent keys.
CREATE TABLE rate_limits (
  key_id  TEXT NOT NULL,
  window  INTEGER NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window)
);
