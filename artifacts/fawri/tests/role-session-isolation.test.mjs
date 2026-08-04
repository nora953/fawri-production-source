import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const store = await readFile(new URL("../src/lib/store.ts", import.meta.url), "utf8");
const login = await readFile(new URL("../src/pages/LoginPage.tsx", import.meta.url), "utf8");
const dashboard = await readFile(
  new URL("../src/components/layout/DashboardLayout.tsx", import.meta.url),
  "utf8",
);

test("merchant and administrator browser state stays isolated by tab and role", () => {
  assert.match(
    store,
    /sessionStorage\.getItem\(MERCHANT_SESSION_ID_KEY\)/,
    "merchant session id must be tab-scoped",
  );
  assert.match(
    store,
    /merchants\.filter\(merchant => merchant\.is_admin !== true\)/,
    "administrator accounts must never enter merchant cache",
  );

  const adminBranchStart = login.indexOf("if (accountType === 'admin')");
  const merchantCacheStart = login.indexOf("cacheMerchantLocally(user)");
  assert.ok(adminBranchStart >= 0, "admin login branch must exist");
  assert.ok(
    merchantCacheStart > adminBranchStart,
    "role must be resolved before merchant state is written",
  );
  const adminBranch = login.slice(adminBranchStart, merchantCacheStart);
  assert.match(adminBranch, /clearMerchantTabSession\(\)/);
  assert.doesNotMatch(adminBranch, /setSession\(/);
  assert.doesNotMatch(adminBranch, /cacheMerchantLocally\(/);

  assert.match(dashboard, /if \(getAdminSessionToken\(\)\)/);
  assert.match(dashboard, /updated\.is_admin === true/);
  assert.match(dashboard, /if \(checkingAccess\)/);
});
