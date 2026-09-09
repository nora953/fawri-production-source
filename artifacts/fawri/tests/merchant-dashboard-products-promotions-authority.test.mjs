import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '../../..');

function read(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('promotion canonical reload owns a separate fail-closed authority state', () => {
  const page = read('artifacts/fawri/src/pages/dashboard/CatalogPromotionsPage.tsx');
  const loadBody = between(page, '    async function load() {', '    void load();');

  assert.match(page, /const \[authorityReady, setAuthorityReady\] = useState\(false\)/);
  assert.match(loadBody, /setAuthorityReady\(false\)/);
  assert.match(loadBody, /getCatalogCommerceContext\(\)/);
  assert.match(loadBody, /listCatalogProducts\(\)/);
  assert.match(loadBody, /listCatalogPromotions\(\)/);
  assert.match(loadBody, /setAuthorityReady\(true\)/);
  assert.match(
    loadBody,
    /catch \(error\)[\s\S]*setAuthorityReady\(false\)[\s\S]*setLoadFailed\(true\)/,
  );
});

test('promotion mutations are blocked whenever canonical authority is stale', () => {
  const page = read('artifacts/fawri/src/pages/dashboard/CatalogPromotionsPage.tsx');
  const saveBody = between(page, '  const save = async () => {', '  const remove = async');
  const removeBody = between(page, '  const remove = async', '  const lifecycleLabel');

  assert.match(page, /const openCreate = \(\) => \{\s*if \(!authorityReady \|\| !context\) return;/);
  assert.match(page, /const openEdit = \(promotion: CatalogPromotion\) => \{\s*if \(!authorityReady \|\| !context\) return;/);
  assert.match(saveBody, /if \(!authorityReady \|\| !context\)/);
  assert.match(removeBody, /if \(!authorityReady\)/);
  assert.match(page, /disabled=\{!authorityReady \|\| !context \|\| loading\}/);
  assert.match(page, /disabled=\{!authorityReady \|\| saving\}/);
  assert.match(page, /disabled=\{saving \|\| !authorityReady\}/);
});

test('promotion editor can preserve draft UI while stale authority cannot commit it', () => {
  const page = read('artifacts/fawri/src/pages/dashboard/CatalogPromotionsPage.tsx');

  assert.match(page, /\{editorOpen && context && \(/);
  assert.match(page, /disabled=\{saving \|\| !authorityReady\}/);
  assert.doesNotMatch(
    between(page, "catch (error) {\n        console.error('Promotion load failed:', error);", '      } finally {'),
    /setEditorOpen\(false\)|setDraft\(emptyDraft\(\)\)/,
  );
});
