export const CASHIER_INDEXEDDB_SMOKE_COPY = {
  title: 'Fawri Cashier Local Commerce Smoke',
  description: 'Disposable P1B/P1C/P1D/P1E diagnostic only. It uses temporary IndexedDB databases, validates offline commerce, compensation, history, backup integrity, and atomic restore behavior, and does not touch merchant data.',
  runningButton: 'Running smoke test…',
  runButton: 'Run local commerce smoke test',
  idleHint: 'Press the button once and send the result shown below.',
  runningHint: 'Running persistence, sale, inventory, pricing, return, void, history, backup, restore, restart, and outbox checks…',
  passed: 'PASS — local cashier storage, commerce, compensation, history, and backup/restore checks completed.',
  failed: 'FAIL — local cashier smoke test did not complete.',
} as const;
