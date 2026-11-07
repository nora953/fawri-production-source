# Cashier backup trust boundary — P0 source checkpoint

Date: 2026-10-24. Gate remains OPEN; release NO-GO. Source inspection only; no test execution.

`artifacts/fawri/src/lib/cashierBackupAuthority.ts` exports six IndexedDB stores from one read transaction and computes SHA-256 over the backup payload. Restore validates the stored digest, record counts, schema and local merchant identity, then clears and replaces all six stores in one write transaction. The SHA-256 digest is not a keyed MAC or digital signature: it detects changes relative to the embedded digest but does not independently authenticate origin or freshness.

The V1 backup envelope includes `local_merchant_id` and `exported_at`, but no independent signed device identity or server-acknowledged sequence watermark. The restore method does not compare backup sequence with the current local/server sequence before replacement. Existing smoke coverage validates backup integrity and atomic round-trip, not old-backup restore after later server-accepted operations.

Required before acceptance: specify whether restore is restricted to the same device, how server-acknowledged sequence and outbox are reconciled, whether older backups must be rejected or quarantined, and how operator authorization is enforced at the restore entry point. Execute exact-source regression for backup N, server accepts N+1, restore N, subsequent sale and retry. Do not silently reset sequence or discard pending operations.
