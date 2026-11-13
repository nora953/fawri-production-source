# P0 cashier discount-policy mutation authority trace — 2026-10-22

Current executable645b534aea0d32848b4467b5bbebf8fd671deddb remains under validation. One resume read observed15/47 parent workflows SUCCESS,32 queued/in_progress,0 failed. Isolated39824457555 was queued. No second poll, retry, rerun or CI cancellation. Previous native non-row baseline evidence remains preserved; no acceptance of the fix yet.

## Independent source review completed

Nine exact-source files reviewed at645b534. [Blob hashes, source facts, single CI observation and runnable proof sequence](evidence/P0-CASHIER-DISCOUNT-POLICY-MUTATION-TRACE-20261022.json).

| Path | Authority behavior |
| --- | --- |
| Policy management PUT | Trusted merchant auth transaction; staff lock/version/role checks, permissions/policy/staff version and snapshots update atomically |
| Role hardening | Trusted auth clears non-manager policy flag, override permission and session snapshot |
| Sale discount validation | Primary merchant-scoped transaction reads policy and configured kind; returns without manager approval when requested amount is within policy limit |
| Approval issue/consume | Existing trusted PIN issuance and protected manager role/permission/policy, staff locks, binding/replay controls remain |
| Readiness inventory | Policy table has RLS but is absent from authentication mutation restriction;645 only adds non-row privilege guard |
| Existing accepted business-RLS test | Scoped primary upsert of own policy100->125 succeeds inside rolled-back test transaction; not a full sale bypass proof |

The source suggests a possible same-tenant policy-integrity gap: a SQL-capable ordinary runtime could raise its own cashier limit. This is an inference requiring the actual sale-authority decision proof; neither an HTTP exploit, hosted exposure, manager/PIN bypass nor successful unauthorized sale is claimed.

## Exact next bounded proof

After classifying645's pending native/CI result, use two actual LOGINs/two merchants in owned network-none PostgreSQL on GitHub Actions. With permission sale.discount, amount policy100 and total1000, validate discount250 without approval: expect CASHIER_MANUAL_DISCOUNT_OVERRIDE_REQUIRED. Attempt primary own-policy update to300, then call the same real validator on the same payload. Record whether decision changes and whether readiness admits the role. Commit only disposable synthetic work needed across connections; restore original policy via auth in finally, verify other merchant and manager/permission/PIN/session/approval state unchanged.

If runtime confirms the gap, add policy-table mutation admission restriction while keeping ordinary scoped reads and trusted auth writers. Test table/column privileges through direct/PUBLIC/inheritance/SET/unreachable roles, authenticated policy PUT version/role/rollback behavior and issue/consume concurrency. Replace existing primary policy-write positive with auth positive plus primary denial; retain attribution business writes. Do not alter discount thresholds, PIN policy or locks.

The current CI is not cancelled to launch this subsequent proof. This checkpoint changes documentation only [skip ci]. Full P0 scope remains OPEN; release NO-GO; percentage UNMEASURED. GitHub/Actions only, no external connector/hosted changes/deployment/main push/merge/credential rotation/P1/P2.
