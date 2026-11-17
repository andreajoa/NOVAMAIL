-- NovaMail control plane schema (Cloudflare D1 / SQLite)
-- Times are unix epoch milliseconds (INTEGER). IDs are prefixed strings.

CREATE TABLE accounts (
  id               TEXT PRIMARY KEY,               -- acc_...
  name             TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  plan             TEXT NOT NULL DEFAULT 'free',   -- free | pro | scale | internal
  status           TEXT NOT NULL DEFAULT 'active', -- active | suspended
  suspended_reason TEXT,
  ip_pool          TEXT NOT NULL DEFAULT 'shared', -- shared | trusted | dedicated:<name> | cold
  postal_org       TEXT,                           -- organization permalink in Postal
  postal_server    TEXT,                           -- server permalink in Postal
  postal_server_key TEXT,                          -- Postal API credential (encrypted, AES-GCM)
  stripe_customer  TEXT,
  stripe_subscription TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE api_keys (
  id           TEXT PRIMARY KEY,                   -- key_...
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  prefix       TEXT NOT NULL,                      -- first chars shown in UI (nm_live_ab12)
  hash         TEXT NOT NULL UNIQUE,               -- SHA-256 hex of the full key
  permission   TEXT NOT NULL DEFAULT 'full',       -- full | sending
  domain_id    TEXT,                               -- optional: restrict to one domain
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at   INTEGER
);
CREATE INDEX api_keys_account ON api_keys(account_id);

CREATE TABLE domains (
  id            TEXT PRIMARY KEY,                  -- dom_...
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | verified | failed
  postal_uuid   TEXT,
  records       TEXT NOT NULL DEFAULT '[]',        -- JSON array of DNS records to publish
  checks        TEXT NOT NULL DEFAULT '{}',        -- JSON of last DNS check
  created_at    INTEGER NOT NULL,
  verified_at   INTEGER,
  UNIQUE(account_id, name)
);

CREATE TABLE emails (
  id              TEXT PRIMARY KEY,                -- uuid v7 (Resend-compatible shape)
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  api_key_id      TEXT,
  from_addr       TEXT NOT NULL,
  to_addrs        TEXT NOT NULL,                   -- JSON array
  cc_addrs        TEXT,
  bcc_addrs       TEXT,
  subject         TEXT NOT NULL,
  tags            TEXT,                            -- JSON array of {name,value}
  last_event      TEXT NOT NULL DEFAULT 'queued',  -- queued|sent|delivered|delayed|bounced|failed|held|opened|clicked|complained|suppressed
  postal_message_id TEXT,
  scheduled_at    INTEGER,
  idempotency_key TEXT,
  created_at      INTEGER NOT NULL,
  UNIQUE(account_id, idempotency_key)
);
CREATE INDEX emails_account_created ON emails(account_id, created_at DESC);

CREATE TABLE email_recipients (
  email_id   TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  address    TEXT NOT NULL,
  postal_id  INTEGER,
  status     TEXT NOT NULL DEFAULT 'queued',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (email_id, address)
);
CREATE INDEX email_recipients_postal ON email_recipients(postal_id);

CREATE TABLE email_events (
  id         TEXT PRIMARY KEY,                     -- Postal webhook uuid (dedupe)
  email_id   TEXT,
  account_id TEXT NOT NULL,
  type       TEXT NOT NULL,
  recipient  TEXT,
  data       TEXT NOT NULL,                        -- JSON
  created_at INTEGER NOT NULL
);
CREATE INDEX email_events_email ON email_events(email_id, created_at);

-- Daily usage counter: monthly = SUM over the billing month.
CREATE TABLE usage_daily (
  account_id TEXT NOT NULL,
  day        TEXT NOT NULL,                        -- YYYY-MM-DD (UTC)
  sent       INTEGER NOT NULL DEFAULT 0,
  bounced    INTEGER NOT NULL DEFAULT 0,
  complained INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day)
);

CREATE TABLE suppressions (
  account_id TEXT NOT NULL,
  address    TEXT NOT NULL,
  reason     TEXT NOT NULL,                        -- hard_bounce | complaint | manual | unsubscribe
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, address)
);

CREATE TABLE webhooks (
  id         TEXT PRIMARY KEY,                     -- wh_...
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  secret     TEXT NOT NULL,                        -- whsec_... (Standard Webhooks)
  events     TEXT NOT NULL DEFAULT '["*"]',
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at INTEGER NOT NULL
);
