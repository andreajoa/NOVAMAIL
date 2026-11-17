-- Signup forms (embedded, popup, hosted landing page), double opt-in and consent proof.
CREATE TABLE forms (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'embed',
  audience_id  TEXT NOT NULL,
  config       TEXT NOT NULL,
  double_optin INTEGER NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'active',
  views        INTEGER NOT NULL DEFAULT 0,
  submits      INTEGER NOT NULL DEFAULT 0,
  confirms     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX forms_account ON forms(account_id);
CREATE TABLE form_pending (
  token_hash TEXT PRIMARY KEY,
  form_id    TEXT NOT NULL,
  account_id TEXT NOT NULL,
  email      TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE consents (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id   TEXT NOT NULL,
  email        TEXT NOT NULL,
  source       TEXT NOT NULL,
  form_id      TEXT,
  text         TEXT,
  ip           TEXT,
  user_agent   TEXT,
  page         TEXT,
  created_at   INTEGER NOT NULL,
  confirmed_at INTEGER
);
CREATE INDEX consents_person ON consents(account_id, email);
