import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const container = String(process.env.FAWRi_POSTGRES_RECOVERY_CONTAINER || process.env.FAWRI_POSTGRES_RECOVERY_CONTAINER || "").trim();
const databaseUrl = String(process.env.DATABASE_URL || "").trim();

assert.ok(container, "FAWRI_POSTGRES_RECOVERY_CONTAINER is required");
assert.ok(databaseUrl, "DATABASE_URL is required");
const parsed = new URL(databaseUrl);
assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
assert.equal(parsed.pathname, "/fawri_recovery_test");

async function docker(...args) {
  await execFileAsync("docker", args, { timeout: 30_000 });
}

async function waitFor(check, message, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${message}${last ? `: ${last.message}` : ""}`);
}

test("API readiness and PostgreSQL pool recover after a database outage without app restart", { timeout: 90_000 }, async (t) => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
    FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
    FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY: "required",
    FAWRI_DISABLE_JOB_WORKERS: "1",
    FAWRI_META_REPLY_TRANSPORT: "disabled",
    FAWRI_META_CREDENTIAL_PROVIDER: "disabled",
  });

  const [{ default: app }, { pool }] = await Promise.all([
    import("../src/app.ts"),
    import("@workspace/db"),
  ]);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await docker("start", container).catch(() => undefined);
    await pool.end().catch(() => undefined);
    await new Promise((resolve) => server.close(() => resolve()));
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const readyBefore = await fetch(`${base}/ops/readiness`);
  assert.equal(readyBefore.status, 200, await readyBefore.text());
  assert.equal((await pool.query("select 1 as ok")).rows[0].ok, 1);

  await docker("stop", "-t", "0", container);

  await waitFor(async () => {
    const response = await fetch(`${base}/ops/readiness`);
    return response.status === 503 ? response : null;
  }, "readiness never failed closed during PostgreSQL outage");

  await assert.rejects(
    () => pool.query("select 1"),
    "operational PostgreSQL query must fail while the database is unavailable",
  );

  await docker("start", container);

  await waitFor(async () => {
    try {
      const result = await pool.query("select 1 as ok");
      return result.rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }, "existing PostgreSQL pool did not recover after database restart");

  const readyAfter = await waitFor(async () => {
    const response = await fetch(`${base}/ops/readiness`);
    return response.status === 200 ? response : null;
  }, "API readiness did not recover after PostgreSQL restart");

  assert.equal((await readyAfter.json()).status, "ready");
});
