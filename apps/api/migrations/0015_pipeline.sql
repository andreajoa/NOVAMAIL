-- Sales pipeline: deals on customizable stages, plus tasks.
CREATE TABLE pipelines (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  stages     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX pipelines_account ON pipelines(account_id);
CREATE TABLE deals (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  pipeline_id   TEXT NOT NULL,
  stage_id      TEXT NOT NULL,
  title         TEXT NOT NULL,
  email         TEXT,
  value_cents   INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'USD',
  owner_user_id TEXT,
  close_date    INTEGER,
  position      REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'open',
  notes         TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  closed_at     INTEGER
);
CREATE INDEX deals_pipeline ON deals(pipeline_id, stage_id, position);
CREATE INDEX deals_email ON deals(account_id, email);
CREATE TABLE tasks (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL,
  title            TEXT NOT NULL,
  due_at           INTEGER,
  done_at          INTEGER,
  assignee_user_id TEXT,
  email            TEXT,
  deal_id          TEXT,
  created_by       TEXT,
  created_at       INTEGER NOT NULL
);
CREATE INDEX tasks_account ON tasks(account_id, done_at, due_at);
