# Cashier local outbox smoke coverage — P0 checkpoint

Date: 2026-10-24. Status: OPEN. Release: NO-GO. Source inspection only; no test executed in this checkpoint.

`artifacts/fawri/src/pages/CashierIndexedDbSmokePage.tsx` invokes `runCashierIndexedDbSmoke` behind `VITE_CASHIER_SMOKE=1` routing in `App.tsx`.

`artifacts/fawri/src/lib/cashierIndexedDbSmoke.ts` checks that a sale creates two pending envelopes (sale and inventory movement), that sale and stock survive database reopening, and that directly invoking `acknowledgeSynced([operationId])` clears the outbox for the operation. These are useful local durability and acknowledgement checks, but do not establish network upload, server acknowledgement, or recovery of missing sequence numbers.

The existing PostgreSQL diagnostic test explicitly demonstrates acceptance of sequences 1 and 3 and subsequent rejection of unseen sequence 2. This remains an unaccepted gap behavior.

Next acceptance requires a verified client uploader call chain and exact-source tests for sale/adjustment/sale ordering, server-confirmed acknowledgement, retry after transient failure, late missing operation, and inventory reconciliation. Do not treat the smoke test as hosted or end-to-end acceptance.
