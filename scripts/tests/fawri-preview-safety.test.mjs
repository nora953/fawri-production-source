import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const source = fs.readFileSync(path.join(root, 'scripts/run-fawri-preview.mjs'), 'utf8');

test('Replit preview is fail-closed on PostgreSQL operational, auth, subscription, catalog, and cashier prerequisites', () => {
  assert.match(source, /cashier\.html/);
  assert.match(source, /cashierMain\.tsx/);
  assert.match(source, /DATABASE_URL is required for the Fawri preview/);

  assert.match(source, /FAWRI_OPERATIONAL_POSTGRES_AUTHORITY/);
  assert.match(source, /process\.env\.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required"/);
  assert.match(source, /FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY/);
  assert.match(source, /FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY/);
  assert.match(source, /FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:\s*"required"/);
  assert.match(source, /FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY:\s*"required"/);

  assert.match(source, /catalog-variant-signature-readiness\.mjs/);
  assert.match(source, /cashier-staff-authority-readiness\.mjs/);
  assert.match(source, /await verifyCatalogPostgresReadiness\(\);/);
  assert.match(source, /await verifyCashierPostgresReadiness\(\);/);
  assert.match(source, /await buildPreview\(\);/);

  const catalogGate = source.indexOf('await verifyCatalogPostgresReadiness();');
  const cashierGate = source.indexOf('await verifyCashierPostgresReadiness();');
  const build = source.indexOf('await buildPreview();');
  assert.ok(catalogGate >= 0 && catalogGate < build, 'catalog database readiness must run before build/start');
  assert.ok(cashierGate >= 0 && cashierGate < build, 'cashier database readiness must run before build/start');
});

test('Replit preview refuses explicitly non-required PostgreSQL auth/subscription authority modes', () => {
  assert.match(source, /authorityName of \[/);
  assert.match(source, /FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY/);
  assert.match(source, /FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY/);
  assert.match(source, /is unsafe for this PostgreSQL preview; expected required/);
  assert.match(source, /process\.env\[authorityName\] = "required"/);
});
