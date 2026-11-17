#!/usr/bin/env node
// Regenerates apps/api/src/schema.ts from apps/api/migrations/*.sql. `--check` fails if out of date.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const dir = path.join(import.meta.dirname, "../apps/api/migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const body = files.map((f) => `  { name: ${JSON.stringify(f.replace(/\.sql$/, ""))}, sql: ${JSON.stringify(readFileSync(path.join(dir, f), "utf8"))} },`).join("\n");
const out = `// Generated from migrations/*.sql by scripts/gen-schema (keep in sync; CI checks).\nexport const MIGRATIONS: { name: string; sql: string }[] = [\n${body}\n];\n`;
const target = path.join(dir, "../src/schema.ts");
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== out) { console.error("schema.ts is out of date: run node scripts/gen-schema.mjs"); process.exit(1); }
} else writeFileSync(target, out);
