-- Teams: a user can belong to several workspaces (accounts) with a role in each.
-- users.account_id is the workspace currently open in the dashboard.
CREATE TABLE memberships (
  user_id    TEXT NOT NULL,
  account_id TEXT NOT NULL,
  role       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, account_id)
);
CREATE INDEX memberships_account ON memberships(account_id);
INSERT INTO memberships (user_id, account_id, role, created_at) SELECT id, account_id, 'owner', created_at FROM users;
CREATE TABLE invites (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  invited_by  TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  accepted_at INTEGER
);
CREATE INDEX invites_email ON invites(email);
