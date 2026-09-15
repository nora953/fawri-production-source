import type { CatalogProductFormState } from '@/lib/catalogProductEditor';

export function catalogEditorFormFingerprint(form: CatalogProductFormState): string {
  return JSON.stringify(form);
}

export function catalogEditorHasUnsavedChanges(
  initialFingerprint: string,
  form: CatalogProductFormState,
): boolean {
  return catalogEditorFormFingerprint(form) !== initialFingerprint;
}
