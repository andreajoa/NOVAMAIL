-- CRM: person profiles (one per e-mail per account), custom fields, notes, activity log, saved segments.
CREATE TABLE people_data (
  account_id TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  company    TEXT,
  fields     TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, email)
);

CREATE TABLE crm_fields (
  account_id TEXT NOT NULL,
  key        TEXT NOT NULL,
  label      TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'text',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, key)
);

CREATE TABLE notes (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  email      TEXT NOT NULL,
  body       TEXT NOT NULL,
  author     TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX notes_person ON notes(account_id, email, created_at);

CREATE TABLE activities (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  email      TEXT NOT NULL,
  type       TEXT NOT NULL,
  data       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX activities_person ON activities(account_id, email, created_at);

CREATE TABLE segments (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  rules      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX email_events_recipient ON email_events(account_id, recipient, created_at);
CREATE INDEX contacts_account_email ON contacts(account_id, email);
