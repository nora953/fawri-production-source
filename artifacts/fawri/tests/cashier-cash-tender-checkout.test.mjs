import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('cash tender is part of the durable sale contract and snapshot', async () => {
  const contracts = await source('src/lib/cashierLocalContracts.ts');

  assert.match(contracts, /cash_tendered_minor\?: number/);
  assert.match(contracts, /change_due_minor\?: number/);

  const snapshotStart = contracts.indexOf('export type CashierSaleSnapshot');
  const commitStart = contracts.indexOf('export type CashierCommitSaleInput');
  assert.ok(snapshotStart >= 0 && commitStart > snapshotStart);
  assert.ok(
    contracts.indexOf('cash_tendered_minor?: number', snapshotStart) < commitStart,
    'sale snapshot must preserve cash received',
  );
  assert.ok(
    contracts.indexOf('change_due_minor?: number', snapshotStart) < commitStart,
    'sale snapshot must preserve change due',
  );
});

test('indexeddb validates cash tender against authoritative pricing before inventory writes', async () => {
  const authority = await source('src/lib/cashierIndexedDbAuthority.ts');
  const commitStart = authority.indexOf('async commitSale(input: CashierCommitSaleInput)');
  const pricing = authority.indexOf('const pricing = resolveCashierSalePricing', commitStart);
  const tenderValidation = authority.indexOf("if (input.payment_method === 'cash')", pricing);
  const insufficient = authority.indexOf('CASHIER_CASH_TENDER_INSUFFICIENT', tenderValidation);
  const changeInvalid = authority.indexOf('CASHIER_CASH_CHANGE_INVALID', tenderValidation);
  const sequence = authority.indexOf('const deviceSequence = await nextDeviceSequence(meta)', tenderValidation);
  const inventoryLoop = authority.indexOf('for (const [index, record] of records.entries())', sequence);

  assert.ok(commitStart >= 0 && pricing > commitStart);
  assert.ok(tenderValidation > pricing, 'tender validation must use authoritative sale-time pricing');
  assert.ok(insufficient > tenderValidation, 'underpayment must fail closed');
  assert.ok(changeInvalid > insufficient, 'change must be verified');
  assert.ok(sequence > changeInvalid, 'device sequence must not advance before tender is valid');
  assert.ok(inventoryLoop > sequence, 'inventory writes happen only after tender validation');
  assert.match(authority, /cashTenderedMinor < pricing\.total_minor/);
  assert.match(authority, /changeDueMinor !== expectedChange/);
  assert.match(authority, /cash_tendered_minor: cashTenderedMinor/);
  assert.match(authority, /change_due_minor: changeDueMinor/);
  assert.match(authority, /CASHIER_CASH_TENDER_PAYMENT_METHOD_INVALID/);
});

test('cash checkout is isolated from the sale screen and persists tender evidence', async () => {
  const page = await source('src/pages/CashierPosPage.tsx');
  const modal = await source('src/components/cashier/CashierCheckoutModal.tsx');

  assert.match(page, /const \[checkoutOpen, setCheckoutOpen\] = useState\(false\)/);
  assert.match(page, /<CashierCheckoutModal/);
  assert.match(page, /extra\.checkout/);
  assert.match(page, /cash_tendered_minor: cashTenderedMinor/);
  assert.match(page, /change_due_minor: changeDueMinor/);
  assert.doesNotMatch(page, /id="cashier-cash-received"/);

  assert.match(modal, /id="cashier-cash-received"/);
  assert.match(modal, /data-cashier-checkout="open"/);
  assert.match(modal, /labels\.cashReceived/);
  assert.match(modal, /labels\.changeDue/);
  assert.match(modal, /labels\.cashInsufficient/);
  assert.match(modal, /onExactCash/);
  assert.match(modal, /role="dialog"/);
});

test('cash checkout still requires received cash and computes exact change', async () => {
  const page = await source('src/pages/CashierPosPage.tsx');

  assert.match(page, /normalizeCashDigits/);
  assert.match(page, /cashTenderedMinor < quote\.total_minor/);
  assert.match(page, /const change = cashTenderedMinor - quote\.total_minor/);
  assert.match(page, /setCashTenderText\(String\(quote\.total_minor\)\)/);
  assert.match(page, /cashTenderReady/);
  assert.match(page, /checkoutCanSubmit/);
});

test('checkout and scanner copy exists in Arabic, Sorani, and English', async () => {
  const copy = await source('src/lib/cashierPosEnhancementCopy.ts');
  const baseCopy = await source('src/lib/cashierUiCopy.ts');

  assert.match(copy, /checkout: 'الدفع'/);
  assert.match(copy, /checkoutTitle: 'إتمام الدفع'/);
  assert.match(copy, /scannerReady: 'قارئ الباركود جاهز/);
  assert.match(copy, /checkout: 'پارەدان'/);
  assert.match(copy, /scannerReady: 'خوێنەری بارکۆد ئامادەیە/);
  assert.match(copy, /checkout: 'Pay'/);
  assert.match(copy, /scannerReady: 'Barcode scanner ready/);

  assert.match(baseCopy, /cashReceived: 'المبلغ المستلم'/);
  assert.match(baseCopy, /exactCash: 'المبلغ بالضبط'/);
  assert.match(baseCopy, /changeDue: 'الباقي للعميل'/);
  assert.match(baseCopy, /cashReceived: 'Cash received'/);
  assert.match(baseCopy, /changeDue: 'Change due'/);
});
