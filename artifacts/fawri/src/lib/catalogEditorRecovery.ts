import type { CatalogProductFormState } from '@/lib/catalogProductEditor';

const RECOVERY_KEY = 'fawri.catalog.create-recovery.v1';
const MERCHANT_SESSION_KEY = 'fawri_merchant_session_id';
const RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type CatalogEditorRecoveryPayload = {
  version: 1;
  merchant_id: string;
  saved_at: number;
  form: CatalogProductFormState;
};

function currentMerchantId(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(MERCHANT_SESSION_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Stores only in-progress editor input for recovery in the same browser tab.
 * This is deliberately not catalog authority: Fawri, cashier, inventory and
 * customer replies never read it. The form must still pass normal server
 * validation and be explicitly saved before it becomes an operational item.
 */
export function saveCatalogCreateRecoveryDraft(form: CatalogProductFormState): void {
  const target = storage();
  const merchantId = currentMerchantId();
  if (!target || !merchantId) return;
  const payload: CatalogEditorRecoveryPayload = {
    version: 1,
    merchant_id: merchantId,
    saved_at: Date.now(),
    form,
  };
  try {
    target.setItem(RECOVERY_KEY, JSON.stringify(payload));
  } catch {
    // Recovery is best effort only and must never block catalog editing.
  }
}

export function clearCatalogCreateRecoveryDraft(): void {
  const target = storage();
  if (!target) return;
  try {
    target.removeItem(RECOVERY_KEY);
  } catch {
    // Best effort only.
  }
}

export function peekCatalogCreateRecoveryDraft(): CatalogProductFormState | null {
  const target = storage();
  const merchantId = currentMerchantId();
  if (!target || !merchantId) return null;
  try {
    const raw = target.getItem(RECOVERY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CatalogEditorRecoveryPayload>;
    if (
      parsed.version !== 1 ||
      parsed.merchant_id !== merchantId ||
      typeof parsed.saved_at !== 'number' ||
      !Number.isFinite(parsed.saved_at) ||
      parsed.saved_at <= 0 ||
      Date.now() - parsed.saved_at > RECOVERY_TTL_MS ||
      !parsed.form ||
      typeof parsed.form !== 'object' ||
      Array.isArray(parsed.form)
    ) {
      if (parsed.merchant_id === merchantId) target.removeItem(RECOVERY_KEY);
      return null;
    }
    return structuredClone(parsed.form as CatalogProductFormState);
  } catch {
    try { target.removeItem(RECOVERY_KEY); } catch { /* best effort */ }
    return null;
  }
}
