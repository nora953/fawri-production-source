import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/app.ts", import.meta.url),
  "utf8",
);
const staffRouteSource = await readFile(
  new URL("../src/routes/cashier-staff-operations.ts", import.meta.url),
  "utf8",
);
const operatorCommerceSource = await readFile(
  new URL("../src/routes/cashier-operator-commerce.ts", import.meta.url),
  "utf8",
);

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("active Express app mounts cashier management and operator commerce routers", () => {
  assert.match(
    appSource,
    /import cashierStaffOperationsRouter from "\.\/routes\/cashier-staff-operations";/,
  );
  assert.match(
    appSource,
    /import cashierOperatorCommerceRouter from "\.\/routes\/cashier-operator-commerce";/,
  );

  const activeBusinessRoutes = between(
    appSource,
    'app.use("/api", conversationOperationsRouter);',
    "// Meta OAuth remains fail-closed",
  );

  assert.match(
    activeBusinessRoutes,
    /app\.use\("\/api", cashierStaffOperationsRouter\);/,
  );
  assert.match(
    activeBusinessRoutes,
    /app\.use\("\/api", cashierOperatorCommerceRouter\);/,
  );
  assert.match(
    activeBusinessRoutes,
    /app\.use\("\/api", cashierSyncOperationsRouter\);/,
  );

  const staffMount = activeBusinessRoutes.indexOf("cashierStaffOperationsRouter");
  const operatorMount = activeBusinessRoutes.indexOf("cashierOperatorCommerceRouter");
  const syncMount = activeBusinessRoutes.indexOf("cashierSyncOperationsRouter");
  assert.ok(staffMount < operatorMount && operatorMount < syncMount);
});

test("mounted cashier staff router owns management, station, login and logout lifecycle", () => {
  for (const route of [
    "/cashier/management/staff",
    "/cashier/management/stations",
    "/cashier/station/pair",
    "/cashier/station/me",
    "/cashier/operator/login",
    "/cashier/operator/me",
    "/cashier/operator/logout",
  ]) {
    assert.ok(staffRouteSource.includes(`"${route}"`), `missing cashier route ${route}`);
  }

  assert.match(staffRouteSource, /requireSecureMerchantSession/);
  assert.match(staffRouteSource, /requireCashierStationCredential/);
  assert.match(staffRouteSource, /requireCashierOperatorSession\(\)/);
});

test("mounted operator commerce router owns live catalog, reporting and compensation surfaces", () => {
  for (const route of [
    "/cashier/operator/catalog-snapshot",
    "/cashier/operator/report",
    "/cashier/operator/sales",
    "/cashier/operator/returns",
    "/cashier/operator/voids",
  ]) {
    assert.ok(operatorCommerceSource.includes(`"${route}"`), `missing operator commerce route ${route}`);
  }

  assert.match(operatorCommerceSource, /requireCashierOperatorSession\("sale\.create"\)/);
  assert.match(operatorCommerceSource, /requireCashierOperatorSession\("sale\.return"\)/);
  assert.match(operatorCommerceSource, /requireCashierOperatorSession\("sale\.void"\)/);
});
