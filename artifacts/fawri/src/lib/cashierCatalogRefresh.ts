const CASHIER_CATALOG_REFRESH_EVENT = 'fawri:cashier-catalog-refresh';

export function publishCashierCatalogRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CASHIER_CATALOG_REFRESH_EVENT));
}

export function subscribeCashierCatalogRefresh(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => listener();
  window.addEventListener(CASHIER_CATALOG_REFRESH_EVENT, handler);
  return () => window.removeEventListener(CASHIER_CATALOG_REFRESH_EVENT, handler);
}
