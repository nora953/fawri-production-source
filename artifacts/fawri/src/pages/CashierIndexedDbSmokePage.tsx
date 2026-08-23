import { useState } from 'react';
import { probeIndexedDbCashierDurability } from '@/lib/cashierIndexedDbAuthority';
import { runCashierIndexedDbSmoke } from '@/lib/cashierIndexedDbSmoke';
import { runCashierPromotionSmoke } from '@/lib/cashierPromotionSmoke';
import { runCashierSalePricingSmoke } from '@/lib/cashierSalePricingSmoke';
import { runCashierCompensationSmoke } from '@/lib/cashierCompensationSmoke';
import { runCashierBackupSmoke } from '@/lib/cashierBackupSmoke';

type SmokeState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'passed'; payload: unknown }
  | { status: 'failed'; error: string };

export default function CashierIndexedDbSmokePage() {
  const [state, setState] = useState<SmokeState>({ status: 'idle' });

  const run = async () => {
    setState({ status: 'running' });
    try {
      const persistence = await probeIndexedDbCashierDurability({
        requestPersistence: true,
      });
      const indexeddb = await runCashierIndexedDbSmoke();
      const promotion = runCashierPromotionSmoke();
      const sale_time_pricing = runCashierSalePricingSmoke();
      const compensation = await runCashierCompensationSmoke();
      const backup_restore = await runCashierBackupSmoke();
      setState({
        status: 'passed',
        payload: {
          persistence,
          indexeddb,
          promotion,
          sale_time_pricing,
          compensation,
          backup_restore,
        },
      });
    } catch (error) {
      setState({
        status: 'failed',
        error: error instanceof Error ? error.stack || error.message : String(error),
      });
    }
  };

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-3xl space-y-6 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Fawri Cashier Local Commerce Smoke</h1>
          <p className="text-sm text-muted-foreground">
            Disposable P1B/P1C/P1D/P1E diagnostic only. It uses temporary IndexedDB databases, validates offline commerce, compensation, history, backup integrity, and atomic restore behavior, and does not touch merchant data.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void run()}
          disabled={state.status === 'running'}
          className="h-12 rounded-xl bg-orange-500 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.status === 'running' ? 'Running smoke test…' : 'Run local commerce smoke test'}
        </button>

        {state.status === 'idle' && (
          <p className="text-sm text-muted-foreground">Press the button once and send the result shown below.</p>
        )}

        {state.status === 'running' && (
          <p className="text-sm font-medium">Running persistence, sale, inventory, pricing, return, void, history, backup, restore, restart, and outbox checks…</p>
        )}

        {state.status === 'passed' && (
          <section className="space-y-3">
            <div className="rounded-xl border border-green-300 bg-green-50 p-4 font-semibold text-green-800">
              PASS — local cashier storage, commerce, compensation, history, and backup/restore checks completed.
            </div>
            <pre className="max-h-[60vh] overflow-auto rounded-xl border bg-muted p-4 text-xs leading-5" dir="ltr">
              {JSON.stringify(state.payload, null, 2)}
            </pre>
          </section>
        )}

        {state.status === 'failed' && (
          <section className="space-y-3">
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 font-semibold text-red-800">
              FAIL — local cashier smoke test did not complete.
            </div>
            <pre className="max-h-[60vh] overflow-auto rounded-xl border bg-muted p-4 text-xs leading-5" dir="ltr">
              {state.error}
            </pre>
          </section>
        )}
      </div>
    </main>
  );
}
