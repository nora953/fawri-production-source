# FAWRI — Engineering Execution and Commercial Release Plan
Version: 1.0 | Adopted: 2026-10-24 | Status: ACTIVE ON P0 AUDIT BRANCH

## Purpose and precedence
This is a continuation and closure program, NOT a new audit. The objective is to turn the existing multi-tenant retail POS SaaS into a verifiably secure, recoverable, operable and commercially launchable product. This plan governs *how work proceeds*; it does not supersede recorded technical evidence or silently change product policies.
Read the latest branch HEAD, `docs/final-audit/P0-CLOSURE-REGISTER.md`, `docs/final-audit/evidence/P0-CLOSURE-REGISTER.json`, `docs/final-audit/PROGRESS.md`, `docs/final-audit/ISSUES.md`, and `docs/final-audit/MASTER_PLAN.md` before deciding what to do. The closure register is authoritative for P0 status. Reconcile conflicts explicitly. Never infer completion from old notes or a percentage.

## Non-negotiable execution rules
1. Continue from the latest *verified* GitHub checkpoint; do not restart or repeat accepted evidence. Work on `fix/p0-provider-receipt-order-discovery-20261015`, existing Draft PR #550; do not merge or deploy without explicit authorization.
2. Three engineering phases only: P0, P1, P2. Remain on P0 until every P0 release blocker is resolved and signed off; preparation of future-phase acceptance criteria is permitted, execution of P1/P2 is not.
3. No Railway, Neon, hosted environment, provider credential or other external-service interaction under the current GitHub-only restriction. Mark dependent evidence BLOCKED_HOSTED_VERIFICATION (or the precise recorded blocker); never invent a PASS. Any change to these restrictions requires explicit user authorization.
4. Prioritize business and security impact over commit count. Identify the *live production entrypoint*, call chain, database/transaction boundaries, failure modes, affected tenants and existing tests before modifying code. Avoid fixing unused paths while the real path remains vulnerable.
5. Prefer a bounded, reversible, smallest-safe change. Preserve valid authorized behavior, financial records, stock integrity, idempotency, device sequencing, merchant isolation and historical migrations. Never paper over a failing test by weakening assertions.
6. Every engineering batch: (a) select one open acceptance gate and define its precise pass/fail conditions; (b) inspect current evidence and actual code path; (c) implement minimal fix and positive/negative/fault regressions; (d) verify targeted and relevant broader CI, including exact commit SHA; (e) update the authoritative register/evidence and progress checkpoint; (f) report verified vs pending vs blocked, with links. No closure on source-only or static-contract tests when runtime/hosted proof is required.
7. If CI is cancelled/superseded, it is NOT a pass. Distinguish source test, browser/device, isolated PostgreSQL, HTTP actor matrix, and hosted verification. No unsupported percentage claims. If tools hang or fail, save a bounded checkpoint and report the blocker rather than looping indefinitely.
8. Communicate in Arabic with concise facts: what changed, commit, tests and evidence, unresolved risks, next exact action. Keep release NO-GO until all mandatory gates pass and an authorized release decision is recorded.

## Phase gates
### P0 — Critical safety and release blockers (CURRENT)
Complete the exhaustive actor/role/field/route inventory and tenant privacy matrix; resolve cashier sequence gaps, offline device/main-secondary/grace behavior, inventory/sale/return consistency, receipt ownership and privileged recovery policy, financial retention/deletion policy, incident review, provider payment and Meta delivery contracts, key lifecycle, hosted RLS/roles/migrations, backups/PITR/media restore, rollback/readiness and independent release signoff. Record both legitimate success and unauthorized/failure-path denial. Do not claim a full P0 denominator until inventory is complete. Status and individual blockers live in the closure register, not this prose.
### P1 — End-to-end business completeness and usability (NOT STARTED)
Accept real merchant journeys: onboarding, branch setup, isolated branch stock, staff/permissions, sales/returns, subscriptions and grace, reports, supported languages and devices, support workflows. Include end-to-end regression, accessibility and operability. No feature expansion without an approved release-critical justification.
### P2 — Performance, reliability and commercial scale (NOT STARTED)
Define an explicit capacity model: merchants, branches, cashier devices, active concurrency, peak operations/s, offline reconnect bursts, reports, data growth and tenant skew. Establish measurable p95/p99 latency, error budget, throughput, database connection/lock contention, queue lag, RPO/RTO, observability and cost ceilings BEFORE load testing. Run baseline, ramp, stress, soak, failover and recovery exercises in authorized non-production environments; tune and repeat until agreed thresholds pass. Never promise capacity for thousands of subscribers without empirical evidence.

