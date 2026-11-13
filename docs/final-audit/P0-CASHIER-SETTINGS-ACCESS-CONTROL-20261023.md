## Acceptance update — 2026-10-23

Source00c56c26 accepted:47/47 workflows,85/85 clean native invocations. [Exact acceptance](P0-CASHIER-SETTINGS-ACCESS-ACCEPTANCE-20261023.md). Earlier preparation notes below are historical; release NO-GO.

---

# P0 cashier settings access control — 2026-10-23

## Verified diagnostic
Source6fe2d4a4ab56a17dcacc134f7a6d3cca1c1f1112:47/47 workflows SUCCESS; native39871639878/job120147216866 completed85/85 clean invocations/83 unique files, zero failed/skipped/cancelled and complete summaries. Actual checkoutffd8e0c1f9669fccab4bee7d9537b2bc44a29712 independently matches source tree32d60a328a86bba5ac36f695a5faeb9c713b56ff. No retry or rerun. [Exact diagnostic evidence](evidence/P0-CASHIER-SETTINGS-AUTHORITY-BASELINE-20261023.json).

The diagnostic established inconsistent configuration mutation authority at the SQL principal boundary. Authorized management, tenant separation and exact restoration passed. This requires a source access-control remediation; it is not a demonstrated HTTP/full-sale or hosted exposure. Green diagnostic CI is not security acceptance.

## Prepared bounded remediation
Settings join the authentication mutation restriction inventory. Merchant configuration PUT retains secure session and subscription authorization, then uses the identity-checked trusted auth transaction. Primary commerce retains scoped ordinary reads and a fixed-projection row-lock capability, avoiding direct configuration write privileges. No threshold, price, offline/subscription policy or UI behavior changed.

Manual migration0046 introduces the strict/volatile definer settings-lock projection and lets the existing pending-approval invalidation capability serve both private-scoped commerce and the already trusted authentication LOGIN. Trusted auth is recognized by its non-PUBLIC marker and safe role attributes; no tenant GUC authorization is introduced. Search path stays pg_catalog; SQL binds merchant identity explicitly; runtime owners must remain unreachable. Readiness requires safe callable metadata for the new capability. No new role or hosted grant is provisioned.

Version checks, shared advisory/settings/approval/staff locks, pending-only invalidation, original transaction ownership and rollback remain intact. Authentication already has direct mutation authority; the revised invalidation projection does not add a new global principal. Staff approvals remain trusted-auth issued; commerce consumes in its own transaction.

## Verification and limits
Local24 existing source-contract tests PASS, including trusted mutation dispatch; native-file syntax and whitespace checks PASS. Full typecheck/canonical regeneration/native execution remain PENDING on the containing source.

The settings diagnostic is now defensive regression: original unauthorized mutation requires42501 while authorized auth management/version/invalidation/rollback remains positive. Added tests cover cold-start/default/version0 behavior; private and trusted-auth locking; auth-marker revocation; cross-merchant denial; actual settings row locks across caller COMMIT/ROLLBACK; every settings column and direct/PUBLIC/inherited/SET/unreachable grant matrix with revocation recovery; capability strictness/volatility/search path/execute/existence and owner reachability. Existing business-RLS management positives now use trusted auth and require primary mutation denial. Existing non-row admission tests retain every protected table and use the more specific auth-mutation rejection for newly auth-protected settings. No assertion weakened to hide a failure.

Manual-stage SQL/journal/snapshot prepared with the existing deterministic algorithm; CI must reproduce them. Source candidate47 migrations, hosted last verified28; no hosted migration applied or approved here. Earlier4acf1351 approval acceptance47/47+84/84 remains exact-source history and is not acceptance of this new source.

Next: read P0_CASHIER_DISCOUNT_SETTINGS_AUTHORITY_REMEDIATION, all85 complete native summaries, full source workflows/Foundation/canonical47/security evidence. Preserve failures before focused correction; no passing-suite timestamp rerun. Further actor/privacy and complete-P0 proof reconciliation remain open.

Release **NO-GO**; percentage UNMEASURED. No hosted operation/change/deployment/restart/migration/ACL/secret/main push/merge/P1/P2. User-facing security summaries stay high-level.
