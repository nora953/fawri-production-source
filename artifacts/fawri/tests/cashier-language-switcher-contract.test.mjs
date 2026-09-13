import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

const switcher = read('../src/components/cashier/CashierLanguageSwitcher.tsx');
const main = read('../src/cashierMain.tsx');

test('cashier quick language switcher exposes Arabic Sorani Kurdish and English', () => {
  assert.match(switcher, /\{ id: 'ar', label: 'العربية' \}/);
  assert.match(switcher, /\{ id: 'ku', label: 'کوردی' \}/);
  assert.match(switcher, /\{ id: 'en', label: 'English' \}/);
  assert.match(switcher, /onClick=\{\(\) => setLang\(language\.id\)\}/);
  assert.match(switcher, /aria-pressed=\{lang === language\.id\}/);
  assert.match(switcher, /data-cashier-language-switcher="true"/);
});

test('cashier quick language switcher joins every operational header and keeps a gate fallback', () => {
  assert.match(switcher, /data-cashier-view='pos'/);
  assert.match(switcher, /data-cashier-view='history'/);
  assert.match(switcher, /data-cashier-view='reports'/);
  assert.match(switcher, /data-cashier-view='sync'/);
  assert.match(switcher, /createPortal\(control, target\)/);
  assert.match(switcher, /pointer-events-none fixed left-1\/2 top-4 z-\[95\]/);
  assert.match(switcher, /new MutationObserver\(resolveTarget\)/);
});

test('cashier language switcher is mounted inside the shared i18n authority', () => {
  assert.match(main, /import CashierLanguageSwitcher from '@\/components\/cashier\/CashierLanguageSwitcher';/);
  assert.match(
    main,
    /<I18nProvider>[\s\S]*<CashierLanguageSwitcher \/>[\s\S]*<CashierOperatorGate bypass=\{demoRequested\}>/,
  );
});
