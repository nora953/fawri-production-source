import {
  createEmptyCatalogOptionDraft,
  createEmptyCatalogVariantDraft,
  type CatalogVariantDraft,
} from '@/lib/catalogProductEditor';

export type CatalogVariantOptionSetDraft = {
  key: string;
  name: string;
  values: string[];
  pendingValue: string;
};

export type CatalogVariantMatrixCoverage = {
  expectedCount: number;
  existingCount: number;
  missingCount: number;
  complete: boolean;
};

let optionSetSequence = 0;

function nextOptionSetKey(): string {
  optionSetSequence += 1;
  return `variant-option-set-${optionSetSequence}`;
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normalized(value: unknown): string {
  return clean(value).normalize('NFKC').toLocaleLowerCase('en-US');
}

function autoNameFromOptions(options: Record<string, string>): string {
  return Object.values(options).map(clean).filter(Boolean).join(' / ');
}

function autoNameFromVariant(variant: CatalogVariantDraft): string {
  return variant.options
    .filter(option => clean(option.name) && clean(option.value))
    .map(option => clean(option.value))
    .join(' / ');
}

function shouldPreserveCustomName(variant: CatalogVariantDraft): boolean {
  const name = clean(variant.name);
  if (!name) return false;
  const automatic = autoNameFromVariant(variant);
  return Boolean(automatic) && normalized(name) !== normalized(automatic);
}

export function createCatalogVariantOptionSetDraft(
  name = '',
  values: string[] = [],
): CatalogVariantOptionSetDraft {
  const seen = new Set<string>();
  const uniqueValues: string[] = [];
  for (const raw of values) {
    const value = clean(raw);
    const key = normalized(value);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    uniqueValues.push(value);
  }
  return {
    key: nextOptionSetKey(),
    name: clean(name),
    values: uniqueValues,
    pendingValue: '',
  };
}

export function catalogVariantOptionSetsFromVariants(
  variants: CatalogVariantDraft[],
): CatalogVariantOptionSetDraft[] {
  const orderedNames: string[] = [];
  const valuesByName = new Map<string, string[]>();
  const displayNameByNormalized = new Map<string, string>();

  for (const variant of variants) {
    for (const option of variant.options) {
      const name = clean(option.name);
      const value = clean(option.value);
      if (!name || !value) continue;
      const key = normalized(name);
      if (!valuesByName.has(key)) {
        orderedNames.push(key);
        valuesByName.set(key, []);
        displayNameByNormalized.set(key, name);
      }
      const values = valuesByName.get(key)!;
      if (!values.some(item => normalized(item) === normalized(value))) {
        values.push(value);
      }
    }
  }

  return orderedNames.map(key =>
    createCatalogVariantOptionSetDraft(
      displayNameByNormalized.get(key) || key,
      valuesByName.get(key) || [],
    ),
  );
}

export function catalogVariantDraftHasStructuredOptions(
  variant: CatalogVariantDraft,
): boolean {
  return variant.options.some(option => clean(option.name) && clean(option.value));
}

export function catalogVariantOptionSetDefinitionsAreValid(
  optionSets: CatalogVariantOptionSetDraft[],
): boolean {
  if (optionSets.length === 0) return true;
  const names = new Set<string>();
  for (const set of optionSets) {
    const name = normalized(set.name);
    if (!name || set.values.length === 0 || names.has(name)) return false;
    names.add(name);

    const values = new Set<string>();
    for (const value of set.values) {
      const normalizedValue = normalized(value);
      if (!normalizedValue || values.has(normalizedValue)) return false;
      values.add(normalizedValue);
    }
  }
  return true;
}

export function catalogVariantOptionNameAvailable(
  optionSets: CatalogVariantOptionSetDraft[],
  name: string,
  exceptIndex = -1,
): boolean {
  const candidate = normalized(name);
  if (!candidate) return false;
  return !optionSets.some((set, index) => index !== exceptIndex && normalized(set.name) === candidate);
}

export function catalogVariantValueAvailable(
  set: CatalogVariantOptionSetDraft,
  value: string,
): boolean {
  const candidate = normalized(value);
  if (!candidate) return false;
  return !set.values.some(item => normalized(item) === candidate);
}

function optionRecordSignature(options: Record<string, string>): string {
  return Object.entries(options)
    .map(([name, value]) => `${normalized(name)}=${normalized(value)}`)
    .sort()
    .join('|');
}

function variantDraftSignature(variant: CatalogVariantDraft): string {
  return optionRecordSignature(
    Object.fromEntries(
      variant.options
        .filter(option => clean(option.name) && clean(option.value))
        .map(option => [clean(option.name), clean(option.value)]),
    ),
  );
}

export function catalogVariantCombinationCount(
  optionSets: CatalogVariantOptionSetDraft[],
): number {
  if (optionSets.length === 0 || !catalogVariantOptionSetDefinitionsAreValid(optionSets)) return 0;
  let count = 1;
  for (const set of optionSets) {
    count *= set.values.length;
    if (!Number.isSafeInteger(count)) return Number.MAX_SAFE_INTEGER;
  }
  return count;
}

export function buildCatalogVariantCombinations(
  optionSets: CatalogVariantOptionSetDraft[],
): Record<string, string>[] {
  if (catalogVariantCombinationCount(optionSets) === 0) return [];

  let combinations: Record<string, string>[] = [{}];
  for (const set of optionSets) {
    const name = clean(set.name);
    combinations = combinations.flatMap(current =>
      set.values.map(value => ({ ...current, [name]: clean(value) })),
    );
  }
  return combinations;
}

export function catalogVariantMatrixCoverage(
  optionSets: CatalogVariantOptionSetDraft[],
  variants: CatalogVariantDraft[],
): CatalogVariantMatrixCoverage {
  const combinations = buildCatalogVariantCombinations(optionSets);
  const expected = new Set(combinations.map(optionRecordSignature));
  const existing = new Set<string>();
  for (const variant of variants) {
    const signature = variantDraftSignature(variant);
    if (signature && expected.has(signature)) existing.add(signature);
  }
  const expectedCount = combinations.length;
  const existingCount = existing.size;
  return {
    expectedCount,
    existingCount,
    missingCount: Math.max(0, expectedCount - existingCount),
    complete: expectedCount > 0 && expectedCount === existingCount,
  };
}

function sameTopologyForValueRename(
  previousSets: CatalogVariantOptionSetDraft[],
  nextSets: CatalogVariantOptionSetDraft[],
  currentVariants: CatalogVariantDraft[],
): boolean {
  if (previousSets.length !== nextSets.length || previousSets.length === 0) return false;
  const previousCount = catalogVariantCombinationCount(previousSets);
  if (previousCount === 0 || previousCount !== currentVariants.length) return false;

  const signatures = new Set(currentVariants.map(variantDraftSignature).filter(Boolean));
  if (signatures.size !== currentVariants.length) return false;

  return previousSets.every((set, index) => {
    const next = nextSets[index];
    return (
      normalized(set.name) === normalized(next?.name) &&
      set.values.length === next?.values.length
    );
  });
}

export function regenerateCatalogVariantDrafts(
  optionSets: CatalogVariantOptionSetDraft[],
  currentVariants: CatalogVariantDraft[],
  trackInventory: boolean,
): CatalogVariantDraft[] {
  const combinations = buildCatalogVariantCombinations(optionSets);
  if (combinations.length === 0) return [];

  const bySignature = new Map(
    currentVariants
      .map(variant => [variantDraftSignature(variant), variant] as const)
      .filter(([signature]) => Boolean(signature)),
  );

  const previousSets = catalogVariantOptionSetsFromVariants(currentVariants);
  const allowPositionalRename = sameTopologyForValueRename(
    previousSets,
    optionSets,
    currentVariants,
  );
  const previousCombinations = allowPositionalRename
    ? buildCatalogVariantCombinations(previousSets)
    : [];

  return combinations.map((options, index) => {
    const signature = optionRecordSignature(options);
    const positional = previousCombinations[index]
      ? bySignature.get(optionRecordSignature(previousCombinations[index]))
      : undefined;
    const matched = bySignature.get(signature) || positional;
    const base = matched || createEmptyCatalogVariantDraft();
    const optionDrafts = Object.entries(options).map(([name, value]) => ({
      ...createEmptyCatalogOptionDraft(),
      name,
      value,
    }));
    const automaticName = autoNameFromOptions(options);

    return {
      ...base,
      name: matched && shouldPreserveCustomName(matched) ? matched.name : automaticName,
      stock_quantity: trackInventory ? base.stock_quantity || '0' : '0',
      options: optionDrafts,
    };
  });
}
