# SEQ-155–157 — Cloud sync and sandbox payment ingress boundary (2026-10-13)

Read-only source audit following SEQ-153–154; no new runtime tests, no production gateway activity.

## SEQ-155: cloud cashier idempotency

`artifacts/api-server/src/services/postgresCashierSyncAuthority.ts` lines 1235–1345: requires PostgreSQL authority and merchant binding, checks historical device authority and timeline, locks by merchant/device, and on existing sale compares operation_id, request_hash, device_id, location_id and device_sequence. Mismatch raises `CASHIER_SYNC_IDEMPOTENCY_CONFLICT` HTTP 409; replay returns zero inventory mutations. **Backend conflict check exists**. This bounds prior local IndexedDB issue: changed input with same operation ID was silently replayed *before* upload, but server has independent content-hash validation when it actually receives changed payload. No proven double stock decrement or backend replay bypass.

## SEQ-156: outbox acknowledgement

`artifacts/fawri/src/lib/cashierCloudOutboxSync.ts` lines 200–253, 265–305: validates HTTP response and acknowledgement operation_id/device_sequence/entity IDs, then calls `acknowledgeSynced` only after complete server accept or replay. Network ambiguity leaves envelopes pending for retry. **Positive source control**, not a fresh network partition test.

## SEQ-157: sandbox payment ingress

`artifacts/api-server/src/services/superQiSandboxWebhook.ts` lines 191–285: verifies signature and confirmed sandbox gateway payment details, locates billing order, attaches payment reference, then awaits `applyVerifiedCashierBillingProviderEvent` for cashier subscription. No catch swallowing a generic P0001 is visible here. Thus a transient SQL application failure can propagate out of sandbox processing; whether the gateway retries, how the HTTP route responds, and how failed notifications are retained **remain unverified**. Never infer actual lost customer payment. The prior P0001 fault was deliberately injected by isolated test.

## Classification

- `CASHIER-IDB-IDEMPOTENCY-001`: local same-ID changed-payload silent replay **source+browser confirmed**, backend has separate request-hash 409 guard; scope local UX/operation identity, not proven cloud double charge/stock.
- `CASHIER-BILLING-SQL-RECOVERY-001`: synthetic generic SQL error rolls back event and pending order; ingress propagation source confirmed, gateway retry policy unverified.
- No new confirmed backend exploit. Do not duplicate prior canonical findings.
- Next audit: route-level webhook status/retry semantics, provider settlement recovery reconciliation, synthetic offline/online sync ambiguity. Continue remaining privileged page browser tests. Estimate ~54%/46%, release BLOCKED; no fixes.
