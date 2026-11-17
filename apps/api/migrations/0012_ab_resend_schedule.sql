-- A/B subject tests, resend-to-non-openers, scheduling and per-recipient send log.
ALTER TABLE broadcasts ADD COLUMN ab TEXT;
ALTER TABLE broadcasts ADD COLUMN resend_of TEXT;
ALTER TABLE broadcasts ADD COLUMN send_at INTEGER;
ALTER TABLE broadcasts ADD COLUMN smart_time INTEGER NOT NULL DEFAULT 0;
CREATE TABLE broadcast_recipients (
  broadcast_id TEXT NOT NULL,
  email        TEXT NOT NULL,
  email_id     TEXT,
  variant      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (broadcast_id, email)
);
CREATE INDEX broadcast_recipients_email ON broadcast_recipients(email_id);
-- Smart send time: each contact is queued for their usual open hour (within 24 h).
ALTER TABLE broadcasts ADD COLUMN queued_at INTEGER;
CREATE TABLE broadcast_queue (
  broadcast_id TEXT NOT NULL,
  contact_id   TEXT NOT NULL,
  due_at       INTEGER NOT NULL,
  PRIMARY KEY (broadcast_id, contact_id)
);
CREATE INDEX broadcast_queue_due ON broadcast_queue(broadcast_id, due_at);
