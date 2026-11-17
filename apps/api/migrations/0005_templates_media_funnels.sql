-- Email templates (visual designs), uploaded media and automated funnels (sequences).

CREATE TABLE templates (
  id         TEXT PRIMARY KEY,                     -- tpl_...
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  subject    TEXT NOT NULL DEFAULT '',
  design     TEXT,                                 -- JSON (@novamail/email Design); NULL for raw-HTML templates
  html       TEXT NOT NULL,                        -- rendered, sanitised
  text       TEXT,
  created_by TEXT,                                 -- user | api | agent:<key id>
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX templates_account ON templates(account_id, updated_at DESC);

CREATE TABLE media (
  id           TEXT PRIMARY KEY,                   -- file name in KV, e.g. m_xxx.png
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name         TEXT,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX media_account ON media(account_id, created_at DESC);

ALTER TABLE broadcasts ADD COLUMN template_id TEXT;

CREATE TABLE funnels (
  id          TEXT PRIMARY KEY,                    -- fn_...
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  trigger     TEXT NOT NULL DEFAULT 'audience',    -- audience (contact joins a list) | api (POST /funnels/:id/enroll)
  audience_id TEXT,
  from_addr   TEXT NOT NULL,
  reply_to    TEXT,
  status      TEXT NOT NULL DEFAULT 'draft',       -- draft | active | paused
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX funnels_trigger ON funnels(audience_id, status);

CREATE TABLE funnel_steps (
  id           TEXT PRIMARY KEY,                   -- fs_...
  funnel_id    TEXT NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  wait_minutes INTEGER NOT NULL DEFAULT 0,         -- delay before this email (from the previous step / enrollment)
  template_id  TEXT NOT NULL,
  subject      TEXT                                -- overrides the template subject
);
CREATE INDEX funnel_steps_funnel ON funnel_steps(funnel_id, position);

CREATE TABLE enrollments (
  id          TEXT PRIMARY KEY,                    -- en_...
  funnel_id   TEXT NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  account_id  TEXT NOT NULL,
  email       TEXT NOT NULL,
  first_name  TEXT,
  last_name   TEXT,
  contact_id  TEXT,
  step        INTEGER NOT NULL DEFAULT 0,          -- index of the next step to send
  next_at     INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',      -- active | done | exited
  created_at  INTEGER NOT NULL,
  UNIQUE(funnel_id, email)
);
CREATE INDEX enrollments_due ON enrollments(status, next_at);
