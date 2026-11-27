-- Scheduled sends (Resend-compatible `scheduled_at`): the message waits here until it is due.
CREATE TABLE scheduled_emails (
  email_id   TEXT PRIMARY KEY,                     -- emails.id (last_event = 'scheduled')
  account_id TEXT NOT NULL,
  principal  TEXT NOT NULL,                        -- JSON: who scheduled it (key/domain restrictions re-checked at send)
  payload    TEXT NOT NULL,                        -- JSON body as received, minus scheduled_at
  track      INTEGER NOT NULL DEFAULT 0,
  send_at    INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX scheduled_emails_due ON scheduled_emails(send_at);
CREATE INDEX scheduled_emails_account ON scheduled_emails(account_id);
