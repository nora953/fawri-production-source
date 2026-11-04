import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import pg from "pg";

async function restrictedTestDatabaseUrl(databaseUrl) {
  const admin = new pg.Client({ connectionString: databaseUrl });
  await admin.connect();
  const role = "fawri_observability_ci_runtime";
  try {
    await admin.query("CREATE ROLE fawri_observability_ci_runtime LOGIN PASSWORD 'disposable-observability-only'").catch((error) => {
      if (error?.code !== "42710") throw error;
    });
    await admin.query(`GRANT CONNECT ON DATABASE ${JSON.stringify(new URL(databaseUrl).pathname.slice(1))} TO ${role}`);
  } finally {
    await admin.end();
  }
  const url = new URL(databaseUrl);
  url.username = role;
  url.password = "disposable-observability-only";
  return url.toString();
}


const testDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDir, "..");
const serverEntry = path.join(apiRoot, "src", "index.ts");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("unable to allocate test port")));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(port, child, output) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API server exited before readiness probe.\n${output.join("").slice(-4000)}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.status === 200) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API server did not start.\n${output.join("").slice(-4000)}`);
}

async function startApi(databaseUrl, extraEnv = {}) {
  const port = await freePort();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fawri-observability-"));
  const metricsToken = crypto.randomBytes(32).toString("hex");
  const output = [];
  const child = spawn(pnpm, ["exec", "tsx", serverEntry], {
    cwd: apiRoot,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl,
      FAWRI_DATA_DIR: dataDir,
      FAWRI_DISABLE_JOB_WORKERS: "1",
      FAWRI_SERVICE_VERSION: "integration-test",
      FAWRI_OBSERVABILITY_BEARER_TOKEN: metricsToken,
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));

  const stopProcess = (signal) => {
    if (process.platform !== "win32" && child.pid) {
      try { process.kill(-child.pid, signal); return; } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
    }
    if (child.exitCode === null) child.kill(signal);
  };

  try {
    await waitForServer(port, child, output);
  } catch (error) {
    stopProcess("SIGKILL");
    await rm(dataDir, { recursive: true, force: true });
    throw error;
  }

  return {
    port,
    metricsToken,
    async stop() {
      if (child.exitCode === null) {
        stopProcess("SIGTERM");
        await Promise.race([
          new Promise((resolve) => child.once("exit", resolve)),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
        if (child.exitCode === null) stopProcess("SIGKILL");
      }
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

async function readJson(url, init) {
  const response = await fetch(url, init);
  return { response, body: await response.json() };
}

const expectedReadyChecks = [
  { name: "postgresql_authority", status: "up" },
  { name: "production_release_configuration", status: "up" },
];

test("real app mounts bounded observability routes and protects metrics", { timeout: 30_000 }, async () => {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  assert.match(databaseUrl, /^postgres(?:ql)?:\/\//i, "disposable PostgreSQL DATABASE_URL is required");
  const server = await startApi(await restrictedTestDatabaseUrl(databaseUrl));
  const base = `http://127.0.0.1:${server.port}`;

  try {
    const legacyHealth = await readJson(`${base}/healthz`);
    assert.equal(legacyHealth.response.status, 200);
    assert.equal(legacyHealth.body.ok, true);

    const health = await readJson(`${base}/ops/health`);
    assert.equal(health.response.status, 200);
    assert.equal(health.body.status, "ok");
    assert.equal(health.body.service, "fawri-api");
    assert.equal(health.body.version, "integration-test");

    const readiness = await readJson(`${base}/ops/readiness`);
    assert.equal(readiness.response.status, 200);
    assert.equal(readiness.body.status, "ready");
    assert.ok(Array.isArray(readiness.body.checks) && readiness.body.checks.length > 0);
    assert.deepEqual(
      readiness.body.checks.map((item) => ({ name: item.name, status: item.status })),
      expectedReadyChecks,
    );

    const denied = await fetch(`${base}/ops/metrics`);
    assert.equal(denied.status, 503);
    assert.equal(await denied.text(), "");

    const wrong = await fetch(`${base}/ops/metrics`, {
      headers: { Authorization: "Bearer not-the-service-token" },
    });
    assert.equal(wrong.status, 503);
    assert.equal(await wrong.text(), "");

    const allowed = await fetch(`${base}/ops/metrics`, {
      headers: { Authorization: `Bearer ${server.metricsToken}` },
    });
    assert.equal(allowed.status, 200);
    assert.match(allowed.headers.get("content-type") || "", /text\/plain/);
  } finally {
    await server.stop();
  }
});

