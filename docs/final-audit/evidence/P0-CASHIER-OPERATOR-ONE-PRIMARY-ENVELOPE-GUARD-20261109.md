# P0 CASHIER-SYNC-SEQUENCE-001 — operator outbox rejects ambiguous financial operation groups

**Date:** 2026-11-09. **Source commit tested:** [040a762594b822c1603dd1d49df157f0a7b2cf0c](https://github.com/nora953/fawri-production-source/commit/040a762594b822c1603dd1d49df157f0a7b2cf0c).

## Real source defect and bounded correction

The active operator outbox's `operationKind(envelopes)` classified a group by searching for **any** return, void, or sale marker. If the same operation ID had multiple incompatible financial anchors (e.g., sale append plus return append, sale append plus sale void, duplicate sale, or an unknown extra primary event), a route could be selected despite the contradictory local group. The server's separate validators cannot substitute for preserving local intent before network submission.

The code now requires **exactly one** non-inventory primary envelope: `sale/append`, `sale/void` or `return/append`. All companion `inventory_movement` envelopes must have `operation=append`. An inventory-only group, multiple primary events, unsupported entity or incompatible operation returns `skip`. The already-existing **entire-batch preflight** rejects `skip` as `CASHIER_OPERATOR_UNSUPPORTED_OPERATION` before any network post and before ACK/deleting local records. This does not convert movement-only inventory adjustments into a sale, reset sequence, activate v2, or remove stored envelopes.

## Exact evidence

- [Targeted outbox contract + executable real-function test run **#42695333590**](https://github.com/nora953/fawri-production-source/actions/runs/42695333590), job **129425553727**: **COMPLETED SUCCESS**, **32/32 tests**. The added runtime-derived tests execute the TypeScript production `operationKind` through TypeScript compiler transpilation, prove normal sale/return/void with valid inventory movements, and reject mixed/duplicated financial anchors, unknown entities, unsupported movement operations, return void, and movement-only groups.
- Source change: [`e6b628a1`](https://github.com/nora953/fawri-production-source/commit/e6b628a1cefb0296db5f6835522708df0c9688c4); tests: [`040a7625`](https://github.com/nora953/fawri-production-source/commit/040a762594b822c1603dd1d49df157f0a7b2cf0c), `artifacts/fawri/tests/cashier-operator-outbox-boundary-behavior.test.mjs`. These extend previously accepted 1001-lookahead, merchant/station/staff/device binding and server-complete-ACK guards rather than rerunning the full monthly audit.
- [Real Chromium + IndexedDB browser #42695334228](https://github.com/nora953/fawri-production-source/actions/runs/42695334228) and [full build/typecheck/quality #42695334247](https://github.com/nora953/fawri-production-source/actions/runs/42695334247): **PENDING** when this document was authored. Do not count these as accepted until GitHub reports exact green status; use an addendum with verified outcomes.

## Explicit remaining barriers

CASHIER-SYNC-SEQUENCE-001 remains **OPEN**: v2 movement-only compatibility decision is not approved, independent original device stream provenance, concurrent replay/restore and physical device acceptance remain incomplete. Payment-provider real settlement, Meta/KMS, hosted roles/backup/deploy are separately **EXTERNAL BLOCKED**; user explicitly instructed to sequence past these external setup dependencies **after notification**, not to waive launch safety.

No P0 row closed, no provider or commercial SQL changed, no merge/deploy. Historical 29/45 known-source CLOSED_SOURCE ratio **64.4%**, which is not global release readiness. PR #550 draft and launch **NO-GO**.
