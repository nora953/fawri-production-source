import { createRoot } from 'react-dom/client';
import CashierLocalShellPage from '@/pages/CashierLocalShellPage';
import CashierPosPage from '@/pages/CashierPosPage';
import '@/index.css';
import '@/styles/fawriUiBaseline.css';
import '@/styles/cashierPos.css';
import { registerCashierOfflineAppShell } from '@/lib/cashierOfflineAppShell';

const diagnostics = new URLSearchParams(window.location.search).get('diagnostics') === '1';
document.documentElement.dataset.cashierView = diagnostics ? 'diagnostics' : 'pos';

createRoot(document.getElementById('cashier-root')!).render(
  diagnostics ? <CashierLocalShellPage /> : <CashierPosPage />,
);

void registerCashierOfflineAppShell();
