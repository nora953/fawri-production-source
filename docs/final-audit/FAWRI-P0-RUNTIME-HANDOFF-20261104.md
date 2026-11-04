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

## 2026-11-04 — blocker-first execution reset (source register reconciliation)

Authoritative register `evidence/P0-CLOSURE-REGISTER.json` reports 29 CLOSED_SOURCE, 7 OPEN and 9 BLOCKED. The inventory explicitly states `completeP0Inventory:false` and `overallPercentage:null`: **29/45 is a bounded known-gate ratio, not total P0 completion**. No gate status changed in this checkpoint.

### OPEN — execute/reconcile before claiming closure
1. **P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX** — Eight-table/86-column source enumeration created; full P0 actor/field/producer/consumer acceptance still incomplete. Five selected work areas are linked to existing gates, not five new release requirements. Next acceptance: Review the concrete F004-R1 conditional offline draft migration contract in evidence/P0-FIELD004-AUTHORITY-MAP-20261025.json#decisionProposal20261031. Recommended: support source-bound legacy identity/state/time normalization for reviewed compatibility storage only, with no automatic runtime continuation, no guessed TTL and whole-plan refusal on ambiguity. Implement bounded offline planner validation only after this specified contract is selected; no source/configuration evidence, actual import, hosted, retention, SEQ or new runtime authority is authorized by that choice. If deferred, preserve current fail-closed behavior and continue independent authorized work.
2. **CASHIER-SYNC-SEQUENCE-001** — Real operator HTTP and restricted SQL confirm accept1/3 then late2 rejection409 without financial mutation. Native hold/reload and actual post-commit attribution repair/replay are bounded accepted layers, not an adopted all-operation recovery/checkpoint/history contract. SEQ-R1/R2/R3 remain open. Next acceptance: Resolve the SEQ-R3 admission/compatibility boundary using existing merchant pairing and actual local queue/server history paths in the existing recovery contract. Prepare one concrete reviewable specification for new versus known/restored devices; explicitly identify required trusted evidence and exceptional owner recovery. Keep public v2 unsupported until that contract and its integration acceptance are met. Do not create another disconnected issuer or rerun accepted internal proof.
3. **P0-RESIDUAL-MERCHANT-PRIVACY-001/http** — Strict SQL/services and eight-table zero-foreign diagnostic do not cover full HTTP actor matrix. Next acceptance: Review the concrete F004-R1 conditional offline draft migration contract in evidence/P0-FIELD004-AUTHORITY-MAP-20261025.json#decisionProposal20261031. Recommended: support source-bound legacy identity/state/time normalization for reviewed compatibility storage only, with no automatic runtime continuation, no guessed TTL and whole-plan refusal on ambiguity. Implement bounded offline planner validation only after this specified contract is selected; no source/configuration evidence, actual import, hosted, retention, SEQ or new runtime authority is authorized by that choice. If deferred, preserve current fail-closed behavior and continue independent authorized work.
4. **P0-OFFLINE-DEVICE-ACCEPTANCE** — Native8 and real HTTP/SQL proof retained; synthetic native ACK and untrusted OS/profile are explicit limits. Next acceptance: Name the missing physical profile/case and expected observation. Mark execution blocked when the device/environment is unavailable; do not regenerate synthetic device proofs.
5. **P0-RECEIPT-OWNERSHIP-POLICY** — Fixture mapping restoration is not a supported administrative repair workflow; product/operator decision and acceptance needed. Next acceptance: Present one source-grounded ownership/recovery proposal with approval scope and failure cases; no repair writes or new authority before that decision.
6. **P0-RETENTION-PRIVILEGED-DELETION-POLICY** — Existing retention/deletion service proofs do not approve duration, privileged access or every field. Next acceptance: Use the consolidated current class/field/reader decision packet before selecting any retention implementation. Per-class purpose, post-deletion readers, trigger/duration, holds/release and final disposition remain unapproved; selected behavior then needs bounded expiry/financial/replay proof. Continue independent known F004-R1 work now; no choice inferred from continuation.
7. **P0-INCIDENT-REVIEW** — Historical healthy samples do not establish incident clearance or uncompromised credentials. No rotation performed. Next acceptance: List required original logs/identity/time windows and responsible review, preserving GitHub-only boundary. No broad rescan to simulate incident clearance.

