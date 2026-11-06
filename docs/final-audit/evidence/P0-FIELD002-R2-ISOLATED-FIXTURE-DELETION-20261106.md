# FIELD002-R2 — owner-authorized deletion of isolated rehearsal notifications (2026-11-06)

## Authority, scope and exact isolation

The product owner explicitly authorized deletion of old experimental notifications if they delayed FIELD002 progress, after confirming that FAWRI has not launched commercially and has onboarded no real merchants. The earlier SELECT-only authorization was superseded **for this one bounded cleanup only** by the new explicit deletion request. There is **no** permission here to delete from actual original staging, the default Neon production branch, backups, other tables, or to perform release/deployment.

Target was explicitly pinned to Neon project `round-fire-18493605`, **non-default, non-primary** branch `br-young-hill-b1x9vhlz` named `fawri-p0-field002-rehearsal-20261104`, database `neondb`. The branch's parent is `br-falling-dust-b1km4gix`. Metadata was rechecked immediately before deletion. The same 28-row fixture cohort had previously been inspected with SELECT-only queries, with no raw values exported; findings are in `P0-FIELD002-R2-READONLY-CONTENT-SENSITIVITY-20261106.md`.

## Guarded execution and observed results

Immediately before deletion, an independent query verified:

| Assertion | Expected and observed |
| --- | --- |
| Notification count | **28** |
| Distinct merchant scopes | **1** |
| Records with two absent source references | **15** |
| Records with both source references | **13** |
| Records with exactly one source reference | **0** |
| Other than merchant audience | **0** |
| Unexpected notification types | **0** |
| Rows dated after 2026-11-06 | **0** |
| Incoming foreign keys referencing `public.notifications` | **0** |

An isolated-target SQL `DO` statement took a table lock within its transaction, reread the preconditions, refused any drift via exception, then deleted exactly the 28 qualifying notifications and refused a different affected-row count. On any guard failure, PostgreSQL would roll back the entire statement. The accepted types were exactly: `inspection_session_request`, `subscription_balance_purchase`, `subscription_emergency_activated`, `subscription_expired`, `subscription_expiry_reminder`, `subscription_plan_event`, `support_reply_reminder`.

**Independent post-delete SELECT result on the same pinned isolated branch:**

```json
{"remaining_notifications":0,"remaining_missing_ref_rows":0,"remaining_linked_rows":0}
```

No code, RLS policies, roles, other tables, merchant identities, notifications on any other Neon branch, CI workflow, stored credential, provider connection, or deployment was changed in this hosted step. The complete existing notification feature remains part of the source. GitHub retains aggregate audit evidence; no individual IDs or raw records were copied to GitHub.

## Acceptance boundary and remaining gate

**Accepted:** All 28 historical experimental notification rows were removed **only** from the isolated rehearsal clone, with guard and SELECT verification. This eliminates the historical cohort within that disposable branch, not within a deployed/source-of-truth environment. Neither original staged records nor commercial production state were inspected or deleted here. The delete itself is **not** evidence of real-world tenant isolation, any future release migration/restore exclusion, or a full P0 acceptance test.

**Remaining FIELD002-R2:** Determine and execute the appropriate nonproduction fixture disposition for the actual future release path, verifying that precommercial seed/import/restore cannot repopulate historic records in production. The existing current-source generic cutover guards reject `rows.notifications`, but cannot certify all external writers/backups/release flows. The owner requested removal of test notifications, not a relaxation of privacy controls. Do not automatically purge another branch or source-of-truth database without separate branch-scoped authorization and safeguards.

**Release:** FIELD002 remains OPEN under `P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX`; R1/R3 bounded source/CI acceptance remains; R2 still OPEN for original hosted/release isolation. Known P0 counts **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED**; full denominator unverified, no certified P0 percentage; migration 0052 BLOCKED, release **NO-GO**, draft PR #550 unmerged.
