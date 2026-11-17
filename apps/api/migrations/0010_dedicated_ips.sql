-- Dedicated IP add-on: one row per account that bought it. Status flow:
-- requested (paid, waiting for an IP) → warming (IP attached, hourly cap ramps up) → active → released.
CREATE TABLE dedicated_ips (
  account_id   TEXT PRIMARY KEY,
  status       TEXT NOT NULL,
  pool         TEXT,
  ip           TEXT,
  requested_at INTEGER NOT NULL,
  assigned_at  INTEGER,
  released_at  INTEGER
);
