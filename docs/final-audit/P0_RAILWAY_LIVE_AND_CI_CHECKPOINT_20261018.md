# P0 — Railway live configuration and CI verification (2026-10-18)

## Scope and evidence

Read-only connected Railway `describe_service` and `list_deployments` against project `f1f544d0-19ae-448d-95c3-ea682af98a10`, environment `e3f66140-5fff-472b-ad63-1c16de59a911`, service `8acd3301-0af6-49c0-a457-84a0ed17e18c` (`fawri-web`). GitHub `fetch_commit_workflow_runs` against PR #550 head `ac639a0a7ad67bb54e881168e2d42b819d413d21`.

## Verified observations

- Railway service `live`, no staged patch, no staged service changes; `source.repo=nora953/fawri-production-source`, `source.branch=main`, `source.checkSuites=false`.
- Latest Railway deployment `11f22954-446b-49ef-adc6-38aca7c08bff` SUCCESS, created 2026-10-10T22:22:49.599Z, source commit `d38d29229bed0f9575a98e7026e7819fe363bfd4`. This is NOT PR #550 code.
- One configured `sfo` replica; no Railway-mounted volumes; healthcheck path `/ops/readiness`. These facts do not prove external object storage availability or endpoint readiness status.
- Railway lists environment variable NAMES including `DATABASE_URL` and `FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE`; secret values are not disclosed. Actual PostgreSQL session principal is NOT VERIFIED.
- GitHub Actions connector returned 40 pull-request-triggered workflow runs for PR #550 head `ac639a0a7ad67bb54e881168e2d42b819d413d21`: **40 SUCCESS, 0 non-success** in the returned page. This does not prove hosted acceptance or all historical runs.
- Neon `list_projects` connector invocation returned `Tool list_projects not found`; no direct SQL checks performed in this batch.

## Remaining P0 release gates

1. Recover isolated Neon branch SQL access; verify branch ID `br-snowy-voice-b1bovtwi`, database identity, migration journal/hash lineage, and role grants before mutations.
2. Test migration 0028–0033 in sequence on isolated disposable branch with explicitly reviewed execution plan; never bypass localhost-only smoke migration safety guard.
3. Prove restricted actual Railway runtime identity, no BYPASSRLS, no privileged SET-reachable role, and exact least-privilege capability EXECUTE grants.
4. Verify hosted RLS and signed provider callback, replay, and Meta ingress acceptance before any production deploy/merge.
5. Review whether enabling `checkSuites` should be part of controlled deployment hardening; no settings changed.

No code, production DB, staging DB, Railway deployment or secret was changed. P0 **NO-GO**; completion percentage unmeasured. This checkpoint is documentary evidence, not a new test pass.
