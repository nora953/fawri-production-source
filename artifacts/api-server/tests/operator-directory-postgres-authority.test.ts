import assert from "node:assert/strict";
import test from "node:test";
import { createOperatorDirectoryAuthority, assertProductionOperatorDatabaseReady } from "../src/services/operatorDirectoryPostgresAuthority";
import type { OperationalQueryTarget } from "../src/services/operationalPostgresAuthority";
import { assertProductionAuthenticationDatabaseReady } from "../src/services/authenticationPostgresAuthority";
import type { OperationalQueryTarget } from "../src/services/operationalPostgresAuthority";

const configured = {
  NODE_ENV: "production", FAWRI_DEPLOYMENT_MODE: "production",
  FAWRI_OPERATOR_DATABASE_URL: "postgresql://synthetic_operator@127.0.0.1/operator_test",
};
function pool(identity: unknown) {
  const events: string[] = [];
  const parameters: unknown[] = [];
  return {
    events, parameters,
    async query() { throw new Error("must use a leased transaction client"); },
    async connect() {
      return {
        async query(sql: string, values?: unknown[]) {
          if (sql.startsWith("SELECT")) parameters.push(values);
          events.push(sql.startsWith("SELECT") ? "IDENTITY" : sql);
          return { rows: sql.startsWith("SELECT") ? (identity ? [identity] : []) : [] };
        },
        release() { events.push("RELEASE"); },
      };
    },
    async end() { events.push("END"); },
  };
}
const identity = { login: "operator", active: "operator", safe: true, can_issue: true };

test("production never falls back to tenant credentials when operator configuration is absent or invalid", async () => {
  for (const value of [undefined, "", "https://secret.invalid", "postgresql://[invalid"]) {
    let opened = false;
    const authority = createOperatorDirectoryAuthority({
      env: { ...configured, FAWRI_OPERATOR_DATABASE_URL: value },
      sharedPool: async () => { opened = true; throw new Error(); },
      makePool: async () => { opened = true; throw new Error(); },
    });
    await assert.rejects(() => authority.databasePool(), error => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "operator database authority is unavailable");
      return true;
    });
    assert.equal(opened, false);
  }
});

test("dedicated pool is reused, validates the authenticated identity and closes independently", async () => {
  const fake = pool(identity);
  let opens = 0;
  const authority = createOperatorDirectoryAuthority({
    env: { ...configured },
    makePool: async url => { assert.equal(url, configured.FAWRI_OPERATOR_DATABASE_URL); opens++; return fake as never; },
    sharedPool: async () => { throw new Error("tenant pool must not be selected"); },
  });
  for (let i = 0; i < 2; i++) assert.equal(await authority.transaction(async () => 42), 42);
  assert.equal(opens, 1);
  assert.deepEqual(fake.events, ["BEGIN", "IDENTITY", "COMMIT", "RELEASE", "BEGIN", "IDENTITY", "COMMIT", "RELEASE"]);
  await authority.close();
  assert.equal(fake.events.at(-1), "END");
});

test("privileged, switched, ungranted and incomplete operator identities roll back before executing work", async () => {
  for (const row of [null, { ...identity, active: "another_role" }, { ...identity, safe: false },
    { ...identity, safe: "true" }, { ...identity, can_issue: false }, { ...identity, can_issue: undefined }]) {
    const fake = pool(row);
    const authority = createOperatorDirectoryAuthority({ env: { ...configured }, makePool: async () => fake as never });
    let worked = false;
    await assert.rejects(() => authority.transaction(async () => { worked = true; }),
      { code: "OPERATOR_DATABASE_IDENTITY_INVALID" });
    assert.equal(worked, false);
    assert.deepEqual(fake.events, ["BEGIN", "IDENTITY", "ROLLBACK", "RELEASE"]);
    await authority.close();
  }
});

test("operator work failures roll back and pool configuration cannot silently change", async () => {
  const fake = pool(identity), env = { ...configured };
  const authority = createOperatorDirectoryAuthority({ env, makePool: async () => fake as never });
  await assert.rejects(() => authority.transaction(async () => { throw new Error("synthetic work failure"); }),
    { message: "synthetic work failure" });
  assert.deepEqual(fake.events, ["BEGIN", "IDENTITY", "ROLLBACK", "RELEASE"]);
  env.FAWRI_OPERATOR_DATABASE_URL = "postgresql://another@127.0.0.1/other";
  await assert.rejects(() => authority.databasePool(), { code: "OPERATOR_DATABASE_CONFIG_CHANGED" });
  await authority.close();
});


