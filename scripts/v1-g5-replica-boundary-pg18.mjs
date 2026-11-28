/** Local-only physical-standby test with synthetic data and loopback networking. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

const require = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Client } = require("pg");
const bin = process.env.FAWRI_G5_LOCAL_PG18_BIN;
assert.ok(bin && isAbsolute(bin), "Set FAWRI_G5_LOCAL_PG18_BIN to local PostgreSQL 18 bin directory");
const run = (program, ...args) => execFileSync(join(bin, program), args, { timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
assert.match(run("postgres", "--version").toString(), /PostgreSQL\) 18\./);

const root = mkdtempSync(join(tmpdir(), "fawri-replica-"));
const active = new Set();
const ports = new Map();
const parent = "parent";
const child = "child";
const parentReplica = "parent-replica";
const childReplica = "child-replica";
const sharedLogin = { user: "g5_same_branch_reader", password: randomBytes(24).toString("hex") };
const childLogin = { user: "g5_child_only_reader", password: randomBytes(24).toString("hex") };
const admin = { user: "postgres", password: randomBytes(24).toString("hex") };
const data = name => join(root, name);

async function boot(name) {
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const { port } = reservation.address();
  await new Promise(resolve => reservation.close(resolve));
  run("pg_ctl", "-D", data(name), "-l", join(root, `${name}.log`), "-o",
    `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port}`, "-w", "start");
  active.add(name);
  ports.set(name, port);
}

function stop(name) {
  run("pg_ctl", "-D", data(name), "-m", "fast", "-w", "stop");
  active.delete(name);
}

function copy(source, dest, standby = false) {
  cpSync(data(source), data(dest), { recursive: true });
  if (standby) writeFileSync(join(data(dest), "standby.signal"), "", { mode: 0o600 });
}

async function query(name, identity, sql) {
  const client = new Client({ ...identity, host: "127.0.0.1", port: ports.get(name), database: "postgres", ssl: false, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    return (await client.query(sql)).rows;
  } finally {
    await client.end();
  }
}

async function createReader(node, { user, password }) {
  // These values are fixed synthetic identifiers and freshly generated hex only.
  await query(node, admin, `CREATE ROLE ${user} LOGIN NOINHERIT BYPASSRLS PASSWORD '${password}';
    GRANT SELECT ON public.catalog, public.catalog_ids TO ${user};`);
}

const state = "SELECT pg_is_in_recovery() AS in_recovery, current_setting('transaction_read_only') AS readonly";
try {
  const passwordFile = join(root, "initdb-password");
  writeFileSync(passwordFile, `${admin.password}\n`, { mode: 0o600 });
  try {
    run("initdb", "-D", data(parent), "-U", "postgres", "--no-locale", "--auth=scram-sha-256", "--pwfile", passwordFile, "--no-sync");
  } finally {
    rmSync(passwordFile);
  }
  await boot(parent);
  await query(parent, admin, `CREATE TABLE public.catalog(id int PRIMARY KEY, merchant text NOT NULL);
    INSERT INTO catalog VALUES (1,'synthetic-a'), (2,'synthetic-b');
    ALTER TABLE catalog ENABLE ROW LEVEL SECURITY;
    ALTER TABLE catalog FORCE ROW LEVEL SECURITY;
    CREATE POLICY no_ordinary_reads ON catalog USING (false);
    CREATE SEQUENCE public.catalog_ids START WITH 12;
    SELECT lo_from_bytea(90001, decode('736e617073686f74','hex'));
    GRANT SELECT ON LARGE OBJECT 90001 TO PUBLIC;`);
  await createReader(parent, sharedLogin);
  stop(parent);
  copy(parent, parentReplica, true);
  copy(parent, child);
  await boot(parent);
  await boot(parentReplica);
  assert.deepEqual(await query(parentReplica, sharedLogin, state), [{ in_recovery: true, readonly: "on" }]);
  assert.deepEqual(await query(parent, sharedLogin, state), [{ in_recovery: false, readonly: "off" }]);
  await assert.rejects(query(parentReplica, sharedLogin, "BEGIN READ WRITE"), error => error.code === "25006" || error.code === "0A000");
  console.log("G5_SAME_BRANCH_REPLICA_READ_ONLY_BUT_WRITER_AUTHENTICATES");

  await boot(child);
  await createReader(child, childLogin);
  stop(child);
  copy(child, childReplica, true);
  await boot(childReplica);
  assert.deepEqual(await query(childReplica, childLogin, state), [{ in_recovery: true, readonly: "on" }]);
  await assert.rejects(query(childReplica, childLogin, "BEGIN READ WRITE"), error => error.code === "25006" || error.code === "0A000");
  assert.deepEqual(await query(childReplica, childLogin, `SELECT
    (SELECT count(*)::int FROM public.catalog) AS protected_rows,
    (SELECT last_value::int FROM public.catalog_ids) AS sequence_value,
    convert_from(lo_get(90001), 'UTF8') AS large_object`),
  [{ protected_rows: 2, sequence_value: 12, large_object: "snapshot" }]);
  await assert.rejects(query(parent, childLogin, state), error => error.code === "28P01");
  await assert.rejects(query(child, childLogin, state), error => error.code === "ENOENT" || error.code === "ECONNREFUSED");
  console.log("G5_CHILD_ONLY_READER_PARENT_AUTH_DENIED_CHILD_WRITER_OFFLINE_FIXTURE_READS_OK");
} catch (error) {
  // Discard native diagnostics and credential arguments; show a non-secret failing assertion or error code.
  console.error("G5_LOCAL_REPLICA_CHECK_FAILED", error.code ?? error.name, error.stack?.match(/\.mjs:(\d+):\d+/)?.[1] ?? "");
  process.exitCode = 1;
} finally {
  for (const name of [...active].reverse()) {
    try { stop(name); } catch { process.exitCode = 1; }
  }
  if (active.size === 0) rmSync(root, { recursive: true, force: true });
}
