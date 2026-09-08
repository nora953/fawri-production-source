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

test('cash checkout UI requires received cash, computes change, and persists both values', async () => {
  const page = await source('src/pages/CashierPosPage.tsx');

  assert.match(page, /const \[cashTenderText, setCashTenderText\] = useState\(''\)/);
  assert.match(page, /normalizeCashDigits/);
  assert.match(page, /cashTenderedMinor < quote\.total_minor/);
  assert.match(page, /const change = cashTenderedMinor - quote\.total_minor/);
  assert.match(page, /setCashTenderText\(String\(quote\.total_minor\)\)/);
  assert.match(page, /cash_tendered_minor: cashTenderedMinor/);
  assert.match(page, /change_due_minor: changeDueMinor/);
  assert.match(page, /!cashTenderReady/);
  assert.match(page, /labels\.cashReceived/);
  assert.match(page, /labels\.changeDue/);
  assert.match(page, /labels\.cashInsufficient/);
});

test('cash checkout copy exists in Arabic, Sorani, and English', async () => {
  const copy = await source('src/lib/cashierUiCopy.ts');

  assert.match(copy, /cashReceived: 'المبلغ المستلم'/);
  assert.match(copy, /exactCash: 'المبلغ بالضبط'/);
  assert.match(copy, /changeDue: 'الباقي للعميل'/);
  assert.match(copy, /cashReceived: 'پارەی وەرگیراو'/);
  assert.match(copy, /changeDue: 'پارەی گەڕاندنەوە بۆ کڕیار'/);
  assert.match(copy, /cashReceived: 'Cash received'/);
  assert.match(copy, /exactCash: 'Exact amount'/);
  assert.match(copy, /changeDue: 'Change due'/);
});
