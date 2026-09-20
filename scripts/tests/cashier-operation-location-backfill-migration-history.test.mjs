import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const drizzle = path.join(root, "lib", "db", "drizzle");
const journal = JSON.parse(
  fs.readFileSync(path.join(drizzle, "meta", "_journal.json"), "utf8"),
);

test("0020 backfills only unattributed cashier locations from the same canonical station", () => {
  const entry = journal.entries.find((item) => item.idx === 20);
  assert.equal(entry?.tag, "0020_cashier_operation_location_backfill");

  const sql = fs.readFileSync(
    path.join(drizzle, "0020_cashier_operation_location_backfill.sql"),
    "utf8",
  );

  assert.match(
    sql,
    /UPDATE "cashier_operation_attribution" AS attribution/,
  );
  assert.match(
    sql,
    /SET "location_id" = station."location_id"/,
  );
  assert.match(
    sql,
    /attribution."location_id" IS NULL/,
  );
  assert.match(
    sql,
    /station."merchant_id" = attribution."merchant_id"/,
  );
  assert.match(
    sql,
    /station."id" = attribution."station_id"/,
  );
  assert.match(
    sql,
    /station."location_id" IS NOT NULL/,
  );

  assert.doesNotMatch(
    sql,
    /SET "location_id" = NULL/,
  );
  assert.doesNotMatch(
    sql,
    /UPDATE "merchant_cashier_stations"/,
  );
});
