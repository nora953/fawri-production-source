import { isMainThread } from 'node:worker_threads';
import { assertDisposablePostgres } from './disposable-postgres-test-guard.mjs';
// Node --import completes this preflight before the test dependency graph loads,
// including legacy suites with static application pool imports.
// Loader workers share the validated main process network namespace. They may
// inherit a deliberate synthetic restricted-role URL after fixture setup.
// Reattesting that role URL would reject an already-proven isolated test run.
if (isMainThread) await assertDisposablePostgres();
