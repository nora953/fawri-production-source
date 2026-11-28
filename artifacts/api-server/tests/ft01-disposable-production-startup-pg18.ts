/**
 * FT-01 disposable CI: invoke the actual production SQL startup identity
 * admission functions on three independently authenticated PG18 sessions.
 * Never starts API/Meta/providers/listener, never runs on hosted databases.
 * This test must be called ONLY by the locally fenced PG18 harness.
 */
import assert from "node:assert/strict";
import pg from "pg";
import { assertProductionAuthenticationDatabaseReady } from
  "../src/services/authenticationPostgresAuthority";
import { assertProductionOperatorDatabaseReady } from
  "../src/services/operatorDirectoryPostgresAuthority";
import { assertProductionDatabaseRlsReady } from
  "../src/services/postgresRuntimeRlsSecurity";
import type { OperationalQueryTarget } from
  "../src/services/operationalPostgresAuthority";

const { Client } = pg;
const keys = [
  "FT01_DISPOSABLE_TENANT_URL",
  "FT01_DISPOSABLE_AUTH_URL",
  "FT01_DISPOSABLE_OPERATOR_URL",
] as const;
const expectedLogins = [
  "fawri_ft01_tenant_disposable",
  "fawri_ft01_auth_disposable",
  "fawri_ft01_operator_disposable",
];

function localUrl(key: (typeof keys)[number], index: number): string {
  const value = process.env[key];
  assert.ok(value, "FT01_MISSING_DISPOSABLE_URL");
  const url = new URL(value);
  assert.equal(url.protocol, "postgresql:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "5432");
  assert.equal(url.pathname, "/fawri_ci");
  assert.equal(decodeURIComponent(url.username), expectedLogins[index]);
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  return value;
}

async function main(): Promise<void> {
  assert.equal(process.argv.length, 2, "FT01_NO_ARGUMENTS");
  assert.equal(process.env.GITHUB_ACTIONS, "true", "FT01_ACTIONS_ONLY");
  assert.equal(process.env.GITHUB_REPOSITORY,
    "nora953/fawri-production-source", "FT01_REPO_ONLY");
  assert.equal(process.env.FAWRI_ALLOW_FT01_DISPOSABLE_THREE_LOGIN_REHEARSAL,
    "1", "FT01_LOCAL_AUTHORIZATION_MISSING");

  const urls = keys.map((key, index) => localUrl(key, index));
  const clients = urls.map(connectionString => new Client({
    connectionString, ssl: false, connectionTimeoutMillis: 3000,
  }));
  const queryTarget = (client: pg.Client) =>
    client as unknown as OperationalQueryTarget;
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "production",
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
    FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE: expectedLogins[0],
    FAWRI_AUTH_DATABASE_URL: urls[1],
    FAWRI_OPERATOR_DATABASE_URL: urls[2],
  };

  let connected = 0;
  try {
    for (const client of clients) {
      await client.connect();
      connected++;
    }
    // These are the SAME functions run before providers and HTTP listener
    // from src/index.ts, but with explicitly supplied actual SQL sessions.
    await assertProductionAuthenticationDatabaseReady(
      env, async work => { await work(queryTarget(clients[1])); },
    );
    await assertProductionOperatorDatabaseReady(
      env, async work => { await work(queryTarget(clients[2])); },
    );
    console.log("FT01_PG18_REAL_AUTH_AND_OPERATOR_PRELISTENER_SQL_PASS");

    await assertProductionDatabaseRlsReady(
      env, queryTarget(clients[0]),
    );
    console.log("FT01_PG18_REAL_TENANT_RLS_PRELISTENER_SQL_PASS");

    // Crossed credentials must never count as an admitted actor.
    await assert.rejects(
      () => assertProductionAuthenticationDatabaseReady(
        env, async work => { await work(queryTarget(clients[0])); },
      ),
      (error: unknown) =>
        (error as { code?: string })?.code ===
          "PRODUCTION_AUTH_DATABASE_IDENTITY_NOT_READY",
    );
    await assert.rejects(
      () => assertProductionOperatorDatabaseReady(
        env, async work => { await work(queryTarget(clients[1])); },
      ),
      (error: unknown) =>
        (error as { code?: string })?.code ===
          "PRODUCTION_OPERATOR_DATABASE_IDENTITY_NOT_READY",
    );
    console.log("FT01_PG18_CROSSED_LOGIN_PRELISTENER_DENIAL_PASS");
  } finally {
    for (const client of clients.slice(0, connected).reverse()) {
      await client.end();
    }
  }
}
await main();
