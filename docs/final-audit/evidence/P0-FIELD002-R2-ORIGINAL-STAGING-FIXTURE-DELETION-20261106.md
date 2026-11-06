# FIELD002-R2 — original staging-runtime test fixture deletion (2026-11-06)

## Owner authorization and bounded target

The product owner explicitly approved deleting experimental notifications on Neon in this conversation, following the earlier SELECT-only checkpoint. This authorization was used exclusively to delete the 28 previously classified precommercial test notifications from Neon staging project `round-fire-18493605`, non-default/non-primary branch `br-falling-dust-b1km4gix` (`staging-runtime`), database `neondb`. Branch metadata was checked immediately before execution; branch state `ready`, `primary=false`, `default=false`. No production/default branch was targeted.

## Fresh preflight and execution

Read-only schema inspection confirmed expected notification columns. Preflight SQL confirmed 28 total notifications, one distinct merchant scope, one distinct account scope, 15 missing both source references, 13 complete source pairs, no partial references, no invalid audience/scope, no unexpected type, no invalid `variables` object, no future-dated record (as of 2026-11-06 UTC), and no explicit expiry. Type counts were:

| Type | Count | Both source references missing |
| --- | ---: | ---: |
| inspection_session_request | 11 | 0 |
| subscription_balance_purchase | 9 | 9 |
| subscription_emergency_activated | 2 | 2 |
| subscription_expired | 1 | 0 |
| subscription_expiry_reminder | 1 | 1 |
| subscription_plan_event | 3 | 3 |
| support_reply_reminder | 1 | 0 |
| Total | **28** | **15** |

Independent catalog queries confirmed zero incoming foreign keys targeting notifications and zero user-defined triggers on the table.

An atomic PostgreSQL `DO` statement ran against this explicitly pinned Neon branch and database; it acquired `ACCESS EXCLUSIVE` on `public.notifications` inside the statement's transaction, revalidated all counts, types, scope constraints, and dependency counts under the lock, and raised an exception to roll back if any guard failed. Only after satisfying all predicates did it execute `DELETE FROM public.notifications`, with a required affected row count of exactly 28. The SQL action returned successfully, without an exception.

Independent post-delete SELECT on the same pinned branch and database returned:

```json
{"remaining_notifications":"0","remaining_unlinked":"0","remaining_linked":"0"}
```

No raw record IDs, payload values, merchant identities, email addresses or credentials were exported. No other tables, RLS, roles, provider integrations, GitHub source code, application deployment, or Neon default/production branch were changed in this step.

## Acceptance boundary

**ACCEPTED:** The exact previously inventoried 28-row legacy test-notification cohort was removed from the original `staging-runtime` branch and zero remaining rows verified. The previously approved isolated rehearsal clone was independently cleaned earlier.

**NOT YET ACCEPTED:** This deletion does not prove future commercial import/restore/deployment paths will exclude historical test fixtures; source migration guards cannot independently certify external/manual restores. The original hosted `public.notifications` table was previously measured `RLS=false`, zero policies, and three non-superuser login roles with SELECT permission; this is a distinct hosted privacy prerequisite and was not changed here. The parent eight-table role/privacy gate and migration 0052 therefore remain unresolved. Do not represent a zero-row table as proof of live cross-tenant isolation.

FIELD002-R2 remains OPEN pending commercial release/import/restore exclusion evidence; FIELD002 overall OPEN; known P0 counts remain 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED, overall percentage not certified; PR #550 draft/unmerged; release NO-GO.

Referenced prior SELECT-only evidence: `P0-FIELD002-R2-ORIGINAL-STAGING-READONLY-20261106.md`. This checkpoint supersedes its original staging fixture-present finding **only with regard to row disposition**, not its independent RLS finding.
