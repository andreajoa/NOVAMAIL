// NovaMail's control-plane database: one SQLite-backed Durable Object.
//
// Why not D1: the Cloudflare account is on the free plan and already has its 10 D1
// databases. SQLite Durable Objects are included in the free plan (5 GB) with no
// per-account database cap. To keep every route unchanged, `DoD1` exposes the small
// subset of the D1 API the app uses (prepare/bind/first/all/run/batch).

import { DurableObject } from "cloudflare:workers";
import { MIGRATIONS } from "../schema";

type Param = string | number | null;
interface Stmt {
  sql: string;
  params: Param[];
}
type Row = Record<string, SqlStorageValue>;
interface RunResult {
  rows: Row[];
  changes: number;
}

export class NovaDB extends DurableObject<Record<string, unknown>> {
  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate() {
    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
    const done = new Set(sql.exec<{ name: string }>("SELECT name FROM _migrations").toArray().map((r) => r.name));
    for (const m of MIGRATIONS) {
      if (done.has(m.name)) continue;
      this.ctx.storage.transactionSync(() => {
        for (const q of splitSql(m.sql)) sql.exec(q);
        sql.exec("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)", m.name, Date.now());
      });
    }
  }

  private one(s: Stmt): RunResult {
    const cur = this.ctx.storage.sql.exec(s.sql, ...s.params);
    const rows = cur.toArray() as Row[];
    return { rows, changes: cur.rowsWritten };
  }

  query(s: Stmt): RunResult {
    return this.one(s);
  }

  batch(stmts: Stmt[]): RunResult[] {
    return this.ctx.storage.transactionSync(() => stmts.map((s) => this.one(s)));
  }
}

/** Splits a migration file into statements (no semicolons inside literals in our schema). */
export function splitSql(src: string): string[] {
  // Strip full-line and trailing "-- comments" first: a ';' inside a comment must not split a statement.
  // (Our migrations never put "--" inside string literals.)
  return src
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

class DoStatement {
  constructor(private readonly db: DoD1, readonly sql: string, readonly params: Param[] = []) {}
  bind(...params: unknown[]) {
    return new DoStatement(this.db, this.sql, params.map((p) => (p === undefined ? null : (p as Param))));
  }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const r = await this.db.stub.query({ sql: this.sql, params: this.params });
    return (r.rows[0] as T) ?? null;
  }
  async all<T = Record<string, unknown>>() {
    const r = await this.db.stub.query({ sql: this.sql, params: this.params });
    return { results: r.rows as T[], success: true, meta: { changes: r.changes } };
  }
  async run() {
    const r = await this.db.stub.query({ sql: this.sql, params: this.params });
    return { results: [], success: true, meta: { changes: r.changes } };
  }
}

export class DoD1 {
  constructor(readonly stub: DurableObjectStub<NovaDB>) {}
  prepare(sql: string) {
    return new DoStatement(this, sql);
  }
  async batch(stmts: DoStatement[]) {
    const res = await this.stub.batch(stmts.map((s) => ({ sql: s.sql, params: s.params })));
    return res.map((r) => ({ results: r.rows, success: true, meta: { changes: r.changes } }));
  }
}

export function openDb(ns: DurableObjectNamespace<NovaDB>): D1Database {
  return new DoD1(ns.get(ns.idFromName("novamail-main"))) as unknown as D1Database;
}
