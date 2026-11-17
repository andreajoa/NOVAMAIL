-- Node-based funnels, contact tags, open/click tracking state.
ALTER TABLE funnels ADD COLUMN graph TEXT;
ALTER TABLE funnels ADD COLUMN trigger_tag TEXT;
ALTER TABLE enrollments ADD COLUMN node_id TEXT;
ALTER TABLE enrollments ADD COLUMN last_email_id TEXT;
ALTER TABLE contacts ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
CREATE INDEX email_events_type ON email_events(email_id, type);
