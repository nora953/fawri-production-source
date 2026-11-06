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
