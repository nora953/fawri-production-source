# P0 cashier identity tenant row isolation — 2026-10-22

Continuation starts at ceb3792285e82e532e54ddd0a65d9bfcb56b93aa. Previous accepted executable44f46431 and79/79 isolated invocations remain preserved. Candidate `81aeaf6e2ccd4f652d435da0775a5b4dffb062da` is CI_PENDING, not accepted yet.

## Change and boundary

Migration0043 enables RLS and the established public.fawri_tenant_or_audited_admin(merchant_id) policy (USING and WITH CHECK) on seven identity tables: merchant_cashier_staff, merchant_cashier_staff_permissions, merchant_cashier_stations, cashier_station_pairing_challenges, cashier_station_credentials, cashier_shifts, cashier_operator_sessions. Schema declarations, linked policies, exact preimages, reviewed SQL SHA-256, deterministic snapshot and journal are committed together. Production protected-table inventory adds all seven. Existing private LOGIN/backend/full-transaction scope and auth/audited-admin predicate branches remain unchanged.

Ordinary tenant reads now require private merchant scope. Existing secret-column SELECT and authentication mutation denials remain. Scoped primary historical reads, business station/shift work and0042 manager row-lock routine must continue; trusted auth LOGIN must retain global credential/housekeeping access without tenant GUC. No policy price/grace/offline rule, credential, hosted grant, role or data migration is changed.

## Prepared native proof

New guarded actual-LOGIN suite seeds two merchants and all seven tables; checks actual policy/RLS catalog, unscoped/forged-GUC hiding, A/B private scopes with contrary GUCs, no scope leakage, cross-merchant station/shift update/delete hiding and insert/rebind denial, own work rollback, global trusted auth reads/marker revocation and merchant-bound actual staff service, actual primary historical session/shift/station/credential join, wrong-device historical denial, and seven disabled-RLS admission cases. Existing housekeeping/session/staff-lock ordinary-read positives now explicitly require a private scope, with new unscoped-empty assertions; original secret/mutation/lock/rollback assertions retained. Runner expects80 invocations; exact logs decide acceptance. New schema paths trigger47 workflows in this source, not a P0 denominator.

Local syntax checks PASS; direct unattested invocation refuses before application DB imports. Actual SQL assertions run only in owned network-none PostgreSQL on GitHub Actions. Local old dependency links were unusable; canonical regeneration/snapshot/provenance verification is delegated to existing GitHub Actions schema gate, and no success is assumed until it completes.

## Remaining and next

This increment is bounded identity row isolation; four source-snapshot cashier tables remain without RLS: merchant_cashier_discount_settings, merchant_cashier_staff_discount_policies, merchant_cashier_discount_override_approvals, cashier_operation_attribution. Next trace their business/auth lock and write dependencies, prepare two-tenant proof and canonical provenance, preserving original sale/discount approval/replay semantics. Alternate view/function exposure, full auth/privacy, offline/grace/sync/retention/provider/storage/full-P0 inventory remain OPEN.

NO-GO; whole-P0 percentage UNMEASURED. Hosted runtime BLOCKED_BY_RAILWAY; hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. GitHub/Actions only; no external service connector, hosted mutation, deployment, main push, merge, credential rotation or P1/P2.
