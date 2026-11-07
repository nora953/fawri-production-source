# P0 bounded gap reconciliation — 2026-10-22

Source `43065bda4b032244016d0fc78823f5579b01deca`; reviewed branch checkpoint `accf522b0d70e9ccf7b8a73176b387b54880c2f8`. **NO-GO. New runtime cases executed:0; newly accepted P0 cases:0.** This batch publishes the previously verified acceptance and reconciles five remaining proof gaps; no product changes or new test results.

## Publication recovered

Six docs/evidence files are now on the authorized branch through commit `accf522b0d70e9ccf7b8a73176b387b54880c2f8`. Its tree `7eb997cf2130c81b4b537064eb590d0d3fc85181` exactly matches the prepared d990ee89 tree. Contents create/update succeeds with fully qualified branch `refs/heads/fix/p0-provider-receipt-order-discovery-20261015`. Ordinary names fail binding; update_ref duplicates the prefix. Do not fast-forward to orphan d990ee89: its content is already published through six sequential commits.

46/46 workflows and75/75 isolated invocations remain accepted at executable43065bda, with0 high/critical dependency advisories and2 moderate. Docs-only commits use[skip ci]; no new executable coverage is claimed.

## Reconciled queue

| Existing gate | Reviewed evidence and limit | Next proof |
| --- | --- | --- |
| Authentication SELECT privacy | Readiness inventories auth mutations, not SELECT. Dedicated tenant auth fixture has no auth grants; its10 accepted results do not test accidental sensitive table/column reads. Existing20261020 finding remains open. | Trace legitimate reads, then actual-LOGIN sensitive-column read negatives and grant/revoke readiness cases with positive signup/session journeys. |
| Cashier credential integrity | PIN/station-token/operator-session tables are outside current readiness auth/protected inventories. This does not prove live exposure, and authorized merchant cashier management must remain functional. | Trace role ownership, then restricted SQL/HTTP cross-tenant read/mutation and inherited/SET grant matrix. |
| CASHIER-OFFLINE-001 | Operator commit calls cached entitlement before local write; cache throws at/after grace without a primary exception there. Conflicts with recorded B+ free-primary policy at source level; alternate paths/native browser behavior not certified. | Trace all sale/free-basic entries; native IndexedDB primary/secondary before/at/after grace and reconnect. Preserve existing signed-identity/tamper requirements; no policy change here. |
| CASHIER-SYNC-SEQUENCE-001 | Existing exact-source SQL suite observes1→3 accepted, later2 rejected, durable[1,3]. Its3 TAP count includes parent and is not three P0 requirements; passing observation does not accept gap recovery. | Trace local non-commerce sequence consumption/outbox ordering; define gap/tombstone recovery contract before repair, then SQL+browser fault cases. |
| Complete P0 denominator | Actual UI CSV has222 unique IDs:84 TRIAGE,138 NOT_RUN, allP1. It cannot measure P0 completion. No P1 execution performed. | Preserve original IDs and create a reconciled non-UI P0 requirement/proof inventory; this five-row queue is not that complete denominator. |

Machine records, exact source anchors, required proof layers and canonical references: [P0-GITHUB-ONLY-GAP-RECONCILIATION-20261022.json](evidence/P0-GITHUB-ONLY-GAP-RECONCILIATION-20261022.json).

## Next bounded engineering task

Prioritize authentication SELECT privacy: enumerate legitimate primary-role reads of accounts/sessions/OTP/device records and sensitive columns before implementing restrictions. Then add a narrowly scoped actual-LOGIN regression on an owned disposable GitHub Actions PostgreSQL fixture. Do not relax RLS, move authentication to the tenant pool, ban legitimate management writes blindly, or rerun all75 suites merely for these docs.

Hosted deployment/runtime checks remain **BLOCKED_BY_RAILWAY**. Hosted DB checks remain NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. No Railway/Neon connectors, hosted changes, deploy/main push/merge, credential rotation or P1/P2 work. Whole-P0 percentage remains unmeasured.
