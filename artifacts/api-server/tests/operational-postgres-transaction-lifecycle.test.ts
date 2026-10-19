import assert from "node:assert/strict";
import test from "node:test";
import {
  withOperationalTransaction,
  type OperationalDatabasePool,
  type OperationalTransactionClient,
} from "../src/services/operationalPostgresAuthority";

function mockPool(failAt?: "BEGIN" | "COMMIT" | "ROLLBACK") {
  const queries: string[] = [];
  const releases: (boolean | Error | undefined)[] = [];
  const client: OperationalTransactionClient = {
    async query(sql) {
      queries.push(sql);
      if (sql === failAt) throw new Error(`simulated ${sql} failure`);
      return { rows: [] };
    },
    release(reason) { releases.push(reason); },
  };
  const pool = { connect: async () => client } as OperationalDatabasePool;
  return { pool, queries, releases };
}

test("successful transaction returns result and keeps healthy connection", async () => {
  const m = mockPool();
  const result = await withOperationalTransaction(async () => "ok", m.pool);
  assert.equal(result, "ok");
  assert.deepEqual(m.queries, ["BEGIN", "COMMIT"]);
  assert.deepEqual(m.releases, [false]);
});

test("callback error rolls back and keeps connection when rollback succeeds", async () => {
  const m = mockPool();
  await assert.rejects(
    () => withOperationalTransaction(async () => { throw new Error("work failed"); }, m.pool),
    /work failed/,
  );
  assert.deepEqual(m.queries, ["BEGIN", "ROLLBACK"]);
  assert.deepEqual(m.releases, [false]);
});

test("failed rollback discards connection and preserves original callback error", async () => {
  const m = mockPool("ROLLBACK");
  await assert.rejects(
    () => withOperationalTransaction(async () => { throw new Error("work failed"); }, m.pool),
    /work failed/,
  );
  assert.deepEqual(m.queries, ["BEGIN", "ROLLBACK"]);
  assert.deepEqual(m.releases, [true]);
});

for (const phase of ["BEGIN", "COMMIT"] as const) {
  test(`failed ${phase} discards connection`, async () => {
    const m = mockPool(phase);
    await assert.rejects(() => withOperationalTransaction(async () => "ok", m.pool), new RegExp(phase));
    assert.deepEqual(m.releases, [true]);
    assert.ok(m.queries.includes("ROLLBACK"));
  });
}
