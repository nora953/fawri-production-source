import { useState } from 'react';
import { probeIndexedDbCashierDurability } from '@/lib/cashierIndexedDbAuthority';
import { runCashierIndexedDbSmoke } from '@/lib/cashierIndexedDbSmoke';

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
      const smoke = await runCashierIndexedDbSmoke();
      setState({
        status: 'passed',
        payload: {
          persistence,
          smoke,
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
          <h1 className="text-2xl font-bold">Fawri Cashier IndexedDB Smoke</h1>
          <p className="text-sm text-muted-foreground">
            Disposable P1B diagnostic only. It uses a temporary IndexedDB database and does not touch merchant data.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void run()}
          disabled={state.status === 'running'}
          className="h-12 rounded-xl bg-orange-500 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.status === 'running' ? 'Running smoke test…' : 'Run IndexedDB smoke test'}
        </button>

        {state.status === 'idle' && (
          <p className="text-sm text-muted-foreground">Press the button once and send the result shown below.</p>
        )}

        {state.status === 'running' && (
          <p className="text-sm font-medium">Running atomic sale, inventory, restart, and outbox checks…</p>
        )}

        {state.status === 'passed' && (
          <section className="space-y-3">
            <div className="rounded-xl border border-green-300 bg-green-50 p-4 font-semibold text-green-800">
              PASS — IndexedDB smoke checks completed.
            </div>
            <pre className="max-h-[60vh] overflow-auto rounded-xl border bg-muted p-4 text-xs leading-5" dir="ltr">
              {JSON.stringify(state.payload, null, 2)}
            </pre>
          </section>
        )}

        {state.status === 'failed' && (
          <section className="space-y-3">
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 font-semibold text-red-800">
              FAIL — IndexedDB smoke test did not complete.
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
