# Fawri final audit — issue and decision ledger

Issues are not automatically defects. Classify as DEFECT, PROOF_GAP, EXTERNAL_DEPENDENCY, or PROCESS.

| ID | Class | State | Finding / next proof |
| --- | --- | --- | --- |
| FA-I-001 | PROOF_GAP | OPEN | Direct Neon connector returned tool-not-found errors. Need non-secret read-only DB role/readiness evidence before FA-004 PASS. Do not infer database is absent. |
| FA-I-002 | PROCESS | OPEN | GitHub branches page 1 has 100 results; full branch pagination and comparison required in FA-001. |
| FA-I-003 | PROCESS | OPEN | [Draft PR #476](https://github.com/nora953/fawri-production-source/pull/476) awaits review and evidence; not part of core freeze automatically. |
| FA-I-004 | PROOF_GAP | OPEN | Reported Claude offline cashier integration concern not supplied verbatim. Request precise reproduction/code path before reopening existing cashier tests. |
| FA-I-005 | EXTERNAL_DEPENDENCY | OPEN | Production provider activation, backups/PITR, durable media storage and release gates tracked in [release blockers](../FAWRI_RELEASE_BLOCKERS.md). |

## Reopening a closed audit
Record exact commit/config delta or reproducible failure, affected components, minimal necessary tests, and closure evidence. No broad restart.

## Decisions
- 2026-10-10: freeze new features; stage-by-stage final audit; visual QA last.
- 2026-10-10: GitHub documents are continuity source; conversation memory is supplementary.
- 2026-10-10: Railway staging already exists; no duplicate environment creation.
