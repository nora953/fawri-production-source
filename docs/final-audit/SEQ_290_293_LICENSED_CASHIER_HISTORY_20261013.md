# SEQ-290–293 — licensed cashier zero-stock and archival history

Continue baseline468c9df61e443f5cbefc2ea46499a2045071e527. Audit only: independent workflow/fixture/evidence, application/original tests/schema unchanged. New zero-stock and missing-level scenarios, no original compensation suite rerun.

| Stage | Evidence | Outcome |
| --- | --- | --- |
| SEQ-290 | Current license/history contracts and four independent audit SQL cases | Modern applied entitlement/billing/seat/credential fixture derives from original compensation helper; zero-stock boundaries extend prior ordinary rebuild proof. |
| SEQ-291 | Four local runner refusal controls, syntax | 4PASS/0FAIL/0SKIP; no SQL acceptance from these controls. |
| SEQ-292 | Initial actual SQL3targetPASS/1seedBLOCKED; remaining-only corrected SQL1PASS | Four distinct intended business cases finally4PASS/0FAIL/0NOT_RUN. Two fresh owned clusters,28migrationsPASS each; cleanupSUCCESS. First failed seed retained separately, not a new product defect. |
| SEQ-293 | Source/contract classification, ledgers and handoff | No new canonical finding. Residual original license fixtures remain stale; licensed history/zero-stock guard/missing-level behavior proved within synthetic service scope. |

## Four distinct completed business cases

Each synthetic merchant has E164 identity, active cashier subscription, applied billing order + entitlement application, licensed seat, paired station, current credential and location inventory. A real service sale consumes2→0 at its location, with one order/line/mutation. Sale quantity2, base20000, manualdiscount2000, total18000; no external payment/provider.

| Case | Result | Exact verified scope |
| --- | --- | --- |
| Zero-stock sale then catalog rename | PASS (initial run) | Complete SELECT* orders/order_items/inventory_mutations rows equal before/after rename; full location level unchanged. Variant identity retained, quantity0; catalog version1→2. Order total18000/linequantity2 retained. |
| Archive while zero-quantity location row exists | PASS (initial run) | CATALOG_VARIANT_HISTORY_CONFLICT; complete authoritative product unchanged, full sale/item/mutation rows and location row unchanged. Zero quantity does not remove dependency. |
| Disable inventory while zero-quantity location row exists | PASS (initial run) | CATALOG_PRODUCT_LOCATION_INVENTORY_CONFLICT; graph/history/location unchanged. |
| Controlled missing-level archive/replay/return | PASS (remaining-only run) | Audit deliberately DELETEs its owned location level, then archive succeeds/version2/hiddenvariant. Raw variant retained/quantity0/catalog_archived=true, complete historical sale/item/mutation rows unchanged. Exact sale replay returns replayed=true/inventory_mutation_count0, rows unchanged. New partial return receives CASHIER_COMPENSATION_LOCATION_INVENTORY_MISSING; rows remain unchanged/no location recreated/no inventory mutation or order/refund metadata persisted. |

The last case is a controlled missing-level fault in a disposable database, not evidence that a production location-deletion workflow creates this state. It proves sale history retention and fail-closed restitution when original stock authority is absent; it does not certify successful compensation after archive. The zero-row guard prevents normal archival while a historical location level exists. Compensation/replay device timeline and all external side effects were not compared; no wider transaction/system clearance.

## Runtime provenance, bounded correction and no repeated verified tests

Initial source3c03392cff7607dc7a3ba647dce355c7e16a9949, https://github.com/nora953/fawri-production-source/actions/runs/38434410022/job/115424558317 : actualPG16/Node24.21.0,28committed migrationsPASS, TAP3P/1F/0SKIP. First three intended boundary cases completedPASS. Fourth stopped at sale setup with CASHIER_OPERATION_DEVICE_AUTHORITY_REQUIRED before missing-level target; no archive/replay/return assertion reached in that attempt.

Current historical authority requires credential issued_at, seat assigned_at and applied billing cycle to cover operation timestamp. DB now() has submillisecond precision and JS Date generates millisecond timestamps, so same-millisecond issued_at can fall after the intended operation timestamp. This is an inference supported by the source/fixture; exact initial issued_at was not logged, so no independently confirmed application precision defect declared. Audit entitlement timestamps moved one minute earlier to guarantee the intended valid historical license. Production guards/original tests unchanged.

Corrected source9f9806b361a7b144023d969dac1a19e4224acdfd, https://github.com/nora953/fawri-production-source/actions/runs/38435030672/job/115426684838 : fixed executor selects only remaining missing-level case. Fixture registers one case rather than skipping three; suite exactly1P/0F/0SKIP. Previously verified3cases not rerun. Distinct completed target coverage is4P, not five tests or a fictional initial green suite. Initial seed failure remains preserved in evidence.

Both fresh PG16 clusters are owned network-none with no published ports; Node24 shares only owned loopback, source readonly, attestation/database/role/marker checked before migrations/imports. No hosted credentials/provider calls. Pool.end and executor tempcleanup=true, provisioner trap destroys owned containers/anonymous volumes; final alwayscleanupSUCCESS in both jobs. Owned superuser seeding is not restricted-role/RLS certification. Selected markers/TAP/jobsteps in seq292evidence; no raw private logs/credentials copied.

## Source interpretation and remaining work

Catalog wrapper retains archived shadows; core locationInventoryGuard checks row existence even quantity0 before graph edits. Sale service validates historical entitlement/location then recognizes exact persisted request hash before attempting catalog stock mutation, explaining replay after archive. Compensation looks for original location inventory level and fails409 if missing; outer transaction rolls its work back. These exact service paths ran against PostgreSQL. HTTP authentication/assistant/merchant/currentrole/browser/offline software/network/provider workflows remain outside this batch.

Existing RESIDUAL-FIXTURE-CONTRACT-001 staysOPEN: original catalog-history sale fixture lacks modern entitlement and is not repaired. This new licensed scenario resolves bounded business proof without pretending the original failed suite passed. Prior catalog marker atomicityMEDIUM and expiryLOW remainOPEN; no new canonical issue/no repair. Final tracked repository scan1766files/0findingsPASS; policy71workflows/0violationsPASS. Reachable-historysynthetic securityfinding remainsOPEN.

21/277selector paths unresolved and222minimum full-routevisualcasesNOT_RUN unchanged. Overall auditpercentageNOT_YET_MEASURABLE;releaseBLOCKED. NextSEQ-294: remaining selector inventory and applicable mounted route/role/HTTP lifecycle cases, then provider/hosted operational acceptance. No final remediation plan before audit completion, no application repair/merge/deployment.
