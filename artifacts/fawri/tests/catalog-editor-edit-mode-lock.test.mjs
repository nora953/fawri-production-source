import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

const shell = read('../src/components/catalog/CatalogEditorShell.tsx');
const itemTypeEditor = read('../src/components/catalog/CatalogItemTypeEditor.tsx');
const editModeCss = read('../src/pages/dashboard/catalogEditModeCompact.css');
const productsWorkspace = read('../src/pages/dashboard/ProductsWorkspacePage.tsx');
const authority = read('../../api-server/src/services/postgresCatalogAuthority.ts');

test('existing catalog items use type-specific edit titles in all supported languages', () => {
  assert.match(shell, /'تعديل الخدمة' : 'تعديل المنتج'/);
  assert.match(shell, /'دەستکاری خزمەتگوزاری' : 'دەستکاری بەرهەم'/);
  assert.match(shell, /'Edit service' : 'Edit product'/);
  assert.match(shell, /const displayTitle = createMode \? title : editTitleForItemType\(lang, form\.item_type\)/);
});

test('item type chooser remains available only while creating a new item', () => {
  assert.match(shell, /CatalogEditorModeContext\.Provider value=\{\{ createMode \}\}/);
  assert.match(itemTypeEditor, /const \{ createMode \} = useContext\(CatalogEditorModeContext\)/);
  assert.match(itemTypeEditor, /if \(!createMode \|\| itemType === form\.item_type\) return;/);
  assert.match(itemTypeEditor, /data-catalog-item-type-mode=\{createMode \? 'create' : 'edit-locked'\}/);
  assert.match(itemTypeEditor, /data-catalog-item-type-locked="true"/);
  assert.match(itemTypeEditor, /createMode \? \(/);
  assert.match(itemTypeEditor, /onClick=\{\(\) => chooseType\('product'\)\}/);
  assert.match(itemTypeEditor, /onClick=\{\(\) => chooseType\('service'\)\}/);
});

test('edit mode explains that the stored item type is fixed', () => {
  assert.match(itemTypeEditor, /نوع هذا العنصر ثابت أثناء التعديل لحماية بياناته\./);
  assert.match(itemTypeEditor, /جۆری ئەم بابەتە لە کاتی دەستکاریکردندا جێگیرە بۆ پاراستنی زانیارییەکانی\./);
  assert.match(itemTypeEditor, /This item's type is fixed while editing to protect its data\./);
});

test('locked item type summary stays compact without changing create mode', () => {
  assert.match(productsWorkspace, /import '\.\/catalogEditModeCompact\.css';/);
  assert.match(editModeCss, /\[data-catalog-item-type-mode="edit-locked"\]/);
  assert.match(editModeCss, /\[data-catalog-item-type-locked="true"\]/);
  assert.match(editModeCss, /align-items: start;/);
  assert.match(editModeCss, /grid-template-columns: minmax\(240px, 0\.72fr\) minmax\(0, 1\.28fr\);/);
  assert.doesNotMatch(editModeCss, /data-catalog-item-type-mode="create"/);
});

test('server authority rejects product-service type changes after creation', () => {
  assert.match(authority, /CATALOG_ITEM_TYPE_IMMUTABLE/);
  assert.match(authority, /catalog item type cannot be changed after creation/);
  assert.match(authority, /assertItemTypeImmutable\(current, input\)/);
  assert.match(authority, /requested_item_type: requestedType/);
});
