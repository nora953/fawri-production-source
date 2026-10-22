# P0 cashier discount and attribution tenant RLS — 2026-10-22

Continuation starts at60d0a6670eec18ddc21abd12a0c1498cc6ed0b12. Previous executable81aeaf6e acceptance47/47 workflows and80/80 invocations remains preserved. Candidate `bec6e7114be692981df07bc7b25ad456116fda42` is CI_PENDING, not accepted yet.

## Change and trace

Migration0044 enables the established public.fawri_tenant_or_audited_admin(merchant_id) RLS policy (ALL/USING/WITH CHECK) on merchant_cashier_discount_settings, merchant_cashier_staff_discount_policies, merchant_cashier_discount_override_approvals and cashier_operation_attribution. Schema declarations/linked policies, exact three schema preimages, reviewed SQL SHA-256, deterministic snapshot/journal and production protected-table inventory are committed together.

Settings changes and primary approval consumption already execute in private merchant scope; issuance/policy management/hardening/retention use trusted auth LOGIN. Sync attribution persistence, operator sale scope, central/operator activity/report reads already bind merchant business transactions. No production service logic or transaction/lock order change is required.0042 staff row lock and existing discount-kind advisory lock remain. No credential/price/PIN/subscription/grace/offline policy or hosted grant/role/data mutation.

## Prepared proof

Guarded actual-LOGIN native test seeds two merchants, authentic manager approval issuance/consumption, settings/policies and synthetic attribution rows. It checks catalog/active RLS, no-scope/forged-GUC hiding, both private scopes/contrary GUC/no leak; cross-merchant UPDATE/DELETE hidden and four insert/rebind denials; own policy/attribution rollback; global trusted auth/no GUC/marker revocation; actual primary approval binding/rollback/replay/concurrent single update; actual settings change rollback, own pending-only invalidation, consumed/other-merchant preservation, version/kind mismatch; real shared advisory-lock blocking/release; four disabled-RLS admission cases. Existing full HTTP sale/return/void/history/report regressions provide actual attribution service coverage, separately from the new synthetic SQL fixture.

Local Node syntax PASS; unattested execution refuses before application DB import. Runtime assertions only on owned network-none PostgreSQL in GitHub Actions. Expected81 invocations/47 workflows; actual logs decide acceptance. Canonical SQL/preimage/snapshot reproduction must pass, not assumed. SQL SHA-256abb05446f350956056ddf7c62b36e5f2fbdb8306833ac59a6d5762e3b3e210a1; snapshot5d6a49f45140545737105b1b2aa5ceec6743599c5f79070392fd84e4356de48f.

## Limits and next

If accepted, all18 cashier tables in the canonical source snapshot have RLS enabled. This is source inventory plus bounded native assertions, not full cashier authorization certification or hosted inspection. Same-tenant credential/business mutation privileges, alternate views/functions, full auth/privacy, offline/grace/sync/retention/provider/storage/full-P0 inventory remain OPEN as applicable.

Next bounded task: inventory caller-accessible database views/routines and remaining cashier mutation privileges under the actual restricted LOGIN; trace any alternate path around column/RLS/marker restrictions and prove concrete denials before remediation. Preserve completed transaction/row/advisory-lock and replay proofs.

NO-GO; whole-P0 percentage UNMEASURED. Hosted runtime BLOCKED_BY_RAILWAY; hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. GitHub/Actions only; no external-service connector, hosted mutation, deployment, main push, merge, credential rotation or P1/P2.
