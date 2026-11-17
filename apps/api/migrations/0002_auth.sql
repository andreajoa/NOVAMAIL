-- Dashboard users, passwordless login codes and sessions.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,                 -- usr_...
  email         TEXT NOT NULL UNIQUE,
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'owner',    -- owner | member
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE INDEX users_account ON users(account_id);

CREATE TABLE login_codes (
  email      TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 1,           -- codes sent in the current window
  window_at  INTEGER NOT NULL                      -- start of the rate-limit window
);

CREATE TABLE sessions (
  id_hash    TEXT PRIMARY KEY,                     -- SHA-256 of the cookie value
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);
