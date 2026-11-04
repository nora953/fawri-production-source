# FAWRI P0 — verified handoff 2026-11-04

This is a continuation checkpoint, not a release approval or a new audit.

## Scope and protection
Repository: nora953/fawri-production-source
Working branch: fix/p0-provider-receipt-order-discovery-20261015
Draft PR: #550
Do not modify the original Railway production service. All runtime testing here uses isolated Railway project fawri-p0-isolated-validation (7361e1f8-a638-411e-8260-2fcfc713060f), environment staging (7d5b9ed0-3b4c-47ef-aa75-0a3f967f7fdb), service fawri-p0-api (830acd44-5631-486e-9d97-1c1ac6ce6935).

## Verified observations
- Source-closed known requirements: 29/45 (64.4%); 7 open; 9 blocked. This is NOT certified release readiness. Release remains NO-GO.
- Commit 6a15e4e introduced startup-stage logging. Commit 2ff9580e split provider initialization and application import.
- Commit aa80c97afece0b74b7a313225e9e13965fcea4e4 sequentialized application module imports, logging only sanitized target. Deployment 501f4b2e-4fd3-4cc1-a496-da252c071baa CRASHED; importTarget=app.
- Commit 878f2d31aef1122a4df7c20ffbb642435e800061 logs exception class. Deployment 3c324e00-0a89-4229-a82a-412e7d6f35f4 CRASHED; importTarget=app, errorType=Error, code=RUNTIME_PROVIDER_INITIALIZATION_FAILED.
- Build succeeded. Crash is in import('./app') or a transitive import / module evaluation. This does not prove that the bug is in app.ts itself or that missing DATABASE_URL is the cause.
- Staging vars observed: FAWRI_DEPLOYMENT_MODE=staging, FAWRI_DISABLE_JOB_WORKERS=1, FAWRI_META_CUTOVER_READY=0; no DATABASE_URL reported.
- No new P0 requirement was closed by these diagnostic commits.

## Next bounded action
1. Reproduce the app module import failure in a controlled local/isolated runtime with a safe exception stack, or isolate transitive imports via a deterministic test; do not keep redeploying speculative diagnostics.
2. Determine and fix the exact root cause; add a regression test.
3. Rebuild and run staging readiness checks, retaining deployment IDs, logs and test evidence.
4. Update the authoritative P0 closure register only when acceptance evidence exists. Never count diagnostics as closures.

## Communication contract
Every progress response must state concrete changes, test outcome, new closures, source-closed count 29/45 unless verified changed, and NO-GO/GO. Do not ask the user to repeat prior history.


## 2026-11-04 — Current active P0 closure lane: residual merchant HTTP privacy

**This section supersedes the previous 'Next bounded action' for the active conversation lane; Railway runtime diagnostics above remain a separate unresolved lane.**

- Canonical repository: `nora953/fawri-production-source`; working branch: `fix/p0-provider-receipt-order-discovery-20261015`; draft PR #550.
- Authoritative register: `docs/final-audit/evidence/P0-CLOSURE-REGISTER.json`: 45 known gates, 29 CLOSED_SOURCE, 7 OPEN, 9 BLOCKED, source closure 64.4%, overall P0 percentage uncertified, release NO-GO.
- Selected OPEN gate: `P0-RESIDUAL-MERCHANT-PRIVACY-001/http` (complete owner/assistant/merchant HTTP authorization and field matrix for all eight residual tables).
- Execution checklist committed at `8771d525ba321c11739abf6e3874a8583e0e1786`: `docs/final-audit/P0-RESIDUAL-HTTP-PRIVACY-CLOSURE-EXECUTION-20261104.md`.
- Commit `e127daee58239682bca1bee3c25131ae365c89b3` added forged tenant headers + foreign query hints regression to `artifacts/api-server/tests/merchant-notification-privacy-http-postgres.integration.test.mjs`. GitHub Actions notification privacy run `41756073566` succeeded; focused suite 9 passed, 0 failed; new case specifically PASS.
- Commit `d3e4d71b789de9260a9781770b10f6c96500b467` added forged owner role/permission headers regression to `artifacts/api-server/tests/merchant-management-privacy-http-postgres.integration.test.mjs`. GitHub Actions management privacy run `41757360965`, job `126336513848`, succeeded. Job log confirmed 80+15+6+14+1+1 = **117 passed, zero failed** across six suites; focused merchant management suite 15 passed, 0 failed; new forged-owner-header case PASS. Isolated disposable PostgreSQL and cleanup succeeded.
- Eight residual tables in source inventory `docs/final-audit/evidence/P0-RESIDUAL-FIELD-INVENTORY-20261024.json`: `audit_events`, `manual_reply_requests`, `merchant_admin_notes`, `merchant_channel_overrides`, `merchant_deletion_requests`, `notifications`, `order_drafts`, `processed_channel_events` (86 columns total). Four review cells remain OPEN: FIELD002 notifications, FIELD003 audit_events, FIELD004 order_drafts/processed_channel_events, FIELD005 deletion/retention policy.
- Reuse historical accepted manual-conversation HTTP proof `docs/final-audit/evidence/P0-CONVERSATION-HTTP-PRIVACY-20261024.json` (10 TAP passed) rather than duplicating it. Existing management and notification proof is bounded, **not** a full eight-table HTTP actor/field/alternate-path acceptance. No new application vulnerability confirmed by the two regressions; no source gate closed.

### Next actions for new conversation / Work
1. Fetch current GitHub HEAD, this handoff, canonical closure register, and execution checklist. Do not reset the audit or assume this handoff's HEAD is still latest.
2. Check `41757360932` isolated PostgreSQL engineering audit separately; it was still in progress at last check and is not required to relabel successful focused tests.
3. Build a finite evidence-linked table × HTTP route × actor × field × alternate-path coverage matrix. Reconcile current source and accepted tests before writing more cases; target genuine missing cells in `audit_events`, `order_drafts`, `processed_channel_events` and field policy boundaries, without reopening already accepted manual reply proof.
4. Add and execute focused missing privacy regressions in disposable isolated PostgreSQL CI. Fix any actual bug and rerun; retain exact run IDs, job logs and source SHA.
5. Preserve FIELD002–FIELD005 explicit policy/hosted dependencies. Mark gate CLOSED_SOURCE only if its complete source acceptance conditions are met. Keep NO-GO until all P0 release gates are accepted.

### Recovery instruction
Continue FAWRI P0 from this verified GitHub handoff, not from conversation history. Work on the selected residual merchant HTTP privacy gate. Report actual code commits and CI evidence; 29/45=64.4% until canonical register legitimately changes; no premature GO.
