-- 0 = person, 1 = security scanner / bot (ignored everywhere), 2 = privacy proxy prefetch (Apple MPP).
ALTER TABLE email_events ADD COLUMN machine INTEGER NOT NULL DEFAULT 0;
CREATE INDEX email_events_acct_type ON email_events(account_id, type, created_at);

-- E-commerce: connected stores, product catalog, carts (abandonment) and orders (revenue attribution).
CREATE TABLE stores (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform   TEXT NOT NULL,
  name       TEXT NOT NULL,
  url        TEXT,
  secret     TEXT NOT NULL,
  currency   TEXT NOT NULL DEFAULT 'USD',
  settings   TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX stores_account ON stores(account_id);
CREATE TABLE products (
  account_id  TEXT NOT NULL,
  store_id    TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title       TEXT NOT NULL,
  url         TEXT,
  image       TEXT,
  price_cents INTEGER,
  currency    TEXT,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (store_id, external_id)
);
CREATE INDEX products_account ON products(account_id, updated_at);
CREATE TABLE carts (
  store_id     TEXT NOT NULL,
  external_id  TEXT NOT NULL,
  account_id   TEXT NOT NULL,
  email        TEXT NOT NULL,
  items        TEXT NOT NULL,
  url          TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency     TEXT,
  status       TEXT NOT NULL DEFAULT 'open',
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (store_id, external_id)
);
CREATE INDEX carts_due ON carts(status, updated_at);
CREATE TABLE orders (
  store_id      TEXT NOT NULL,
  external_id   TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  email         TEXT,
  amount_cents  INTEGER NOT NULL,
  currency      TEXT NOT NULL,
  items         TEXT,
  email_id      TEXT,
  broadcast_id  TEXT,
  funnel_id     TEXT,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (store_id, external_id)
);
CREATE INDEX orders_account ON orders(account_id, created_at);
CREATE INDEX orders_broadcast ON orders(broadcast_id);
