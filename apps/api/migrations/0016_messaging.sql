-- SMS (Twilio) and WhatsApp (Meta Cloud API) with the customer's own provider accounts.
CREATE TABLE channels (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  kind       TEXT NOT NULL,
  name       TEXT NOT NULL,
  config     TEXT NOT NULL,
  sender     TEXT,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);
CREATE INDEX channels_account ON channels(account_id);
CREATE TABLE message_consents (
  account_id TEXT NOT NULL,
  phone      TEXT NOT NULL,
  kind       TEXT NOT NULL,
  email      TEXT,
  source     TEXT,
  granted_at INTEGER,
  revoked_at INTEGER,
  PRIMARY KEY (account_id, phone, kind)
);
CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  channel_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,
  to_phone    TEXT NOT NULL,
  email       TEXT,
  body        TEXT,
  template    TEXT,
  status      TEXT NOT NULL,
  provider_id TEXT,
  error       TEXT,
  funnel_id   TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX messages_account ON messages(account_id, created_at);
CREATE INDEX messages_provider ON messages(provider_id);
