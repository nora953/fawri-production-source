# P0 backup restore / device sequence rollback source finding

Date: 2026-10-24. Status: OPEN, requires reproduction and design review. Release NO-GO. No test was executed in this checkpoint.

Source: `artifacts/fawri/src/lib/cashierBackupAuthority.ts`, `restoreBackup`. After backup validation against the local merchant, the restore transaction clears every local store, including `meta` and `outbox`, and inserts backup records. `validateStoreRecords` validates `meta.device_sequence` as an integer, but no comparison to the current device sequence is visible in this restore method.

Source: `artifacts/fawri/src/lib/cashierIndexedDbAuthority.ts`, `nextDeviceSequence`, reads the `meta.device_sequence` counter and increments it. `artifacts/api-server/src/services/cashierHistoricalOperationAuthority.ts` rejects previously unseen operations at sequence numbers less than or equal to the highest accepted number for the device.

Risk hypothesis: restoring an older backup to an existing device may rewind the counter and cause new local operations to conflict with previously accepted server timeline entries. Restoring an outbox snapshot may also reintroduce operations whose server status has changed. This is not yet an observed end-to-end exploit or an accepted remediation.

Acceptance plan: test backup A at sequence N, advance local and server to N+k, restore A, attempt new operation and reconcile outbox against authoritative server state; verify no double stock mutation, no lost sale, and explicit recovery or fail-closed handling. Define policy for restoring backups across different device IDs before code changes. Do not silently bump the sequence or delete outbox entries without an authoritative contract.
