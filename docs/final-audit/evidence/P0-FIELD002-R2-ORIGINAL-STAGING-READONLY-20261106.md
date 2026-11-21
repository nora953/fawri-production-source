# FIELD002-R2 — original staging-runtime SELECT-only inspection (2026-11-06)

## Authorization and exact scope

The product owner expressly authorized **SELECT-only** inspection of the original Neon `staging-runtime` branch, not deletion or modification. This checkpoint records the live results, not a migration or cleanup. No SQL mutations, grants, RLS changes, imports, exports, background jobs, data restoration, deploy, or GitHub merge were run in Neon.

Neon metadata was independently checked before querying:
- Project: `round-fire-18493605` (`Fawri-Staging`)
- Branch: `br-falling-dust-b1km4gix`, named `staging-runtime`
- Parent: `br-shiny-lab-b1vxj4wn`; `primary=false`, `default=false`, current state `ready`
- Database: explicitly `neondb`
- No access to the default/production branch in this inspection.

## Aggregate SQL findings — no raw row values or identifiers retrieved

| Check | Staging result |
| --- | ---: |
| Total `public.notifications` rows | **28** |
| Distinct merchant scopes | 1 |
| Distinct account scopes | 1 |
| Both source references missing | **15** |
| Both source references present | **13** |
| Exactly one source reference missing | 0 |
| Audience other than `merchant` | 0 |
| Missing merchant scope | 0 |
| Non-object `variables` JSON | 0 |
| Explicit expiry dates | 0 |
| Earliest/latest `created_at` dates (UTC) | 2026-07-29 / 2026-10-09 |

| Notification type | Total | Missing both references | Complete references |
| --- | ---: | ---: | ---: |
| `inspection_session_request` | 11 | 0 | 11 |
| `subscription_balance_purchase` | 9 | 9 | 0 |
| `subscription_emergency_activated` | 2 | 2 | 0 |
| `subscription_expired` | 1 | 0 | 1 |
| `subscription_expiry_reminder` | 1 | 1 | 0 |
| `subscription_plan_event` | 3 | 3 | 0 |
| `support_reply_reminder` | 1 | 0 | 1 |
| **Total** | **28** | **15** | **13** |

The 15 unlinked rows were screened in SQL **by counts only** against the four known subscription-notification payload type/field allowlists. Exactly **115** JSON field instances were enumerated. Unexpected keys: **0**; nested JSON: **0**; names of directly sensitive fields: **0**; email-like pattern matches: **0**; Iraqi-phone-like matches: **0**; external-URL-like matches: **0**; scalar string fields longer than 120 chars: **0**. Unlinked legacy IDs and title/body template structures: **0** mismatches.

These are heuristic checks and **do not prove** that free text anywhere in the wider 28-row cohort lacks real-person names. The previously reviewed 13 complete-reference rows include potentially free-text `admin_name`/`ticket_subject` fields; no values were read. The owner has attested the dataset was generated during precommercial testing with no actual merchants onboarded.

### Hosted database security status — separate blocker

A read-only catalog query against the actual `staging-runtime` `public.notifications` table returned:
- `relrowsecurity=false`
- `relforcerowsecurity=false`
- Number of `pg_policies` on this table: **0**
- Number of non-superuser LOGIN roles with PostgreSQL `SELECT` privilege on this table: **3** (aggregate only, not role names)
- Incoming foreign keys referencing `public.notifications`: **0**
- Non-internal/user-defined triggers on `public.notifications`: **0**

This **does not establish an actual cross-tenant read or exposure**; the application may still enforce separate authenticated tenant filtering. However, database-level RLS is **not active** for this table in the current original staging branch. API/CI tenant filtering acceptance on disposable PostgreSQL cannot be treated as proof that this hosted branch has approved row-level database isolation. Record as an independent unresolved hosted P0 privacy/RLS acceptance condition. Do not turn on RLS or change grants without dedicated migration/role/rollback review.

## Interpretation and next permitted action

1. Deleting 28 rows from the **child, nondefault isolated rehearsal clone** in the prior checkpoint had no effect on its parent `staging-runtime`. Here the parent still contains 28 rows with the same aggregate shape, but no row-ID-level equality comparison was performed. This is **not** evidence that the prior deletion failed; branches are separate.
2. Source guard at `5ae7330af8a033b2a7475de00bc51fff2683bf9f` rejects notification rows and notification-targeted migration lineage entries in the two code-based migration validators; the relevant source tests and CI passed. This cannot erase old hosted rows, prevent an external manual SQL restore, or prove a commercial deployment is correctly isolated.
3. **FIELD002-R2 remains OPEN** because the original staging legacy fixture disposition and actual future import/restore/release exclusion are not yet accepted/verified. Exact read-only inventory is now complete; do not repeat it without an environmental change.
4. Any deletion from `staging-runtime` needs a **separate explicit branch-scoped destructive authorization** and fresh guard verifying the expected 28 test records/7 types/1 merchant/15+13 reference split before an atomic change; this user authorization was for SELECT only. No deletion was performed here.
5. The hosted staging **RLS absence** is separately relevant to the parent eight-table privacy matrix. Cleaning test rows alone cannot satisfy DB privacy/RLS release acceptance.

Status remains **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED** known P0 rows, inventory incomplete and overall percentage unknown; `P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX` OPEN, migration 0052 BLOCKED, release **NO-GO**, draft PR #550 unmerged. This is a read-only hosted evidence step, not a full FIELD002 or P0 closure.
