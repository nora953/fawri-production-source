import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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

async function startApi(databaseUrl) {
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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));

  try {
    await waitForServer(port, child, output);
  } catch (error) {
    child.kill("SIGKILL");
    await rm(dataDir, { recursive: true, force: true });
    throw error;
  }

  return {
    port,
    metricsToken,
    async stop() {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await Promise.race([
          new Promise((resolve) => child.once("exit", resolve)),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
        if (child.exitCode === null) child.kill("SIGKILL");
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

test("real app mounts bounded observability routes and protects metrics", async () => {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  assert.match(databaseUrl, /^postgres(?:ql)?:\/\//i, "disposable PostgreSQL DATABASE_URL is required");
  const server = await startApi(databaseUrl);
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

test("real app readiness fails closed when PostgreSQL authority is unavailable", async () => {
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
