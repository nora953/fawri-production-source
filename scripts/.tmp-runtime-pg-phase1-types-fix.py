from pathlib import Path

path = Path('artifacts/api-server/src/services/postgresCatalogAuthority.ts')
text = path.read_text(encoding='utf-8')

old = '''  if (!Array.isArray(params.items) || params.items.length === 0) {
    throw new CatalogRuntimeError(
      "CATALOG_IMPORT_EMPTY",
      "import requires at least one product",
      400,
    );
  }
  if (params.items.length > MAX_IMPORT_ITEMS) {
    throw new CatalogRuntimeError(
      "CATALOG_IMPORT_LIMIT_EXCEEDED",
      "import contains too many products",
      400,
      { max: MAX_IMPORT_ITEMS },
    );
  }
  const keyHash = catalogIdempotencyKeyHash(params.idempotencyKey);
  const requestHash = catalogRequestHash(params.items);
'''

new = '''  const itemsValue = params.items;
  if (!Array.isArray(itemsValue) || itemsValue.length === 0) {
    throw new CatalogRuntimeError(
      "CATALOG_IMPORT_EMPTY",
      "import requires at least one product",
      400,
    );
  }
  const items: unknown[] = itemsValue;
  if (items.length > MAX_IMPORT_ITEMS) {
    throw new CatalogRuntimeError(
      "CATALOG_IMPORT_LIMIT_EXCEEDED",
      "import contains too many products",
      400,
      { max: MAX_IMPORT_ITEMS },
    );
  }
  const keyHash = catalogIdempotencyKeyHash(params.idempotencyKey);
  const requestHash = catalogRequestHash(items);
'''

if text.count(old) != 1:
    raise SystemExit(f'expected import validation block exactly once, found {text.count(old)}')
text = text.replace(old, new, 1)

replacements = {
    'if (existing.length + params.items.length > MAX_PRODUCTS_PER_MERCHANT) {':
        'if (existing.length + items.length > MAX_PRODUCTS_PER_MERCHANT) {',
    'const products = params.items.map((item) => {':
        'const products = items.map((item) => {',
}
for before, after in replacements.items():
    if text.count(before) != 1:
        raise SystemExit(f'expected typing target exactly once: {before!r}; found {text.count(before)}')
    text = text.replace(before, after, 1)

path.write_text(text, encoding='utf-8')
