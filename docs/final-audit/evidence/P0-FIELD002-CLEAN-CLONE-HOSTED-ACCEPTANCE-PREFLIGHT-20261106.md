# FIELD002 — fresh clean Neon clone SQL/HTTP acceptance preflight (2026-11-06)

## Exact inspected target
Read-only, explicitly pinned Neon project `round-fire-18493605`, branch `br-polished-mouse-b1proel7` (`fawri-field002-clean-staging-rehearsal-20261106`), database `neondb`. Neon branch metadata confirms nondefault, nonprimary, parent `br-falling-dust-b1km4gix`. No default production queries, staging write, schema migration, role grant, or fixture insertion in this checkpoint.

Source pinned to current PR head `f8dc034bdca8b4c3374dcfeca2359efd1602b01b`. Current workflow `.github/workflows/field002-clean-clone-acceptance.yml` and harness `artifacts/api-server/scripts/field002-isolated-notification-acceptance.mjs` were inspected, not executed.

## Independent actual SELECT-only preflight

| Exact precondition | Hosted result |
| --- | ---: |
| Applied Drizzle migration records | 52 |
| Last recorded migration timestamp (0051) | 1791936000023 |
| Last migration source SHA-256 | `1773f8314f11c832a1c03453204af2896b204b80695066ebc06cded7b11e62ea` |
| Stored notifications | 0 |
| Audit events | 283 |
| Merchant rows | 1 |
| `fawri_security.transaction_scopes` rows | 0 |
| Existing temporary `field002_[ta]_<24 hex>` test roles | 0 |
| Eight critical RLS tables with exactly one policy | 8/8 |
| Other actively querying or transaction-holding clients during sample | 0 |

The exact expected last-ledger hash matches the source's `LEDGER_HASH` constant; the pinned clean-clone profile hardcodes branch and endpoint. Two trusted functions are present (`public.fawri_authentication_runtime()` and `fawri_security.issue_scope(name,integer,bigint,text)`); both reject EXECUTE for the two old runtime roles. The authentication marker is **not** SECURITY DEFINER (expected marker behavior); the scope issuer **is** SECURITY DEFINER with `search_path=pg_catalog`. Do not confuse the count of SECURITY DEFINER functions with the number of required security capabilities.

## Actual authorization boundary reviewed

The clean-clone harness explicitly demands **both**:
- `FAWRI_FIELD002_CLONE_PROFILE=clean_20261106` and the immutable exact endpoint/branch, credentials only from `FAWRI_FIELD002_CLEAN_CLONE_ADMIN_URL`;
- `FAWRI_FIELD002_ALLOWED_EXECUTION_BRANCH=br-polished-mouse-b1proel7` for `--execute`.

The workflow additionally requires an **explicit authorized execution request** on the draft PR branch (single-file approval-only commit with exact parent SHA) or a workflow dispatch with exact approval string `APPROVE_CLEAN_CLONE_TEST_FIXTURES` and exact source SHA. This check is not implicitly satisfied by a normal documentation/code push.

The harness's authorized hosted action would create two **ephemeral least-privilege LOGIN roles**, two synthetic merchant accounts/notifications, test real own/foreign/revoked SQL and mounted HTTP, and attempt full cleanup. Credentials are generated in-process, expire after 20 minutes and are never printed; the harness verifies all-data/ACL/role/policy baseline parity after deletion. This is a **potentially mutable hosted test** requiring separate product-owner authorization. Roles are not created by this read-only preflight.

## Result and next action

**PREFLIGHT-ONLY ACCEPTED:** live source/host baseline matches the intended clean-clone acceptance harness prerequisites. It removes doubt about the clone's ledger/RLS/fixture baseline, but **does not prove** that the runner can connect, that required GitHub secret exists, or that privileged provisioning/cleanup and SQL/HTTP tests will pass.

**NOT EXECUTED:** no owner approval was newly asserted, no approval-run request was created, and no temporary SQL/HTTP fixtures or role changes were performed. Before executing the real test, require explicit approval for the pinned nonproduction clone and validate the narrowly scoped GitHub Actions secret. On a missing secret or refusal, keep the gate OPEN and do not fall back to original staging, default production, owner/BYPASSRLS connections or unreviewed grants.

FIELD002 OPEN, original staging rollout OPEN, R2 commercial restore/import promotion OPEN, independent 0052 BLOCKED, PR #550 draft/unmerged, commercial launch NO-GO. Historical P0 register: 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED, no certified overall percentage.
