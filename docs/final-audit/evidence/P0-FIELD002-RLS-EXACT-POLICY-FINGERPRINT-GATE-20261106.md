# FIELD002 — exact eight-table hosted RLS policy fingerprint admission (2026-11-06)

## Why this source repair is necessary

The previous `createPostgresAuthorityReadinessCheck` counted a critical `public` table as ready if `relrowsecurity=true` and **any** row in `pg_policy` existed. This can falsely admit a deliberately or accidentally replaced policy such as `USING (true) WITH CHECK (true)` even when the selected runtime principal itself has no `BYPASSRLS`.

**New source control:** `artifacts/api-server/src/observability/runtime.ts` (commit `1fcdd39863494abbd02ed7ce519f475052af8dc5`) pins eight expected policy digests from the previously independently tested hosted rehearsal clone. The runtime readiness query now requires **exactly one policy** on every critical table, active RLS, and an exact SHA-256 digest of the actual `pg_policy` name/command/permissiveness/roles and parsed `USING` / `WITH CHECK` expressions. Any missing, additional or altered policy cannot increment the expected 8/8 count. The normal least-privilege connection-role restrictions (no SUPERUSER/BYPASSRLS/CREATEROLE or inherited/SET privileged roles, no trusted-function EXECUTE) remain in place. The stricter table check is required only when `FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE` is explicitly configured for a hosted tenant runtime, as before.

**Attestation scope:** fingerprints are intentionally tied to reviewed, PG18-generated expressions from already-migrated **old isolated clone** `br-young-hill-b1x9vhlz` at journal 0051. Future PostgreSQL engine-format drift or policy changes may fail closed and require approved hash regeneration after independent semantic review. A fingerprint is a *schema-integrity assertion*, not a replacement for real SQL and HTTP positive/negative tenant tests.

## Actual read-only hosted PostgreSQL acceptance

Executed one catalog-only SQL comparison on each explicitly pinned branch in Neon project `round-fire-18493605`, database `neondb`, using the same `concat(... E'\\x1f' ...)` and `sha256(convert_to(...,'UTF8'))` expression as the runtime source. No change to roles, policies, grants, rows, migrations, or application:

| Branch | Migration count (previously verified) | Exact fingerprints accepted |
| --- | ---: | ---: |
| `br-young-hill-b1x9vhlz` (previously migrated/accepted isolated rehearsal) | 52/53 | **8/8** |
| `br-polished-mouse-b1proel7` (new clean clone; stopped after 0042) | 43/53 | **0/8** |
| `br-falling-dust-b1km4gix` (original `staging-runtime`) | 28/53 | **0/8** |

**Negative control without DB mutation:** on the already migrated clone, replaced only the *expected digest for `notifications`* in an independent read-only query with an all-zero digest. Its exact-match count fell from **8** to **7**, while the database policies remained untouched. This demonstrates detection of a changed required digest at the aggregate acceptance boundary. It is not a live malicious-policy rollout or hosted role/HTTP regression test.

## Source regression

`artifacts/api-server/tests/observability-components.test.ts` commit `d4845304b7d3efed4e08ff6ccd7f83c9c6e7feaf` now verifies eight distinct expected tables, one 64-hex digest each, and tests the existing guarded `assertSafePostgresRuntimeRole` against 8/8 positive, missing/0/7/string-8 negative, and an unsafe BYPASSRLS role negative. GitHub CI status must be cited from **this exact commit**, not from older all-green runs; direct database comparison above is independently accepted regardless of CI queue.

## Remaining boundaries

- These are **newly accepted read-only SQL attestation results** and a source-level hardening change. Fresh CI validation of the modified runtime and tests is still required before accepting the new source change.
- The fresh clone remains at migration **0042**. Its 0043 SQL was blocked by the hosted execution tool's safety check; **no bypass or new 0043 attempt** in this batch. The original staging still lacks RLS and retains its old privileges; **no original SQL changes authorized or executed**.
- Trusted hosted login and issuer separation, own/foreign/revoked for **all eight tables**, real commercial backup/import/seed/promotion isolation, migration 0052 owner bootstrap and actual deployment parity remain unproven.
- `FIELD002` OPEN; parent merchant privacy gate OPEN; 0052 BLOCKED; known 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED; no certified overall P0 percent; launch NO-GO; PR #550 draft/unmerged.


## Exact-source CI acceptance and real 0043 schema-only preflight

**CI source SHA:** `8638575d1c8f32f2bf563ecf58cda11a490fbcd2`. The first version of the new strict gate exposed a legitimate test-fixture mismatch: the existing disposable PostgreSQL 16 mounted-observability test supplied eight synthetic `USING(false)` policies and previously expected a **ready** response based solely on their existence. With reviewed hosted-policy attestation, these intentionally *unapproved* policies must cause readiness `503`. The mounted integration fixture was corrected in `50ca4d0128d310aa073086da1ece9b9295c477be` to expect the fail-closed `503`, without changing actual runtime admission logic. `8638575d1c8f32f2bf563ecf58cda11a490fbcd2` additionally covers separate unsafe trusted-function EXECUTE variations under otherwise valid 8/8 catalog coverage.

At that exact tested source SHA, these GitHub Actions completed **SUCCESS**:
- [Observability mounted routes, run 42212333769](https://github.com/nora953/fawri-production-source/actions/runs/42212333769), including the previously failing mounted PostgreSQL test.
- [Final quality gates, run 42212333341](https://github.com/nora953/fawri-production-source/actions/runs/42212333341): full build, quality, type checks.
- [P0 notification privacy HTTP matrix, run 42212333964](https://github.com/nora953/fawri-production-source/actions/runs/42212333964).
- [Backup and restore drill, run 42212333678](https://github.com/nora953/fawri-production-source/actions/runs/42212333678).
- [Complete migration safety, run 42212333541](https://github.com/nora953/fawri-production-source/actions/runs/42212333541).

**Do not claim all GitHub Actions green:** `Cashier subscription lifecycle` failed on the exact commit, outside this FIELD002 runtime policy change. Other workflows were still in progress at this checkpoint.

**0043 bounded SQL readiness inspection on new clone `br-polished-mouse-b1proel7`:** all seven required cashier-identity tables exist, each has exactly one merchant ownership column `merchant_id`, all seven have `relrowsecurity=false` and zero preexisting RLS policies (there is no partial 0043 apply), and the referenced `public.fawri_tenant_or_audited_admin(text)` function exists. An independent SELECT found Drizzle **43** entries, final 0042 timestamp `1791936000014`, **0** notifications, and no other active application client at inspection time. This rules out these particular schema prerequisites, **not** the execution tool's safety refusal. **No retry/bypass of 0043 was performed.**

**Acceptance boundary:** the source+hosted-schema-attestation subcondition is now **ACCEPTED** with exact-source CI; full FIELD002 remains OPEN. The old clone (8/8 policy fingerprints) is not evidence that the new clone (0/8) or original staging (0/8) is ready. 0043–0051 are still unapplied on the clean clone; 0052 remains independently BLOCKED. No hosted migration, RLS/role/grant mutation, Railway deployment or PR merge was performed in this source hardening batch.
