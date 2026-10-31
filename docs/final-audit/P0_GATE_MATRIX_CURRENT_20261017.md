# P0 closure gate matrix — 2026-10-17

This is a **current-status overlay**, not a rewrite of historical `MASTER_PLAN.md` or proof that the entire P0 audit is complete. All unlisted open register findings remain open until individually reconciled. Release: **NO-GO**.

| Gate | Current disposition | Evidence / next proof |
| --- | --- | --- |
| Receipt function owner and pre-rollback no-mutation assertions | PASS in isolated CI, NOT hosted | Run 39002802732 / job 117309086649 emits 16 `REPLAY_CAPABILITY_OWNER_PROOF` records with `preRollbackDomainUnchanged=true`, `rollbackRestored=true`; supersedes `MASTER_PLAN.md` pending assertion note. |
| Provider order mapping mutations at admission/discovery boundaries | PASS in isolated CI, NOT hosted | Current `billing-provider-discovery-restricted-postgres.integration.test.mjs` contains two-session mapping mutation cases for both SaaS and cashier; successful job 117309086649 includes suite. Supersedes old `MASTER_PLAN.md` NOT RUN status. |
| Admin actor/session identity for receipt routes | Source + isolated HTTP test PASS, NOT hosted | Routes require `manage_subscriptions` and derive account/session/device from server auth context, reject body actor overrides. |
| Hosted migrations 0028–0033, function owners, RLS and EXECUTE | OPEN | Only read-only catalog inspection and approved disposable-branch rollout; no production migrations/grants. |
| Railway branch parity and actual runtime identity | OPEN | Existing staging service uses old `main`; actual deployment mode and runtime role unverified; healthcheck alone insufficient. |
| Provider, deployment controls, storage, retention/privileged deletion | OPEN / POLICY | Define retention/deletion and missing-order ownership policies; certify provider integration and storage/recovery before release. |
| `CASHIER-OFFLINE-001` licensing expiry behavior | OPEN / PRODUCT DECISION | Choose signed certificate and expiry blocking local sales after 7-day grace, OR subscription controls cloud features while local sales stay open. Until decision, cannot claim comprehensive offline-license acceptance. |
| Entire P0 register reconciliation | OPEN | Reconcile each canonical finding against exact source/run/environment, and update active headers without erasing historical failure evidence. |

No new P0 completion percentage is measured. This commit only records audited statuses; it neither modifies application code nor performs hosted operations. Prior run counts are not additive.
