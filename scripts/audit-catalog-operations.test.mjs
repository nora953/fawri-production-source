import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { auditCatalogDocument } from './audit-catalog-operations.mjs';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audit-catalog-operations.mjs');

function cleanFixture() {
  return {
    version: 1,
    merchants: {
      'merchant-a': {
        products: {
          'prd-1': {
            id: 'prd-1',
            merchant_id: 'merchant-a',
            external_ref: 'erp-1',
            name: 'Product',
            sku: 'SKU-1',
            price_iqd: 1000,
            stock_quantity: 3,
            low_stock_threshold: 5,
            status: 'low_stock',
            allow_fawri_reply: true,
            image_refs: [{ id: 'img-1', url: 'https://cdn.example.test/a.jpg' }],
            variants: [
              {
                id: 'var-1',
                name: 'Small',
                sku: 'SKU-1-S',
                stock_quantity: 3,
                options: { size: 'S' },
                image_refs: [],
                created_at: '2026-08-07T00:00:00.000Z',
                updated_at: '2026-08-07T00:00:00.000Z',
              },
            ],
            created_at: '2026-08-07T00:00:00.000Z',
            updated_at: '2026-08-07T00:00:00.000Z',
            version: 1,
          },
        },
        idempotency: {},
      },
    },
  };
}

test('clean fixture is migration-ready', () => {
  const result = auditCatalogDocument(cleanFixture());
  assert.equal(result.ok, true);
  assert.equal(result.counts.products, 1);
  assert.equal(result.counts.variants, 1);
  assert.equal(result.migration_readiness.proposed_rows.catalog_variant_options, 1);
});

test('audit detects tenant mismatch, duplicate identifiers, negative stock, and base64 images', () => {
  const fixture = cleanFixture();
  const product = fixture.merchants['merchant-a'].products['prd-1'];
  product.merchant_id = 'merchant-b';
  product.stock_quantity = -1;
  product.image_refs = [{ id: 'bad', url: 'data:image/png;base64,AAAA' }];
  product.variants.push({
    ...product.variants[0],
    id: 'var-2',
    name: 'Duplicate',
    stock_quantity: 0,
  });

  const result = auditCatalogDocument(fixture);
  const codes = new Set(result.violations.map(item => item.code));
  assert.equal(result.ok, false);
  assert.ok(codes.has('CATALOG_PRODUCT_TENANT_MISMATCH'));
  assert.ok(codes.has('CATALOG_STOCK_INVALID'));
  assert.ok(codes.has('CATALOG_IMAGE_BINARY_FORBIDDEN'));
  assert.ok(codes.has('CATALOG_VARIANT_DUPLICATE'));
  assert.ok(codes.has('CATALOG_SKU_DUPLICATE'));
});

test('CLI is read-only and returns success for a clean store', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-audit-'));
  const filePath = path.join(directory, 'catalog-inventory.json');
  fs.writeFileSync(filePath, `${JSON.stringify(cleanFixture(), null, 2)}\n`);
  const before = fs.readFileSync(filePath);
  const beforeHash = crypto.createHash('sha256').update(before).digest('hex');
  const beforeMtime = fs.statSync(filePath).mtimeMs;

  const run = spawnSync(process.execPath, [scriptPath, '--file', filePath, '--json'], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const output = JSON.parse(run.stdout);
  assert.equal(output.ok, true);

  const after = fs.readFileSync(filePath);
  const afterHash = crypto.createHash('sha256').update(after).digest('hex');
  const afterMtime = fs.statSync(filePath).mtimeMs;
  assert.equal(afterHash, beforeHash);
  assert.equal(afterMtime, beforeMtime);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('CLI returns code 2 for integrity violations and does not rewrite the file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-audit-bad-'));
  const filePath = path.join(directory, 'catalog-inventory.json');
  const fixture = cleanFixture();
  fixture.merchants['merchant-a'].products['prd-1'].stock_quantity = -5;
  fs.writeFileSync(filePath, `${JSON.stringify(fixture, null, 2)}\n`);
  const before = fs.readFileSync(filePath);

  const run = spawnSync(process.execPath, [scriptPath, '--file', filePath, '--json'], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 2, run.stderr);
  const output = JSON.parse(run.stdout);
  assert.equal(output.ok, false);
  assert.ok(output.violations.some(item => item.code === 'CATALOG_STOCK_INVALID'));
  assert.deepEqual(fs.readFileSync(filePath), before);
  fs.rmSync(directory, { recursive: true, force: true });
});
