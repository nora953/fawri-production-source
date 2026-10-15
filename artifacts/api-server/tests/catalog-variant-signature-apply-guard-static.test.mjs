import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(testDirectory, '../../..');
const source = fs.readFileSync(
  path.join(workspaceRoot, 'lib/db/scripts/apply-catalog-variant-signature-guard.mjs'),
  'utf8',
);

test('catalog variant signature migration apply is explicit, pinned, target-scoped, and fail-closed', () => {
  assert.match(source, /FAWRI_ALLOW_CATALOG_SIGNATURE_MIGRATION/);
  assert.match(source, /FAWRI_EXPECT_DATABASE/);
  assert.match(source, /0012_catalog_variant_signature_guard/);
  assert.match(source, /0011_commerce_promotions_timezone_authority/);
  assert.match(source, /9a6522b949e99f8799635208d9288a9125933d752f70ba6e275d38c8f46d16ed/);
  assert.match(source, /entries\.filter\(\(entry\) => entry\.tag === TARGET_TAG\)\.length/);
  assert.match(source, /entries\.length >= targetIndex \+ 1/);
  assert.match(source, /scopedJournal\.entries = scopedJournal\.entries\.slice\(0, targetIndex \+ 1\)/);
  assert.match(source, /entries\.slice\(targetIndex \+ 1\)/);
  assert.match(source, /history\.length >= targetIndex \+ 1/);
  assert.match(source, /history\.length, targetIndex/);
  assert.match(source, /historyAfter\.length, targetIndex \+ 1/);
  assert.match(source, /invalid_signature_count/);
  assert.match(source, /trigger_present/);
  assert.match(source, /normalizer_present/);
  assert.match(source, /await migrate\(database, \{ migrationsFolder \}\)/);
  assert.doesNotMatch(source, /target migration is not the latest applied migration/);
  assert.doesNotMatch(source, /drizzle-kit\s+push|push-force|--force/);
});
