# P0 continuation: role reachability and Meta capability owner acceptance

## Runtime role reachability — PASS

Source `0c7c03abe889d65ba11317f66dbfa6c24ffe81c6`, Draft #550. Before repair, readiness checked current/session role attributes and reachable table ownership, but missed SET-reachable privileged roles that owned none of the protected tables. The added mocked catalog regression failed with missing expected rejection (8 PASS / 1 FAIL). It passed after repair (9 PASS / 0 FAIL); this is the unit baseline, not an assertion of an unexecuted PostgreSQL baseline.

The readiness query now uses the session principal's actual catalog SET eligibility for SUPERUSER/BYPASSRLS roles. Existing current/session/ownership checks retain their precedence; a new remaining privileged path raises `PRODUCTION_DATABASE_PRIVILEGED_ROLE_REACHABLE`. No grants, migrations or policies changed.

Actual isolated PostgreSQL tests prove direct and indirect BYPASSRLS activation is possible while both direct role flags and protected-table ownership are safe, and reject readiness before activation. `row_security_active` on the global receipt inbox changes from true to false after activating the synthetic role. INHERIT TRUE / SET FALSE remains safe, accepts readiness and has active RLS. All fixture memberships are rolled back. RLS suite28 PASS.

Isolated [38779466489](https://github.com/nora953/fawri-production-source/actions/runs/38779466489), job116575601617:332 PASS /0 FAIL /0 SKIP,55unique files/57invocations including parent/repeated-runtime counts. All25 observed workflows SUCCESS. Foundation38779466260/job116575597185 SUCCESS. TypeScript no-emit PASS. Full restore34migrations/95tables/45policies/9functions; seed and verification fingerprint388515b2f9bd94c03cded652f5f39a5414fb1f6950f80f2521d033c237392035. Machine evidence: `evidence/P0_REACHABLE_PRIVILEGED_ROLE_RESULTS_20261015.json`.

## Meta restricted capability owner — PASS

Source `e61dd80af7fbd87273b2e0f6be6baabc7d13ac89` adds two SQL capability integration cases. The function and merchant_channels table are assigned to the same temporary NOSUPERUSER/NOBYPASSRLS role, catalog flags are asserted, and the ordinary runtime calls the original resolver. With no FORCE RLS, only the requested synthetic mappings are returned while ordinary runtime table reads remain empty. With FORCE RLS, row_security=off must raise42501. Both ownership and FORCE flags are transactionally rolled back, followed by a successful original resolver call. These cases certify bounded SQL behavior, not complete HTTP/worker behavior under this alternate owner or hosted configuration.

Actual isolated38780417675/job116578852357 SUCCESS:334 PASS /0 FAIL /0 SKIP,55unique/57invocations. Meta bounded resolver10PASS includes both new owner cases; RLS28PASS retained. All25 observed workflows SUCCESS. Merge checkout prefix458778f; full restore unchanged34migrations/95tables/45policies/9functions and matching fingerprint. Local syntax and whitespace checks PASS. No production code changes in this second batch. Machine evidence: evidence/P0_META_CAPABILITY_OWNER_RESULTS_20261015.json.

## Remaining gates

Hosted function ownership/RLS/EXECUTE setup, deployment protection/storage and actual hosted acceptance remain unverified. Retention duration/privileged deletion and arbitrary missing-order ownership repair require defined policy. Provider mapping mutations after discovery/admission remain NOT RUN as recorded in the earlier handoff; do not claim existing pre-handler mismatch tests cover them. No main merge, deployment, hosted migration/grant, real payment or secret changes performed. Historical P0 85/15 is unmeasured; release NO-GO.