### BLOCKED — collect external evidence / authorization; no synthetic substitutes
1. **P0-ACCESS-HOSTED-IDENTITY** — No new hosted inspection performed. Historical hosted evidence does not accept current source. Next acceptance: After authorization, collect exact revision/DB/login/pooling evidence read-only; refuse to accept based on environment-variable names alone.
2. **P0-ACCESS-HOSTED-ROLLOUT** — No new hosted inspection performed. Historical hosted evidence does not accept current source. Next acceptance: Once identity is verified and scope authorized, compare actual catalog and full journal to accepted source; record discrepancies before proposing writes.
3. **P0-OFFLINE-KEY-RELEASE** — No key provisioning, secret change or hosted rollout authorized. Next acceptance: Collect approved key-ID/public-key/release-manifest parity, then rehearse authorized rotation and rollback; do not substitute generated fixture keys.
4. **P0-HOSTED-PROVIDER-PAYMENT** — Fake signed gateway only; live integration excluded by task boundaries. Next acceptance: After authorization, execute only the missing provider contract cases and retain redacted original evidence; fake fixtures remain labeled fake.
5. **P0-HOSTED-PROVIDER-META** — Injected Graph/AI proof is retained; hosted provider checks not performed. Next acceptance: Execute a bounded approved real-provider scenario set and reconcile delivery/failure outputs; do not activate planned channels.
6. **P0-HOSTED-STORAGE-DELETION** — Local filesystem deletion is not object-store acceptance; live services untouched. Next acceptance: After authorization, establish actual copy/storage inventory before mutation, then test only the approved deletion/access path.
7. **P0-HOSTED-RECOVERY** — Owned dump/restore proof retained; operational recovery evidence/signoff missing. Next acceptance: Inventory dependencies read-only under approved scope; define measurable targets before the separately authorized recovery rehearsal.
8. **P0-HOSTED-BRANCH-DEPLOYMENT** — Last read-only observation was old main/d38d2922; current deployment not inspected or authorized. Next acceptance: Verify current artifact identity first; record parity gap and concrete reviewed rollout/rollback before requesting any change.
9. **P0-RELEASE-SIGNOFF** — NO-GO. Complete requirement/field/actor inventory and every operational blocker must be resolved; no merge/deploy authorization. Next acceptance: Review the complete requirement/evidence register only after blockers are satisfied; retain NO-GO until an authorized decision.

### Execution order and hard stop rules
1. **SEQ-R3 / cashier device admission**: inspect existing pairing, local queue and recovery contract; produce one testable compatibility decision, then implement only approved behavior. No unrelated tests.
2. **Receipt ownership recovery and privacy FIELD002–FIELD005**: close specific source/actor/field gaps with exact positive/negative SQL+HTTP evidence; avoid replaying accepted bounded tests.
3. **Retention and incident decision packets**: request explicit product/security decisions for policy values; never invent retention periods or incident clearance.
4. **Disposable runtime and hosted parity**: inspect read-only identity, actual revision, database roles, grants, RLS, schema and deployment; never conflate isolated CI with hosted proof.
5. **Provider/device/recovery release evidence**: execute only approved bounded real-environment scenarios; record missing hardware or provider access as BLOCKED.
6. **Signoff last**: no merge/deploy and NO-GO until every blocker has accepted evidence.

### Last verified bounded regression
`db117422c6bd2c6b693e721e9f818f1597665f0f`, GitHub Actions management HTTP matrix `41760160353`: 120 passed / 0 failed / 0 skipped. This does not close FIELD003 or the eight-table matrix.
