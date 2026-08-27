# Fawri Development Charter

Status: Authoritative development covenant for the finishing and hardening phase.

## 1. Purpose

This document defines the non-negotiable engineering rules for finishing Fawri without regressing already validated work. It is the primary process reference for all future development, integration, hardening, and release work.

## 2. Current finishing-phase principle

Fawri is no longer treated as a collection of isolated feature branches. From this point forward it is treated as one integrated PostgreSQL-authoritative system. A successful build is necessary but is not sufficient evidence of correctness.

Every change must preserve previously validated behavior across Auth, Admin, Subscription, Catalog, Inventory, Cashier/POS, Orders, Settings, Conversations, Channels, Knowledge, observability, and database authority boundaries.

## 3. Repository safety rules

- Never force-push an active integration/development branch.
- Never reset or rebase the active working branch to recover an older feature.
- Never merge an old feature branch wholesale into the active tree without first reviewing the exact diff.
- Prefer selective integration of the minimum canonical slice required.
- Use a dedicated branch created from an explicitly verified SHA for every material phase.
- Before any write, re-verify the expected base branch and SHA.
- After validation, integrate using a clean commit and fast-forward only whenever possible.
- Preserve a known-good checkpoint before every material hardening phase.
- If the active branch moved unexpectedly, stop and reassess before writing.

## 4. Replit covenant

- Do not use Replit Agent for Fawri development.
- Replit actions must be performed through explicit Shell commands supplied for manual execution.
- Do not ask for or expose passwords, PINs, tokens, credentials, secrets, or private keys in chat or logs.
- Preview startup must be fail-closed on required PostgreSQL authorities and readiness checks.
- A preview must not silently fall back to legacy/local authority when PostgreSQL authority is required.

## 5. Authority rules

- Server/PostgreSQL authority is canonical for operational state unless a documented exception explicitly says otherwise.
- Legacy/local stores must not become silent operational fallbacks after cutover.
- Tenant isolation must be enforced server-side.
- Invalid, corrupt, ambiguous, stale, expired, or cross-tenant state must fail closed.
- Runtime lifecycle states that are time-derived must reconcile deterministically.
- A frontend cache or local binding must never be treated as proof that the corresponding server authority is still valid.

## 6. Mandatory development sequence

For every material phase use this sequence:

1. Audit the current tree and relevant runtime authority.
2. Verify the exact base SHA.
3. Create an isolated branch/worktree.
4. Implement the smallest coherent change set.
5. Run focused regression tests.
6. Run package typechecks.
7. Run production builds.
8. Run database readiness/runtime consistency checks when relevant.
9. Validate in an isolated runtime when relevant.
10. Validate the real merchant/admin/browser journey.
11. Review the final diff against the base branch.
12. Collapse iterative work into a clean final commit when appropriate.
13. Fast-forward the active branch only after validation.
14. Update the current checkpoint and release blockers.

## 7. Definition of validated

A change is not considered complete merely because compilation or build succeeds.

Depending on scope, validation must include:

- regression tests,
- typecheck,
- build,
- route continuity,
- authority/environment consistency,
- migration/journal continuity,
- database readiness,
- runtime consistency,
- tenant isolation,
- browser/runtime validation,
- golden user journey validation.

## 8. Integration regression prevention

The project must maintain explicit guards for critical surfaces so features cannot silently disappear during later integration. At minimum, guards should cover:

- dashboard routes and navigation,
- Auth/Admin/Subscription authority startup contracts,
- Catalog/Variants/Inventory authority paths,
- Cashier staff/station/operator/report surfaces,
- API route mounting,
- database migrations and schema continuity,
- golden end-to-end merchant journeys.

## 9. Finishing order

The finishing program proceeds in this order unless a newly discovered critical defect requires a controlled deviation:

1. POS Global Hardening.
2. Merchant Dashboard Global Hardening.
3. Catalog / Variants / Inventory Finalization.
4. Auth / Admin / Subscription Hardening.
5. Orders / Settings / Channels / Conversations / Knowledge Hardening.
6. Database / Security / Operational Hardening.
7. Golden End-to-End Test Suite.
8. UI/UX Final Polish.
9. Release Candidate and Production Readiness.

Do not begin broad visual polish before the relevant authority/runtime behavior is proven stable.

## 10. Release discipline

Production readiness must distinguish between:

- code-complete and validated items,
- external activation prerequisites,
- provider credentials/permissions,
- live integrations that are intentionally disabled,
- unresolved release blockers.

No external provider, credential, production KMS/HSM, Meta activation, payment activation, or live-send capability may be invented or assumed.

## 11. Required permanent gates

The finishing phase must leave behind repeatable gates, not one-off manual knowledge. The target permanent gates include:

- Fawri static global consistency audit,
- PostgreSQL runtime consistency audit,
- preview fail-closed safety tests,
- cashier surface/lifecycle regression tests,
- golden merchant journey tests,
- final quality/security/supply-chain gates,
- backup/restore and observability validation where applicable.

## 12. Stop conditions

Stop development and investigate before continuing if any of these occur:

- active branch or expected SHA changed unexpectedly,
- local working tree contains unexplained modifications,
- a previously validated critical route or authority disappears,
- a required authority falls back to legacy/local state,
- cross-tenant access becomes possible,
- database readiness fails,
- static/runtime consistency reports critical or warning findings that affect the current phase,
- browser behavior contradicts validated server behavior,
- a proposed integration would overwrite recent unrelated work.

This charter remains authoritative until explicitly superseded by a newer documented charter committed to the repository.
