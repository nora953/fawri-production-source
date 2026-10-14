# SEQ-393 — Emergency CI blocked by shell suite allowlist

Actual CI evidence: run https://github.com/nora953/fawri-production-source/actions/runs/38507827684, job 115669285530, PR merge SHA d027aec3763998389dc5fee901da3ae62b274b7a. Guard tests 15 PASS/0 FAIL, dependency install and API build PASS. Emergency suite step failed immediately with `Unsupported audit suite` exit 2; **no PostgreSQL container was started, no migrations and no emergency HTTP assertions executed**. Always-run cleanup step succeeded. Job conclusion cancelled due to subsequent PR push/concurrency; retain failed-step evidence, do not relabel as product failure.

Root cause: `scripts/run-isolated-postgres-audit.sh` has an independent shell case allowlist that lacked `emergency`, despite the JS suite mapping added at SEQ-387.

Audit-harness-only changes: commit `2f1828db643bb5f038a6485b310d809315466e44` adds `emergency` to shell allowlist. Commit `b4e94261f253fbe515992cf1ba058ee3e4567aac` adds shell runner to emergency workflow PR paths so changes retrigger targeted CI. No app, SQL schema or original behavior fix.

Next: inspect fresh emergency CI run after these commits. Verify 28 migrations, TAP assertions, isolation attestation and cleanup before crediting any result. Release BLOCKED, overall progress NOT_YET_MEASURABLE.
