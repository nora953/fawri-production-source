# Operator replay PostgreSQL wire recovery — 2026-10-14

Accepted source `2e3acfea62c6c7e1ad14e2f088e33fb0998ba3d8`, tree `fcf1d183eaea20852e8b5728a3e87314ee5fe170`, Draft [#546](https://github.com/nora953/fawri-production-source/pull/546) stacked on #545. Isolated run [38631830513](https://github.com/nora953/fawri-production-source/actions/runs/38631830513), job116085119744, merge checkout `71db03cc64f5916b81806d96c14a8de2810ab5c8`: **240 PASS / 0 FAIL / 0 SKIP**, 47 unique test files / 49 invocations. New operator suite **5 PASS** (parent plus four cases); **7/7 observed source workflows SUCCESS**. These totals overlap prior acceptance and must not be added to it. [Machine evidence](evidence/P0_OPERATOR_REPLAY_WIRE_RECOVERY_RESULTS_20261014.json).

The original authenticated operator HTTP replay runs in a fresh Node process under a non-owner, non-superuser, non-BYPASSRLS role. A loopback TCP proxy forwards real authentication commits, then arms only after fresh injected provider confirmation. It withholds the actual PostgreSQL backend COMMIT CommandComplete at the billing receipt or entitlement boundary and closes the owned connection. An independent direct database session checks committed state.

| Authority | Lost acknowledgment | State after HTTP 503 | Two fresh-process/session retries | Final applications |
| --- | --- | --- | --- | --- |
| SaaS | Receipt COMMIT | Received event, no grant | Applied + duplicate | 1 |
| SaaS | Entitlement COMMIT | Applied event, one grant | Duplicate + duplicate | 1 |
| Cashier | Receipt COMMIT | Received event, no grant | Applied + duplicate | 1 |
| Cashier | Entitlement COMMIT | Applied event, one grant | Duplicate + duplicate | 1 |

Each uncertain caller reports HTTP503 without success. Before recovery, a new original-authority session with revoked current finance permission returns HTTP403 before provider traffic or execution audit and changes no state, including already-applied duplicate cases. After permission restoration, both new processes obtain distinct genuine sessions and perform fresh provider checks through the actual route and original billing authorities. Exactly one application/subscription remains for each of four owned orders; original six-fractional-digit event/paid time, unchanged raw receipt and durable execution audit pass. Direct tenantless raw receipt/order reads remain empty under the child role.

Full committed restore seed/verify passed: 33 migrations, 95 tables, 45 policies, 8 functions and restricted tenant reads, identical fingerprint `793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498`. Existing generic billing wire tests and original replay/review/identity tests remain intact; this new proof specifically exercises the operator HTTP/session lifecycle. Guard, original chronology/constraints, cleanup and assertions are preserved.

Local API typecheck, syntax, five proxy frame-filter tests and whitespace check passed. First published source passed acceptance without correction. Documentation checkpoint changes evidence only and preserves tested application/test source. Unrelated pre-existing capture PNG modification remains untouched and excluded.

Provider transport is injected at the exact synthetic status URL; no actual Qi traffic or money. SQL runs only in guard-attested offline disposable PostgreSQL using existing CI. This is route-level HTTP, not full main-app/browser/mobile/visual/accessibility or 222-baseline certification. No production application/migration change, hosted capability grant/migration, merge or deploy.

#523 remains OPEN for expiry/device-race extensions, independently known order discoverability, ownership/retention and reviewed hosted capability rollout. The bounded operator TCP uncertainty item now has accepted evidence; broader arbitrary process termination remains separate. #535 full downstream signed Meta HTTP restricted-role acceptance is the next concrete unit.
