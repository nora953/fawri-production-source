# SEQ-67/68 — Local cashier source review

Source: `artifacts/fawri/src/lib/cashierIndexedDbAuthority.ts`.

SEQ-67: Lines 550-570 retrieve an existing sale by operation ID. Lines 796-927 persist stock deduction, sale, and sync outbox records in one IndexedDB transaction, with abort on error.

SEQ-68: Lines 931-1042 check inventory delta and resulting stock, and persist inventory movement and outbox records in one transaction.

Status: SOURCE_REVIEW_ONLY. Pending tests: repeated operation ID with changed payload, replay after sync acknowledgment, concurrent browser tabs, server reconciliation, offline expiry. No runtime test or application change in these checkpoints.
