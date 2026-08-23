import { createRoot } from 'react-dom/client';
import CashierLocalShellPage from '@/pages/CashierLocalShellPage';
import '@/index.css';
import '@/styles/fawriUiBaseline.css';
import { registerCashierOfflineAppShell } from '@/lib/cashierOfflineAppShell';

createRoot(document.getElementById('cashier-root')!).render(<CashierLocalShellPage />);

void registerCashierOfflineAppShell();
