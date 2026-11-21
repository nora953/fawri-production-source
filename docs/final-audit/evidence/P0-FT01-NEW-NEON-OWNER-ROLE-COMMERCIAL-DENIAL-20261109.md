# FT-01 — New Neon bootstrap owner may not be any commercial application LOGIN

**Date:** 2026-11-09 Baghdad. **Exact executable source SHA** `6b785c581db122d1e5893cc83a9439e6248ed7d7`. **Result: SOURCE/CI BOUNDED ACCEPTED; actual hosted restricted accounts not created.**

## New-target-specific gap detected and fixed

The owner created independent Neon PG18 project `crimson-cherry-65705041` / branch `br-holy-waterfall-b993zglb`, database `fawri`. Its read-only preflight recorded real SQL `session_user=fawri_owner`; the previous `FIELD002_FORBIDDEN_RUNTIME_ROLE_NAMES` guarded legacy `neondb_owner` but omitted the **new** database's `fawri_owner`. Although runtime RLS would still reject any excessively privileged actual SQL session, letting the new admin username through basic configuration validation would be unsafe and waste startup time.

The production prelistener `artifacts/api-server/src/services/productionReleaseReadiness.ts` now explicitly forbids `fawri_owner` in the three independently authenticated **tenant, authentication, operator** application pools, alongside previously forbidden Neon owners and privileged identities. The configuration remains fail-closed before opening a listener. Exact regression in `artifacts/api-server/tests/production-release-readiness.test.ts`: tries new owner in each of the 3 roles and asserts `PRODUCTION_RELEASE_CONFIGURATION_INVALID` with the corresponding denial reason. Existing nonowner three-login positive configuration still passes.

## Verified exact-code CI

- [Backup and restore drill run #42529186222](https://github.com/nora953/fawri-production-source/actions/runs/42529186222): **COMPLETED SUCCESS** with both `observability-contracts` and `disposable-restore-drill`. The observability job includes `FIELD002 production startup role and RLS policy admission tests`, **PASS**, including the new owner's role denials.
- [Final quality gates #42529186319](https://github.com/nora953/fawri-production-source/actions/runs/42529186319): **COMPLETED SUCCESS** (TypeScript and build).
- Other workflows may still be pending at the time this checkpoint was written. Do not claim all-green.

**No user action at this checkpoint:** this is application source-only. No Neon SQL, migration, credential change, old staging/default modification, provider provisioning, PR merge or application deployment. Previously accepted canonical PostgreSQL18 local PG18 migration result remains 53 migrations, 97 tables, 69 enums, 82 composite FKs, 10 sampled RLS-protected tables, no role elevation; do not repeat.

**Launch dependency remaining:** The new `fawri` destination has zero user relations and no Drizzle ledger on the owner-supplied prior SELECT. Its actual direct host/endpoint identity, independent permanent restricted tenant/auth/operator LOGINs and approved grants, provider recoverability and hosted schema rollout including 0052 are **not yet verified or authorized**. Keep bootstrapping under a migration-only owner identity, then configure application pools with non-owner credentials. **FIELD002 OPEN, 0052 hosted BLOCKED, PR #550 DRAFT, commercial NO-GO.**
