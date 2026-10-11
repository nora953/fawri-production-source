import { assertDisposablePostgres } from './disposable-postgres-test-guard.mjs';
// Node --import completes this preflight before the test dependency graph loads,
// including legacy suites with static application pool imports.
await assertDisposablePostgres();
