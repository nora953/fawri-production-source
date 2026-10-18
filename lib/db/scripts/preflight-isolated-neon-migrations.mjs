#!/usr/bin/env node
// Read-only, fail-closed migration preflight. Never applies SQL.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");
const journal = JSON.parse(fs.readFileSync(path.join(root, "meta/_journal.json"), "utf8"));
const entries = journal.entries;
assert.ok(Array.isArray(entries) && entries.length > 0, "missing migration journal");
const urlText = process.env.FAWRI_ISOLATED_NEON_DATABASE_URL;
const expectedHost = process.env.FAWRI_ISOLATED_NEON_HOST;
const expectedDb = process.env.FAWRI_ISOLATED_NEON_DATABASE;
const expectedLastHash = process.env.FAWRI_ISOLATED_NEON_LAST_HASH;
assert.ok(urlText && expectedHost && expectedDb && expectedLastHash, "explicit isolated connection, hostname, database, and last applied hash are required");
const url = new URL(urlText);
assert.ok(url.protocol === "postgresql:" || url.protocol === "postgres:", "PostgreSQL URL required");
assert.equal(url.hostname, expectedHost, "database host mismatch");
assert.ok(!url.port || url.port === "5432", "unexpected PostgreSQL port");
assert.ok(!url.hash, "URL fragments are forbidden");
assert.ok(!url.hostname.includes("pooler"), "direct Neon endpoint required, not a pooler");
assert.match(url.hostname, /^ep-[a-z0-9-]+\.([a-z0-9-]+\.)?aws\.neon\.tech$/, "Neon endpoint hostname required");
assert.equal(decodeURIComponent(url.pathname.slice(1)), expectedDb, "database name mismatch");
assert.notEqual(expectedDb, "fawri_ci", "local CI database is not an isolated Neon branch");
assert.equal(url.searchParams.get("sslmode"), "require", "sslmode=require required");
assert.ok(url.username && url.password, "explicit authenticated connection required");
assert.ok(!url.searchParams.has("options"), "session startup options are forbidden in preflight");
assert.ok(!url.searchParams.has("host") && !url.searchParams.has("hostaddr") && !url.searchParams.has("service"), "alternate connection routing is forbidden");
assert.deepEqual([...url.searchParams.keys()], ["sslmode"], "only sslmode connection parameter is permitted");
assert.ok(!url.username.includes("%") && !url.password.includes("%"), "malformed connection credentials");
assert.match(expectedLastHash, /^[a-f0-9]{64}$/, "expected last hash must be sha256");
const client = new Client({ connectionString: urlText, application_name: "fawri-isolated-migration-readonly-preflight" });
let connected = false;
let report;
try {
  await client.connect();
  connected = true;
  await client.query("BEGIN READ ONLY");
  const identity = await client.query("SELECT current_database() AS db, current_user AS role, inet_server_addr()::text AS address");
  assert.equal(identity.rows[0].db, expectedDb, "connected database mismatch");
  const history = await client.query('SELECT id, created_at::text AS created_at, hash FROM drizzle.__drizzle_migrations ORDER BY id');
  assert.ok(history.rows.length > 0 && history.rows.length <= entries.length, "unexpected migration history length");
  for (let i = 0; i < history.rows.length; i++) {
    const actual = history.rows[i];
    assert.equal(Number(actual.id), i + 1, "non-contiguous migration IDs");
    assert.equal(String(actual.created_at), String(entries[i].when), "migration timestamp differs from committed journal");
    assert.match(actual.hash, /^[a-f0-9]{64}$/, "invalid applied migration hash");
    const sqlPath = path.join(root, `${entries[i].tag}.sql`);
    const sourceSql = fs.readFileSync(sqlPath, "utf8");
    const sourceHash = createHash("sha256").update(sourceSql).digest("hex");
    assert.equal(actual.hash, sourceHash, `applied migration SQL hash mismatch: ${entries[i].tag}`);
  }
  assert.equal(history.rows.at(-1).hash, expectedLastHash, "last applied migration hash mismatch");
  const pending = entries.slice(history.rows.length).map((entry) => entry.tag);
  const roles = await client.query("SELECT rolname,rolcanlogin,rolbypassrls,rolsuper FROM pg_roles WHERE rolname IN ('fawri_staging_runtime','fawri_staging_rls_runtime') ORDER BY rolname");
  report = { ok: true, read_only: true, db: identity.rows[0].db, role: identity.rows[0].role, applied: history.rows.length, pending, roles: roles.rows };
} finally {
  try {
    if (connected) await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}
if (report) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
