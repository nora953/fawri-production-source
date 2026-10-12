SEQ-95/96

The return flow opens a readwrite IndexedDB transaction across meta, catalog, sales, movements and outbox (cashierCompensationAuthority.ts:482-517). Stock updates and movements share that transaction (591-627).

Pending tests: competing local returns, restart after interruption, and remote multi-device reconciliation. Source inspection only.
