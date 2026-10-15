import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const current = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(current, "../src/services/postgresOnlineOrderReportAuthority.ts"),
  "utf8",
);

test("online interactive report has a PostgreSQL execution budget and fail-closed timeout mapping", () => {
  assert.match(source, /ONLINE_REPORT_STATEMENT_TIMEOUT_MS\s*=\s*8_000/);
  assert.match(source, /SET LOCAL statement_timeout/);
  assert.match(source, /code\s*===\s*"57014"/);
  assert.match(source, /ONLINE_REPORT_QUERY_TIMEOUT/);
  assert.match(source, /503/);
});

test("online report keeps all-time financial truth instead of silently truncating rows", () => {
  assert.doesNotMatch(source, /LIMIT\s+\$\d+[\s\S]*FROM orders\b/i);
  assert.match(source, /MAX_TOP_PRODUCTS/);
});
