import { useState } from 'react';
import { probeIndexedDbCashierDurability } from '@/lib/cashierIndexedDbAuthority';
import { runCashierIndexedDbSmoke } from '@/lib/cashierIndexedDbSmoke';
import { runCashierPromotionSmoke } from '@/lib/cashierPromotionSmoke';
import { runCashierSalePricingSmoke } from '@/lib/cashierSalePricingSmoke';
import { runCashierCompensationSmoke } from '@/lib/cashierCompensationSmoke';
import { runCashierBackupSmoke } from '@/lib/cashierBackupSmoke';
import { CASHIER_INDEXEDDB_SMOKE_COPY as copy } from '@/lib/translations/features/pages/CashierIndexedDbSmokePage';

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
          <h1 className="text-2xl font-bold">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">
            {copy.description}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void run()}
          disabled={state.status === 'running'}
          className="h-12 rounded-xl bg-orange-500 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.status === 'running' ? copy.runningButton : copy.runButton}
        </button>

        {state.status === 'idle' && (
          <p className="text-sm text-muted-foreground">{copy.idleHint}</p>
        )}

        {state.status === 'running' && (
          <p className="text-sm font-medium">{copy.runningHint}</p>
        )}

        {state.status === 'passed' && (
          <section className="space-y-3">
            <div className="rounded-xl border border-green-300 bg-green-50 p-4 font-semibold text-green-800">
              {copy.passed}
            </div>
            <pre className="max-h-[60vh] overflow-auto rounded-xl border bg-muted p-4 text-xs leading-5" dir="ltr">
              {JSON.stringify(state.payload, null, 2)}
            </pre>
          </section>
        )}

        {state.status === 'failed' && (
          <section className="space-y-3">
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 font-semibold text-red-800">
              {copy.failed}
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
