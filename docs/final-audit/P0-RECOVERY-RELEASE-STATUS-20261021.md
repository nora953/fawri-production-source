## Final accepted executable

`c60914b8d954cb1d82e9a3706adfd0b669d9144d`:46/46 workflows SUCCESS;75/75 isolated invocations clean. Isolated run39649327517/job119393191547; exact source/checkout tree match. See evidence/P0-CENTRAL-SCOPE-FINAL-ACCEPTANCE-20261021.json. This containing commit changes docs/evidence only; no new runtime acceptance is inferred. Release remains **NO-GO**.

# P0 recovery and release status — 2026-10-21

## What recovery established

The previous session saved real work. Its observed GitHub HEAD74fc702f8d7759abd4f34ac4d367e8e126439c21 was the actual branch HEAD. Its46 exact-SHA workflows and72 isolated invocation summaries were independently checked: all successful/clean. Twelve commits followed the earlier251b8329 reference. A fresh checkout was clean; the previous session filesystem is unavailable, so unsaved edits cannot be certified recovered. Draft PR550 targets test/p0-integrated-billing-meta-20261015 and remains unmerged.

## Current implementation increment

The central operational and subscription merchant wrappers now await private scope issuance AFTER BEGIN and BEFORE protected locks/work. Generic/authentication transaction wrappers do not mint. The private authority remains bound to actual LOGIN/backend/full transaction ID/merchant and is committed through the separate trusted authentication connection. Focused actual-function/lifecycle tests29 and guard/security34 pass locally; full database acceptance must be tied to the final executable source in the following checkpoint/evidence, not transferred from older commits.

Actual primary/auth/operator fixture separation preserves the existing provider mapping races, owner/FORCE RLS proofs, HTTP authorization, refunds and COMMIT-acknowledgment loss tests. Original failures and cancelled intermediate runs remain part of the evidence history. Local full frozen dependency installation was rejected because xlsx@0.20.3 lacks tarball integrity under the installed pnpm11 policy. The lockfile/policy was not relaxed. Focused VM tests used the cached TypeScript package and a temporary resolver; full builds/install/typechecks are established only through exact-source CI. No local PostgreSQL/Docker execution is claimed.

## Fresh hosted evidence

Read-only inspection explicitly selected Neon staging-runtime/br-falling-dust-b1km4gix, not the default production branch. It still has28 migration ledger rows ending1791244800000 (0027); source contains41. Therefore13 source migrations0028–0040 lack hosted application evidence. fawri_security and the confirmed payment resolver are absent. fawri_staging_runtime is LOGIN/BYPASSRLS/CREATEROLE/CREATEDB; fawri_staging_rls_runtime is NOLOGIN/NOBYPASSRLS. The latter still has direct SELECT and some write privileges on non-RLS merchants/account_sessions/cashier_operator_sessions/order_items/support_messages. This is a SQL isolation/configuration gap, not a demonstrated HTTP exploit or proof that Railway uses either role.

Railway fawri-staging/environment named production still runs main@d38d29229bed0f9575a98e7026e7819fe363bfd4 from2026-10-10; no staged/applying work. No volume/bucket reported by Railway does not exclude external storage. Actual deployed DB credential identity remains unverified. See evidence/P0-HOSTED-READONLY-RECOVERY-20261021.json. No hosted write, migration, privilege change, deploy or main merge was performed.

## Measurement and remaining effort

A confirmed whole-P0 completion percentage is **NOT MEASURABLE** from the saved inventory. The machine-readable manifest is a UI import with P1 rows, not a complete P0 requirement/required-proof denominator. The execution control plan explicitly records incomplete inventory reconciliation. Historical85% is unverified, and invocation/TAP/workflow counts cannot substitute for unique accepted P0 requirements. No replacement percentage is invented.

Provisional engineering estimate: **20–40 focused hours**, excluding waiting for environment access/owner policy decisions, assuming no new high-impact defects and stable CI. Budget4–8h for public predicate cutover/consumer acceptance,4–8h for auth/session/privacy and cashier integrity,6–10h for remaining offline/sync/retention requirements,4–8h for hosted schema/role/provider/storage acceptance, and2–6h for inventory reconciliation/final regression. These ranges are planning assumptions, not measured completion or a delivery guarantee.

## Open release blockers / next precise work

- Public fawri_tenant_or_audited_admin STILL trusts raw fawri.tenant_id. The successful exploit proof remains OPEN despite private-scope caller progress. Do not mark SQL tenant isolation fixed globally.
- After the final executable has clean CI, implement canonical0041 private predicate cutover with matching stage/journal/deterministic snapshot; remove six transitional source GUC writes. Preserve negative forgery, expired scope, transaction/session replay and actual normal business behavior. Adapt remaining SQL fixtures to the new authority without granting issuer to primary or bypassing startup.
- Reconcile the full P0 requirement/proof inventory; certify sensitive auth SELECT/privacy, cashier credentials/sessions, offline/stock/sync boundary requirements, retention/deletion and missing-order policy.
- Hosted role identity, owners/ACL/default grants/pooler,13-migration parity, real sandbox/provider acceptance, storage/recovery/deployment gates remain open. No release deployment is authorized by this continuation.

**Release decision: NO-GO.** Final exact-source CI/counters and verified commit belong in the latest handoff checkpoint; this report does not predeclare a pending run successful.
