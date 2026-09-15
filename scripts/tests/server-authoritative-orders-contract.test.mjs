import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("active orders page is server-authoritative", () => {
  const entry = read("artifacts/fawri/src/pages/dashboard/OrdersPage.tsx");
  const page = read(
    "artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx",
  );
  const combined = `${entry}\n${page}`;

  assert.match(entry, /ServerOrdersPage/);
  for (const forbidden of [
    "getOrders",
    "saveOrders",
    "fawri_orders",
    "localStorage",
    "sessionStorage",
  ]) {
    assert.equal(
      combined.includes(forbidden),
      false,
      `server-authoritative orders page contains forbidden authority: ${forbidden}`,
    );
  }
  assert.match(page, /fetch\('\/api\/orders'/);
  assert.match(page, /expected_version/);
  assert.match(page, /ORDER_VERSION_CONFLICT/);
});

test("order API exposes isolated state and payment mutation routes", () => {
  const router = read(
    "artifacts/api-server/src/routes/order-operations.ts",
  );
  const service = read(
    "artifacts/api-server/src/services/orderOperationsRuntime.ts",
  );

  assert.match(router, /requireMerchantSession/);
  assert.match(router, /\/orders\/:orderId\/status/);
  assert.match(router, /\/orders\/:orderId\/payment-status/);
  assert.match(router, /\/orders\/:orderId\/payment\/confirm/);
  assert.match(router, /\/orders\/:orderId\/payment\/reject/);
  assert.match(service, /ORDER_VERSION_CONFLICT/);
  assert.match(service, /writeJsonAtomically/);
  assert.match(service, /registerMerchantRuntimeDeletion/);
});