for (const [capability, signature] of [
  ["receiptRead", "public.fawri_read_verified_payment_receipts(text,integer,timestamptz,text,text,text)"],
  ["receiptReview", "public.fawri_review_verified_payment_receipt(text,text,text,text,text,text)"],
  ["receiptExecution", "public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text)"],
] as const) test(`${capability} pool validates its own bounded capability without requiring directory issuance`, async () => {
  const fake = pool(identity);
  const authority = createOperatorDirectoryAuthority({
    capability, env: { ...configured }, makePool: async () => fake as never,
  });
  assert.equal(await authority.transaction(async () => "read"), "read");
  assert.deepEqual(fake.parameters, [[signature]]);
  await authority.close();
});

test("unrecognized runtime capabilities fail before opening connections", () => {
  assert.throws(() => createOperatorDirectoryAuthority({ capability: "untrusted" as never }),
    { code: "OPERATOR_DATABASE_CAPABILITY_INVALID" });
});


test("authentication cannot select operator or tenant credentials in production", async () => {
  let opened=false;
  const authority=createOperatorDirectoryAuthority({capability:"authentication",env:{...configured},
    makePool:async()=>{opened=true;throw Error();},sharedPool:async()=>{opened=true;throw Error();}});
  await assert.rejects(()=>authority.databasePool(),{code:"AUTH_DATABASE_REQUIRED",message:"authentication database authority is unavailable"});
  assert.equal(opened,false);
});
test("authentication validates its own LOGIN capability and dedicated URL",async()=>{
  const fake=pool(identity),url="postgresql://synthetic_auth@127.0.0.1/auth_test";
  const authority=createOperatorDirectoryAuthority({capability:"authentication",env:{...configured,FAWRI_AUTH_DATABASE_URL:url},
    makePool:async selected=>{assert.equal(selected,url);return fake as never;}});
  assert.equal(await authority.transaction(async()=>"auth"),"auth");
  assert.deepEqual(fake.parameters,[["public.fawri_authentication_runtime()"]]);await authority.close();
});


const productionAuthenticationEnv = {
  NODE_ENV: "production",
  FAWRI_DEPLOYMENT_MODE: "production",
  FAWRI_AUTH_DATABASE_URL: "postgresql://synthetic_auth@127.0.0.1/neondb",
};
const safeAuthLogin = {
  login: "synthetic_auth",
  active: "synthetic_auth",
  database_name: "neondb",
  authentication_ready: true,
  issuer_ready: true,
  tenant_data_reachable: false,
};
function authenticationProbe(
  identityResult: unknown = safeAuthLogin,
  scopeResult: unknown = { present: true, safe: true },
) {
  const statements: string[] = [];
  return {
    statements,
    async execute(work: (client: OperationalQueryTarget) => Promise<void>) {
      const client: OperationalQueryTarget = {
        async query<T extends Record<string, unknown>>(sql: string) {
          statements.push(sql);
          if (sql.includes("WITH principal AS")) {
            return { rows: (scopeResult ? [scopeResult] : []) as T[] };
          }
          if (sql.includes("SELECT session_user::text AS login")) {
            return { rows: (identityResult ? [identityResult] : []) as T[] };
          }
          throw new Error("unexpected SQL in auth startup proof");
        },
      };
      await work(client);
    },
  };
}

test("FIELD002 production startup admits only live restricted auth issuer matching its own DB URL", async () => {
  const fake = authenticationProbe();
  await assert.doesNotReject(
    assertProductionAuthenticationDatabaseReady(productionAuthenticationEnv, fake.execute),
  );
  assert.equal(fake.statements.length, 2);
  assert.ok(fake.statements[0].includes("WITH principal AS"));
  assert.ok(fake.statements[1].includes("tenant_data_reachable"));
});

test("FIELD002 production auth startup fails closed on role switching, wrong DB, missing grants or tenant access", async () => {
  const unsafe = [
    null,
    { ...safeAuthLogin, login: "legacy_login" },
    { ...safeAuthLogin, active: "switched_owner" },
    { ...safeAuthLogin, database_name: "another_branch_db" },
    { ...safeAuthLogin, authentication_ready: false },
    { ...safeAuthLogin, issuer_ready: false },
    { ...safeAuthLogin, tenant_data_reachable: true },
    { ...safeAuthLogin, tenant_data_reachable: undefined },
    { ...safeAuthLogin, issuer_ready: "true" },
  ];
  for (const row of unsafe) {
    const fake = authenticationProbe(row);
    await assert.rejects(
      assertProductionAuthenticationDatabaseReady(productionAuthenticationEnv, fake.execute),
      { code: "PRODUCTION_AUTH_DATABASE_IDENTITY_NOT_READY",
        message: "production authentication database is not ready" },
    );
  }
  for (const scope of [
    null, { present: false, safe: true }, { present: true, safe: false },
  ]) {
    const fake = authenticationProbe(safeAuthLogin, scope);
    await assert.rejects(
      assertProductionAuthenticationDatabaseReady(productionAuthenticationEnv, fake.execute),
      { code: "PRODUCTION_AUTH_DATABASE_IDENTITY_NOT_READY" },
    );
  }
});

