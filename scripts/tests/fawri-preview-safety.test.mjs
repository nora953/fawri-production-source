import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const source = fs.readFileSync(path.join(root, 'scripts/run-fawri-preview.mjs'), 'utf8');

test('Replit preview is fail-closed on cashier and PostgreSQL catalog prerequisites', () => {
  assert.match(source, /cashier\.html/);
  assert.match(source, /cashierMain\.tsx/);
  assert.match(source, /DATABASE_URL is required for the Fawri preview/);
  assert.match(source, /FAWRI_OPERATIONAL_POSTGRES_AUTHORITY/);
  assert.match(source, /process\.env\.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required"/);
  assert.match(source, /catalog-variant-signature-readiness\.mjs/);
  assert.match(source, /await verifyCatalogPostgresReadiness\(\);/);
  assert.match(source, /await buildPreview\(\);/);
  assert.ok(
    source.indexOf('await verifyCatalogPostgresReadiness();') < source.indexOf('await buildPreview();'),
    'database readiness must run before the preview build/start sequence',
  );
});
