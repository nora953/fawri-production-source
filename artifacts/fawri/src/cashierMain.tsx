import { createRoot } from 'react-dom/client';
import CashierCatalogSyncPage from '@/pages/CashierCatalogSyncPage';
import CashierLocalShellPage from '@/pages/CashierLocalShellPage';
import CashierPosPage from '@/pages/CashierPosPage';
import '@/index.css';
import '@/styles/fawriUiBaseline.css';
import '@/styles/cashierPos.css';
import { registerCashierOfflineAppShell } from '@/lib/cashierOfflineAppShell';
import { installAuthClientCutover } from '@/lib/authClientCutover';

const params = new URLSearchParams(window.location.search);
const diagnostics = params.get('diagnostics') === '1';
const sync = params.get('sync') === '1';

// The local POS and diagnostics stay independent from cloud authentication.
// Provisioning is different: it reads device-bound merchant APIs, so install
// the same Auth v2 browser transport used by the Fawri dashboard before the
// sync page can issue any request. This adds the stable X-Fawri-Device-Id that
// was used when the merchant session was created, without exposing the
// HttpOnly session credential or making normal cashier operation cloud-bound.
if (sync) {
  installAuthClientCutover();
}

document.documentElement.dataset.cashierView = diagnostics
  ? 'diagnostics'
  : sync
    ? 'sync'
    : 'pos';

createRoot(document.getElementById('cashier-root')!).render(
  diagnostics ? (
    <CashierLocalShellPage />
  ) : sync ? (
    <CashierCatalogSyncPage />
  ) : (
    <CashierPosPage />
  ),
);

void registerCashierOfflineAppShell();