test("FIELD002 auth admission does not leak SQL or passwords and skips explicit nonproduction", async () => {
  const failed = authenticationProbe();
  failed.execute = async () => {
    throw new Error("postgresql credentials should never appear in an error");
  };
  await assert.rejects(
    assertProductionAuthenticationDatabaseReady(productionAuthenticationEnv, failed.execute),
    error => {
      assert.equal((error as {code?:string}).code, "PRODUCTION_AUTH_DATABASE_IDENTITY_NOT_READY");
      assert.equal((error as Error).message, "production authentication database is not ready");
      return true;
    },
  );
  let touched = false;
  await assert.doesNotReject(assertProductionAuthenticationDatabaseReady(
    { ...productionAuthenticationEnv, FAWRI_DEPLOYMENT_MODE: "staging" },
    async () => { touched = true; },
  ));
  assert.equal(touched, false);
  await assert.rejects(assertProductionAuthenticationDatabaseReady(
    { ...productionAuthenticationEnv, FAWRI_AUTH_DATABASE_URL: "" },
    async () => { touched = true; },
  ), { code: "PRODUCTION_AUTH_DATABASE_IDENTITY_NOT_READY" });
  assert.equal(touched, false);
});


const operatorStartupEnv = {
  NODE_ENV: "production",
  FAWRI_DEPLOYMENT_MODE: "production",
  FAWRI_OPERATOR_DATABASE_URL: configured.FAWRI_OPERATOR_DATABASE_URL,
};
const goodOperatorStartup = {
  login: "synthetic_operator",
  active: "synthetic_operator",
  database_name: "operator_test",
  directory_ready: true,
  authentication_reachable: false,
  scope_issuer_reachable: false,
};
function operatorStartupProbe(row: unknown = goodOperatorStartup) {
  const queries: string[] = [];
  return {
    queries,
    async execute(work: (client: OperationalQueryTarget) => Promise<void>): Promise<void> {
      const client: OperationalQueryTarget = {
        async query<T extends Record<string, unknown>>(sql: string) {
          queries.push(sql);
          if (!sql.includes("SELECT session_user::text AS login")) {
            throw new Error("unexpected operator startup SQL");
          }
          return { rows: (row ? [row] : []) as T[] };
        },
      };
      await work(client);
    },
  };
}

test("FIELD002 production proves the actual dedicated operator issuer before HTTP admission", async () => {
  const probe = operatorStartupProbe();
  await assert.doesNotReject(
    assertProductionOperatorDatabaseReady(operatorStartupEnv, probe.execute),
  );
  assert.equal(probe.queries.length, 1);
  assert.ok(probe.queries[0].includes("authentication_reachable"));
  assert.ok(probe.queries[0].includes("scope_issuer_reachable"));
});

test("FIELD002 operator prelistener SQL denies mismatched, switched, overprivileged, and incomplete roles", async () => {
  for (const row of [
    null,
    { ...goodOperatorStartup, login: "unexpected_login" },
    { ...goodOperatorStartup, active: "neondb_owner" },
    { ...goodOperatorStartup, database_name: "another_db" },
    { ...goodOperatorStartup, directory_ready: false },
    { ...goodOperatorStartup, directory_ready: "true" },
    { ...goodOperatorStartup, authentication_reachable: true },
    { ...goodOperatorStartup, scope_issuer_reachable: true },
    { ...goodOperatorStartup, scope_issuer_reachable: undefined },
  ]) {
    await assert.rejects(
      assertProductionOperatorDatabaseReady(operatorStartupEnv, operatorStartupProbe(row).execute),
      { code: "PRODUCTION_OPERATOR_DATABASE_IDENTITY_NOT_READY" },
    );
  }
  await assert.rejects(
    assertProductionOperatorDatabaseReady(
      { ...operatorStartupEnv, FAWRI_OPERATOR_DATABASE_URL: "" },
      operatorStartupProbe().execute,
    ),
    { code: "PRODUCTION_OPERATOR_DATABASE_IDENTITY_NOT_READY" },
  );
});

test("FIELD002 operator startup sanitizes transport errors and preserves explicit staging isolation", async () => {
  await assert.rejects(
    assertProductionOperatorDatabaseReady(operatorStartupEnv, async () => {
      throw new Error("raw SQL diagnostic or synthetic secret must not leak");
    }),
    error => {
      assert.equal((error as { code?: string }).code,
        "PRODUCTION_OPERATOR_DATABASE_IDENTITY_NOT_READY");
      assert.equal((error as Error).message, "production operator database is not ready");
      return true;
    },
  );
  let invoked = false;
  await assert.doesNotReject(
    assertProductionOperatorDatabaseReady(
      { ...operatorStartupEnv, FAWRI_DEPLOYMENT_MODE: "staging" },
      async () => { invoked = true; },
    ),
  );
  assert.equal(invoked, false);
});
