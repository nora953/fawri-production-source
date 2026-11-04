# P0 residual merchant HTTP privacy — executable closure checklist (2026-11-04)

Gate: `P0-RESIDUAL-MERCHANT-PRIVACY-001/http`
Status: OPEN. This is an execution checklist, not closure evidence or approval.

## Grounded baseline
- Canonical register: `docs/final-audit/evidence/P0-CLOSURE-REGISTER.json` (29 CLOSED_SOURCE, 7 OPEN, 9 BLOCKED; 45 known rows).
- Existing bounded HTTP proof: `docs/final-audit/evidence/P0-RESIDUAL-HTTP-PRIVACY-20261024.json`. Management 11 passing TAP; notification 7 passing TAP, both isolated PostgreSQL; **neither** proves complete actor/field/alternate-path matrix.
- Field inventory: `docs/final-audit/evidence/P0-RESIDUAL-FIELD-INVENTORY-20261024.json` (8 tables, 86 columns, 19 reviewed route rows; full acceptance false).
- Other source-accepted bounded layers are linked in the canonical register. Reuse them rather than rerunning equivalent proof.

## Work to execute in GitHub
1. Derive the eight table names and every HTTP read/write/alternate route from the inventory and currently mounted application routes; reconcile against existing accepted tests. Record a finite matrix of (table, route, actor, own/foreign merchant, allowed/denied, fields projected, test reference).
2. Cover **owner, assistant, same-merchant and foreign-merchant** actors, expired/revoked sessions, and privileged/alternate access where applicable. Assert legitimate positives and unauthorized negatives, absence of cross-tenant data and absence of side effects on denied writes. Explicitly mark any actor/route that is not supported by product policy as N/A with source justification.
3. Run focused source/HTTP tests with an isolated disposable PostgreSQL and the actual mounted application middleware; verify RLS and authorization without weakening policy. Record commit SHA, test cases, pass/fail counts, CI run/job links, database isolation and cleanup.
4. Repair any product findings, then rerun affected tests. Do not classify test-fixture preconditions as product defects.
5. Reconcile the residual field decisions: FIELD002 (notification producer/response fields), FIELD003 (audit cross-consumers), FIELD004 (legacy offline draft authority), FIELD005 (retention). Preserve explicit policy dependencies and do not silently treat source tests as policy approval.
6. Change gate to CLOSED_SOURCE **only if** the complete eight-table actor/field/alternate-path HTTP matrix is evidenced and no P0 privacy requirement remains unclassified. Hosted acceptance and full launch GO remain separate.

## Historical initial target (completed in bounded scope; see current checkpoint)
Extend the existing `merchant-management-privacy-http-postgres.integration.test.mjs` and `merchant-notification-privacy-http-postgres.integration.test.mjs` coverage only after comparing the current 8-table matrix to other already accepted full-app HTTP suites. The first new test must cover a documented missing actor/route/field cell, not duplicate the 18 historical passing cases.

## Current result
No new tests run, no new code fix, no new P0 closure in this checklist commit. Gate remains OPEN; release NO-GO.

## Current execution checkpoint — 2026-11-04
- Actual FIELD002 field minimization remains accepted in targeted HTTP CI at source `b09e09a`, with original compatibility limitations. This stage additionally repaired a distinct inherited-name historical type mapper fault: code `951cd26`, regression `7e138211`; targeted notification CI [41765464219](https://github.com/nora953/fawri-production-source/actions/runs/41765464219) job `126362670422` **SUCCESS (88/88 PASS, 0 FAIL, cleanup SUCCESS)**. Exact bounded evidence and affected field cells are in `evidence/P0-RESIDUAL-HTTP-ROUTE-ACTOR-MATRIX-20261104.md`.
- Newly completed existing-gate condition: unknown notification types named `constructor` / `__proto__` / `toString` cannot cause the canonical merchant response projection to throw or reveal stored extension keys. This stage does **not** close FIELD002 or any existing register row.
- Next independent FIELD002 work: reconcile R3 supported caller/source reachability for direct `operational_new_order` and three legacy subscription types; distinguish source-only classification from a policy retirement decision. R2 historical/hosted writer+custom-client inventory remains blocked without authorization/evidence. No redundant projection tests, new policy or silent deletion of unknown rows.
- Gate `P0-RESIDUAL-MERCHANT-PRIVACY-001/http`: OPEN; 29 known CLOSED_SOURCE/7 OPEN/9 BLOCKED; complete P0 inventory false, overall percentage unknown; release **NO-GO**. Full engineering/hosted acceptance still separate.
