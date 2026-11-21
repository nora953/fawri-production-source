# FIELD002-R2 — archived Neon branch source inventory and restoration quarantine (2026-11-06)

## Scope / safety

Read-only Neon **branch metadata** enumeration only on project `round-fire-18493605` (`Fawri-Staging`), followed by read-only `get_branch` metadata confirmation for the three archived branches. No unarchive, restore, branch delete, SQL query into an archived branch, data copy, role change, Railway action, or default production SQL access.

## Observed branch graph (7 total)

| ID | Branch name | Parent | State | Default / primary |
| --- | --- | --- | --- | --- |
| `br-shiny-lab-b1vxj4wn` | `production` | — | ready | **yes / yes** |
| `br-falling-dust-b1km4gix` | `staging-runtime` | `br-shiny-lab-b1vxj4wn` | ready | no / no |
| `br-young-hill-b1x9vhlz` | `fawri-p0-field002-rehearsal-20261104` | `br-falling-dust-b1km4gix` | ready | no / no |
| `br-polished-mouse-b1proel7` | `fawri-field002-clean-staging-rehearsal-20261106` | `br-falling-dust-b1km4gix` | ready | no / no |
| `br-square-night-b1l1x9zk` | `pre-legacy-restore-backup-2026-10-09` | `br-falling-dust-b1km4gix` | **archived** | no / no |
| `br-snowy-voice-b1bovtwi` | `audit-p0-resolver-isolated-20261017` | `br-falling-dust-b1km4gix` | **archived** | no / no |
| `br-billowing-leaf-b14yamgu` | `fawri-p0-migrations-0028-0034-disposable-20261019` | `br-snowy-voice-b1bovtwi` | **archived** | no / no |

Archived creation times, UTC:
- `pre-legacy-restore-backup-2026-10-09`: 2026-10-09T01:10:56Z
- `audit-p0-resolver-isolated-20261017`: 2026-10-16T23:58:42Z
- `fawri-p0-migrations-0028-0034-disposable-20261019`: 2026-10-19T05:34:15Z

All three predate the **2026-11-06** test-notification cleanups. **Metadata does not prove how many historic notifications or whether other sensitive records are present.** They are potential *historical snapshot sources*, not a demonstrated leak or a confirmed set of dirty rows.

## Conservative source quarantine decision

Until verified otherwise, **none of these three archived staging-derived branches is eligible to become a commercial release/import/seed/restore source or to replace the default production branch.** This is a release **policy recommendation and OPEN acceptance gate**, not a Neon-enforced rule or an owner-approved deletion.

Any future attempt to source data from an archived branch needs:
1. Dedicated authorization, with noncommercial isolated read-only source inspection; no unarchiving merely to silence this audit.
2. Independent verification of whether `public.notifications` contains historical test records and review of all other precommercial fixtures, with source integrity and RLS/role checks.
3. Isolation from production and a fail-closed clone/recovery drill proving that no unapproved test fixtures can be promoted; the newly accepted `--field002-require-empty-notifications 1` gate is scoped to **disposable precommercial candidates**, not to recovery of legitimate future merchant messages.
4. A separately approved actual hosted deployment/promotion control. GitHub's loopback-only restore test does not protect direct Neon branch restore or manual external imports.

## Existing, separately supported cleanup

Original `staging-runtime`, the 2026-11-04 rehearsal and the fresh 2026-11-06 clone were each independently observed with **zero** historic notices after the owner-approved cleans/copy. The archived branch contents were **not** read or modified, and default `production` was not queried.

This inventory clarifies why **FIELD002-R2 future restore/source isolation remains OPEN** even though original staging cleanup and disposable PostgreSQL negative/positive restore tests succeeded. Parent hosted privacy/8-table RLS remains OPEN, 0052 BLOCKED, release NO-GO; known P0 register **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED**, total P0 percentage not certified.
