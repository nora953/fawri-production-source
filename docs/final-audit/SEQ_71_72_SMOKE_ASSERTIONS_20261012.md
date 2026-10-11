# SEQ-71/72 — Cashier smoke assertions and coverage boundaries

SEQ-71: `artifacts/fawri/src/lib/cashierIndexedDbSmoke.ts:148-172` replays the same operation ID with the same sale payload and checks stock is not deducted twice. Lines 220-231 check two pending envelopes, database reopen, and acknowledgement removing them. The harness does not prove behavior for the same operation ID with changed sale contents, remote server receipt, or acknowledgement failure. These are unverified test scenarios, not confirmed defects.

SEQ-72: `artifacts/fawri/src/lib/cashierBackupSmoke.ts:174-265` checks financial history, SHA-256 digest, modified backup rejection, merchant mismatch rejection, destination preservation, successful restore, outbox recovery, and reopen. Source harness is manually invoked and uses disposable databases; physical device, storage eviction, quota exhaustion, browser restart and real recovery time remain unverified.

Status: SOURCE_REVIEW_ONLY. No runtime execution or business code change.
