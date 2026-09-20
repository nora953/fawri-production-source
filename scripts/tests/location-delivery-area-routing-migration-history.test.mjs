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

test("0019 delivery-area routing creates referenced uniqueness before tenant FK", () => {
  const entry = journal.entries.find((item) => item.idx === 19);
  assert.equal(entry?.tag, "0019_location_delivery_area_routing");

  const sql = fs.readFileSync(
    path.join(drizzle, "0019_location_delivery_area_routing.sql"),
    "utf8",
  );

  const uniqueStatement =
    'ALTER TABLE "merchant_delivery_area_rates" ADD CONSTRAINT "merchant_delivery_area_rates_id_merchant_unique" UNIQUE("id","merchant_id")';
  const foreignKeyStatement =
    'ALTER TABLE "merchant_location_delivery_areas" ADD CONSTRAINT "merchant_location_delivery_areas_area_merchant_fk" FOREIGN KEY ("delivery_area_rate_id","merchant_id") REFERENCES "public"."merchant_delivery_area_rates"("id","merchant_id")';

  const uniqueIndex = sql.indexOf(uniqueStatement);
  const foreignKeyIndex = sql.indexOf(foreignKeyStatement);

  assert.notEqual(uniqueIndex, -1, "0019 must create the composite unique constraint");
  assert.notEqual(foreignKeyIndex, -1, "0019 must create the tenant-scoped delivery-area FK");
  assert.ok(
    uniqueIndex < foreignKeyIndex,
    "0019 must create merchant_delivery_area_rates(id, merchant_id) uniqueness before the FK references it",
  );
});
