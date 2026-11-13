# FIELD002-R2 — real PostgreSQL precommercial restore fixture-exclusion proof (2026-11-06)

## Scope and authority

This checkpoint implements and tests an explicit **optional** fail-closed post-restore check for the **disposable precommercial release-candidate rehearsal**. It does not modify Neon, prod/default branches, Railway services, application notification writers, external restore pipelines, or real merchant data.

Source commits:
- `58af902832b1fbc52e4f7f366f304f0d6b2eddf9`: `scripts/restore-postgresql.mjs` now accepts only `--field002-require-empty-notifications 1` (no false/zero bypass). The argument adds a fixed, read-only `SELECT count(*) FROM public.notifications` after the ordinary restored-record verification. Only literal `0` passes. Unexpected nonzero count, missing table or SQL error fails closed. No delete/update or implicit production permission.
- `4ecbf4b9ca5fe8c4febdbc96422465e9baf8818e`: unit safety tests cover empty=accepted, 28 synthetic legacy notifications=rejected, missing table=rejected, invalid flag value=rejected, no exposed connection password.
- `a8f33f3cf0aa4948f9475511f692a5ddbc64e016` and `4d18b836829d2618dda46fa69534558b6f929228`: `.github/workflows/backup-restore-drill.yml` now exercises **real PostgreSQL** for both negative and positive restore cases, not just mocked psql.
- `fe9d22c31887ef7c66dac31c5e3bd7b64b059736`: operational documentation distinguishes precommercial fixture elimination from real merchant data recovery.

## Exact CI result

[GitHub Actions run #42208491832 — Backup and restore drill](https://github.com/nora953/fawri-production-source/actions/runs/42208491832) on code commit `4d18b836829d2618dda46fa69534558b6f929228`: **SUCCESS**.

The actual `disposable-restore-drill` job `127861000292` completed **SUCCESS**. Its step summary specifically records:
- `Run backup and restore unit safety tests` — SUCCESS
- `Create disposable PostgreSQL source and restore targets` — SUCCESS
- `FIELD002 rejects nonempty synthetic restored notification fixtures` — SUCCESS
- `Restore and verify disposable PostgreSQL target` — SUCCESS
- `Write and scan restore evidence` — SUCCESS

The synthetic legacy notice (one record of type `subscription_plan_event`) was created **only in a GitHub Actions workflow-owned PostgreSQL 16 disposable source database**, separately backed up, and removed from the source. Restoring that synthetic legacy archive into the workflow-owned target with the new FIELD002 flag produced the expected **nonzero exit**, and the independent SELECT confirmed the fixture row existed in the restored copy. The clean backup was then successfully restored to the same disposable target with the flag and zero historic notifications; existing owner/ACL/RLS and deterministic row-consistency checks also succeeded. Neither backup dump nor any credential or notice value was uploaded as an artifact.

## Closure accounting (bounded)

**ACCEPTED SOURCE + CI:** the currently controlled restore drill can enforce precommercial notification exclusion on an explicitly flagged disposable restored copy, with positive and negative actual-PostgreSQL evidence. This is stronger than unit-only or read-only catalogue evidence.

**OPEN:** no commercial hosted recovery/import/seed topology or promotion gate has been connected to this optional mode. A future hosted backup may legitimately contain real merchant notifications; this precommercial zero-row rule must not be applied indiscriminately to merchant recovery. Before commercial launch, confirm all actual release pipelines and mandatory fail-closed fixtures policy, and verify the real source/target cutover with deployed role-safe RLS. Do not claim these tests prove deployed notification privacy or zero notifications in all external backup archives.

Prior accepted evidence: original staging and first rehearsal branch both had 28 precommercial test notifications removed and independent zero-row verification. New clean clone `br-polished-mouse-b1proel7` remains **43/53** ledger, latest migration 0042. Hosted tool safety check blocked 0043 execution; **0043–0051 not applied** in this clone, and 0052 remains BLOCKED. Original staging retains 28 ledger migrations, zero notifications, unsafe ACL defaults and zero of eight RLS table/policy pairs — not release-ready. No bypass of the hosted tool refusal.

**P0:** FIELD002 remains OPEN, parent role/privacy matrix OPEN, 0052 BLOCKED, known register 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED, no certified global completion percentage, launch NO-GO. Draft PR #550 remains unmerged.
