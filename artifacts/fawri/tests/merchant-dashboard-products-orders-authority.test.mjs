import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

test('dashboard products and orders routes resolve to the active server-backed workspaces', () => {
  const productsEntry = read('artifacts/fawri/src/pages/dashboard/ProductsPage.tsx');
  const productsWorkspace = read('artifacts/fawri/src/pages/dashboard/ProductsWorkspacePage.tsx');
  const ordersEntry = read('artifacts/fawri/src/pages/dashboard/OrdersPage.tsx');
  const ordersWorkspace = read('artifacts/fawri/src/pages/dashboard/OrdersWorkspacePage.tsx');

  assert.match(productsEntry, /ProductsWorkspacePage/);
  assert.match(productsWorkspace, /CommerceCatalogSimplifiedPage/);
  assert.match(productsWorkspace, /CatalogPromotionsPage/);
  assert.match(ordersEntry, /OrdersWorkspacePage/);
  assert.match(ordersWorkspace, /ServerOrdersPage/);
});

test('catalog and order server authorities derive merchant identity from the authenticated session', () => {
  const catalogRoute = read('artifacts/api-server/src/routes/catalog-operations.ts');
  const orderRoute = read('artifacts/api-server/src/routes/order-operations.ts');

  for (const source of [catalogRoute, orderRoute]) {
    assert.match(source, /requireMerchantSession/);
    assert.match(source, /getMerchantIdFromSession/);
    assert.match(source, /Cache-Control/);
    assert.match(source, /no-store/);
  }

  assert.match(catalogRoute, /listCatalogProductsAuthoritative\(merchantId\)/);
  assert.match(catalogRoute, /expectedVersion: req\.body\?\.expected_version/);
  assert.match(orderRoute, /listServerOrdersAuthoritative\(merchantId\)/);
  assert.match(orderRoute, /expectedVersion: req\.body\?\.expected_version/);
});

test('active products page does not require browser merchant state and gates stale mutations', () => {
  const page = read('artifacts/fawri/src/pages/dashboard/CommerceCatalogSimplifiedPage.tsx');

  assert.doesNotMatch(page, /getCurrentMerchant/);
  assert.doesNotMatch(page, /if \(!merchant\)/);
  assert.match(page, /listCatalogProducts\(\)/);
  assert.match(page, /getCatalogCommerceContext\(\)/);
  assert.match(page, /const \[authorityReady, setAuthorityReady\] = useState\(false\)/);
  assert.match(page, /setAuthorityReady\(false\);[\s\S]*listCatalogProducts\(\)/);
  assert.match(page, /setInventoryValues\(drafts\);\s*setAuthorityReady\(true\)/);
  assert.match(page, /\}, \[reload\]\);/);
  assert.match(page, /if \(saving \|\| !authorityReady\)/);
  assert.match(page, /const remove = async[\s\S]*if \(!authorityReady\)/);
  assert.match(page, /const setInventory = async[\s\S]*if \(!authorityReady\)/);
  assert.match(page, /const adjustInventory = async[\s\S]*if \(!authorityReady\)/);
  assert.match(page, /disabled=\{!authorityReady\}/);
  assert.match(page, /busy=\{inventoryBusy === key \|\| !authorityReady\}/);
});

test('orders validate canonical payloads and only the newest authority read can apply', () => {
  const page = read('artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx');

  assert.match(page, /function isServerOrder\(value: unknown\): value is ServerOrder/);
  assert.match(page, /const loadRequestIdRef = useRef\(0\)/);
  assert.match(page, /const requestId = \+\+loadRequestIdRef\.current/);
  assert.match(page, /setAuthorityStatus\('loading'\)/);
  assert.match(page, /if \(requestId !== loadRequestIdRef\.current\) return/);
  assert.match(page, /data\.orders\.every\(isServerOrder\)/);
  assert.match(page, /credentials: 'same-origin'/);
  assert.match(page, /cache: 'no-store'/);
  assert.match(page, /useEffect\(\(\) => \{\s*void loadOrders\(\);[\s\S]*\}, \[\]\);/);
  assert.doesNotMatch(page, /\[pendingOrderId, language\]/);
});

test('order mutations fail closed while freshness is unconfirmed and validate mutation results', () => {
  const page = read('artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx');

  assert.match(page, /if \(pendingOrderId \|\| authorityStatus !== 'ready'\) return/);
  assert.match(page, /body: JSON\.stringify\(\{ expected_version: order\.version, \.\.\.body \}\)/);
  assert.match(page, /!isServerOrder\(data\.order\)/);
  assert.match(page, /data\.code === 'ORDER_VERSION_CONFLICT'[\s\S]*isServerOrder\(data\.current_order\)/);
  assert.match(page, /setAuthorityStatus\('unavailable'\);[\s\S]*await loadOrders\(true\)/);
  assert.match(page, /const authorityBlocked = authorityStatus !== 'ready'/);
  assert.match(page, /disabled=\{busy \|\| authorityBlocked\}/);
});
