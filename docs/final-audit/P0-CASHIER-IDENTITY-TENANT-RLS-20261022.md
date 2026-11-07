# P0 cashier identity tenant row isolation — 2026-10-22

**Accepted executable `81aeaf6e2ccd4f652d435da0775a5b4dffb062da`:47/47 workflows SUCCESS.** Isolated39789294155/job119860712686:80/80 invocations exit0/failed0/skipped0/cancelled0/summaryComplete,78 unique files. [Exact evidence](evidence/P0-CASHIER-IDENTITY-TENANT-RLS-ACCEPTANCE-20261022.json). Start checkpointceb37922; prior executable44f4643146/46+79/79 remains historical.

## Change and boundary

Migration0043 enables RLS and the established public.fawri_tenant_or_audited_admin(merchant_id) policy, with USING and WITH CHECK, on merchant_cashier_staff, merchant_cashier_staff_permissions, merchant_cashier_stations, cashier_station_pairing_challenges, cashier_station_credentials, cashier_shifts and cashier_operator_sessions. Schema declarations, linked policies, exact two schema preimages, reviewed SQL SHA-256, deterministic snapshot and journal passed canonical regeneration. Production protected-table inventory includes all seven.

Ordinary tenant reads require private merchant transaction scope. Existing secret-column SELECT and authentication mutation denials remain. Trusted auth retains global access through its existing independently verified LOGIN/marker; application SQL still binds merchant IDs. Private LOGIN/backend/full-transaction scope, audited-admin branch and0042 scoped row-lock routine are unchanged. No discount/subscription/grace/offline policy, credential, hosted grant, role or data migration change.

Three previous native ordinary-read positives now prove both unscoped-empty and authorized scoped-readable behavior. They retain original secret/mutation/locking/rollback assertions. Other production services did not need a logic change: historical commerce already issues private merchant scope, and credential/housekeeping/staff management already use trusted auth.

## Executed validation

| Proof | Actual result |
| --- | --- |
| New identity suite |8PASS,0FAIL/skip/cancel, parent included; two actual independent LOGINs/two merchants |
| Catalog |All7 policies present with expected predicate/USING/WITH CHECK; RLS enabled and active for actual tenant LOGIN |
| Tenant reads |Unscoped and forged tenant/admin GUC reads return no fixture rows; both A/B private scopes return only own rows despite contrary GUC; ended scope reveals no rows |
| Tenant writes |Cross-merchant station/shift UPDATE/DELETE affect0; station INSERT/rebinding to other merchant reject42501; own station/shift work permitted and rollback preserves originals |
| Trusted auth |Global reads across both merchants without tenant GUC; actual staff service remains merchant-bound; revoked auth marker hides rows and authority rejects |
| Historical commerce |Actual primary service joins own operator session/shift/station/credential/location for both merchants; cross-device historical attribution denied |
| Production drift |Disabling RLS on each of7 tables rejects admission; restoring RLS accepts |
| Previous boundaries |Staff-lock7PASS, permission/session8PASS, housekeeping10PASS, manager PIN10PASS, auth63PASS/50 sensitive-read ACL cases/10 columns; staff mutation denial, real locking, durable PIN lockout, rollback/replay/concurrency preserved |
| Full isolated run |80/80 clean invocations/78 unique files, all44 migrations, full committed-schema dump/restore, owned cleanup and Node22 HTTP PASS |
| Schema |39789294139/job119860711191 SUCCESS; SQL/preimages/journal/snapshot reproduced; snapshot SHA-256bcb3d995913677bd51b381790a10fba50153c5ab8d3583860f81e539dce24a3f |
| Foundation/quality |Foundation39789294370/job119860713266 final marker/types/build/readiness/native-RLS/integration and final quality39789294668 SUCCESS |
| Security |39789294182 attempt1 SUCCESS; audit119860712503/review119860711692:0 high/0 critical/2 moderate |

No CI failure or retry in this increment. Source and actual checkout4178279c91a971331029da586aa67281b1d01d43 share tree80cc0aac58de49c8116c0ba3bce27c7f6cc458e8. Source change is15 files. Later report/evidence/ledger commits are docs-only[skip ci], not new executable tests. Counts include parents/repeated invocations; schema paths trigger47 workflows rather than prior46, not a P0 denominator. Local syntax PASS; unattested invocation refuses before application DB import. Local old dependency links were unavailable; actual canonical generation and all DB assertions were verified in existing GitHub Actions, using owned network-none PostgreSQL for runtime assertions.

## Remaining and exact next

Four cashier source-snapshot tables remain without RLS: merchant_cashier_discount_settings, merchant_cashier_staff_discount_policies, merchant_cashier_discount_override_approvals, cashier_operation_attribution. This inventory is source-only, not a new hosted inspection.

Next trace cashierMerchantDiscountSettingsAuthority/cashierDiscountPolicyAuthority/cashierDiscountOverrideAuthority and operation-attribution sync/report writers. Preserve auth approval issuance, primary sale consumption, advisory/row lock order, exact sale binding, time windows, replay and transactional rollback. Add two-tenant read/write negatives and own/auth positives, then canonical schema/provenance before expanding the production inventory. Do not alter business policy or drop locks to satisfy RLS.

Alternate view/function exposure, complete auth/privacy, offline/grace/sync/retention/provider/storage/full-P0 inventory remain OPEN. **NO-GO; whole-P0 percentage UNMEASURED.** Hosted runtime BLOCKED_BY_RAILWAY; hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. GitHub/Actions only; no external-service connector, hosted mutation, deployment, main push, merge, credential rotation or P1/P2. Preserve accepted evidence; resume at the bounded next group.
