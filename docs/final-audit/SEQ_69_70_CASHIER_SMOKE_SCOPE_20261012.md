# SEQ-69/70 — Cashier browser smoke test scope

Sources: `artifacts/fawri/src/lib/cashierIndexedDbSmoke.ts` and `artifacts/fawri/src/lib/cashierBackupSmoke.ts`.

SEQ-69: IndexedDB smoke creates a disposable database and runs only when manually invoked in a browser. Report assertions cover sale replay, restart recovery, rollback for insufficient stock, catalog projection and promotion conflicts, and pending outbox before/after acknowledgement.

SEQ-70: Backup smoke creates disposable source/destination/mismatch databases. Report assertions cover SHA-256 integrity, tamper rejection, merchant mismatch, failed restore preservation, atomic restore, outbox/history/inventory recovery and restart.

These are source-level descriptions of the harness, not recorded execution results. Both tests need actual browser execution and device/storage failure matrix. They do not prove remote sync, offline licensing or clock tamper resistance. Status: SOURCE_REVIEW_ONLY. No app code changes.
