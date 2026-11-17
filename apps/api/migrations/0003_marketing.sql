-- Audiences, contacts and broadcasts (marketing e-mail with one-click unsubscribe).

CREATE TABLE audiences (
  id         TEXT PRIMARY KEY,                     -- aud_...
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX audiences_account ON audiences(account_id);

CREATE TABLE contacts (
  id           TEXT PRIMARY KEY,                   -- con_... (time-ordered: broadcasts page by id)
  account_id   TEXT NOT NULL,
  audience_id  TEXT NOT NULL REFERENCES audiences(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  first_name   TEXT,
  last_name    TEXT,
  unsubscribed INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  UNIQUE(audience_id, email)
);
CREATE INDEX contacts_audience ON contacts(audience_id, id);

CREATE TABLE broadcasts (
  id          TEXT PRIMARY KEY,                    -- bc_...
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  audience_id TEXT NOT NULL REFERENCES audiences(id),
  name        TEXT,
  from_addr   TEXT NOT NULL,
  reply_to    TEXT,
  subject     TEXT NOT NULL,
  html        TEXT,
  text        TEXT,
  status      TEXT NOT NULL DEFAULT 'draft',       -- draft | sending | paused | sent | cancelled
  status_reason TEXT,
  cursor      TEXT NOT NULL DEFAULT '',            -- last contact id processed
  sent_count  INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  started_at  INTEGER,
  finished_at INTEGER
);
CREATE INDEX broadcasts_status ON broadcasts(status);
