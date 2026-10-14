# Audit manifest initialization rules — SEQ-372
This is a **schema and reconciliation queue**, not a completed coverage manifest. Do not fabricate 222 UI case IDs or mark unknown cases as tested. The existing 222-case baseline remains in its original ledger until each exact case ID is imported.

## Case manifest CSV schema
`case_id,domain,capability,requirement_id,priority,proof_layer,role,scenario,source_anchor,test_path,environment,status,evidence_uri,source_sha,harness_sha,last_verified_at,canonical_issue_id,limitations`

Allowed statuses: NOT_RUN, PASS, FAIL, BLOCKED, TRIAGE, STALE. PASS only when required proof layer is met. A distinct case may require multiple proof-layer rows with unique case IDs or explicit linked subcase IDs. Store timestamps in UTC ISO8601.

## Domain reconciliation queue (not test cases)
| Domain | Mandatory reconciliation before claiming coverage |
|---|---|
| Tenant and PostgreSQL RLS | Merchant/admin roles, grants, tenant context, denial under NOBYPASSRLS, migrations |
| Authentication and sessions | OTP, token/session revocation, stale session, device binding, 401/403 |
| Owner/admin/support/emergency | Role matrices, actual HTTP permissions, stale UI, privacy and expiration |
| Billing and subscription | SaaS/cashier order identity, SQL rollback, webhooks, reconciliation, renewals |
| Cashier offline and sync | IndexedDB replay, grace expiry, signed license, stock race, outbox, shifts |
| Inventory/orders/returns | Multi-location, compensation, cancellation, concurrency, reporting |
| Meta/AI/replies | OAuth, webhook ingress, page directory, knowledge trust, quota refund |
| Data lifecycle | Deletion, media cleanup, export, backup, restore, PITR |
| Frontend/UI and i18n | Import exact existing 222 UI baseline, 21 unmapped selectors, AR/EN/KU, 390/1280, accessibility |
| Security/supply chain | Secrets, headers, packages, isolation, threat boundaries |
| Deployment and operations | Staging/prod parity, readiness, metrics, alerting, rollback, proxy, provider contracts |

## Next transaction
1. Locate exact canonical UI 222-case CSV and its latest SHA; import case IDs verbatim, with current 84 PASS_BOUNDED_FULL_APP and 138 NOT_RUN **only after row-level reconciliation**.
2. Enumerate remaining domains from code/config/tests and attach evidence references to known completed cases.
3. Freeze v1 denominator and document additions/removals with justification; report both accepted and executed coverage.
4. Run only previously uncovered P0 cases after reconciliation.

**No overall percentage until row-level reconciliation. Release BLOCKED.**
