# P0 merchant retention: subscription activation status required before reactivating a suspended account

**Date:** 2026-11-10. **Scope:** source-only merchant account suspension/resumption logic. **Status:** bounded source fix verified, **not** hosted SQL/HTTP acceptance, physical release, or authorization to modify subscription/retention policy.

## Confirmed code defect

In `artifacts/api-server/src/services/postgresMerchantRetentionAuthority.ts`, the `activeSubscription` condition previously checked only `subscription.expires_at > now`. A retention-suspended merchant with an `expired`, `suspended` or **`pending_activation`** subscription whose expiration had moved into the future would have its merchant and account status set to **approved/active** even when the commercial subscription had not yet been activated. The source also used a future expiry from unapproved subscriptions to postpone retention and clear product read-only restrictions.

[Source fix `5b199e72`](https://github.com/nora953/fawri-production-source/commit/5b199e72a04d9d1dfb0bad10c9aa46c57c8fc8c9) adds `permitsRetentionResumption(subscription,now)`: only an explicitly `active` or `replies_exhausted` subscription with a finite, future expiry is eligible to restore a previously retention-suspended merchant. A `pending_activation`, `suspended` or `expired` state cannot supply a future retention anchor merely by possessing a future timestamp. Earlier legitimate historical expired subscription end dates remain considered when computing retention, and an actual renewal that marks a subscription `active` retains the existing restoration behavior. Existing zero-reply logic stays disabled where `replies_exhausted` is the final status.

## Targeted executable source acceptance

- [GitHub Actions **#42750820065**](https://github.com/nora953/fawri-production-source/actions/runs/42750820065) **COMPLETED SUCCESS 5/5**, zero failing cases. The test is `artifacts/api-server/tests/merchant-retention-resumption-fail-closed.test.mjs`; it transpiles and executes the **actual TypeScript production** retention helper and `refreshMerchantRetentionPostgres`, with a synthetic SQL transaction query recorder:
  - Future `pending_activation`, `suspended`, `expired` statuses leave the retention-suspended account blocked and record no SQL account/merchant `active` restoration.
  - A genuinely `active` future subscription restores merchant/account and correct final subscription state.
  - A future zero-reply `replies_exhausted` subscription restores the account, but writes final subscription status `replies_exhausted`, with PostgreSQL expression `auto_reply_enabled = (status = 'active')`.
  - An expired `active` subscription or invalid expiry timestamp cannot restore a suspended account.
  - A merely pending future subscription without valid historical end cannot invent an approved retention entitlement.
- Source and tests have not yet exercised PostgreSQL as a real hosted commercial LOGIN, physical environment, or actual merchant client HTTP session. The SQL mutation sequence above is **source-derived with synthetic query recorder**, **not** accepted as direct SQL/HTTP evidence.
- [Final quality run **#42750819480**](https://github.com/nora953/fawri-production-source/actions/runs/42750819480) is **pending** at initial evidence authoring: confirm exact all-four job conclusions separately and add acceptance only after success.

## Boundary and remaining P0 work

No billing webhook/payment settlement was mocked as an entitlement; no pending trial converted to active, no suspended merchant manually unlocked. Source rule remains consistent with the authorized paid plan-cycle path that marks successfully renewed subscriptions `active`. The code change does not answer which subscription financial events are settled with a real gateway; that remains a separately blocked external/provider requirement.

This fixes **one source-level privilege-restoration hazard**. `P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX`, full tenant/identity hosted SQL+HTTP and owner release signoff remain OPEN/BLOCKED until independently accepted real evidence. `P0-RETENTION-PRIVILEGED-DELETION-POLICY` remains OPEN; no user-approved retention durations/deletion-reader matrix or waiver can be inferred. Historical 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED among 45 known rows = 64.4% *source row count only*, not global release readiness. PR #550 **DRAFT**, launch **NO-GO**, no merge/hosted DB changes/deploy.
