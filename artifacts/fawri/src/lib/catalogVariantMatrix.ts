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

export function createCatalogVariantOptionSetDraft(
  name = '',
  values: string[] = [],
): CatalogVariantOptionSetDraft {
  return {
    key: nextOptionSetKey(),
    name,
    values: values.map(clean).filter(Boolean),
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

function optionSetDefinitionsAreUnique(
  optionSets: CatalogVariantOptionSetDraft[],
): boolean {
  const names = new Set<string>();
  for (const set of optionSets) {
    const name = normalized(set.name);
    if (!name || names.has(name)) return false;
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

export function catalogVariantCombinationCount(
  optionSets: CatalogVariantOptionSetDraft[],
): number {
  const usable = optionSets.filter(set => clean(set.name) && set.values.length > 0);
  if (usable.length !== optionSets.length || usable.length === 0) return 0;
  if (!optionSetDefinitionsAreUnique(usable)) return 0;
  return usable.reduce((count, set) => count * set.values.length, 1);
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
  const sameCount = currentVariants.length === combinations.length;

  return combinations.map((options, index) => {
    const signature = optionRecordSignature(options);
    const matched = bySignature.get(signature) || (sameCount ? currentVariants[index] : undefined);
    const base = matched || createEmptyCatalogVariantDraft();
    const optionDrafts = Object.entries(options).map(([name, value]) => ({
      ...createEmptyCatalogOptionDraft(),
      name,
      value,
    }));

    return {
      ...base,
      name: Object.values(options).join(' / '),
      stock_quantity: trackInventory ? base.stock_quantity || '0' : '0',
      options: optionDrafts,
    };
  });
}
