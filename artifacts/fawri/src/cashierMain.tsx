import { createRoot } from 'react-dom/client';
import CashierCatalogSyncPage from '@/pages/CashierCatalogSyncPage';
import CashierLocalShellPage from '@/pages/CashierLocalShellPage';
import CashierPosPage from '@/pages/CashierPosPage';
import '@/index.css';
import '@/styles/fawriUiBaseline.css';
import '@/styles/cashierPos.css';
import { registerCashierOfflineAppShell } from '@/lib/cashierOfflineAppShell';

const params = new URLSearchParams(window.location.search);
const diagnostics = params.get('diagnostics') === '1';
const sync = params.get('sync') === '1';
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
