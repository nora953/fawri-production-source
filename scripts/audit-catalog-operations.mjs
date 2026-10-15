#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalized(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function finiteNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function finitePrice(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000_000;
}

function looksEmbedded(value) {
  const text = String(value || '');
  return text.length > 2_048 || /^data:/i.test(text) || /^blob:/i.test(text) || /;base64[,;]/i.test(text);
}

function addViolation(violations, code, message, details = {}) {
  violations.push({ code, message, ...details });
}

function variantSignature(variant) {
  const options = objectRecord(variant.options);
  const entries = Object.entries(options)
    .map(([name, value]) => `${normalized(name)}=${normalized(value)}`)
    .sort();
  return entries.length > 0 ? entries.join('|') : `name=${normalized(variant.name)}`;
}

export function auditCatalogDocument(document, source = '<memory>') {
  const violations = [];
  const counts = {
    merchants: 0,
    products: 0,
    variants: 0,
    image_references: 0,
    idempotency_records: 0,
  };
  const migration = {
    catalog_products: 0,
    catalog_variants: 0,
    catalog_variant_options: 0,
    catalog_image_references: 0,
    catalog_idempotency_keys: 0,
  };

  const root = objectRecord(document);
  if (root.version !== 1) {
    addViolation(violations, 'CATALOG_STORE_VERSION_UNSUPPORTED', 'store version must equal 1', {
      actual: root.version,
    });
  }
  const merchants = objectRecord(root.merchants);

  for (const [merchantId, rawCatalog] of Object.entries(merchants)) {
    counts.merchants += 1;
    if (!merchantId.trim()) {
      addViolation(violations, 'CATALOG_MERCHANT_ID_EMPTY', 'merchant key is empty');
    }
    const catalog = objectRecord(rawCatalog);
    const products = objectRecord(catalog.products);
    const idempotency = objectRecord(catalog.idempotency);
    counts.idempotency_records += Object.keys(idempotency).length;
    migration.catalog_idempotency_keys += Object.keys(idempotency).length;

    const skuOwners = new Map();
    const barcodeOwners = new Map();
    const externalOwners = new Map();

    const registerIdentifier = (kind, value, owner) => {
      if (!value) return;
      const key = normalized(value);
      const map = kind === 'sku' ? skuOwners : barcodeOwners;
      if (map.has(key)) {
        addViolation(
          violations,
          kind === 'sku' ? 'CATALOG_SKU_DUPLICATE' : 'CATALOG_BARCODE_DUPLICATE',
          `${kind} is duplicated within a merchant`,
          { merchant_id: merchantId, value, owner, conflicting_owner: map.get(key) },
        );
      } else {
        map.set(key, owner);
      }
    };

    for (const [productKey, rawProduct] of Object.entries(products)) {
      counts.products += 1;
      migration.catalog_products += 1;
      const product = objectRecord(rawProduct);
      const owner = `${merchantId}/${productKey}`;
      if (product.id !== productKey) {
        addViolation(violations, 'CATALOG_PRODUCT_KEY_MISMATCH', 'product key differs from product.id', {
          merchant_id: merchantId,
          product_key: productKey,
          product_id: product.id,
        });
      }
      if (product.merchant_id !== merchantId) {
        addViolation(violations, 'CATALOG_PRODUCT_TENANT_MISMATCH', 'product merchant_id differs from tenant key', {
          merchant_id: merchantId,
          product_id: productKey,
          stored_merchant_id: product.merchant_id,
        });
      }
      if (!String(product.name || '').trim()) {
        addViolation(violations, 'CATALOG_PRODUCT_NAME_EMPTY', 'product name is empty', {
          merchant_id: merchantId,
          product_id: productKey,
        });
      }
      if (!finitePrice(product.price_iqd)) {
        addViolation(violations, 'CATALOG_PRICE_INVALID', 'product price is invalid', {
          merchant_id: merchantId,
          product_id: productKey,
          value: product.price_iqd,
        });
      }
      if (
        product.compare_at_price_iqd !== undefined &&
        (!finitePrice(product.compare_at_price_iqd) || product.compare_at_price_iqd < product.price_iqd)
      ) {
        addViolation(violations, 'CATALOG_COMPARE_PRICE_INVALID', 'compare-at price is invalid', {
          merchant_id: merchantId,
          product_id: productKey,
        });
      }
      if (!finiteNonNegativeInteger(product.stock_quantity)) {
        addViolation(violations, 'CATALOG_STOCK_INVALID', 'product stock is invalid', {
          merchant_id: merchantId,
          product_id: productKey,
          value: product.stock_quantity,
        });
      }
      if (!Number.isSafeInteger(product.version) || product.version <= 0) {
        addViolation(violations, 'CATALOG_VERSION_INVALID', 'product version must be positive', {
          merchant_id: merchantId,
          product_id: productKey,
          value: product.version,
        });
      }

      const externalRef = normalized(product.external_ref);
      if (externalRef) {
        if (externalOwners.has(externalRef)) {
          addViolation(violations, 'CATALOG_EXTERNAL_REF_DUPLICATE', 'external_ref is duplicated within a merchant', {
            merchant_id: merchantId,
            product_id: productKey,
            conflicting_owner: externalOwners.get(externalRef),
          });
        } else {
          externalOwners.set(externalRef, owner);
        }
      }
      registerIdentifier('sku', product.sku, owner);
      registerIdentifier('barcode', product.barcode, owner);

      const productImages = Array.isArray(product.image_refs) ? product.image_refs : [];
      counts.image_references += productImages.length;
      migration.catalog_image_references += productImages.length;
      for (const image of productImages) {
        const record = objectRecord(image);
        if (
          Object.keys(record).some(key => ['data', 'base64', 'content', 'bytes', 'blob'].includes(key)) ||
          looksEmbedded(record.url)
        ) {
          addViolation(violations, 'CATALOG_IMAGE_BINARY_FORBIDDEN', 'embedded image data found', {
            merchant_id: merchantId,
            product_id: productKey,
          });
        }
      }

      const variants = Array.isArray(product.variants) ? product.variants : [];
      counts.variants += variants.length;
      migration.catalog_variants += variants.length;
      const signatures = new Set();
      const variantIds = new Set();
      let variantStock = 0;

      for (const rawVariant of variants) {
        const variant = objectRecord(rawVariant);
        const variantOwner = `${owner}/${variant.id || '<missing>'}`;
        if (!String(variant.id || '').trim() || variantIds.has(variant.id)) {
          addViolation(violations, 'CATALOG_VARIANT_ID_INVALID', 'variant ID is missing or duplicated', {
            merchant_id: merchantId,
            product_id: productKey,
            variant_id: variant.id,
          });
        }
        variantIds.add(variant.id);
        const signature = variantSignature(variant);
        if (signatures.has(signature)) {
          addViolation(violations, 'CATALOG_VARIANT_DUPLICATE', 'variant options are duplicated', {
            merchant_id: merchantId,
            product_id: productKey,
            signature,
          });
        }
        signatures.add(signature);
        if (!finiteNonNegativeInteger(variant.stock_quantity)) {
          addViolation(violations, 'CATALOG_VARIANT_STOCK_INVALID', 'variant stock is invalid', {
            merchant_id: merchantId,
            product_id: productKey,
            variant_id: variant.id,
            value: variant.stock_quantity,
          });
        } else {
          variantStock += variant.stock_quantity;
        }
        if (variant.price_iqd !== undefined && !finitePrice(variant.price_iqd)) {
          addViolation(violations, 'CATALOG_VARIANT_PRICE_INVALID', 'variant price is invalid', {
            merchant_id: merchantId,
            product_id: productKey,
            variant_id: variant.id,
          });
        }
        registerIdentifier('sku', variant.sku, variantOwner);
        registerIdentifier('barcode', variant.barcode, variantOwner);
        migration.catalog_variant_options += Object.keys(objectRecord(variant.options)).length;

        const images = Array.isArray(variant.image_refs) ? variant.image_refs : [];
        counts.image_references += images.length;
        migration.catalog_image_references += images.length;
        for (const image of images) {
          const record = objectRecord(image);
          if (
            Object.keys(record).some(key => ['data', 'base64', 'content', 'bytes', 'blob'].includes(key)) ||
            looksEmbedded(record.url)
          ) {
            addViolation(violations, 'CATALOG_IMAGE_BINARY_FORBIDDEN', 'embedded variant image data found', {
              merchant_id: merchantId,
              product_id: productKey,
              variant_id: variant.id,
            });
          }
        }
      }

      if (variants.length > 0 && variantStock !== product.stock_quantity) {
        addViolation(violations, 'CATALOG_STOCK_MISMATCH', 'product stock differs from variant sum', {
          merchant_id: merchantId,
          product_id: productKey,
          product_stock: product.stock_quantity,
          variant_stock: variantStock,
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    read_only: true,
    source,
    source_sha256: crypto.createHash('sha256').update(JSON.stringify(document)).digest('hex'),
    store_version: root.version ?? null,
    counts,
    migration_readiness: {
      ready_for_schema_mapping: violations.length === 0,
      proposed_rows: migration,
      required_constraints: [
        'tenant-scoped unique external_ref',
        'tenant-scoped case-insensitive SKU uniqueness across products and variants',
        'tenant-scoped barcode uniqueness across products and variants',
        'non-negative integer stock checks',
        'non-negative IQD price checks',
        'positive optimistic version checks',
        'tenant-safe composite foreign keys',
      ],
    },
    violations,
  };
}

function parseArguments(argv) {
  const options = { json: false, file: '', dataDir: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--json') options.json = true;
    else if (value === '--file') options.file = String(argv[++index] || '');
    else if (value === '--data-dir') options.dataDir = String(argv[++index] || '');
    else if (value === '--help') options.help = true;
    else throw new Error(`unknown argument: ${value}`);
  }
  return options;
}

function usage() {
  return [
    'Usage: node scripts/audit-catalog-operations.mjs [--json] [--file PATH | --data-dir DIR]',
    '',
    'The command is read-only. It never creates, edits, or deletes catalog data.',
  ].join('\n');
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const defaultDir = process.env.FAWRI_DATA_DIR
    ? path.resolve(process.env.FAWRI_DATA_DIR)
    : path.resolve(process.cwd(), 'artifacts/api-server/data');
  const filePath = options.file
    ? path.resolve(options.file)
    : path.join(options.dataDir ? path.resolve(options.dataDir) : defaultDir, 'catalog-inventory.json');

  let document;
  try {
    document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      const result = {
        ok: true,
        read_only: true,
        status: 'not_initialized',
        source: filePath,
        counts: {
          merchants: 0,
          products: 0,
          variants: 0,
          image_references: 0,
          idempotency_records: 0,
        },
        migration_readiness: {
          ready_for_schema_mapping: true,
          proposed_rows: {},
          note: 'No catalog runtime file exists yet.',
        },
        violations: [],
      };
      console.log(options.json ? JSON.stringify(result) : `Catalog audit: ${result.status}\nSource: ${filePath}`);
      return 0;
    }
    console.error(`Catalog audit failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const result = auditCatalogDocument(document, filePath);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Catalog audit: ${result.ok ? 'PASS' : 'FAIL'}`);
    console.log(`Source: ${result.source}`);
    console.log(`Merchants: ${result.counts.merchants}`);
    console.log(`Products: ${result.counts.products}`);
    console.log(`Variants: ${result.counts.variants}`);
    console.log(`Image references: ${result.counts.image_references}`);
    console.log(`Idempotency records: ${result.counts.idempotency_records}`);
    if (result.violations.length > 0) {
      for (const violation of result.violations) {
        console.log(`- ${violation.code}: ${violation.message}`);
      }
    }
  }
  return result.ok ? 0 : 2;
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) process.exitCode = main();