test("real app readiness fails closed when PostgreSQL authority is unavailable", { timeout: 30_000 }, async () => {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  assert.match(databaseUrl, /^postgres(?:ql)?:\/\//i, "disposable PostgreSQL DATABASE_URL is required");
  const unavailablePort = await freePort();
  const unavailableUrl = new URL(databaseUrl);
  unavailableUrl.hostname = "127.0.0.1";
  unavailableUrl.port = String(unavailablePort);

  const server = await startApi(unavailableUrl.toString());
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const readiness = await readJson(`${base}/ops/readiness`);
    assert.equal(readiness.response.status, 503);
    assert.equal(readiness.body.status, "not_ready");
    assert.equal(readiness.body.checks.length, 2);
    assert.equal(readiness.body.checks[0].name, "postgresql_authority");
    assert.equal(readiness.body.checks[0].status, "down");
    assert.ok(["dependency_unavailable", "timeout"].includes(readiness.body.checks[0].error_code));
    assert.deepEqual(
      { name: readiness.body.checks[1].name, status: readiness.body.checks[1].status },
      expectedReadyChecks[1],
    );
    assert.equal(JSON.stringify(readiness.body).includes(unavailableUrl.toString()), false);
  } finally {
    await server.stop();
  }
});

test("configured runtime readiness blocks eight-table privacy RLS drift on real PostgreSQL", { timeout: 30_000 }, async () => {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  assert.match(databaseUrl, /^postgres(?:ql)?:\/\//i);
  const restrictedUrl = await restrictedTestDatabaseUrl(databaseUrl);
  const server = await startApi(restrictedUrl, {
    FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE: "fawri_observability_ci_runtime",
  });
  try {
    const response = await readJson(`http://127.0.0.1:${server.port}/ops/readiness`);
    assert.equal(response.response.status, 503);
    assert.equal(response.body.status, "not_ready");
    const postgresCheck = response.body.checks.find(check => check.name === "postgresql_authority");
    assert.equal(postgresCheck?.status, "down");
    assert.equal(JSON.stringify(response.body).includes(restrictedUrl), false);
  } finally {
    await server.stop();
  }
});

test("real runtime readiness refuses auth-bypass EXECUTE despite eight active RLS policies", { timeout: 60_000 }, async () => {
  // Destructive fixtures below are permitted ONLY inside the disposable local
  // PostgreSQL fawri_ci service owned by CI. Never point this test to Neon.
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  assert.match(databaseUrl, /^postgres(?:ql)?:\/\//i);
  const parsed = new URL(databaseUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname), "local disposable PostgreSQL required");
  assert.equal(decodeURIComponent(parsed.pathname), "/fawri_observability_test", "dedicated disposable observability CI database required");
  const restrictedUrl = await restrictedTestDatabaseUrl(databaseUrl);
  const admin = new pg.Client({ connectionString: databaseUrl });
  const privacyTables = [
    "audit_events", "manual_reply_requests", "merchant_admin_notes",
    "merchant_channel_overrides", "merchant_deletion_requests",
    "notifications", "order_drafts", "processed_channel_events",
  ];
  const createdTables = [];
  let functionCreated = false;
  let server;
  await admin.connect();
  try {
    const existing = await admin.query(`
      SELECT count(*)::int AS existing FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname = ANY($1::text[])
    `, [privacyTables]);
    assert.equal(existing.rows[0].existing, 0, "never alter an existing privacy table");
    const existingFunction = await admin.query(
      "SELECT to_regprocedure('public.fawri_authentication_runtime()') AS existing",
    );
    assert.equal(existingFunction.rows[0].existing, null, "never replace existing auth function");

    for (const name of privacyTables) {
      await admin.query(`CREATE TABLE public.${name} (id text PRIMARY KEY)`);
      createdTables.push(name);
      await admin.query(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY`);
      await admin.query(
        `CREATE POLICY ${name}_disposable_deny_all ON public.${name}
         FOR ALL TO PUBLIC USING (false) WITH CHECK (false)`,
      );
    }
    server = await startApi(restrictedUrl, {
      FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE: "fawri_observability_ci_runtime",
    });
    const base = `http://127.0.0.1:${server.port}`;
    const before = await readJson(`${base}/ops/readiness`);
    assert.equal(before.response.status, 200, "RLS-protected restricted role must be ready");
    await server.stop();
    server = undefined;

    await admin.query(`CREATE FUNCTION public.fawri_authentication_runtime()
      RETURNS boolean LANGUAGE sql STABLE AS 'SELECT true'`);
    functionCreated = true;
    await admin.query("REVOKE ALL ON FUNCTION public.fawri_authentication_runtime() FROM PUBLIC");
    await admin.query(
      "GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO fawri_observability_ci_runtime",
    );
    const capability = await admin.query(`
      SELECT has_function_privilege('fawri_observability_ci_runtime',
        'public.fawri_authentication_runtime()', 'EXECUTE') AS granted
    `);
    assert.equal(capability.rows[0].granted, true, "real SQL capability grant verified");
    server = await startApi(restrictedUrl, {
      FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE: "fawri_observability_ci_runtime",
    });
    const blocked = await readJson(`http://127.0.0.1:${server.port}/ops/readiness`);
    assert.equal(blocked.response.status, 503, "auth bypass must invalidate ready despite 8/8 RLS");
    assert.equal(blocked.body.status, "not_ready");
    assert.equal(blocked.body.checks.find(x => x.name === "postgresql_authority")?.status, "down");
    assert.equal(JSON.stringify(blocked.body).includes(restrictedUrl), false);
  } finally {
    if (server) await server.stop();
    if (functionCreated) {
      await admin.query("REVOKE ALL ON FUNCTION public.fawri_authentication_runtime() FROM fawri_observability_ci_runtime");
      await admin.query("DROP FUNCTION public.fawri_authentication_runtime()");
    }
    for (const name of createdTables.reverse()) {
      await admin.query(`DROP TABLE public.${name}`);
    }
    await admin.end();
  }
});

test("real readiness rejects a login that can SET ROLE into CREATEROLE", { timeout: 30_000 }, async () => {
  // The CI PostgreSQL service is disposable; no real credentials/roles are touched.
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  assert.match(databaseUrl, /^postgres(?:ql)?:\/\//i);
  const restrictedUrl = await restrictedTestDatabaseUrl(databaseUrl);
  const admin = new pg.Client({ connectionString: databaseUrl });
  const roleName = "fawri_observability_ci_role_admin";
  await admin.connect();
  let server;
  let provisioned = false;
  try {
    await admin.query(`CREATE ROLE ${roleName} NOLOGIN CREATEROLE`);
    provisioned = true;
    await admin.query(`GRANT ${roleName} TO fawri_observability_ci_runtime WITH INHERIT FALSE, SET TRUE`);
    const roleState = await admin.query(`
      SELECT pg_has_role('fawri_observability_ci_runtime', $1::name, 'SET') AS can_set,
        (SELECT rolcreaterole FROM pg_roles WHERE rolname=$1::name) AS reachable_create_role,
        (SELECT rolcreaterole FROM pg_roles WHERE rolname='fawri_observability_ci_runtime') AS login_create_role
    `, [roleName]);
    assert.deepEqual(roleState.rows[0], {
      can_set: true,
      reachable_create_role: true,
      login_create_role: false,
    });
    server = await startApi(restrictedUrl);
    const readiness = await readJson(`http://127.0.0.1:${server.port}/ops/readiness`);
    assert.equal(readiness.response.status, 503);
    assert.equal(readiness.body.status, "not_ready");
    const roleCheck = readiness.body.checks.find(item => item.name === "postgresql_authority");
    assert.equal(roleCheck?.status, "down");
    assert.equal(JSON.stringify(readiness.body).includes(restrictedUrl), false);
  } finally {
    try {
      if (server) await server.stop();
    } finally {
      if (provisioned) {
        await admin.query(`REVOKE ${roleName} FROM fawri_observability_ci_runtime`);
        await admin.query(`DROP ROLE ${roleName}`);
      }
      await admin.end();
    }
  }
});