## Release and pilot acceptance
Release requires: complete P0 inventory and all critical gates accepted; P1 merchant-journey acceptance; P2 measured capacity/recovery acceptance; independent security and operational signoff; a reproducible build/deployment manifest, monitoring/on-call, incident and rollback playbooks; and a controlled pilot with real merchant acceptance. Suggested pilot cohorts (5–10, then 25–50 merchants) are planning examples, not authorized deployments or evidence. Expand only when defined safety, financial-integrity, reliability and support thresholds hold. Default decision: **NO-GO**.

## Checkpoint and handoff protocol
After each bounded batch, write a concise GitHub checkpoint including: branch/HEAD, gate ID, changed files, exact commands/workflows and results, evidence links, decisions, blocked dependencies, next one actionable step. Prefer existing `PROGRESS.md` and gate evidence over new overlapping documents. Any new chat or agent must first read this plan and the live register, then inspect the current HEAD/PR before touching code. Memory/chat context is advisory; GitHub is the durable source of truth.

## Closure control amendment — 2026-10-27

The user approved consolidating the known P0 remainder into a finite closure queue. The authoritative queue is now in P0-CLOSURE-REGISTER.md and closurePlan in evidence/P0-CLOSURE-REGISTER.json:45 existing known rows,29 CLOSED_SOURCE,7 OPEN,9 BLOCKED; no new release gate or status change. This freezes known register scope, not completeness: completeP0Inventory remainsfalse and overallPercentage remainsnull until row-level reconciliation is accepted.

Each new engineering batch must name an existing gate, its unmet acceptance condition, the missing evidence/decision, and whether it closes the gate or completes a necessary prerequisite. Reuse accepted proofs; repeat only for changed source, a failure or a named integration gap. Do not create unused features, duplicate pairing/issuer designs or overlapping proof documents to generate activity. Newly confirmed critical additions must record evidence, justification and scope/count impact; never silently enlarge or suppress the known remainder.

Immediate execution order: reconcile current P0 actor/entrypoint/field-to-evidence gaps from existing manifests; map SEQ-R1/R2/R3 to current pairing/client/SQL evidence; then implement the identified missing acceptance condition. The previously suggested HTTP pairing test is conditional on that gap map, not an automatic next task. Policy proposals must be concrete and reviewable before a choice is requested. GitHub-only restrictions, no merge/deploy and releaseNO-GO remain in force; user agreement to closure planning approves none of the outstanding operational or record-specific policies.


## Delivery discipline — 2026-10-31

The current execution contract is `closurePlan.deliveryControl20261031` in `evidence/P0-CLOSURE-REGISTER.json`. It links the16 existing nonclosed gates to exact acceptance conditions, missing evidence, executable work and policy/physical/external dependencies. This does not change any gate status or establish inventory completeness.

Before a new test or change, identify the existing gate, unmet condition, insufficient existing evidence and expected closure delta. Batch related conditions with shared authority/fixtures; run required checks once per coherent candidate, preserving positive/negative/fault depth. Test, commit and document counts are verification metadata, not progress. A documented limitation does not automatically require a new test.

Keep active next-action pointers synchronized; preserve obsolete actions only as history. Reuse accepted C01-C04/Knowledge/SSE/order/pairing proofs. Use CI wait time for independent authorized work with bounded polling. Continue within authorization without asking for another continuation; clearly checkpoint unavailable capabilities or required decisions. Keep authoritative details in the existing register/evidence and use short references elsewhere rather than duplicating long narratives.

A batch must deliver a verified implementation/accepted condition, resolve a named inventory unknown with finite evidence classification, or prepare a concrete decision/external blocker. Source-only classification never closes a runtime or release gate. All existing GitHub-only, policy, physical-device, hosted, no merge/deploy and NO-GO restrictions remain unchanged.
