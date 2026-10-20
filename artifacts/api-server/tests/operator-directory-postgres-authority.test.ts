import assert from "node:assert/strict";
import test from "node:test";
import { createOperatorDirectoryAuthority } from "../src/services/operatorDirectoryPostgresAuthority";

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
