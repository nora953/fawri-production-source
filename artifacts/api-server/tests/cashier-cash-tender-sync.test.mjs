import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('cashier sync validates cash received and change without breaking legacy queued cash sales', async () => {
  const authority = await source('src/services/postgresCashierSyncAuthority.ts');
  const typeStart = authority.indexOf('type CashierSale = {');
  const parseStart = authority.indexOf('function parseSale(value: unknown)');
  const parseEnd = authority.indexOf('function parseMovement', parseStart);
  const saleType = authority.slice(typeStart, parseStart);
  const body = authority.slice(parseStart, parseEnd);

  assert.ok(typeStart >= 0 && parseStart > typeStart && parseEnd > parseStart);
  assert.match(saleType, /cash_tendered_minor\?: number/);
  assert.match(saleType, /change_due_minor\?: number/);
  assert.match(body, /const hasCashTenderMetadata/);
  assert.match(body, /if \(paymentMethod === "cash"\)/);
  assert.match(body, /if \(hasCashTenderMetadata\)/);
  assert.match(body, /raw\.cash_tendered_minor === undefined \|\| raw\.change_due_minor === undefined/);
  assert.match(body, /CASHIER_SYNC_CASH_TENDER_INSUFFICIENT/);
  assert.match(body, /CASHIER_SYNC_CASH_CHANGE_INVALID/);
  assert.match(body, /cashTenderedMinor < claimedTotal/);
  assert.match(body, /changeDueMinor !== expectedChange/);
  assert.match(body, /cash tender metadata is allowed only for cash payments/);
});

test('validated cash tender becomes immutable idempotency evidence and canonical order metadata', async () => {
  const authority = await source('src/services/postgresCashierSyncAuthority.ts');

  const normalizeStart = authority.indexOf('const normalizedForHash = {');
  const hash = authority.indexOf('requestHash: sha256(normalizedForHash)', normalizeStart);
  assert.ok(normalizeStart >= 0 && hash > normalizeStart);
  assert.match(authority.slice(normalizeStart, hash), /sale,/);

  const metadataStart = authority.indexOf('const metadata = {');
  const insertStart = authority.indexOf('await target.query(', metadataStart);
  const metadata = authority.slice(metadataStart, insertStart);
  assert.match(metadata, /cash_tendered_minor: bundle\.sale\.cash_tendered_minor/);
  assert.match(metadata, /change_due_minor: bundle\.sale\.change_due_minor/);
  assert.match(metadata, /sale_snapshot: bundle\.sale/);
});

test('server parser preserves tender fields only after exact validation', async () => {
  const authority = await source('src/services/postgresCashierSyncAuthority.ts');
  const parseStart = authority.indexOf('function parseSale(value: unknown)');
  const parseEnd = authority.indexOf('function parseMovement', parseStart);
  const body = authority.slice(parseStart, parseEnd);

  const validation = body.indexOf('let cashTenderedMinor');
  const insufficient = body.indexOf('CASHIER_SYNC_CASH_TENDER_INSUFFICIENT', validation);
  const changeMismatch = body.indexOf('CASHIER_SYNC_CASH_CHANGE_INVALID', validation);
  const resultTender = body.indexOf('cash_tendered_minor: cashTenderedMinor', changeMismatch);
  const resultChange = body.indexOf('change_due_minor: changeDueMinor', changeMismatch);

  assert.ok(validation >= 0);
  assert.ok(insufficient > validation);
  assert.ok(changeMismatch > insufficient);
  assert.ok(resultTender > changeMismatch);
  assert.ok(resultChange > changeMismatch);
});
