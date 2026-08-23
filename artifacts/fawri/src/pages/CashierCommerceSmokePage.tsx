import { useState } from 'react';

import { runCashierPromotionSmoke } from '@/lib/cashierPromotionSmoke';

type SmokeState =
  | { status: 'idle' }
  | { status: 'pass'; report: unknown }
  | { status: 'fail'; error: string };

export default function CashierCommerceSmokePage() {
  const [state, setState] = useState<SmokeState>({ status: 'idle' });

  const run = () => {
    try {
      const report = runCashierPromotionSmoke();
      setState({ status: 'pass', report });
    } catch (error) {
      setState({
        status: 'fail',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <section className="mx-auto max-w-3xl rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Fawri Cashier Commerce Smoke</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Disposable P1C diagnostic. It validates offline promotion pricing rules only and does not touch merchant data.
        </p>

        <button
          type="button"
          onClick={run}
          className="mt-6 h-12 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground"
        >
          Run commerce smoke test
        </button>

        {state.status === 'pass' ? (
          <div className="mt-6">
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 font-semibold text-emerald-800">
              PASS — offline promotion conformance checks completed.
            </div>
            <pre className="mt-3 max-h-[28rem] overflow-auto rounded-xl border bg-muted/40 p-4 text-xs leading-6" dir="ltr">
              {JSON.stringify(state.report, null, 2)}
            </pre>
          </div>
        ) : null}

        {state.status === 'fail' ? (
          <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800">
            FAIL — {state.error}
          </div>
        ) : null}
      </section>
    </main>
  );
}
