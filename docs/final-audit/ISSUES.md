## Background-job admin HTTP subcondition accepted; cashier proof gaps reconciled — 2026-10-27

Accepted source205b5eca8908885a676ec02cd3643faf64f5fe22,57/57 CI SUCCESS. [Authoritative checkpoint](P0-CLOSURE-REGISTER.md); [job HTTP evidence](evidence/P0-BACKGROUND-JOB-ADMIN-HTTP-20261027.json). Seven new functional cases exercise actual GET(view_logs/manage_channels) versus POST(manage_channels), summary payload exclusion, latest/missing safety refusal, path-selected once-only safe requeue, queued-state denial, payload-hydration atomic rollback/retry and SQL permission removal. Actual enqueue/encryption, root-seeded DLQ fixture state, no worker/provider/KMS/hosted claim. Target58 TAP/4files (full app27, includes parents); broader829 TAP/97invocations/94files excludes the HTTP file. Tracked/full-history security PASS, checkout tree matched, owned fresh-cluster fingerprints match. App/schema/ACL unchanged; no whole result-JSON privacy certification.

Also reconciled existing SEQ-R1/R2/R3 accepted layers versus missing admission/public-native integration in the existing recovery contract/design. Canonical0052 storage is accepted,0053 remains candidate; legacy header corrected without new policy/runtime acceptance. Next: Resolve the SEQ-R3 admission/compatibility boundary using existing merchant pairing and actual local queue/server history paths in the existing recovery contract. Prepare one concrete reviewable specification for new versus known/restored devices; explicitly identify required trusted evidence and exceptional owner recovery. Keep public v2 unsupported until that contract and its integration acceptance are met. Do not create another disconnected issuer or rerun accepted internal proof.

All45 statuses unchanged; parent gates OPEN, complete inventoryfalse, overall percentnull, releaseNO-GO. No hosted/merge/deploy.
## Current-source reconciliation and one named HTTP subcondition accepted — 2026-10-27

Accepted sourceccda10c03b91633825cd2a1aea58f97ca2727da9,57/57 CI SUCCESS. [Authoritative checkpoint and next case](P0-CLOSURE-REGISTER.md); [current actor/entrypoint map](evidence/P0-ACTOR-ENTRYPOINT-EVIDENCE-MAP-20261027.json); [provider cost HTTP evidence](evidence/P0-PROVIDER-COST-HTTP-20261027.json). Verified320 source/363 test blobs; AST362 registration rows/236 method-path pairs, not a P0 denominator or runtime acceptance. Existing8-table/86-field schema unchanged; historical UI222 remains P1, no scope expansion.

One existing full-role/privacy subcondition accepted with5 real app/SQL cases: owner-only provider configuration, private fields/actor binding, manual provider_api refusal, audit failure rollback/retry, current SQL role removal. Target50 TAP/4files (full app19 includes parents); broader829 TAP/97invocations/94files excludes that HTTP file. Security full historyPASS, exact checkout tree matched. Initial16499546 had54success/1fail/2cancelled; fixture dollar-quote SQL corrected without weakening assertions, failure retained. Runtime application/schema/ACL unchanged. All45 gate statuses unchanged, inventory incomplete, releaseNO-GO.

Next: Reconcile channelDurableJobAdmin actual-app GET(view_logs/manage_channels) versus requeue(manage_channels) and producer/result-field assertions against existing evidence; select a missing case only after that trace. Continue existing SEQ-R1/R2/R3 acceptance mapping separately without duplicate pairing.

## P0 finite known-remainder closure queue fixed — 2026-10-27

From checkpoint9dedf2ebd5560f0a57f77246f5885c258fd4f7d2, reconciled all16 known remaining rows (7 OPEN/9 BLOCKED) into the existing authoritative register, each with precise closure conditions, missing evidence/decision, authorized work now, external dependency and next action. No new gates, status changes, runtime/CI claims or policy/hosted approvals. Accepted source remainsb15f4b8751da7d8e84933ffd2e778b28538caa3b. Complete inventory remainsfalse; no overall completion percentage. [Closure queue and execution order](P0-CLOSURE-REGISTER.md); machine-readable closurePlan is in existing evidence/P0-CLOSURE-REGISTER.json.

Next batch: reconcile current P0 actors/entrypoints/fields/producers/consumers against existing manifests/evidence and name exact unmatched rows. Then map SEQ-R1/R2/R3 before selecting necessary cashier implementation/proof. Do not automatically add the previously proposed HTTP test or repeat accepted layers. New code/tests require an existing gate plus an unmet closure condition; discovered critical scope changes require explicit evidence and count impact. No hosted/merge/deploy; releaseNO-GO.

## Existing merchant pairing continuity accepted — 2026-10-27

Accepted test/source **b15f4b8751da7d8e84933ffd2e778b28538caa3b**, all **57/57 CI SUCCESS**. Existing merchant-managed station pairing is reused, not replaced. Three new nested real restricted-LOGIN PostgreSQL/service cases pass: same-device credential rotation preserves legacy sequence1 and canonical review stream0/version1; replacement leaves the old device's stream/history in place and creates no replacement stream; consumed code and revoked old credential are refused with protected state unchanged. [Evidence](evidence/P0-CASHIER-PAIRING-CONTINUITY-20261027.json).

[Targeted40500667391/job122177245587](https://github.com/nora953/fawri-production-source/actions/runs/40500667391):88 TAP/16 invocations/16 files; full lifecycle4 TAP includes parent plus3 new cases. API and frontend typechecks SUCCESS. [Broader40500666928/job122177242953](https://github.com/nora953/fawri-production-source/actions/runs/40500666928):829 TAP/97 invocations/94 unique files,0 failed/skipped/cancelled. Targeted overlaps broader; do not add totals. Both totals include parents; prior synthetic69 and history9 are not newly claimed. Checkoutd4827cbbc800101f60cc47fbe001dcfca0ac8dd9 treea28136231f456c27a406f8b03d2c7ced3f0c420a exactly matches source. Security40500667247/job122177245230 tracked and full reachable Git history PASS. Independent-cluster recovery fingerprints matchf38adb9c44cb127a3cea16463a5559d93bf8eb21a46e7f46cc2f9ed45805649e; inherited recovery remains bounded.

Application runtime/schema/ACL/startup/routes remain byte-identical to prior accepted699af77; changes are test coverage and correction of work instructions/records. No claim of HTTP/browser/physical-device pairing coverage, nonzero-v2-receipt continuity or independent fresh-empty provenance. All45 gate statuses unchanged:29 CLOSED_SOURCE,7 OPEN,9 BLOCKED. Known equal-weight row ratio29/45=64.4%; overall P0 percent remainsnull because complete inventory isfalse. CASHIER-SYNC-SEQUENCE-001 OPEN, releaseNO-GO. No hosted/merge/deploy.

Next: Extend the same existing merchant pairing continuity scenarios through authenticated merchant HTTP issuance and real cashier redemption, reusing current session and station authority. Then reconcile protocol negotiation/recovery; keep v2 unsupported until complete acceptance, with no guessed fresh-empty provenance, historical reset, routine platform-owner approval or duplicate pairing.

## SEQ-D3 policy-neutral issuer candidate — 2026-10-27

Continuation from checkpointc45c883a4e4f607843137413273a4403043499ba. Added an unimported candidate and69 passing local synthetic tests under docs evidence, binding trusted server subject/session and explicit authorization to original-byte digest plus merchant/station/device/review. Rejects client authority fields, foreign bindings, nonempty counters, ambiguous encoding, expired evidence and revocation/policy changes during preparation. [Contract and limits](evidence/P0-REVIEWED-DEVICE-ISSUER-CANDIDATE-20261027.md); [structured evidence](evidence/P0-REVIEWED-DEVICE-ISSUER-CANDIDATE-20261027.json).

This is executable candidate evidence, not a live issuer fix: real authentication/policy/assignment/custody adapters and transaction-bound revocation/reuse remain unimplemented. Both reviewer-model choices remain unadopted, all five approvals and retention durations unchanged. No application/canonical schema/ACL/route/startup changes or new CI/HTTP/PostgreSQL claims. Last accepted application source remains699af77df6be59510cc4638512d876d4a9a16173; prior test totals retain their original scope. All45 gate statuses unchanged; releaseNO-GO.

Next: Choose the reviewer policy explicitly, then specify real session/policy revocation, trusted original evidence observation/custody/access, and the transaction-bound issuance/reuse contract before any application adapter or route. Keep the policy-neutral candidate unimported until those dependencies are resolved.

## SEQ-D3 concrete promotion decision record prepared — 2026-10-27

Documentation-only continuation from checkpointb4d649a397948d363b6c6c908d36b1f1fd9b0ba3. Last fully accepted executable remains699af77df6be59510cc4638512d876d4a9a16173; prior CI57/57, broader826 TAP and fresh35/upgrade35 plus history9 are reused within their original scope, not rerun or newly claimed. [Concrete decision record](P0-FIELD005-RETENTION-DECISIONS-20261026.md) now records actual questions, a proposed owner_admin-only initial reviewer model and explicit alternatives, required issuer/evidence bindings, primary/auth/reviewer/bootstrap separation, eight review fields and unapproved retention schedules, emergency integrity and blocked hosted recovery. Machine-readable record lives in the existing design evidence. All five approvals, adopted model, actual operational identities and retention durations remain unset. No code, schema, grant, startup, route, canonical promotion or hosted change; gate statuses unchanged, releaseNO-GO.

Next: Obtain the explicit reviewer-model choice for this concrete proposal, then prepare its source-only issuer/evidence-binding contract. Keep retention/provisioning/hosted approvals unset until separately decided; no repeated proof of accepted preflight without a source change or new failure.

## Current SEQ-D3 checkpoint — 2026-10-27

Accepted source699af77df6be59510cc4638512d876d4a9a16173,57/57 CI SUCCESS. Complete54-entry migration history and withheld-capability preflight accepted in fresh35/upgrade35 TAP; broader826 TAP and history9 tests PASS. Current source53/97 remains unchanged; no activation/grants. [Authoritative register](P0-CLOSURE-REGISTER.md) and [design evidence](evidence/P0-CASHIER-SEQUENCE-DESIGN-20261026.json) record failed sources53ef9049/71610e08, correction and exact run/tree evidence. CASHIER-SYNC-SEQUENCE-001 OPEN; policy/reviewer/provisioning/hosted prerequisites remain, releaseNO-GO. Entries below are historical in their original scope.

Next: Reconcile these existing prerequisites with the finite FIELD005 checklist and prepare a concrete reviewer/provisioning/retention decision record. Keep approvals unset, avoid invented durations or permissions, and do not repeat accepted migration/preflight proofs without a new change or failure.

## Current SEQ-D3 checkpoint — 2026-10-27

Accepted sourcefec5efedeefbf253af8b764d63a5911dd6fb99f0,57/57 CI SUCCESS. Actual Drizzle candidate0053 fresh8/upgrade8 TAP and full broader826 TAP PASS; see authoritative [register](P0-CLOSURE-REGISTER.md) and [design evidence](evidence/P0-CASHIER-SEQUENCE-DESIGN-20261026.json). Candidate54/98 exists only in isolated tests; canonical source53/97 unchanged. CASHIER-SYNC-SEQUENCE-001 OPEN, FIELD005/reviewer policy and hosted prerequisites unresolved, releaseNO-GO. Historical entries below retain their original scope.

Next: Prepare an internal read-only candidate installation preflight verifying the actual complete Drizzle journal hashes/timestamps against the reviewed54-entry package and accepted owner/function/role boundaries before any future EXECUTE grant. Prove missing/tampered/extra journal and denied-role/partial-installation refusals with fault rollback. No startup wiring, canonical promotion, operational grants or public v2 activation; trusted reviewer issuance, FIELD005 and hosted/KMS/PITR/media remain prerequisites.

## SEQ-D2 canonical0052 source storage/startup readiness/deletion/restore accepted — 2026-10-26

Accepted source **3bb3c67717a17da1cba903047e35f2b622b997b1**,57/57 CI SUCCESS. [Canonical40323848241/job121575332020](https://github.com/nora953/fawri-production-source/actions/runs/40323848241):22 TAP/2 files,104 historical SQL/snapshots byte-identical. [Cashier40323848140/job121575332493](https://github.com/nora953/fawri-production-source/actions/runs/40323848140):52 TAP/15 invocations; committed storage8 and startup/catalog readiness16 pass. [Broader40323848365/job121575333763](https://github.com/nora953/fawri-production-source/actions/runs/40323848365):750 TAP/94 invocations/92 files,0 failed/skipped/cancelled, exact source tree matched. Complete schema40323848361 and schema validation40323848333 SUCCESS. [Evidence](evidence/P0-CASHIER-CANONICAL-0052-ACCEPTANCE-20261026.json).

Canonical source is now53 migrations/97 public tables.0052 SQL/schema/preimage/snapshot/journal adopted;0000-0051 bytes preserved. Dedicated NOLOGIN column-limited owner, tenant RLS/immutable receipts/contiguous checkpoint constraints and device-erasing retirement consumed directly by regressions. Legacy merchants with no non-retired streams require no new retirement authority, preserving prior deletion behavior. Production startup verifies actual primary/auth identities and reviewed metadata before providers/listener. No live enrollment/receipt financial writer/admission/client protocol changes.

Full committed schema restore seed2 TAP/verify2 TAP uses53 migrations/97 tables and identical owner/column ACL/policy/trigger/data fingerprints; restricted reads, immutable receipts, post-restore actual deletion and selected peer preservation pass. Global roles preprovisioned in owned cluster, not full lost-cluster credential recovery. Prior failures preserved: fresh schema helpers lacked private bootstrap; then old inventory expected18 rather than20 cashier tables. Shared reviewed bootstrap and explicit two-table inventory corrected without weakening per-table denials. Initial browser prerequisite timeout was not an application test; only current57/57 establishes full source acceptance.

Next: SEQ-D3 trusted financial-transaction receipt/admission and exact replay/attribution repair with verified enrollment and unsupported-operation hold. Preserve legacy admission/ambiguous histories. FIELD005/full role bootstrap/hosted gates remain open. **CASHIER-SYNC-SEQUENCE-001 OPEN; release NO-GO.** Register45=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED; incomplete inventory, no percentage. No merge, deployment or hosted change.

## SEQ-D2 internal read-only metadata readiness accepted; prior browser pending resolved — 2026-10-26

Accepted source **11f7e55dd59aa5674822dc3557973acc9440fef0**,57/57 CI SUCCESS. [Candidate40318675833/job121557666907](https://github.com/nora953/fawri-production-source/actions/runs/40318675833):21 TAP/0failed/skipped across existing management6 and new readiness15(parent+positive+13 metadata faults). Historical104 files unchanged; candidate53/97 generation remains reproducible. [Broader40318676078/job121557667401](https://github.com/nora953/fawri-production-source/actions/runs/40318676078):734 TAP/93 invocations/91 files,0 failed/skipped/cancelled; exact source tree matched. [Evidence](evidence/P0-CASHIER-CANDIDATE-READINESS-20261026.json).

Prior b55328a2a3410cbb94b13b4ba2ba5085a8560336 also reached57/57: browser40315005762/job121545272094 completed SUCCESS with actual IndexedDB/stale-backup PASS; previous installation delay is resolved, not an application failure.

New inspector uses catalog SELECTs; actual restricted LOGIN positive runs READ ONLY. Checks include RLS/policies, owner/caller flags and reachability, column/grant boundaries, function body hashes/security/search_path/owner/PUBLIC execute, enabled/deferred trigger bindings.13 actual metadata fault transactions each rejected; rollback restores positive state and selected stream/receipt rows. Trusted caller supplies role names; this is not actor authentication, concurrent-DDL attestation or complete business/privacy proof. Returns operationalAdoption=false; no live readiness wiring.

Active schema remains52/95, candidate53/97 ephemeral. Next: promote generated artifacts together with fixture adaptation, reviewed live readiness wiring and workflow update; require exact-source storage/deletion/restore/role denials before adoption. FIELD005 policy/full role bootstrap/hosted remain open. **Sequence gate OPEN; NO-GO.** Register45=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED, incomplete inventory, no percentage.

## SEQ-D2 generated0052 candidate bounded accepted; full-source CI pending browser setup — 2026-10-26

Candidate source **b55328a2a3410cbb94b13b4ba2ba5085a8560336**. [Generation40315005720/job121545272842](https://github.com/nora953/fawri-production-source/actions/runs/40315005720) SUCCESS:104 historical SQL/snapshot files byte-identical, old journal entries preserved, candidate53 migrations/97 tables; reviewed SQL applied in owned offline PostgreSQL and restricted management contracts6 TAP PASS/0 failed/skipped. Generated SQL/snapshot/journal saved under evidence/seq-d2-canonical-candidate/generated with verified SHA256 and sizes. [Broader40315005751/job121545708032](https://github.com/nora953/fawri-production-source/actions/runs/40315005751):734 TAP/93 invocations/91 files,0 failed/skipped/cancelled; exact source tree matched. [Evidence](evidence/P0-CASHIER-CANONICAL-CANDIDATE-20261026.json).

**56/57 CI SUCCESS; browser40315005762/job121545272094 pending in Playwright/Chromium installation, observed about10 minutes with application test not started. No browser PASS/FAIL inferred. Last fully accepted source remains926fac511bc507b37475f00e574e3468cfec73a8.** New dedicated workflow increases total from56 to57. Initial109166ff8f10dd061d3431beb3c3bc246d52c1c7 generated history correctly but SQL migration rejected42703 from camelCase reference; corrected candidate separately; failed/superseded runs not accepted.

Active schema/journal remain52 migrations/95 tables. Candidate only, not adopted; no admission/client/hosted change. Next: resolve pending CI then promote generated artifacts only together with storage/restore fixture adaptation, new table/owner/ACL/trigger readiness checks and candidate-workflow update; run exact-source acceptance. Full FIELD005 policy and role/credential bootstrap remain open. **Sequence gate OPEN; NO-GO.** Register45=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED; inventory incomplete, no percentage.

## SEQ-D2 backup CLI v2 owner/ACL and explicit two-role bootstrap accepted — 2026-10-26

Accepted source **926fac511bc507b37475f00e574e3468cfec73a8**,56/56 CI SUCCESS. [Backup drill40311588593/job121533837949](https://github.com/nora953/fawri-production-source/actions/runs/40311588593):22 contract tests PASS/0 FAIL/0 skipped plus real workflow-owned PostgreSQL archive/restore/bootstrap proof. Local CLI19 PASS. [Broader40311588482/job121533847068](https://github.com/nora953/fawri-production-source/actions/runs/40311588482):734 TAP/93 invocations/91 files,0 failed/skipped/cancelled; source/checkout tree matched. [Evidence](evidence/P0-BACKUP-CLI-OWNER-ACL-20261026.json).

Backup v2 preserves owners/ACL and declares required global-role preprovisioning. Restore requires v2 security metadata/size/hash and no longer omits ownership/privileges. Legacy v1 data-only descriptions rejected before tool invocation; old archives untouched. Existing guards/loopback/database/URL-option/routing-env/verification-SQL restrictions preserved. Real CLI drill drops source DB and both fixture roles, recreates explicit non-login restricted definitions, restores data hash/function owner/column ACL/RLS, tests reader scoped positive/cross-row negative and valid definer mutation. Future-only cutover templates aligned; no production command executed.

Boundary: generic two-role bootstrap, not complete FAWRI global/login/credential recovery or hosted disaster recovery. Reader uses SET ROLE in this generic drill; separate full proposal restore already supplies real restricted LOGIN proof. Canonical95 tables/52 migrations and current admission unchanged. Next: additive canonical Drizzle/schema/readiness preparation with explicit non-login owner provisioning; preserve history and keep full role bootstrap, FIELD005 policy, live financial receipts and hosted requirements open. **Sequence gate OPEN; NO-GO.** Register45=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED; incomplete inventory, no percentage.

## SEQ-D2 proposal-inclusive database restore accepted — 2026-10-26

Accepted source **553e08f7223e5ea242b813f3edc0e270f0c4784c**,56/56 CI SUCCESS. [Broader40309933849/job121528266491](https://github.com/nora953/fawri-production-source/actions/runs/40309933849):734 TAP/93 invocations/91 files,0 failed/skipped/cancelled; source/checkout tree matched. Restore seed2 TAP and verify2 TAP(parent+1 child each). [Evidence](evidence/P0-CASHIER-STREAM-RESTORE-20261026.json).

Custom pg_dump/owner-preserving pg_restore to a fresh database yields identical fingerprint before/after: public function owners, policy role bindings, proposal column ACLs, user triggers/enabled state, proposal JSON data and role flags included. Real restricted reader tests own-tenant positive/raw+forged-GUC negative, no direct mutation/trigger execution/owner activation in both phases. Immutable receipt mutation rejected. Actual unchanged deletion service after restore retires target with NULL binding/checkpoint1 preserved; receipts and selected peer stream exact.

Owned cluster97 public tables include2 noncanonical proposal tables; canonical95 tables/52 migrations unchanged. Global roles are preprovisioned in same disposable cluster: not lost-cluster role bootstrap, hosted/PITR/RPO/RTO/media/financial provenance acceptance. Separate backup-postgresql/restore-postgresql scripts omit owner/ACL and are NOT certified by this drill. Initial31b4e2885415fa28eb75bfcd7707c7c1bc4993f7 seed2 PASS but verify0 PASS/2 FAIL lacked explicit operational authority for service fixture; corrected test configuration, prior failure preserved.

Next: reconcile separate backup/restore ownership/ACL paths and role bootstrap, then canonical Drizzle/readiness promotion; FIELD005 policy, legacy adoption and live admission remain pending. **Sequence gate OPEN; NO-GO.** Register45=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED, incomplete inventory, no percentage.

## SEQ-D2 non-login column-limited retirement owner accepted — 2026-10-26

Accepted source **e822ba57b63d6eb06b30ed86582f71d0cab28916**,56/56 CI SUCCESS. [Cashier40306955203/job121518318946](https://github.com/nora953/fawri-production-source/actions/runs/40306955203):36 TAP/14 invocations; proposal fixture8 TAP(parent+7 subtests). [Broader40306955254/job121518317522](https://github.com/nora953/fawri-production-source/actions/runs/40306955254):732 TAP/93 invocations/91 files,0 failed/skipped/cancelled; checkout tree matched. [Evidence](evidence/P0-CASHIER-RETIREMENT-OWNER-20261026.json).

Retirement definer runs as dedicated NOLOGIN/non-superuser/non-BYPASSRLS/non-creator/non-inheriting owner of function only, not tables/indexes. No schema CREATE remains. SELECT streams and UPDATE(state,device_id,version) only, with explicit owner RLS read/retirement policies. Checkpoint/identity/enrollment mutation and receipt/account/merchant grants absent. Primary/auth LOGINs cannot use/SET role or directly execute trigger function. Unchanged actual deletion service succeeds; revoked UPDATE(version) makes deletion fail42501 and selected target/peer rows roll back; restored grant passes existing post-retirement fault/retry and exact receipt/peer checks.

Boundary: fixture-only role/grants/ownership and proposal tables; no canonical schema/journal or hosted mutation. Earlier root-owner evidence is historical. Next: proposal-inclusive dump/restore preserving owner/column ACL/policy/trigger/denial and valid deletion, then canonical Drizzle/readiness promotion. Financial receipt provenance, FIELD005 policy and hosted gates remain unaccepted. **Sequence gate OPEN; NO-GO.** Register45=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED; inventory incomplete, no percentage.

## SEQ-D2 proposal bridge with actual deletion service accepted — 2026-10-26

Accepted source **3fdc89edc5500b511b3cdcd492e67bc3a5b99b80**,56/56 CI SUCCESS. [Cashier40267010329/job121391499858](https://github.com/nora953/fawri-production-source/actions/runs/40267010329):35 TAP/14 invocations; proposal fixture7 TAP(parent+6 subtests). [Broader40267010218/job121391707258](https://github.com/nora953/fawri-production-source/actions/runs/40267010218):731 TAP/93 invocations/91 files,0 failed/skipped/cancelled; checkout tree matches source. [Evidence](evidence/P0-CASHIER-STREAM-DELETION-TRANSACTION-20261026.json).

Unchanged canonical deletion service runs with separate restricted auth LOGIN and proposal-only retention-transition trigger. Post-retirement account fault verifies all target bindings were retired before raising, then exact selected merchant/account/request/cashier/stream/receipt rows roll back. Retry completes deletion, retires active/review streams, preserves already retired stream, all selected immutable receipts and peer business/proposal snapshots. Direct primary invocation/state change denied; deleted enrollment and append denied; repeated deletion leaves selected target unchanged.

Initial candidate c0120e5072f5803784e3dec68907c4e82d54aa7b failed fixture0 PASS/1 FAIL because plain <> rejected valid NULL retention state. Corrected with IS DISTINCT FROM; failed/cancelled/superseded runs are not accepted.

Boundary: proposal trigger/tables installed and removed only in owned disposable SQL, not canonical schema/journal or hosted. No owner HTTP/media/backup acceptance, financial provenance or retention-policy adoption. Definer uses root fixture owner; canonical least-privilege non-login ownership/readiness/restore still pending. Next: canonical generation and reviewed ownership/trigger/readiness/dump-restore verification before adoption; preserve FIELD005 policy blockers and current admission. **Sequence gate OPEN; NO-GO.** Register45=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED, incomplete inventory, no percentage.

## SEQ-D2 proposal revision2 device binding erasure accepted — 2026-10-26

Accepted source **5a9489f6d5cde233fcb54cb690cef15ceab0d7e3**,56/56 CI SUCCESS. [Cashier40265005413/job121385370597](https://github.com/nora953/fawri-production-source/actions/runs/40265005413):34 TAP/14 invocations; proposal fixture6 TAP(parent+5 subtests). [Broader40265005072/job121385369306](https://github.com/nora953/fawri-production-source/actions/runs/40265005072):730 TAP/93 invocations/91 files,0 failed/skipped/cancelled; exact checkout tree matched. [Evidence](evidence/P0-CASHIER-DEVICE-BINDING-ERASURE-20261026.json).

Revision2 removes raw device_id from immutable receipts; stable stream/merchant FK remains. Stream retirement requires binding NULL; active clearing/rebinding, retained raw binding on retirement, and retired reactivation/rebinding are rejected. Actual receipt writer waits on retirement lock then rejects after retirement commit. Selected receipts and peer stream remain exact; scoped runtime cannot retire. Prior receipt/checkpoint commit/rollback contention and tenant constraints still pass. Revision1 evidence remains historical.

Boundary: owned disposable proposal/root SQL only. No canonical schema/journal, owner deletion route, live admission or hosted change. This is not complete PII erasure/retention policy, financial provenance or backups proof. Next: trusted lifecycle retirement primitive with transaction rollback/peer proof; FIELD005 retained-field reconciliation; then canonical generation/readiness/restore. **CASHIER-SYNC-SEQUENCE-001 OPEN; NO-GO.** Register45=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED, incomplete inventory, no percentage.

## SEQ-D2 proposal SQL contention accepted; canonical promotion pending — 2026-10-26

Accepted source **4b9f9dc638e95b8b053189edf3cb6e93b48b384e**,56/56 CI SUCCESS. [Cashier40264134265/job121382683025](https://github.com/nora953/fawri-production-source/actions/runs/40264134265):33 TAP/14 invocations; proposal fixture5 TAP(parent+4 subtests). [Broader40264134048/job121382681239](https://github.com/nora953/fawri-production-source/actions/runs/40264134048):729 TAP/93 invocations/91 files,0 failed/skipped; exact checkout tree matched. [Evidence](evidence/P0-CASHIER-STREAM-CONCURRENCY-20261026.json).

Actual row-lock wait observed with pg_blocking_pids. First commit leaves exactly one receipt/checkpoint1/version2 and rejects waiter; first rollback leaves no first receipt and waiter commits exactly one. Another merchant proceeds during blocking; existing peer selected JSON unchanged exactly. Root proposal SQL fixture only, not financial writer/HTTP acceptance. No canonical migration, live admission or hosted changes.

Canonical review also records a privacy prerequisite: immutable proposal rows retain raw device IDs while current deletion anonymizes device identity in timeline/attribution. Resolve this before promotion; no retention policy adopted. Readiness/schema generation/restore/financial integration remain pending. **Sequence gate OPEN; release NO-GO.** Register unchanged45=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED; incomplete inventory and no overall percentage.

## SEQ-D2 disposable SQL proposal accepted; canonical promotion pending — 2026-10-26

Accepted source **0edf291bb5d172a76ff6f840af70db710d3f6503**, **56/56 CI SUCCESS**. [Cashier run40261736753](https://github.com/nora953/fawri-production-source/actions/runs/40261736753):32 TAP/14 invocations; new proposal fixture4 TAP(parent+3 subtests). [Broader run40261736766](https://github.com/nora953/fawri-production-source/actions/runs/40261736766):728 TAP/93 invocations/91 files, zero failed/skipped/cancelled. Synthetic checkout tree matches source. [Evidence](evidence/P0-CASHIER-STREAM-STORAGE-PROPOSAL-20261026.json).

Draft stream/immutable receipt SQL is outside the canonical migration journal. Owned disposable SQL tests verify restricted tenant reads, denied runtime writes, atomic receipt/checkpoint constraints, contiguous sequence and merchant-wide operation identity, and station/location/staff/shift foreign keys. Fixture tables are removed after tests. Canonical schema/journal and live admission are unchanged. Synthetic root-created receipts are not financial effect or trusted enrollment proof; no concurrency/restore/hosted acceptance is claimed.

Next: reconcile through canonical Drizzle generation and verify RLS/privacy/readiness/restore and deletion constraints before canonical promotion. SEQ-D2 is partially verified, not complete; D3/D4 remain open. **CASHIER-SYNC-SEQUENCE-001 OPEN; NO-GO.** Register remains45 rows=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED, incomplete inventory, no overall percentage.

## SEQ-D1 bounded read-only history component accepted — 2026-10-26

Accepted executable **df273707c000588e9b4e0fe772ef05f4a132d579**: **56/56CI SUCCESS**. [Cashier40257982261/job121363860931](https://github.com/nora953/fawri-production-source/actions/runs/40257982261):28TAP PASS/13invocations; multi-device fixture5TAP(parent+4functional),one new read-only assessment subtest. [Broader40257982407/job121363861470](https://github.com/nora953/fawri-production-source/actions/runs/40257982407):**724TAP PASS/92invocations/90files**,0failed/skipped/cancelled. Exact checkout tree matched. [Evidence](evidence/P0-CASHIER-DEVICE-HISTORY-ASSESSMENT-20261026.json).

`assessCashierDeviceHistory` reads at most configured limit+1(default/cap512) numeric timeline rows for one merchant/device in one statement; bigint text is inspected without unsafe rounding. Reports empty/numerically contiguous/gapped/review; truncated or unsafe history cannot become a complete checkpoint. Always enrollmentAuthorized=false/statementSnapshotOnly=true. Real restricted-role READ ONLY SQL transactions assert read-only mode, own/peer positives and tenant/device negatives, empty/gap/start-above1/unsafe/limit cases; separate uncommitted setup writer invisible until commit, then its gap visible. Exact selected financial/timeline snapshots unchanged by assessor.

**Boundary:** internal component has a regression caller only; no live HTTP endpoint/admission wiring or checkpoint/receipt/migration/grant changes. Supplied target must be a trusted tenant transaction; utility is not caller authentication. Statement visibility is not a durable enrollment/receipt proof or canonical writer race. **CASHIER-SYNC-SEQUENCE-001 remainsOPEN; NO-GO**.45register rows29CLOSED_SOURCE/7OPEN/9BLOCKED unchanged;inventory incomplete/percentage null;no merge/deploy/P1/P2.

Concrete design revision1 was saved inc11352f2 before this slice: verified stable device streams/immutable receipts, exact replay before contiguous future admission, explicit ambiguous-legacy hold, original post-commit attribution repair, opt-in local adjustment handling and version/rollback rules. [Design](P0-CASHIER-SEQUENCE-RECOVERY-CONTRACT-20261026.md), [implementation slice status](evidence/P0-CASHIER-SEQUENCE-DESIGN-20261026.json). SEQ-D1 bounded source acceptance does not implement or adopt the protocol, repair late operations or close SEQ-R1/R2/R3.

**Next exact action:** Prepare and verify SEQ-D2 additive stream/receipt schema and migration proposal against existing canonical schema/RLS/privacy/readiness/restore conventions. Preserve legacy rows and current admission; use server-owned identity/versioned immutable receipt constraints,not MAX/client counters. Do not apply hosted migrations or claim recovery before later admission/client/adoption slices pass.

---

## Concrete sequence recovery design revision1 prepared — 2026-10-26

Reviewedede1f101; accepted executable0c98d71f/56CI/27cashier/723broader reused only. **No new runtime/CI,application,schema,grant or hosted change.** [Concrete protocol2 design](P0-CASHIER-SEQUENCE-RECOVERY-CONTRACT-20261026.md), [machine decisions](evidence/P0-CASHIER-SEQUENCE-DESIGN-20261026.json). Proposed direction: verified server-owned stream identity/checkpoint, immutable exact replay first, contiguous future application and preserved hold for ambiguous legacy state. No automatic MAX/client-counter baseline, historical backfill, reset, silent ACK or tombstone.

Design covers original operator attribution repair after core commit, typed complete ACK, local queue compatibility, four reviewed producers and intended manual-adjustment disposition, version downgrade/credential rotation/rollback and four implementation slices. This is a concrete proposal, **not implemented,not adopted runtime policy,not recovery acceptance**. Remaining SEQ-R1/R2/R3 remainOPEN;45register rows29CLOSED_SOURCE/7OPEN/9BLOCKED unchanged;inventory incomplete/percentage null;**NO-GO**. No merge/deploy/P1/P2.

**Selected next slice SEQ-D1:** bounded read-only device-history assessment under current tenant scope, actual SQL negative/positive/limit/numeric/snapshot cases; no financial,timeline,checkpoint or admission write and no enrollment capability. Reuse prior1/3/2/native/HTTP/fault diagnostics rather than rerunning them solely for these docs.

---

## Canonical operator HTTP sequence and post-commit retry proof — 2026-10-26

Accepted test-only executable **0c98d71f6ced72f6cc1d506050b63319afc15b06**: **56/56CI SUCCESS**. [Cashier40252881652/job121348379020](https://github.com/nora953/fawri-production-source/actions/runs/40252881652):27TAP PASS/13invocations; historical compensation fixture2TAP(parent+one new subtest containing the diagnostic/fault scenarios). [Broader40252881441/job121348658711](https://github.com/nora953/fawri-production-source/actions/runs/40252881441):**723TAP PASS/92invocations/90files**,0failed/skipped/cancelled. Both use exact checkout tree matched to source. [Evidence](evidence/P0-CASHIER-SEQUENCE-OPERATOR-HTTP-20261026.json).

Actual mounted Express commerce/staff routers with real operator login, station credential, restricted primary and separate auth LOGIN accept ordered1/2/3. Target1/3 accepted, late2 denied409 twice;2orders/2stock mutations/2correct attributions/remaining stock1(from3). Exact ACK identity and replay/no-mutation/selected peer preserved. Missing token400 with exact input-invalid code; invalid token/wrong device/wrong station401; foreign tenant403; disabled session401. Initial missing-token401 expectation failed and was corrected to the existing input contract, not by changing production; failed/superseded attempts retained.

**Actual post-commit fault:** owned disposable attribution INSERT trigger produces500 twice after one sale/stock/timeline commit. Removing it and replaying the same HTTP bundle repairs exactly one staff attribution, returns replayed200/zero new stock mutation and preserves original financial rows; further retry and peer remain exact. This is actual SQL+HTTP fault/retry evidence, separate from the earlier native browser's synthetic fetch ledger. Not full-app, integrated browser-to-server, hosted or capacity proof. No production application/schema/grant change or new gap-recovery policy.

[Contract candidate](P0-CASHIER-SEQUENCE-RECOVERY-CONTRACT-20261026.md) now includes the four reviewed local sequence consumers and bounded caller reachability. Local adjustInventory direct caller found in diagnostic fixtures; similarly named dashboard functions use remote inventory APIs. No production UI caller established by this review; no dynamic/external/history absence theorem. Remaining **SEQ-R1/R2/R3** cover adopted financial gap/late semantics, intended local adjustment contract and trusted checkpoint/history disposition. **Gate remainsOPEN; NO-GO.**45register rows29CLOSED_SOURCE/7OPEN/9BLOCKED unchanged;inventory incomplete/percentage null. No merge/deploy/main/P1/P2. Docs-only checkpoint[skip ci] claims no additional runtime.

**Next exact action:** Prepare one concrete, reviewable recovery design in the existing candidate for authenticated existing-device checkpoints, future gaps and late financial operations, with an explicit disposition for the reviewed local manual-adjustment API and retained outboxes. Reuse the accepted SQL/native/HTTP/fault layers; do not add another identical1/3/2 diagnostic, guess a device baseline, drop an operation or alter financial history. Select a bounded implementation only after checking all affected callers and schema constraints.

---

## Native cashier outbox hold and lost-ACK reload verified — 2026-10-26

Accepted test/workflow executable **b7b73221ddeb92af05b9b63f32d4c48fe19f3ea6**: **56/56CI SUCCESS**. [Chromium40250800705/job121342045349](https://github.com/nora953/fawri-production-source/actions/runs/40250800705) runs native IndexedDB and real production drain clients in a fresh context with a synthetic in-browser fetch ledger. Actual page reload, exact raw-store snapshots, selected peer database and supported legacy-drain positive allPASS; no numeric browser TAP count claimed. Source/checkout trees matched. [Evidence](evidence/P0-CASHIER-NATIVE-OUTBOX-20261026.json).

Real local sale1/adjustment2/sale3 produces5envelopes. Synthetic operator context + real operator preflight rejects unsupported2 with zero transport calls/all stores intact. Legacy drain suffers synthetic accepted-operation1/lost-response ambiguity:5envelopes survive reload; exact replay ACK clears only operation1's2envelopes, then unsupported2 holds remaining3envelopes for sequences2/3. Repeated retries do not upload3. Separate supported legacy queue uploads/ACKs2sales without altering held database or committed stock/sales.

**Proof boundary:** fetch ledger and operator context are synthetic, not actual SQL commit or HTTP authentication. Operator positive upload is not tested here; supported positive/replay is the legacy merchant drain. New harness/workflow only; no production application/schema/grant/policy/hosted changes. Broader [isolated40250800858/job121342046391](https://github.com/nora953/fawri-production-source/actions/runs/40250800858): **722TAP PASS**,92invocations/90files,0failed/skipped/cancelled, exact checkout tree matched.

**CASHIER-SYNC-SEQUENCE-001 remainsOPEN**: server accept1/3/reject2 is still the accepted diagnostic, not recovery approval. No new non-commerce upload, backfill, tombstone, sequence reset or adopted contract.45register rows29CLOSED_SOURCE/7OPEN/9BLOCKED unchanged;inventory incomplete/percentage null;**NO-GO**. No merge/deploy/P1/P2. Docs-only checkpoint uses[skip ci];no additional runtime claimed for documentation.

**Next exact action:** Inspect existing canonical cashier operator HTTP fixture coverage for /api/cashier/operator/sync/sale with real station/operator session binding, then add a missing bounded ordered/gap/late-retry case only if not already covered. Preserve the native browser and canonical SQL evidence as separate layers; adopt a reviewed all-operation gap/non-commerce recovery contract before changing admission or authorizing tombstones.

---

## P0 retention checklist and canonical sale-sequence diagnostic — 2026-10-26

Accepted test-only executable **e14ca5301d6b4da8a93c93b19cf9c58302d51a41**: **56/56CI SUCCESS**, [isolated40249040016/job121336684560](https://github.com/nora953/fawri-production-source/actions/runs/40249040016) **722TAP PASS/0FAIL/0SKIP/0CANCEL**,92invocations/90files; exact checkout tree matched. Multi-device/gap fixture4TAP(3functional), one new canonical sale-service diagnostic. No application/schema/grant or hosted change in this batch; accepted emergency fixacf6c8d remains inherited.

**CASHIER-SYNC-SEQUENCE-001 staysOPEN.** Canonical restricted-role sale service accepts1/3, rejects valid late2 twice, leaves2orders/2inventory mutations/stock1(from3); exact selected financial/stock/timeline snapshots unchanged on rejection/replay, selected peer unchanged. This confirms unresolved recovery behavior; a passing diagnostic does not approve losing sale2, prove native outbox retention or implement gap recovery. [Evidence](evidence/P0-CASHIER-SEQUENCE-SALE-DIAGNOSTIC-20261026.json). [Recovery contract candidate](P0-CASHIER-SEQUENCE-RECOVERY-CONTRACT-20261026.md) compares contiguous all-operation admission, controlled historical backfill and reconciliation hold; **not adopted/enforced**. No blind max+1 patch, deletion of backwards guard, synthetic tombstone or financial repair.

FIELD005 finite checklist saved inb160689a: three reused bounded runtime items, one source-only mapping; F005-R1/R2/R3 remain policy/designOPEN, R4/R5 hosted/recoveryBLOCKED. [Decision and recovery criteria](P0-FIELD005-RETENTION-DECISIONS-20261026.md). No new FIELD005 runtime execution or retention approval.

45register rows29CLOSED_SOURCE/7OPEN/9BLOCKED unchanged; inventory incomplete/percentage null; **NO-GO**. No merge/deploy/main/P1/P2. This documentation checkpoint uses[skip ci]; no new execution claimed for docs-only content.

**Next exact action:** Add a native IndexedDB fault regression with sale1/manual-adjustment2/sale3 and the real cloud-sync client: unsupported2 must preserve its envelopes and later operations, never silently skip/ACK or advance upload. Keep simulated transport/client evidence separate from canonical HTTP session/device/SQL proof. Adopt a reviewed gap/non-commerce/recovery contract before changing server admission; no speculative financial repair.

---

## FIELD005 finite retention checklist reconciled — 2026-10-26

Source-reviewed6e94a8e; accepted executableacf6c8d and56CI/44targeted/721broader evidence reused only. **No new runtime/CI or application/schema/grant/hosted change.** [Decision and recovery criteria](P0-FIELD005-RETENTION-DECISIONS-20261026.md), [machine checklist](evidence/P0-FIELD005-RETENTION-FIELDS-20261025.json). Three bounded runtime items reused, one source-only inventory reconciled; literal purge inventory58statements/57tables is limited to one function and is not a full-schema/P0 denominator.

Remaining: **F005-R1 OPEN_POLICY** admin identity snapshots; **R2 OPEN_POLICY** financial/receipt/audit schedule; **R3 OPEN_POLICY_AND_DESIGN** emergency payload privacy/integrity/deletion contract; **R4 BLOCKED** authorized historical inventory/trusted-payload recovery; **R5 BLOCKED** hosted copies/media/backup/restore disposition. Hashes cannot reconstruct erased payloads; no fabricated content, silent rehash or verifier bypass. Existing audited deletion409 remains.

FIELD005 remainsOPEN;45register rows29CLOSED_SOURCE/7OPEN/9BLOCKED unchanged, inventory incomplete/percentage null; **NO-GO**. Policy/design decisions and hosted scope are explicit dependencies, not a reason to repeat accepted deletion proofs.

**Next exact action:** Inspect CASHIER-SYNC-SEQUENCE-001's existing accept1/accept3/reject2 diagnostic and live admission/drain path; reconcile the remaining gap/tombstone/late recovery contract before selecting a bounded regression. No speculative financial repair, merge/deploy or P1/P2.

---

## FIELD005 emergency creation/deletion race fixed within bounded source scope — 2026-10-26

Accepted executable **acf6c8d68dda271f97d9275d9b24407d3343a60f**: **56/56 CI SUCCESS**, no pending/failed/cancelled runs at acceptance. Real mounted management+emergency HTTP/SQL lane: **44TAP PASS**, zero failed/skipped/cancelled; owner fixture14TAP(13functional), three newfunctional over accepted72f01da4. Targeted run40247798744/job121332970467; source checkout tree matched. Separate canonical full-app suite13TAP is included in that lane; the owner fixture itself is mounted actual routers, not full-app acceptance.

New finding **MERCHANT-DELETION-EMERGENCY-RACE-002** reproduced on1d894be3/run40247342559/job121331597782: a fixture gate paused canonical emergency INSERT after the merchant eligibility read; owner deletion200 completed, then creator201 left one active emergency request on the deleted merchant. Audit remained200/valid; no deleted-merchant snapshot disclosure or hosted incident asserted. Fix keeps merchant eligibility locked FOR UPDATE through emergency request/audit commit; existing emergency-ledger deletion409 remains. No retention exception, hash rewrite, schema/ACL or hosted change.

Acceptance proves two bounded SQL-overlap schedules (including post-validation gate) and completed-deletion404, legitimate creation201/deletion409, valid audit, exact peers and ordinary unaudited deletion. Initial harness missed scope-issuer and later transitive waits; diagnostics and unsuccessful attempts remain in [evidence](evidence/P0-DELETION-EMERGENCY-CONCURRENCY-20261025.json). Prior32fd10e0 broader runs49SUCCESS/7CANCELLED are not whole-source acceptance. Priorca2c90c7 browser cleanup failed then passed exact-source retry; final source browser passed without code changes for that cleanup.

Broader [isolated audit40247798502](https://github.com/nora953/fawri-production-source/actions/runs/40247798502)/job121333162482: **721TAP PASS**,92invocations/90unique files; zero failed/skipped/cancelled and exact source tree matched. Owner deletion fixture is not selected in this broader lane; its evidence is the separate targeted lane above.

**FIELD005 and retention policy/history remain OPEN; NO-GO.** Register45/statuses29CLOSED_SOURCE/7OPEN/9BLOCKED unchanged; inventory incomplete/percentage null. No all-schedule/capacity/hosted claim, no historical repair, no merge/deploy. Audited-merchant deletion remains blocked pending an explicit privacy-preserving retention contract.

**Next exact action:** Reconcile FIELD005 into a finite field/lifecycle checklist using this accepted concurrency evidence; prepare remaining retention/privacy decisions and historical-chain recovery acceptance criteria. Do not invent retention durations, approve admin-identity snapshot retention, rewrite chain hashes or infer hosted acceptance.

---

## FIELD005 concurrency attempt: overlap not proven — 2026-10-25

Source20703a6b/run40218027798/job121243499529 executed actual deletion/emergency requests behind a merchant row gate. Required2SQLwaiters were not observed within5s;fixture10PASS/2FAIL(1functional+parent). **Harness failure, not product race evidence or PASS.** No application changes. Prior72f01da4 bounded pre-existing-ledger mitigation remains accepted; concurrency/policy/history OPEN. [Evidence](evidence/P0-DELETION-EMERGENCY-CONCURRENCY-20261025.json). No merge/deploy/hosted change; releaseNO-GO.

**Next exact action:** Instrument owned authentication-role pg_stat_activity/pg_locks and both request outcomes before gate release; distinguish pool admission, nested refresh and FK/merchant waits. Build deterministic observed business-stage overlap, retain strict negative/peer/chain assertions, rerun exact-source lane. Do not change production locking solely on this harness failure.

---

## FIELD005 emergency ledger corruption reproduced; bounded deletion mitigation accepted — 2026-10-25

Source **72f01da4fb6a2df23108a2bd2e9d805addac3fae**:56/56CI SUCCESS. Initial d97b183b/run40215641483/job121236061026 reproduces completed merchant deletion followed by owner emergency audit503 EMERGENCY_AUDIT_CHAIN_INVALID;fixture8PASS/2FAIL(1functional+parent). Scrubbing audit metadata removes chain_payload/sequence required by global verifier. No hosted incident asserted.

Mitigation blocks purge with409 MERCHANT_DELETION_AUDIT_POLICY_REQUIRED when pre-existing merchant emergency audit rows exist. No implicit PII retention exemption, peer hash rewrite or weakened verifier. Actual mounted management+emergency HTTP/password/session/SQL proof:audited target denial preserves selected snapshots and valid chain; ordinary unaudited merchant still deletes; exact peer emergency ledger remains. Three newfunctional,owner fixture11TAP(10functional+parent);management lane41TAP PASS,run40215851931/job121236694172. Broader721TAP PASS/92invocations/90files,run40215851893/job121236947033;this fixture not selected in broader lane. Both zero failed/skipped/cancelled;checkoutc1c17f75 source tree matched targeted. [Evidence](evidence/P0-DELETION-EMERGENCY-CHAIN-20261025.json).

**Mitigation only, not full resolution:** concurrent emergency insert/deletion not proven; previously damaged chains not repaired; audited-merchant deletion stays blocked pending approved privacy/retention handling. No schema/grant/retention-duration or hosted change. FIELD005 and retention policy gateOPEN;register statuses remain29CLOSED_SOURCE/7OPEN/9BLOCKED;inventory incomplete/percentage null;NO-GO. No merge/deploy.

**Next exact action:** Test concurrent canonical emergency event creation versus owner merchant deletion with observed SQL overlap and strict time bounds. Require no successful deletion that corrupts the global ledger, legitimate denial/retry semantics and peer preservation. No claim of race safety from the current SELECT guard. Retention policy and historical chain repair remain OPEN.

---

## FIELD005 retention field mapping and emergency ledger interaction — 2026-10-25

Recovered ef7c4e79/PR550Draft. Source-only mapping: merchant deletion scrubs merchant name/phone/details snapshots; requesting-admin identity snapshots remain. audit_events details/metadata/IP/user-agent are scrubbed for the merchant, while hash columns remain. Emergency verifier separately requires metadata.chain_payload/sequence: this is an **unconfirmed interaction requiring runtime proof**, not a confirmed defect or permission to retain PII.

[Evidence](evidence/P0-FIELD005-RETENTION-FIELDS-20261025.json). Existing owner deletion test covers authorization/password/foreign request/pending operations/tombstone/replay and selected peers, but not this global emergency ledger interaction. No existing accepted test rerun, code/schema/grant change or new retention duration. FIELD005 and existing P0-RETENTION-PRIVILEGED-DELETION-POLICY remainOPEN; register statuses unchanged; inventory incomplete/percentage null; NO-GO/GitHub-only/no merge/deploy/hosted change.

**Next exact action:** Add a bounded actual-app owner deletion regression with genuine emergency audit events for two owned merchants: verify whether deleting one merchant preserves the global emergency audit verification/authorized owner reader and peer chain, or produces a reproducible failure. Preserve privacy scrubbing, owner/password/pending-operation guards and prior deletion positive; do not change retention durations or weaken hash verification. Treat source metadata dependency as hypothesis until actual runtime proof.

---

## FIELD004 finite closure reconciliation — 2026-10-25

Recovered8eb803e6/PR550Draft/base preserved. [Finite checklist](evidence/P0-FIELD004-AUTHORITY-MAP-20261025.json): four bounded source/runtime or reused-evidence items separated from two unresolved requirements. Debug retirement HTTP accepted; SQL/RLS evidence reused within original limits; Meta durable pipeline is a separate authority, not residual processed_channel_events coverage. No new runtime/CI execution or source changes.

Remaining **F004-R1 OPEN**: intended lifecycle/support/retirement contract for residual tables; **F004-R2 BLOCKED_HOSTED_VERIFICATION**: actual contents, external/dynamic writers and deployed/migration consistency under GitHub-only restriction. No absence theorem, table deletion, new CRUD, historical cleanup or full FIELD004 closure inferred. Current register45/statuses29CLOSED_SOURCE/7OPEN/9BLOCKED unchanged; inventory incomplete/overallPercentage null; releaseNO-GO. Accepted executable86ac8610/56CI/80notificationTAP/721broaderTAP inherited only.

**Next independent action:** Continue FIELD005 source reconciliation of merchant_deletion_requests identity snapshots and audit-retention handling against the existing privileged-deletion/retention gate. Reuse accepted deletion execution tests; identify exact unresolved field/duration policy without inventing retention periods or changing hosted data. FIELD004 unresolved scope and hosted inventory stay explicit.

---

## FIELD004 retired debug HTTP boundary accepted — 2026-10-25

Source **86ac8610591659cee4a0e92d3386ba1e51736d41**:56/56CI SUCCESS. Corrected notification lane40211082822/job121222247568:80TAP PASS,consumer fixture9TAP(8functional+parent),2newfunctional. Broader40211083053/job121222367476:721TAP PASS/92invocations/90files. Both zero failed/skipped/cancelled; checkout64271ced has source-identical tree. Broader excludes this fixture; totals separate. No application/schema/grant change.

Actual-app own merchants/case+slash aliases/foreign hints receive410 LEGACY_BOT_DEBUG_DISABLED without db_path/drafts/pages/product names or peer identity. Invalid actors receive authentication401 or exact unconditional retirement410 before auth; no200 accepted. Selected SQL snapshots stable; no root legacy JSON created; normal notification positive retained. Initial b146efa4 failure preserved as expectation mismatch with earlier legacyBotDebugRouteGuard, not product vulnerability. [Evidence](evidence/P0-FIELD004-DEBUG-HTTP-20261025.json).

FIELD004 remainsOPEN: this is retired-route proof, not complete residual-table writer or hosted inventory acceptance. Register45rows/statuses unchanged; incomplete inventory/percentage null; releaseNO-GO. GitHub-only/no merge/deploy/hosted change.

**Next:** Reconcile FIELD004 finite closure criteria: dormant residual SQL table writer/reader inventory versus accepted durable Meta ingress/worker evidence and verified retired debug route. Keep dynamic/external/historical writer inventory blocked without hosted authorization; do not invent new public readers or repeat accepted debug cases.

---

## FIELD004 debug guard expectation correction — 2026-10-25

Initial b146efa4/run40210760045 failed because tests expected the later helper code and mandatory401. Source inspection located earlier legacyBotDebugRouteGuard: fixed410 LEGACY_BOT_DEBUG_DISABLED can precede session checks. Tests now require exact retirement payload for410 or authentication401 for invalid actors, while preserving no-data/SQL/JSON assertions. No application change or confirmed product finding. Corrected runtime PENDING; prior7a5a5327 acceptance retained; FIELD004OPEN/NO-GO. Next read corrected notification lane and exact-source CI.

---

## FIELD004 actual-app retired debug tests committed — 2026-10-25

Source **b146efa4b0157a5e0d6896cff3efeeb44b749973** adds2functional cases to the existing consumer full-app fixture. Syntax/diff checks PASS; application unchanged. Actual notification-privacy lane run40210760045/job121221275209 is still in progress at this checkpoint; **runtime PENDING, not accepted**. [Evidence](evidence/P0-FIELD004-DEBUG-HTTP-20261025.json). Prior7a5a5327 acceptance retained; FIELD004OPEN/releaseNO-GO. No merge/deploy/hosted interaction.

**Next exact action:** Read run40210760045/job121221275209 for b146efa4, preserve any failure, verify checkout tree and remaining exact-source CI before acceptance. Keep prior7a5a5327 accepted source until checks finish.

---

## FIELD004 authority separation mapped — 2026-10-25

Recovered236f3620/PR550Draft/base preserved. [Bounded source evidence](evidence/P0-FIELD004-AUTHORITY-MAP-20261025.json) separates residual SQL order_drafts/processed_channel_events from legacy Map/runtime JSON and current durable Meta jobs/channel_inbound_events. Reviewed server references for the two residual SQL tables are scoped purge/readiness/schema boundaries, not identified public row readers/producers. No formal absence theorem or table retirement inferred.

Legacy /bot/debug calls readBotProductsForHttp before returning db_path/drafts/pages; helper returns410/null in required-PostgreSQL mode. Legacy Meta webhook also returns410; current queued worker uses separate inbound ledger. These are source findings, not new runtime PASS. Reuse accepted Meta/new-order provenance; no duplicate runtime execution, code/schema/grant change, new CRUD or CI rerun.

FIELD004 OPEN; latest accepted executable7a5a5327 and56CI/38managementTAP/721broaderTAP inherited only. Register45=29CLOSED_SOURCE/7OPEN/9BLOCKED; inventory incomplete, percentage null, releaseNO-GO. GitHub-only/no merge/deploy/hosted interaction.

**Next exact action:** Add a bounded actual-app required-PostgreSQL test for /api/bot/debug (canonical and case/trailing-slash aliases), own/foreign merchant hints, anonymous/admin/wrong-device/session confusion, and proof no draft/page/db_path projection or legacy JSON writes. Reuse current Meta signed-ingress/worker dedup evidence instead of rerunning it or inventing CRUD for the two residual SQL tables.

---

## FIELD003 cross-consumer policy reconciliation — 2026-10-25

Recovered5c7604b5/Draft PR550/base preserved. Source-only review: operations-observability.md explicitly scopes view_merchants health visibility to the early-warning endpoint; auth hardening lists view_logs/view_merchants separately. Generic admin logs intentionally project merchant-linked audit references and whole metadata in current source; this includes merchant incident rows by predicate. This observation is not new HTTP proof or sufficient evidence of intended cross-consumer health-field policy.

[Decision evidence](evidence/P0-AUDIT-CROSS-CONSUMER-POLICY-20261025.json) records concrete alternatives: gate merchant early-warning incident rows/details additionally, or explicitly permit their audit representation under view_logs. No policy silently adopted, source fix, runtime test or CI rerun. FIELD003 remains OPEN; established ordinary log access preserved. Inherited executable7a5a5327/56CI/38managementTAP/721broaderTAP retained. Register45=29CLOSED_SOURCE/7OPEN/9BLOCKED; complete inventoryfalse; percentage null; releaseNO-GO. GitHub-only/no merge/deploy/hosted interaction.

**Next independent action:** Continue RESIDUAL-FIELD-004: trace current order_drafts and processed_channel_events SQL writers/readers versus legacy debug/in-memory order and durable ingress consumers, reusing accepted Meta/new-order reachability evidence. Identify one missing live authority/field boundary; do not add CRUD routes or repeat accepted notification/early-warning proofs.

---

## RESIDUAL-FIELD-003 early-warning merchant telemetry boundary fixed — 2026-10-25

Source **7a5a532727ab8759ef672e9b0748f74717d8b499**: **56/56 CI workflows SUCCESS**, zero pending/failure/cancellation. Recovered8986ecfc; initial failure a8c3d87f and targeted checkpoint9d45716d preserved; previous accepted37f97e75 retained as history.

**EARLY-WARNING-MERCHANT-TELEMETRY-PROJECTION-001 — FIXED_SOURCE within tested actual-app response boundary.** Initial run40204683245/job121203000080:fixture10PASS/3FAIL (2functional+parent). Actual view_logs-only assistant and assistant after SQL view_merchants removal received2per-merchant AI telemetry rows while merchant_health_visible=false and merchant incident history was correctly filtered. Isolated owned fixture evidence, not a hosted incident or actual provider call.

Minimal route correction copies ai_runtime and gates its merchants array using the existing current SQL-backed merchantHealthVisible result at response time. Global aggregate/provider statistics and authorized merchant detail remain unchanged. No SQL history/telemetry storage/schema/grant/entitlement or field-policy change. Existing management workflow now watches early-warning route, history service and telemetry source.

Actual owner/view_logs+view_merchants route creates system+merchant history from two approved/error-channel merchants; real in-process telemetry API receives synthetic usage. Exact15normalized history keys, current SQL-derived incident state and bootstrap-only extra/stale metadata omission PASS. view_logs-only canonical/alias/forged-hint responses omit every owned merchant ID and nested usage row while retaining system history and exact AI aggregates. SQL permission removal overrides original session claims; anonymous/merchant/no-permission/wrong-device/combined-role negatives and owner positive PASS. Selected incident/business SQL snapshots stable. Repeated same-window requests use existing cache code; cache hits not independently instrumented. No provider/browser/hosted acceptance or whole-audit immutability inferred.

Dedicated management lane **38TAP PASS** (34functional+4parents), fixture13TAP(12functional+parent),3newfunctional:run40204790621/job121203336143. Broader **721TAP PASS**,92invocations/90unique files:run40204790680/job121203645959; this fixture is not selected by broader lane. Both zero failed/skipped/cancelled, teardownSUCCESS; both checkout62121e6a have source-identical tree0c63114b8135aca2d0e5ad862cbfc60cd8680c17.

[Evidence](evidence/P0-EARLY-WARNING-FIELD-HTTP-20261025.json). **FIELD003 remains OPEN** for remaining generic audit metadata/details and cross-consumer field policy. FIELD002 candidate remains unenforced, historical/scope items open. Register45=29CLOSED_SOURCE/7OPEN/9BLOCKED; completeP0Inventoryfalse; overallPercentagenull; **release NO-GO**. GitHub-only/no merge/deploy/hosted/provider interaction.

**Next exact action:** Reconcile merchant-scoped early_warning_incident metadata in the generic /api/auth/admin/logs projection against the declared view_logs versus view_merchants policies. Preserve the established ordinary global-admin-log contract; distinguish an intentional audit reference from restricted merchant health/usage details before asserting a new defect. Use only missing actual-app positive/negative field proof justified by source policy; do not repeat accepted early-warning or emergency cases. FIELD002 candidate/history/scope items remain open.

---

## RESIDUAL-FIELD-003 owner-only emergency audit alternate projection fixed — 2026-10-25

Source **37f97e75b17e1131ab364a218dfbc3eb34c4e5e1**: **56/56 CI workflows SUCCESS**, zero pending/failure/cancellation. Recovered a363d0d8; failed3e631f0a and targeted checkpoint fa3d2ad8 preserved; previous accepted4e36d591 retained as history.

**EMERGENCY-AUDIT-ALTERNATE-PROJECTION-001 — FIXED_SOURCE within tested HTTP/SQL boundary.** Actual owner-created requests under2merchants generated4canonical SQL emergency events. A view_logs-only assistant received403 from the dedicated owner-only audit but4events including chain metadata from general admin logs. Initial run40193604397/job121169614760:fixture8PASS/2FAIL (1functional+parent). This is an observed alternate read-projection authorization defect in an isolated owned fixture, not a hosted incident or credential compromise.

Minimal correction: current SQL-backed admin profile supplies an explicit owner flag; SQL excludes emergency_read_access rows for other log readers before ordering/limit, preserving NULL entity ordinary rows. Helper defaults to excluding owner-only events. No user query/body hint controls the flag. Owner keeps existing general/dedicated audit visibility; ordinary log fields/meta, chain/storage, transaction/ACL/schema remain unchanged.

Corrected actual app proof: owner positive and assistant dedicated denial; view_logs-only/manager generic canonical+mixed-case/trailing-slash/forged-owner-hint requests return0emergency rows; owner retains all4. Ordinary log exact actor/details/reason/string+number meta, filtered nested/bool meta, anonymous/merchant/no-permission/current-SQL-permission-revocation negatives and complete selected SQL read snapshots PASS. Dedicated management lane **35TAP PASS** (31functional+4parents), fixture10TAP(9functional+parent);3newfunctional. Run40193882711/job121170462946. Broader **721TAP PASS**,92invocations/90unique files, run40193883147/job121170697031; fixture is not selected by broader lane. Both zero failed/skipped/cancelled and teardownSUCCESS. Both checkout40205fad have source-identical tree e1731ae10436c5023e7d8743cd5ae28dae371022.

[Evidence](evidence/P0-AUDIT-FIELD-BOUNDARY-20261025.json). Bounded literal source map:17exact-table SQL references,11INSERT sites across9producer files,5read sites across3consumer files in839tracked source files. Emergency, general logs and normalized incident history have different field/role contracts; no formal whole-program/historical/hosted proof or generic meta allowlist acceptance. Existing direct incident opened/dedup/resolved proof is not HTTP field coverage.

**FIELD003 remains OPEN; FIELD002 candidate remains unenforced; release NO-GO.** Register45=29CLOSED_SOURCE/7OPEN/9BLOCKED; completeP0Inventoryfalse; overallPercentagenull. GitHub-only/no merge/deploy/provider/hosted change.

**Next exact action:** Exercise actual /api/auth/admin/early-warning incident_history projection with view_logs-only versus view_logs+view_merchants and owner actors, current system/merchant incident producers, selected normalized metadata, denial/permission revocation and stable SQL lifecycle snapshots. Reuse existing direct sync opened/dedup/resolved proof; do not count it as HTTP field acceptance or repeat the accepted emergency generic-log boundary. FIELD002 candidate remains unenforced and its historical/scope items stay open.

---

## RESIDUAL-FIELD-002 response-field contract candidate assessed — 2026-10-25

Recovered **f0bd2b06**, Draft PR550/base preserved. Prepared an explicit per-type response-field candidate for12client shapes, canonical common fields and current inspection lifecycle enrichment. Candidate permits **no extra keys** beyond each type's enumerated required/optional fields. Unknown/malformed records are retained as failures under the existing strict client contract; no silent row filtering, defaulted lifecycle, historical relinking or SQL rewrite.

**Local candidate/client assessment:6PASS/0FAIL/0SKIP/0CANCEL**, Node v24.22.1. Actual frontend validator/read client imported; source-derived synthetic objects and in-process fetch adapter only. All12valid full shapes remain identical; optional absence, missing required fields, invalid URL/value, unlinked inspection, unknown mixed list, read path identity/timestamp negatives checked. Literal current page accesses and all12validator key sets fit the candidate. No SQL/application HTTP/browser/hosted execution; no new CI run.

**Compatibility change is explicit:** actual current client accepts and returns extra fields; candidate removes them (including synthetic customer-message order_id retained by the previous reserved-key regression). Candidate is **NOT_ENFORCED / NOT_POLICY_ADOPTED**. It establishes known-shape compatibility, not historical/custom-consumer compatibility or an attacker-controlled leak. The current unread-count hook counts array rows without per-record validation; no unknown-row filtering proposed. Read HTTP may commit before frontend validation; client rejection is not SQL rollback.

[Candidate field table and limits](P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.md), [machine contract](evidence/P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.json), [local assessment](evidence/p0-notification-response-field-contract.test.mjs). FIELD002-R1 stays OPEN with a concrete tested candidate; R2 historical disposition BLOCKED_HOSTED_VERIFICATION; R3 intended producer scope OPEN. No product code/schema/grant/retention change. Executable4e36d591 retains inherited56/56CI,78notificationTAP,721broaderTAP; local6 are separate. Register45=29CLOSED_SOURCE/7OPEN/9BLOCKED, inventory incomplete, overallPercentage null, **NO-GO**. GitHub-only/no merge/deploy.

**Next exact action:** Continue RESIDUAL-FIELD-003: map actual audit_events producers, metadata/details projections and current role-scoped HTTP consumers against existing emergency, management and incident evidence. Select one concrete unproved field boundary; do not rerun accepted notification cases. FIELD002-R1 remains a tested candidate, not enforced or closed; retain R2 hosted disposition and R3 intended producer scope.

---

## RESIDUAL-FIELD-002 finite acceptance reconciliation — 2026-10-25

Recovered **04552d16** / Draft PR550, base unchanged. Documentation-only reconciliation: corrected stale pending markers across12client types and linked11accepted executable evidence records after ancestry verification; current source anchors12/12 and client type set match. **8types** have bounded canonical caller→SQL→actual app→actual frontend-validator evidence; **1new-order type** has direct SQL producer proof with no identified application caller; **3legacy JSON types** have source/synthetic-client compatibility only. These categories are not a P0 completion percentage.

Current acceptance matrix and finite checklist: [field map](P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.md) / [machine evidence](evidence/P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.json). Five checklist items record bounded runtime/source acceptance; three unresolved items: **FIELD002-R1** non-reserved response-field/unknown-record policy, **FIELD002-R2** hosted historical inventory and incompatible/unlinked-row disposition (BLOCKED under GitHub-only restriction), **FIELD002-R3** intended producer scope for new-order and legacy types. No new defect, cleanup policy, product caller, code change, runtime execution or CI rerun claimed.

Retain executable **4e36d59149f1ac3b7b1cad91c93a09aff9146612** and its verified56/56CI,78notificationTAP,721broaderTAP as inherited evidence. **FIELD002 OPEN; release NO-GO;45register rows=29CLOSED_SOURCE/7OPEN/9BLOCKED; inventory incomplete; overallPercentage null.** No merge/deploy/hosted/provider interaction.

**Next exact action:** Prepare a compatibility-preserving FIELD002-R1 response-field contract from the reconciled 12 type shapes and current inspection enrichment: explicit allowed extra keys, unknown/malformed record behavior and historical compatibility impact. Do not change production projection, enable retired producers or claim hosted data acceptance until that contract and source evidence justify remediation.

---

## RESIDUAL-FIELD-002 canonical reserved notification fields fixed — 2026-10-25

Source **4e36d59149f1ac3b7b1cad91c93a09aff9146612**: **56/56 CI workflows SUCCESS**, zero pending/failure/cancellation. Recovered0b9b90df; initial failure13a11406 and targeted checkpoint c8f45035 preserved. Previous accepted executable31912d9f retained as history.

**NOTIFICATION-RESERVED-FIELD-PROJECTION-001 — FIXED_SOURCE within the tested canonical contract.** Synthetic conflicts in privileged-bootstrap owned rows replaced projected id/type and forged read_at on SQL-unread rows; created_at was already canonical. This is correctness/defense-in-depth evidence, not proof of public attacker input, unauthorized access, hosted incident or malformed historical rows. Minimal projection fix copies variables and removes id/type/created_at/read_at before canonical SQL fields are mapped. Stored JSON and other business/extra keys stay unchanged; no schema/grant/frontend-validator change or general per-type extra-key allowlist.

Actual app and restricted SQL proof: list/unread retain canonical id/type/created_at and omit read_at for unread rows; own read/replay use canonical path identity and timestamps; peer read404 and peer state preserved; null/number/object reserved values cannot corrupt canonical records; actual frontend validator accepts output. Three new functional cases; extended fixture27TAP (26functional+parent). Dedicated notification lane **78TAP PASS** (72functional+6parents), run40188627730/job121154645813. Broader isolated PostgreSQL **721TAP PASS**,92invocations/90unique files, run40188627644/job121154872673. Both zero failed/skipped/cancelled; teardown SUCCESS. Three new cases run only in the dedicated lane. Both checkout384c568a have source-identical tree af9ada1b7c012d220917d3b340b8af6e159f1e99.

[Evidence](evidence/P0-NOTIFICATION-RESERVED-FIELDS-20261025.json). **FIELD002 remains OPEN; release NO-GO.** Register unchanged45rows=29CLOSED_SOURCE/7OPEN/9BLOCKED; complete inventory false; overall percentage null. GitHub-only; no merge/deploy/hosted/provider proof.

**Next exact action:** Reconcile a finite RESIDUAL-FIELD-002 closure checklist across the 12 notification types and linked evidence: live canonical producers/callers, inactive JSON/legacy shapes, reserved canonical fields, non-reserved extra-key policy and unlinked historical/hosted rows. Identify precise remaining source acceptance versus blocked policy/hosted proof before closing; do not infer attacker key control or repeat accepted scenarios.

---

## RESIDUAL-FIELD-002 canonical inspection creation race fixed — 2026-10-25

Source **31912d9fd33c9e12311351c189b937652496c6fb**: **56/56 CI workflows SUCCESS**,0pending/failure/cancellation. Recovered a0d014a0; targeted checkpoint e85c2465 preserved proof; prior57b554a0 acceptance retained. Application change:18lines in canonical inspection authority only; no schema/grant/role/consent-policy change.

**SUPPORT-INSPECTION-CONCURRENT-CREATE-001 — FIXED_SOURCE within tested canonical path.** Initial e9c25726 run40187310176/job121150735692 observed2trusted SQL transactions at INSERT gate,HTTP201+201,2requests+2notices for one merchant across two assigned tickets; peer progressed. Fixture22PASS/2FAIL includes1functional failure+parent. This violates the existing one-active-inspection rule, not evidence of unauthorized access or a hosted incident. Correction locks merchant before ticket/request checks and revalidates ticket merchant identity; preserves assignment/status/consent checks and merchant→ticket lock order. Old/unused creator and privileged raw SQL are not globally constrained by a new DB uniqueness policy.

[Notification40187591978/job121151571011](https://github.com/nora953/fawri-production-source/actions/runs/40187591978/job/121151571011): **69functional/75TAP across6files PASS**,0fail/skip/cancel. Fixture23functional/24TAP includes **1new bounded concurrency case**,22prior cases reused. Actual authenticated canonical HTTP requests overlap in SQL at insert_gate+merchant_serialization, return201+409 with SUPPORT_INSPECTION_ALREADY_ACTIVE, exactly1request/notice and no loser writes. Peer creates while own gated and retains exact state afterward. Actual app list/read and actual frontend validator PASS. Merchant rejection releases eligibility; scoped notice INSERT failure rolls back request/lock, subsequent real retry succeeds. [Evidence](evidence/P0-INSPECTION-CONCURRENT-CREATE-20261025.json) retains original failed run and corrected observations.

[Broader40187592067/job121151701144](https://github.com/nora953/fawri-production-source/actions/runs/40187592067/job/121151701144): **92clean invocations/90unique files/721TAP PASS**,0fail/skip/cancel; cleanupSUCCESS. Dedicated case not selected there, so broader count unchanged; do not add totals as unique tests. Both checkoutcd3a07dc2052c2f451461dc67eeeb9360944046d/tree 6dd65e1ad85d64b6ba7c5640769a8187b4290dd2 equal source. No blanket zero-skip claim for unrelated optional quality tests.

Owned disposable trigger/advisory gate and legitimate actors only. No application handler override or provider sends. No load-capacity/browser/hosted or simultaneous lifecycle/reassignment/deletion proof. No historical duplicate cleanup or unused-helper repair. Finding tracked within existing FIELD002, not a new P0 denominator.

**Next exact batch:** Verify canonical SQL notification identity/timestamps cannot be replaced by conflicting reserved keys in stored variables through actual app list/read and frontend validation. Use synthetic owned rows only and distinguish correctness/defense-in-depth evidence from proof of attacker-controlled input. Retain extra-key/historical policy and unproved producer races explicitly. FIELD002/full HTTP/role/field gatesOPEN;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Last fully accepted executable31912d9f. **NO-GO**; GitHub only,PR550Draft/base preserved; no main/merge/deploy/hosted/P1/P2. Earlier PREPARED/PENDING headers historical for this bounded accepted scope.

---

## RESIDUAL-FIELD-002 concurrent subscription notification refresh accepted — 2026-10-25

Source **57b554a0ea1c2caf7fa258145a9ec38c19b68b8e**: **56/56 CI workflows SUCCESS**,0pending/failure/cancellation. Recovered92f8c296; targeted checkpoint14a9c95d preserved proof; previous6182678d acceptance retained. Tests/docs only; no application/schema/ACL change.

[Notification40186343958/job121147829330](https://github.com/nora953/fawri-production-source/actions/runs/40186343958/job/121147829330): **68functional/74TAP across6files PASS**,0fail/skip/cancel. Extended fixture22functional/23TAP includes **2new cases**,20prior cases retained. Real authenticated app list requests enter unchanged canonical refresher SQL. Owned bootstrap row locks gate execution; pg_stat_activity observes distinct restricted SQL waiters, proving overlap beyond Promise.all. Same-tenant reminder cohort observed2waiters, gated replay2waiters; peer completed while own subscription locked/unchanged. Four new subscription/add-on notices across two merchants, then six actual blocked requests across both tenant rows produce exactly2expired notices. Exact SQL variables/identities/time/markers→app→actual frontend validator, original notice preservation and stable repeats PASS. All subscription/batch business fields except intended sent markers/updated_at unchanged.

Fixture-only primary pool8; bounded5s observation/10s HTTP abort; finally rollback/release and request drain. Seeded eligible states, no provider or production pool change. This is bounded idempotency/tenant proof, not load-capacity/latency/crash/concurrent-billing-cycle/hosted/browser acceptance. Existing failure and consent/lifecycle proofs reused, not new concurrency findings.

[Broader40186343833/job121147829299](https://github.com/nora953/fawri-production-source/actions/runs/40186343833/job/121147829299): **92clean invocations/90unique files/721TAP PASS**,0fail/skip/cancel; cleanupSUCCESS. Two new cases are dedicated-lane only; broader721unchanged, totals not added as unique tests. Both checkoutbeefaa1992732689234a534f8f99297dcfa59472/tree f40d40aabf16f12e3064e1d9c8e66487d18938be equal source. No blanket zero-skip claim for unrelated optional quality tests. [Evidence](evidence/P0-NOTIFICATION-CONCURRENT-REFRESH-20261025.json). Legacy local-client4PASS remains separate.

**Next exact batch:** Test concurrent canonical inspection-request HTTP creation for the same merchant on two independently assigned active tickets; verify at most one active inspection/request notice, explicit loser denial, rollback and peer preservation with observed SQL overlap. Reuse accepted sequential409 proof. Do not infer a race defect from source alone; historical/extra-reserved-key policy remains open. FIELD002/full HTTP/role/field gatesOPEN;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Last fully accepted executable57b554a0. **NO-GO**; GitHub only,PR550Draft/base preserved; no main/merge/deploy/hosted/P1/P2. Earlier PREPARED/PENDING headers historical for this bounded accepted scope.

---

## RESIDUAL-FIELD-002 legacy provenance and local client compatibility reconciled — 2026-10-25

Recovered exact HEAD7be0c3ff; PR550Draft/base preserved. [Report](P0-NOTIFICATION-LEGACY-COMPATIBILITY-20261025.md) and [machine evidence](evidence/P0-NOTIFICATION-LEGACY-COMPATIBILITY-20261025.json) record807tracked runtime files text-scanned including embedded NUL,18matching-file digests and exact identifier/mount/guard anchors. Three legacy subscription types originate in AuthDb JSON append helpers/legacy handlers, not accepted canonical SQL producers. Earlier PostgreSQL subscription/notification routes and final legacy guard separate required-mode HTTP paths. Older SQL inspection helper has request_id/minimal shape and only declaration found; canonical caller is separate. Raw JSON inspection shape also lacks authoritative lifecycle enrichment. Source trace is not formal whole-program or hosted runtime proof.

Actual frontend validator/client on source-derived synthetic shapes: **4local cases PASS**,0fail/skip/cancel via Node24.22.1. Three JSON subscription shapes structurally valid; older SQL inspection shape invalid; key rename alone insufficient; mixed response with incompatible row rejected by actual client. Fetch adapter only, no SQL/application HTTP/network. First local attempt3P/1F was invalid synthetic previous_plan_name bronze, corrected to valid gold without changing assertions/production code. [Local TAP](evidence/p0-notification-legacy-shapes.tap). This is local client-contract evidence, not actual legacy producer/SQL/HTTP or data migration acceptance.

No product/schema/ACL/frontend behavior changes, hosted data inspection, import/cleanup/relink/deletion or retention-policy decision. No new CI claimed/rerun required for this docs/evidence-only batch. Last fully accepted executable **6182678d**,56/56CI,notification72TAP,broader721TAP unchanged. No historical rows inferred from source or synthetic examples.

**Next exact batch:** Test concurrent actual authenticated notification-list refreshes for the same merchant and a peer with eligible subscription/add-on states; require one notice per source, stable sent markers, no duplicate side effects and tenant separation. Keep historical/extra-reserved-key policy unresolved; do not invent data repair or cleanup. FIELD002/full HTTP/role/field gatesOPEN;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. **NO-GO**; GitHub only,PR550Draft/no main/merge/deploy/hosted/P1/P2. Do not repeat accepted sequential/lifecycle proofs as new concurrent acceptance.

---

## RESIDUAL-FIELD-002 inspection ending lifecycle bounded runtime accepted — 2026-10-25

Source **6182678d76e97e315df428bd2739af284afea420**: **56/56 CI workflows SUCCESS**,0pending/failure/cancellation. Recovered6fe8bb50; targeted checkpoint36af6980 preserved results during CI; previous06c04523 projection fix accepted separately. Tests/docs only; no application/schema/ACL change.

[Notification40183582956/job121139560915](https://github.com/nora953/fawri-production-source/actions/runs/40183582956/job/121139560915): **66functional/72TAP across6files PASS**,0fail/skip/cancel. Extended fixture20functional/21TAP includes **3new cases**,17prior cases retained as regression. Actual merchant HTTP termination ends real HTTP-created preview; canonical admin-list lifecycle expires owned pending request and approved window/preview. Current SQL→actual app list/read→actual frontend validator matches request status/consent/deadline/end fields. Foreign notice/termination denied; ended preview snapshot409; repeated read/refresh and inactive/expired action denial preserve state. Exact peer tickets/messages/requests/notices/preview rows preserved.

Only owned fixture timestamps are aged; actual service clocks and lifecycle execute normally. No timer cadence, real-time waiting, browser/physical-device/provider/hosted proof. Approved consent remains approved after window end, with session_expires_at/ended_at/end_reason exposing end state; not a new consent policy. No historical data inspected or repaired, no concurrent lifecycle or other ticket transition acceptance.

[Broader40183582871/job121139560368](https://github.com/nora953/fawri-production-source/actions/runs/40183582871/job/121139560368): **92clean invocations/90unique files/721TAP PASS**,0fail/skip/cancel; cleanupSUCCESS. Broader count unchanged: three new cases run in dedicated notification lane only; totals not added as unique tests. Both checkout3ddc074ed07f7a991b1a06a202fdfb6551a48201/tree 8c21cb0b71b729a5e8d84111c6322f5ef9281b96 equal source. No blanket zero-skip claim for unrelated optional quality tests. [Evidence](evidence/P0-SUPPORT-NOTIFICATION-ENDING-20261025.json).

**Next exact batch:** Reconcile historical/legacy inspection notification shapes and legacy subscription/notification helper reachability using current source and owned fixtures. Identify exact compatible/unlinked forms before any repair; do not infer hosted historical contents or invent data-retention/cleanup policy. FIELD002/full HTTP/role/field gatesOPEN;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Last fully accepted executable6182678d. **NO-GO**; GitHub only,PR550Draft/base preserved; no main/merge/deploy/hosted/P1/P2. Earlier PREPARED/PENDING headers historical for this bounded accepted scope.

---

## RESIDUAL-FIELD-002 Support callers and inspection projection bounded runtime accepted — 2026-10-25

Source **06c045233853ad897b99ae2cd72582274e69e65c**: **56/56 CI workflows SUCCESS**,0pending/failure/cancellation. Recovered c4541295; targeted checkpoint5e90aa16 preserved evidence during CI; prior ac1cd586 acceptance retained. Application change confined to canonical notification list/read projection; no schema/ACL/frontend-validator/consent-authority changes.

**SUPPORT-INSPECTION-NOTIFICATION-PROJECTION-001 — FIXED_SOURCE within this scope:** Actual canonical inspection caller produced SQL notices lacking mandatory request_status/current decision fields in app list/read. Original source741c371a run40170722701/job121100822960 had3functional failures+parent (13PASS/4FAIL in fixture). Preserve failed evidence; not accepted. Correction batch-loads matching current merchant-owned inspection rows inside existing list/read transaction, binds source/request/ticket identities and maps current lifecycle fields. Stored stale lifecycle keys cannot override authoritative state; unmatched rows receive no fabricated status. No grant or consent transition changed. This bounded finding is tracked within existing FIELD002, not a new P0 denominator.

[Notification40170910749/job121101365168](https://github.com/nora953/fawri-production-source/actions/runs/40170910749/job/121101365168): **63functional/69TAP across6files PASS**,0fail/skip/cancel. Extended fixture17functional/18TAP includes **6new cases**,11prior cases retained. Actual assigned assistant inspection HTTP caller→request/notice SQL→merchant app list/read→actual frontend validator; actual owner-admin lifecycle list→reply-reminder fields/marker; improper admin denial, peer notice/decision denial, exact peer state, read/replay and duplicate inspection409. Scoped disposable notification INSERT failures roll back inspection request+notice and reminder+marker before real HTTP retry. Pending/approved/rejected current fields, session deadline, stale stored values and synthetic foreign-source/wrong-ticket checks PASS. Private reason is absent from notification projection.

[Broader40170910900/job121101480788](https://github.com/nora953/fawri-production-source/actions/runs/40170910900/job/121101480788): **92clean invocations/90unique files/721TAP PASS**,0fail/skip/cancel; cleanupSUCCESS. Broader count unchanged: six new cases run in dedicated lane only, not added as unique tests. Both checkout59db804d754c7977517a2af3da8ab4b78b8e89d4/tree ebcbd617d2b8d7b987192875cf26866322256d4e match source. No blanket zero-skip claim for unrelated optional quality tests. [Evidence](evidence/P0-SUPPORT-NOTIFICATION-CALLER-20261025.json).

Older createInspectionRequestPostgres/refreshSupportLifecyclePostgres helpers have only declarations in inspected literal runtime identifier scan; current tested callers use separate canonical modules. Source provenance only, not a formal call graph/runtime absence/historical repair acceptance. Synthetic unlinked/mismatched records remain frontend-invalid and are not auto-repaired; unknown-key policy, expiry/termination/concurrent races/browser/provider/hosted acceptance remain unproven.

**Next exact batch:** Extend current inspection projection acceptance to expiry and terminated/ended sessions through canonical lifecycle/HTTP, preserving tenant/reference binding and actual frontend validation. Then reconcile unlinked historical/legacy notification rows and remaining legacy types without inventing cleanup policy or new-order caller. FIELD002/full HTTP/role/field gatesOPEN;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Last fully accepted executable06c04523. **NO-GO**; GitHub only,PR550Draft/base preserved; no main/merge/deploy/hosted/P1/P2. Earlier PREPARED/PENDING headers historical for this bounded accepted scope.

---

## RESIDUAL-FIELD-002 subscription list caller bounded runtime accepted — 2026-10-25

Source **ac1cd586a51dea417ace5b1e3ff818c8ec58f4ce**: **56/56 CI workflows SUCCESS**,0pending/failure/cancellation. Tests/docs only; no application/schema/ACL/policy change. Recovered e81c2cd8; targeted checkpoint c1703299 preserved results during CI; prior d86d7c11 acceptance retained.

[Notification40155088840/job121054660846](https://github.com/nora953/fawri-production-source/actions/runs/40155088840/job/121054660846): **57functional/63TAP across6files PASS**,0fail/skip/cancel. Operational fixture11functional/12TAP includes **4new cases**, seven existing cases retained as regressions. Actual authenticated app list invokes canonical subscription refresher, producing subscription_expiry_reminder, subscription_expired and addon_expiry_reminder with exact SQL/source/identity/variable/time fields validated by actual frontend code. Two merchants; empty/expired/distant batches excluded, only eligible marker written; peer list/query identity isolation, foreign read404, own read/replay and exact peer subscription/batch/notice preservation PASS.

Scoped disposable addon-notice INSERT failure after earlier reminder insertion/marker update returns503 and rolls back all three-table snapshots; actual HTTP retry creates both notices/markers. Seeded subscription/batch counters are not purchase/full balance-accounting acceptance. No background scheduler cadence, concurrent refresh, crash, browser rendering, external provider or hosted acceptance. First source c2b1b1e8 failed two test-only time checks plus parent: Date.parse(pg Date object) lost milliseconds through string conversion. Corrected getTime retains identical bounds; failed attempt retained in [evidence](evidence/P0-SUBSCRIPTION-NOTIFICATION-CALLER-20261025.json), not accepted or hidden.

[Broader40155088913/job121054721070](https://github.com/nora953/fawri-production-source/actions/runs/40155088913/job/121054721070): **92clean invocations/90unique files/721TAP PASS**,0fail/skip/cancel; cleanupSUCCESS. Broader count unchanged: four new cases run only in dedicated notification lane, not added as unique tests. Both checkout67a51c9ec80fc602bb43306d0eea8f4b2ec4587c/tree f79713ab99719508b0ee95f2ba33aa4b56542c00 equal corrected source. No blanket zero-skip claim for unrelated optional quality tests.

[New-order reachability evidence](evidence/P0-NEW-ORDER-NOTIFICATION-REACHABILITY-20261025.json):807tracked runtime files text-scanned including embedded NUL; canonical new-order SQL helper only declared, no caller identified. Legacy createOrder uses JSON/AuthDb notice in required-mode-disabled Meta flow; literal backend orders INSERT is cashier sync/source_channel cashier. Source-only reconciliation, not runtime absence/commercial online-order journey proof or permission to add a feature. Preserve direct SQL-producer acceptance separately.

**Next exact batch:** Trace current canonical Support inspection request and reply-reminder producers/callers through actual app/frontend; distinguish older postgresSupportAuthority helpers and reuse existing Support role/lifecycle proofs. Do not invent an application caller for the new-order SQL helper. FIELD002/full HTTP/role/field gatesOPEN;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Last fully accepted executable ac1cd586. **NO-GO**; GitHub only,PR550Draft/base preserved; no main/merge/deploy/hosted/P1/P2. Earlier PREPARED/PENDING headers are historical for this bounded accepted batch.

---

## RESIDUAL-FIELD-002 Meta knowledge-gap caller bounded runtime accepted — 2026-10-25

Source **d86d7c11a9634f870acda08f863d2237dbbe5bbc**: **56/56 CI workflows SUCCESS**,0pending/failure/cancellation. Tests/docs only; no application/worker/schema/ACL/policy changes. Recovered d6377cbb; prior e08e554f customer-message acceptance retained separately.

[Notification40153840340/job121050814318](https://github.com/nora953/fawri-production-source/actions/runs/40153840340/job/121050814318): **53functional/59TAP across6files PASS**,0fail/skip/cancel. Meta suite25functional/26TAP includes **3new cases**, with22prior functional cases retained as regression. Actual restricted worker/encrypted queue/knowledge engine handles2unknown questions: pending_merchant_reply training requests, committed manual handoff, exact merchant/account/source/variable fields in knowledge-gap notices, authenticated app list/read and actual frontend validator. Peer notice excluded from list; peer read404 leaves domain/training/audit snapshot unchanged. Own read replay stable. Signed webhook redelivery/exact queue dedup preserve notices, training/audit/domain/jobs, debit and send count. Loopback fake Graph/synthetic embedding only; no external Meta/browser/crash/forced-reprocessing/notification-write-failure/hosted acceptance. Own successful read does not independently certify every peer table; avoid broader inference.

[Broader40153840344/job121050814314](https://github.com/nora953/fawri-production-source/actions/runs/40153840344/job/121050814314): **92clean invocations/90unique files/721TAP PASS**,0fail/skip/cancel; cleanupSUCCESS. Increase from718 is exactly3new cases. Targeted lane is separate, not added as unique tests. Both checkout e5f117bde705ece7e80b85cf033ca9341e8c7018/tree a667b847de9554366cd05853102f8bd650d4dfd7 equal source. No blanket zero-skip claim for unrelated optional quality tests. [Evidence](evidence/P0-META-KNOWLEDGE-GAP-NOTIFICATION-CALLER-20261025.json).

**Next exact batch:** Reconcile actual operational_new_order production caller and SQL reachability against legacy JSON path, then prepare only missing caller-to-app/frontend runtime coverage. Do not infer unreachability from the four inspected order modules; subscription/Support and historical/legacy provenance remain pending. Four inspected order modules lack a new-order notification call; this subset is not proof of unreachability. Direct-engine knowledge-learning-cycle proof stays separate and unchanged. FIELD002/full HTTP/role/field gatesOPEN;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Last fully accepted executable d86d7c11. **NO-GO**; GitHub only,PR550Draft/base preserved; no main/merge/deploy/hosted/P1/P2. Targeted checkpoint9de792e2 preserved results during CI; no tool/session stall.

---

## RESIDUAL-FIELD-002 Meta customer-message caller bounded runtime accepted — 2026-10-25

Source **e08e554fd159e1f90d05fdf56fe768ea3b3ed4d0**: **56/56 CI workflows SUCCESS**,0pending/failure/cancellation. Tests/CI/docs only; no child/worker/app/schema/ACL/policy changes. Recovered17242509; previous92507e7a acceptance retained.

[Notification40152165456/job121045777664](https://github.com/nora953/fawri-production-source/actions/runs/40152165456/job/121045777664): **50functional/56TAP across6files PASS**,0fail/skip/cancel. Meta suite22functional/23TAP includes **3new cases** plus original19functional/20TAP identity regressions, including16old denial scenarios. Those are reused regressions, not new findings.

Original restricted worker/encrypted queue produces2customer notices tied to actual inbound SQL message/conversation/source event and exact merchant/account/variables/time. Authenticated actual app list/read and actual frontend validator PASS; peer notice read404 leaves nine-domain snapshot unchanged; own read replay retains fields/timestamps/peer notices. Original signed-webhook redelivery plus exact durable enqueue replay leaves jobs/notices/send count/reply debit unchanged and worker.runOnce finds no ready work. One original event uses signed HTTP ingress; the other original durable enqueue omits recipient. Loopback fake Graph/synthetic credentials only; no external Meta/browser/hosted acceptance. Normal dedup is not crash/forced reprocessing/notice-write-failure recovery acceptance.

[Broader40152165630/job121045778830](https://github.com/nora953/fawri-production-source/actions/runs/40152165630/job/121045778830): **92clean invocations/90unique files/718TAP PASS**,0fail/skip/cancel; cleanupSUCCESS. Increase from715 is exactly3new cases. Targeted lane counted separately, not added to718 as unique tests. Both checkout4e86d649511080db8a6e431d8398aca83c86ec9e/tree0e4034beb11145bb9de1253b15a4bc5346adf8d5 equal source. No blanket zero-skip claim for unrelated optional quality tests. [Evidence](evidence/P0-META-CUSTOMER-NOTIFICATION-CALLER-20261025.json).

**Next exact batch:** knowledge-gap actual Meta caller/handoff→training request→notification SQL→authenticated app/frontend. Existing knowledge-learning-cycle test is direct-engine domain proof and must not be presented as this caller round trip; preserve its accepted evidence. New-order caller, subscription/Support templates, concurrent/failure/historical/legacy provenance remain pending. FIELD002/full HTTP/role/field gatesOPEN;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Last fully accepted executablee08e554f. **NO-GO**; GitHub only,PR550Draft/base preserved; no main/merge/deploy/hosted/P1/P2. No tool/session stall.

---

## RESIDUAL-FIELD-002 payment-conflict caller bounded runtime accepted — 2026-10-25

Source **92507e7ab7e55f792c238df65ca8ec8ea5a37403**: **56/56 CI workflows SUCCESS**,0pending/failure/cancellation. Tests/CI/docs only; no application/schema/ACL/policy changes. Recovered6be84a36; previousb0417241 retained separately.

[Notification40148637030/job121035284959](https://github.com/nora953/fawri-production-source/actions/runs/40148637030/job/121035284959): **28functional/33TAP across5files PASS**,0fail/skip/cancel. **New4functional/5TAP** exercise actual recordVerifiedProviderPaymentEvidenceAuthoritative→notification SQL→authenticated actual app list/read→actual frontend validator under2merchants/restricted primaryLOGIN+separate auth. Four invalid caller inputs reject without domain writes; exact variables/account/source identity/local URLs, own legitimate conflict, foreign notice read denial, peer preservation and sequential caller/read replay PASS. Same provider/event IDs remain tenant-separated.

Scoped disposable notification INSERT failure occurs **after payment evidence commits**. One evidence event and paid/reconciliation-required order persist with no notice; exact caller replay deduplicates payment and creates the notice, retaining original order/event rows; subsequent replay stable. This accepts bounded recovery, not atomic payment+notice, real provider retry delivery, crash recovery or cryptographic ingress. Paid state is seeded; prior confirmation/fulfillment proof reused. Frontend validator is actual; no browser rendering/click proof. Fixture grants are broad and RLS-mediated, not hosted least privilege.

[Broader40148637034/job121035284918](https://github.com/nora953/fawri-production-source/actions/runs/40148637034/job/121035284918): **92clean invocations/90unique files/715TAP PASS**,0fail/skip/cancel; cleanupSUCCESS. Targeted lane counted separately. Both checkout17bd9c59a3c1cbc65234f0a34550dbc12dc97490/tree9cb368361532e68118c5b8f9acee191f02306ec0 equal source. No blanket zero-skip claim for unrelated optional quality tests. [Machine evidence](evidence/P0-PAYMENT-CONFLICT-NOTIFICATION-CALLER-20261025.json).

**Next exact batch:** actual Meta customer-message caller→SQL fields→authenticated app/frontend using existing restricted-worker fixture; reuse accepted20TAP Meta job-identity denials. Knowledge-gap/new-order callers, remaining subscription/Support templates, concurrent/historical/legacy provenance and provider/hosted acceptance remain pending. FIELD002/full HTTP/role/field gatesOPEN;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Last fully accepted executable92507e7a. **NO-GO**; GitHub only,PR550Draft/base preserved; no main/merge/deploy/hosted/P1/P2. No tool/session stall.

---

## RESIDUAL-FIELD-002 optional operational runtime accepted — 2026-10-25

Source **b0417241bd9b69dd8f460ce91e044004650266d9**: **56/56 CI workflows SUCCESS**,0pending/failure/cancellation. Tests/docs only; no application/schema/ACL/policy changes. Recovereda2e74076; prior04b7fa85 present-option evidence retained.

[Notification40144065203/job121021573721](https://github.com/nora953/fawri-production-source/actions/runs/40144065203/job/121021573721): **24functional/28TAP across4files PASS**,0fail/skip/cancel. Producer suite7functional/8TAP includes **2new optional-omitted/blank cases**,12new rows/20total. Actual new-order/payment-conflict/knowledge-gap producers→exact SQL variables/source IDs→actual app list/read→actual frontend validator; default service clock, absent optional keys, safe encoded order/conversations fallback URLs, foreign denial, sequential producer/read replay and exact peer preservation PASS. Payment empty/blank sourceEventId exercises existing internal fallback, not an HTTP input contract.

[Broader40144065200/job121021573877](https://github.com/nora953/fawri-production-source/actions/runs/40144065200/job/121021573877): **92clean invocations/90unique files/715TAP PASS**,0fail/skip/cancel; cleanupSUCCESS. Targeted lane counted separately. Both checkout8c38c070eadb6e30027dc7f591d960f86acdbe61,tree28feeaa5a81a0e2af8f3fb8ab86e478dc4cf7e77 equals source. No blanket zero-skip claim for unrelated optional quality tests.

[Evidence](evidence/P0-OPERATIONAL-NOTIFICATION-OPTIONAL-RUNTIME-20261025.json). Existing payment11TAP and Meta-job-identity20TAP passed within broader lane; payment already checks a conflict notice/order ID, Meta denials snapshot notifications among nine surfaces. Reuse those accepted original assertions; they do not establish every caller-to-HTTP/frontend field round trip. Source-only callsites found in postgresMetaAutoReplyIntent (message/knowledge gap) and postgresOrderPaymentProviderAuthority (conflict); new-order SQL caller unreconciled in inspected subset, not proven unreachable.

**Next exact batch:** actual verified-payment conflict authority→notification fields→app/frontend under two merchants/restricted runtime, extending only missing coverage; then Meta caller round trips/new-order reconciliation and remaining subscription/Support templates. Concurrent producer races/historical/legacy provenance remain unaccepted. FIELD002/full HTTP/role/field gatesOPEN;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Last fully accepted executableb0417241; prior04b7fa85 retained. **NO-GO**; GitHub only,PR550Draft/base preserved; no main/merge/deploy/hosted/P1/P2. No tool/session stall.

---

## RESIDUAL-FIELD-002 bounded operational producer runtime accepted — 2026-10-25

Source **04b7fa858c10e7d7d8242b26aa6d6a77e49edc7e**: **56/56 CI workflows SUCCESS**,0pending/failure/cancellation. Tests/CI/docs only; no application/schema/ACL/policy changes. Recovery started at verified5f0d5a8d; earlier FIELD001 acceptance preserved.

[Notification40143199309/job121019046755](https://github.com/nora953/fawri-production-source/actions/runs/40143199309/job/121019046755): **22functional cases/26TAP PASS across4files**,0fail/skip/cancel. New suite5functional/6TAP: actual four SQL producers→eight rows/two merchants→actual app.ts list/single-read→actual frontend validator. Exact keys/values/identity/time, encoded local URLs, foreign-ID/invalid-session denial with unchanged SQL, read replay and producer dedup preserving original timestamps/peer SQL. Ten denied requests in new suite. No root legacy JSON or provider sends. Direct internal calls do not accept upstream caller ownership.

[Broader isolated40143198816/job121019045204](https://github.com/nora953/fawri-production-source/actions/runs/40143198816/job/121019045204): **92clean invocations/90unique files/715TAP PASS**,0fail/skip/cancel; cleanupSUCCESS. Targeted lane counted separately. Both checkoutbfedcfafe95d888ee3c3e18195fefc101043ac8a; tree **de45ce80192be1293147ff1e4d76aa4568baec5f** equals source. No blanket zero-skip claim for unrelated optional quality tests. Runs originated2026-10-24UTC; local acceptance date2026-10-25.

[Machine evidence](evidence/P0-OPERATIONAL-NOTIFICATION-FIELD-RUNTIME-20261025.json); producer map updated with bounded four-type runtime evidence. FIELD002 remains **OPEN_PARTIAL_OPERATIONAL_RUNTIME_ACCEPTED**: absent optional branches, upstream caller ownership, concurrent producer races, remaining subscription/Support types and alternate/historical/legacy provenance are unaccepted. Broad RLS-mediated fixture grants do not prove hosted least privilege. Full HTTP/role/field gates OPEN;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Last fully accepted executable now04b7fa85; priorbd3c518e retained.

**Next exact batch:** optional-absent operational producer branches and fallback action URLs, preserving tenant/replay guarantees; then upstream caller-to-merchant provenance and remaining SQL templates. Do not repeat accepted present-option round trips for recovery alone. **NO-GO**; GitHub only,PR550Draft/current base preserved; no main/merge/deploy/hosted/P1/P2. No tool/session stall occurred.

---

## RESIDUAL-FIELD-002 notification producer field map — 2026-10-25

Created [producer-to-client source map](P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.md) and [machine evidence](evidence/P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.json): **12frontend types**,9reviewed canonical SQL template candidates and3legacy AuthDb definitions. All12source anchors/type-set equality/reserved-key disjointness and11input file SHA256 digests checked. Source64f61f44; last accepted executable **bd3c518eb784608a68539d6a8b9fb9050fff57e8 remains unchanged**. This is source provenance only; no new runtime/CI/per-field acceptance or application/schema/ACL/policy change.

The client validates common/type-specific fields and safe local action URLs, then returns original records. It does not strip unknown keys. The server mapper spreads stored variables after id/type and before timestamps; reviewed literal template key sets contain no reserved-key collision, but generic storage has no per-type allowlist. Arbitrary stored JSON acceptance alone does not prove attacker control or an unauthenticated exploit. Actual producer/caller identity and historical rows must be reconciled before any projection change.

Three balance/plan/emergency type definitions occur in legacy AuthDb merchant_notifications helpers; a matching PostgreSQL audit action string is not a notifications.type producer. Older postgresSupportAuthority SQL helper inspection shape differs from the reviewed current canonical inspection producer. Client mocks and JSON-store operational-notifications test are not SQL-producer-to-HTTP-client runtime proof. Scope/call graph limitations remain explicit in evidence.

**Next exact runtime batch:** four operational types (new order, payment conflict, knowledge gap, customer message) through real notifyMerchant*Postgres producers, exact SQL variable keys, app.ts list/single-read and actual frontend isMerchantNotificationRecord; two merchants, own success, peer preservation, safe encoded action URLs and dedup/replay. No provider sends. Then remaining subscription/Support templates and alternate helper provenance; reuse accepted synthetic list/single/bulk/alias/session proofs.

FIELD001 remains bounded HTTP accepted at64f61f44 (56/56CI, targeted20TAP, broader715TAP); FIELD002 remains **OPEN_SOURCE_PROVENANCE_MAPPED_RUNTIME_PENDING**. Inventory:1accepted selected cell/4open work areas,86schema columns; full HTTP/role/field gatesOPEN,29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Deterministic inventory check/whitespacePASS. **NO-GO**; PR550Draft/unmerged/base preserved; no main/merge/deploy/hosted/P1/P2.

---

## RESIDUAL-FIELD-001 bulk notification read accepted — 2026-10-25

Accepted executable `bd3c518eb784608a68539d6a8b9fb9050fff57e8`: **56/56 returned workflows completed SUCCESS**,0pending/failure/cancellation. No application/schema/ACL/policy change. [Bulk/consumer/notification40102702477/job120897947248](https://github.com/nora953/fawri-production-source/actions/runs/40102702477/job/120897947248): **17functional cases / 20TAP PASS across3files**,0fail/skip/cancel; new bulk5+parent=6, earlier consumer7/notification7. Includes11denied requests with unchanged SQL, valid owner/support-assistant admin positives, anonymous/admin/wrong-device/combined-role/forged-legacy/revoked-session denials, own bulk despite foreign body/query hints, unchanged peer/admin audience/already-read timestamps, mixed-case replay updated0, independent peer success and no root JSON stores. Existing bulk UPDATE includes expired own unread rows; no new retention policy inferred.

[Full isolated40102702222/job120897947012](https://github.com/nora953/fawri-production-source/actions/runs/40102702222/job/120897947012): **92clean invocations / 90unique files / 715TAP PASS**,0fail/skip/cancel; owned cleanupSUCCESS. Targeted HTTP counted separately from92. Both lanes checkout78c7bb33de13c359af5e42cc49e80c016766736c matches source tree3b1fc195dcbab23676c18caf1e8a845b2b7e6c71. No blanket zero-skip claim for unrelated optional quality tests. Runs originated2026-10-24; acceptance reverified2026-10-25.

Evidence: [P0-NOTIFICATION-BULK-HTTP-20261024.json](evidence/P0-NOTIFICATION-BULK-HTTP-20261024.json). [Inventory](P0-RESIDUAL-FIELD-INVENTORY-20261024.md) now records1bounded accepted cell and4selected open work areas, preserving original FIELD001 gap and source evidence. Its86schema columns/19reviewed route rows/61literal SQL refs remain unchanged; no per-field/full-actor policy acceptance inferred. All fieldPrivacyAccepted flags remainfalse for full producer/actor signoff; prior bounded runtime proofs remain valid. Deterministic generator/check and whitespacePASS; documentation-only checkpoint adds no new runtime claim.

**Next exact cell RESIDUAL-FIELD-002**: reconcile canonical SQL notification producer type/key/input provenance with current frontend validator/consumer and existing tests. Current client has type-specific validation and safe local action URL checks; mocked client tests and older operational-notifications JSON-store test are not proof of all canonical SQL producer fields. Determine actual input control/collision and supported keys before any projection change. Reuse accepted list/single/bulk/alias/session proofs.

Full HTTP/role/field gates remain **OPEN**;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. One accepted mutation/actor cell does not close the entire notification or P0 domain. **NO-GO**; PR550Draft/unmerged/base preserved; no main/merge/deploy/hosted/P1/P2. Earlier prepared/pending/next-bulk notes below are historical for this accepted scope.

---

## P0 bounded residual field inventory created — 2026-10-24

[Machine-readable inventory](evidence/P0-RESIDUAL-FIELD-INVENTORY-20261024.json) and [field/role/route report](P0-RESIDUAL-FIELD-INVENTORY-20261024.md): **8 tables / 86 schema columns**,19 reviewed route rows,61 literal SQL references from312 runtime files. Source revision53f4f4b0; last accepted executable **fc00437ff93c1d055b2218aaa0e3b54fe8519383 remains unchanged** (56/56 CI SUCCESS and715 broaderTAP retained). This batch changes audit documentation/generator only; no new application runtime/CI acceptance claimed.

Reproducible extraction uses0051 canonical snapshot, explicit reviewed column/role mappings, source function anchors and SHA256 inputs. `python docs/final-audit/tools/build_residual_privacy_inventory.py --check` PASS;86unique table/column keys exactly match snapshot; no missing/extra classification; source runtime/schema diff against53f4f4b0 empty; whitespacePASS. The generator fails on input drift or missing anchors. Literal SQL/function scan is not a complete dynamic dataflow proof;19 reviewed rows are not an exhaustive endpoint denominator. Every fieldPrivacyAccepted remainsfalse for full producer/actor policy signoff; earlier bounded runtime acceptance is not revoked.

Five selected open work areas, linked to existing register gates: bulk notification read through later Support route; flattened notification-variable producer/key provenance; differing management/emergency/incident audit metadata; SQL versus legacy/in-memory draft/event consumer reachability; existing PII/retention snapshot policy. No current named test/evidence reference for `/notifications/read-all` was located; earlier single-read/list tests do not prove bulk mutation. Duplicate Support GET/PATCH routes are shadowed by earlier notification router in required mode, while POST bulk remains reachable. For19columns of order_drafts/processed_channel_events no direct SQL HTTP reader was identified in the scanned source; public APIs are not inferred; legacy `/bot/debug` reads a separate in-memory draft map and includesdb_path.

**Next exact batch RESIDUAL-FIELD-001**: actual app POST `/api/auth/notifications/read-all` with anonymous/admin/wrong-device/revoked denials, own bulk success/replay under foreign body/query hints and exact peer/admin-audience preservation. Preserve current expiry semantics; no speculative projection or storage redesign. Then explicit producer/consumer cells002–005 in the inventory.

Full HTTP and role/field gates remain **OPEN**;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Enumeration completion applies only to these8selected tables, not all95tables or wholeP0. **NO-GO**; PR550Draft/unmerged/current base preserved; no main/merge/deploy/hosted/P1/P2. Earlier next-inventory/PENDING headers below are historical for this bounded enumeration.

---

## P0 actual-app notification/conversation consumers accepted — 2026-10-24

Accepted executable `fc00437ff93c1d055b2218aaa0e3b54fe8519383`: **56/56 returned workflows completed SUCCESS**,0pending/failure/cancellation at acceptance. **Six new functional cases**, no application/schema/ACL/policy/provider changes.

[Actual-app consumers/notification40100232849/job120890696968](https://github.com/nora953/fawri-production-source/actions/runs/40100232849/job/120890696968): **12 functional cases / 14 TAP PASS across2files**,0fail/skip/cancel; new6+parent=7 and previous notification7. Actual app.ts with restricted primary LOGIN/separate authentication LOGIN verifies own live notification audience/read replay despite foreign hints; own conversation case/list/detail aliases with original mixed-case IDs/message metadata/no private reply-request fields; anonymous/admin/wrong-device/combined-role denial; foreign notification/admin-audience/conversation ID denial and exact no-change SQL; own takeover/return under foreign body/query hints with pending peer request preserved; revoked session denial/peer positive/no root JSON stores. No provider sending. Checkout `92e4e31e11b869c24ba36ca4194970916ccd21a4` matches tree `895ec4240490ac6e6f0a3fe8f9c7059b22c78303`.

[Full isolated40100232828/job120890754511](https://github.com/nora953/fawri-production-source/actions/runs/40100232828/job/120890754511): **92 clean invocations/90 unique files/715 TAP PASS**,0fail/skip/cancel; owned cleanupSUCCESS, identical checkout/tree to targeted lane. Targeted consumers counted separately from92. Existing conversation/management/browser/security/build/schema workflows alsoSUCCESS; no blanket zero-skip claim for unrelated optional quality tests.

Initial1425cede/run40100009223/job120890035410 failed before0new cases: fixture status=failed omitted required error_code. Corrected synthetic failure code only; check/guards/assertions retained. Prior notification7PASS and cleanupSUCCESS retained. Failure and exact-source evidence: [P0-CONSUMER-FULL-APP-HTTP-20261024.json](evidence/P0-CONSUMER-FULL-APP-HTTP-20261024.json). Local syntax/whitespacePASS. Prior dd8bd690 actual-app management fixes remain accepted separately.

Full HTTP/role/field gate remains **OPEN/PARTIAL_HTTP_VERIFIED**;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Known synthetic metadata projection is not an arbitrary-field allowlist or certification of all producers. No operator pool/browser/device/provider/hosted acceptance. Static followup distinguishes SQL order_drafts/processed_channel_events references from legacy /bot/debug in-memory draft projection; schema columns recorded but neither consumer inventory accepted.

Next exact batch: build a bounded machine-readable eight-table field/actor/producer/consumer map from current schema/live routes, including audit_events, manual_reply_requests, merchant_admin_notes, merchant_channel_overrides, merchant_deletion_requests, notifications, order_drafts, processed_channel_events. Reconcile existing evidence, direct SQL vs retired/in-memory consumers and unknown field policies; select tests only for explicit uncovered cells. Do not assume a schema table requires a new public CRUD route or claim privacy closure from unrelated legacy storage. **NO-GO**; PR550Draft/unmerged/base preserved; no main/merge/deploy/hosted/P1/P2. Earlier PREPARED/PENDING headers historical for this bounded scope.

---

## P0 actual-app management privacy accepted — 2026-10-24

Accepted executable `dd8bd690af323fd3ab65628c0fe441f5c09a566f`: **56/56 returned workflows completed SUCCESS**,0pending/failure/cancellation at acceptance. Six new bounded functional cases run through actual src/app.ts, restricted primary LOGIN and separate authentication LOGIN with mixed-case merchant IDs.

[Actual-app/management/import/deletion40098967597/job120886999544](https://github.com/nora953/fawri-production-source/actions/runs/40098967597/job/120886999544): **28 functional cases / 32 TAP PASS across4files**,0fail/skip/cancel; new actual-app6+parent=7, previous management11/import6/deletion8 retained. Actual-app cases verify authorized note projection and mutation, merchant/anonymous/unprivileged administrative denial, case/trailing-slash handling, exact path/SQL actor identity despite foreign body/query IDs, wrong-device/combined-role/legacy-credential denial with unchanged snapshots after each request, retired/unknown auth fallthrough, SQL permission/session revocation, independent owner positive, no root JSON stores and global nosniff header. Checkout `2dcfbae6ee3c3383e4c443ba35edca8508ac4747` matches executable tree `8c1009e219dd1536a4d1b5df4437b240ac97dd82`.

Two observed application defects corrected minimally: managed-surface classifier compared case-sensitively before Express case-insensitive/non-strict routes (authorized variants wrongly410); normalize only a comparison copy, preserving original IDs. Early routes accepted mixed merchant/admin cookies before the later compatibility layer's existing confusion rejection; common authenticate now rejects the same combination401 ROLE_SESSION_CONFUSION before token validation, without clearing/revoking separate sessions. Existing valid single-session operations retained. This is policy alignment, not a claim that observed acceptance required no owner credentials. No schema/grant/purge/transaction/financial-retention-policy change.

Initial b16c2ea2/run40098457152 had3functionalPASS/3FAIL (3TAP PASS/4FAIL incl parent); corrected classifier9bf269db/run40098659676 had5functionalPASS/1FAIL (5TAP PASS/2FAIL incl parent). Intermediate750dec08 superseded with same negative-case failure; cancelled broader workflows never counted asPASS. Failures and prior independent25TAP successes preserved in [P0-MANAGEMENT-FULL-APP-HTTP-20261024.json](evidence/P0-MANAGEMENT-FULL-APP-HTTP-20261024.json). No assertions weakened; negative assertions named and exact no-mutation checks strengthened. Local syntax/whitespacePASS, auth-cutover-contract10PASS/1existingSKIP (no local DATABASE_URL); CI isolated lane requires0skips.

[Full isolated40098967576/job120887080916](https://github.com/nora953/fawri-production-source/actions/runs/40098967576/job/120887080916): **92 clean invocations/90 unique files/715 TAP PASS**,0fail/skip/cancel; owned cleanupSUCCESS, identical checkout/tree to targeted lane. New targeted HTTP cases counted separately from92. All56 workflowsSUCCESS, including broader legitimate merchant/cashier/admin journeys; no blanket zero-skip claim for unrelated optional quality tests.

Full eight-table HTTP and exhaustive role/field inventory gates remain **OPEN/PARTIAL_HTTP_VERIFIED**;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Reuses actual-app merchant/cashier and signed-Meta journeys; new proof covers only stated management projections/denials/route wiring. No whole-app-all-features, full audit-field provenance, browser/device, operator-pool, provider or hosted certification. Original b2470a3a deletion acceptance retained.

Next exact batch: reconcile notification and conversation alias/consumer paths through actual app.ts against existing router/parent-router proofs; add only missing current own/foreign field-projection/session/case/fallthrough checks. Then complete eight-table actor/field inventory, including order_drafts and processed_channel_events consumer exposure rather than assuming SQL success covers every HTTP field. Earlier PREPARED/PENDING headers are historical for this bounded accepted scope. **NO-GO**; PR550Draft/unmerged/base unchanged; no main/merge/deploy/hosted/P1/P2.

---

## P0 owner deletion HTTP accepted — 2026-10-24

Accepted executable `b2470a3a1e6f4a35a630e463752837771c74b96a`: **56/56 returned workflows completed SUCCESS**, 0 pending/failure/cancellation at acceptance. Seven new functional deletion cases run through actual management router, restricted primary LOGIN and separate authentication LOGIN on disposable PostgreSQL; no operator-pool execution claimed.

[Management/import/deletion run40097378176/job120882349884](https://github.com/nora953/fawri-production-source/actions/runs/40097378176/job/120882349884): **22 functional cases / 25 TAP PASS across3files**, 0 fail/skip/cancel; deletion7+parent=8, existing management11 and owner import6. Verifies owner password/session/device/origin, foreign deletion request, queued-work denial, actual target private-data purge/account tombstone/local-media removal, intact peer/blocked tenant, repeat404/no extra audit and revoked-owner denial. Checkout `825339493b8d470f92797d760694432f29e30cd8` matches source tree `bebcb78b13e5c7bdb9bbd9429d51c86dcddc2faa`.

Actual failure discovered before correction: source3da2b78e initial authorized deletion and peer/media assertions passed, but repeat returned500 instead of404. Minimal application correction uses existing MerchantManagementError for pre-capture missing/closed404 and non-suspended409; no schema/grant/purge/transaction/product-policy changes. Repeat assertion retained and exact error code added. Initial b4e8fffe active-session fixture failure and the real3da2b78e regression are both preserved in [P0-OWNER-DELETION-HTTP-20261024.json](evidence/P0-OWNER-DELETION-HTTP-20261024.json); failed parents are not independent functional cases. Local syntax/whitespace and physical-media contract1PASS.

[Full isolated run40097378250/job120882350309](https://github.com/nora953/fawri-production-source/actions/runs/40097378250/job/120882350309): **92 clean invocations / 90 unique files / 715 TAP PASS**, 0 fail/skip/cancel and owned cleanup SUCCESS, same checkout/tree as targeted lane. Targeted HTTP cases are separate from this92total. All56 workflows SUCCESS; no blanket zero-skip claim for unrelated optional quality tests.

Full eight-table HTTP and role/field inventory gates remain **OPEN/PARTIAL_HTTP_VERIFIED**; 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED, completeP0Inventory=false. This accepts actual-router synthetic HTTP/current52-migration SQL/local-media behavior only. Financial retention duration, complete per-table PII policy, hosted object storage/ACL rollout, operator pool, whole-app middleware/browser/provider acceptance excluded.

Next exact batch: reconcile existing whole-app proofs before adding missing production-app middleware/alternate-path actor and private-field tests. Inspect app.ts authSecurityRouter ordering, enforceAuthCutoverCompatibility and enforceLegacyAuthProductionCutoverGate; verify no legacy fallthrough or foreign-field exposure with authorized positive controls. Earlier PREPARED/PENDING headers remain historical for this bounded accepted scope. **NO-GO**; PR550 Draft/unmerged, current base preserved; no main/merge/deploy/hosted/P1/P2.

---

## P0 correction approval and owner import accepted — 2026-10-24

Accepted executable `c0754a143dc8dcb6214c66ba94bb365bd4c353d0`: **56/56 returned workflows completed SUCCESS**,0pending/failure/cancellation at acceptance. **11 newly added functional cases across two bounded batches**, with no application/schema/ACL/product-policy/provider changes. Earlier approval executablec8698263 independently completed56/56 before owner-import batch began; its evidence is retained.

- [Conversation/approval40079121573/job120828775502](https://github.com/nora953/fawri-production-source/actions/runs/40079121573/job/120828775502):21functional cases/23TAP PASS across2files,0fail/skip/cancel. Includes6new approval cases: actual own knowledge create/update, identical-question tenant isolation, resolved replay/conflict, real SQL review-write fault and sequential recovery, revoked session. Knowledge and review commits are separate; tested retry converges with one saved answer, not an atomic-single-transaction claim.
- [Management/import40079121403/job120828774803](https://github.com/nora953/fawri-production-source/actions/runs/40079121403/job/120828774803):15functional cases/17TAP PASS across2files,0fail/skip/cancel. Includes5new owner-import cases: role/device/origin denials, actual owner positive, peer/conflict preservation, exact/altered replay, real mid-transaction note-write fault rolling back earlier audit insert and recovery, revoked owner. Existing ON CONFLICT DO NOTHING behavior preserved.
- [Full isolated40079121455/job120828775095](https://github.com/nora953/fawri-production-source/actions/runs/40079121455/job/120828775095):92clean invocations/90unique files/**715TAP PASS**,0fail/skip/cancel; owned cleanupSUCCESS. Targeted HTTP suites are separate from that92total. Checkout35da677e3b2b7152d414e2ffce0e42618edbe314 shares source tree76ee69ce73d55a4dd0c5626c1794a4842693916b; both targeted lanes use that identical checkout. No blanket zero-skip claim for unrelated optional quality tests.

Evidence: [P0-CORRECTION-APPROVAL-HTTP-20261024.json](evidence/P0-CORRECTION-APPROVAL-HTTP-20261024.json), [P0-OWNER-IMPORT-HTTP-20261024.json](evidence/P0-OWNER-IMPORT-HTTP-20261024.json). Full eight-table HTTP and role/field gates remain **OPEN/PARTIAL_HTTP_VERIFIED**;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Concurrent approval races, every import platform/limit, full-app/UI/provider/hosted acceptance are excluded.

Next exact batch: reconcile [SEQ306–311 deletion HTTP evidence](SEQ_306_311_CURRENT_MANAGEMENT_HTTP_20261013.md) with current restricted LOGIN/auth/operator roles and52-migration source. Earlier15HTTP cases (including correct-password owner deletion) used root-owned DB role/28migrations and explicitly excluded least-privilege/peer deletion proof; current service/SQL restricted-role evidence is separate. Reuse accepted observations; add only missing current actual owner deletion HTTP/password/session/peer-preservation cases. Retention policy/real object storage/hosted deletion remain separate unaccepted gates. Prior PREPARED/PENDING headers below are historical for these verified scopes. **NO-GO**; no main/merge/deploy/hosted/P1/P2.

---

## P0 populated conversation metadata accepted — 2026-10-24

Accepted executable `2a0453ed276a0b85a6e24467faf2498692ff445e`: **56/56 returned workflows completed SUCCESS**,0pending/failure/cancellation at acceptance. [Conversation HTTP40077528008/job120824032599](https://github.com/nora953/fawri-production-source/actions/runs/40077528008/job/120824032599): **15 functional cases+parent=16TAP PASS**,0fail/skip/cancel; **5 new populated-metadata cases** and6synthetic messages. Checkout4410cc8015e9825e39f0e84f5ef46b233dc8ef79 matches tree06b6b7b2b2c33886c3eea34c9a59b1b1e729ec45. New tests verify exact own correction/image/knowledge/learning projection through list aliases/detail, real foreign/mismatched correction IDs denied without SQL changes, authorized dismissal/replay with UI review status/peer metadata retained, malformed decision/context denial, and revoked-session denial. No application/schema/ACL/product-policy/provider changes.

[Broader isolated40077528124/job120824033716](https://github.com/nora953/fawri-production-source/actions/runs/40077528124/job/120824033716):92clean invocations/90unique files/**715TAP PASS**,0fail/skip/cancel. Conversation tests run separately from that92total. Signed-native first job120824032355 timed out before browser prerequisites (browser=null/results=[]), after24signing unitsPASS. Exactly one scoped retry120824279721 succeeded on identical checkout: Chrome155.0.8059.39,8native casesPASS and24signing unitsPASS. Original failure retained; no assertion/timeout changes. Synthetic native ACK still does not prove server sync or physical-device acceptance.

Evidence [P0-CONVERSATION-METADATA-HTTP-20261024.json](evidence/P0-CONVERSATION-METADATA-HTTP-20261024.json). Previous e8bc8b06 proof is retained separately. Full HTTP and role/field gates remain **OPEN/PARTIAL_HTTP_VERIFIED**;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Production-shaped fixture projection is not execution/certification of every metadata producer, arbitrary-field allowlist, successful correction approval/knowledge creation, audio/video, whole app, UI/browser, provider or hosted environment.

Next exact batch: actual PostgreSQL/HTTP **successful correction approval with knowledge isolation**. Trace conversation-operations → reviewMerchantCorrectionAuthoritative → applyMerchantCorrection; require legitimate own saved-answer creation/update and approval projection, peer records unchanged (including identical normalized questions), exact replay/no duplicates and conflicting review denial. Use disabled embeddings/providers and owned synthetic fixtures. Then privileged import/deletion and full-app alternate paths. Prior PREPARED/PENDING notes below are historical for this accepted scope. **NO-GO**; no main/merge/deploy/hosted/P1/P2.

---

## P0 corrected manual conversation source fully verified — 2026-10-24

Accepted executable `e8bc8b060d7f4ead1f8b19c447ae17bead436a42`: **56/56 workflows completed SUCCESS**,0pending/failure/cancellation at acceptance. Targeted [conversation HTTP40076278947/job120820201546](https://github.com/nora953/fawri-production-source/actions/runs/40076278947/job/120820201546): **10 functional cases+parent=11TAP PASS**,0fail/skip/cancel. Checkout124dbc3db19f3ead88235c71cea1512b0161bfb3 matches source treecca16927b147185a44f97a9fc3fc7b9161a1282c. [Full isolated40076279113/job120820201771](https://github.com/nora953/fawri-production-source/actions/runs/40076279113/job/120820201771): **92clean invocations/90unique files/715TAP PASS**,0fail/skip/cancel; owned container cleanup SUCCESS. Targeted conversation cases run separately from that92 total. Quality/security/schema/native/remaining workflows SUCCESS; no blanket zero-skip claim for unrelated optional quality tests.

Minimal production-path correction compares the stored conversation_id and message hash before returning an existing manual reply request. Keeps merchant-wide idempotency uniqueness, error code and legitimate replay; no schema/grant/provider/credential change. New actual-SQL HTTP regression confirms rejection for a different own conversation with unchanged SQL; valid same-conversation replay and prior privacy/recovery cases still PASS. Standalone pre-fix regression793f264b had no observed run before correction: no pre-fix runtime failure claimed. Local TypeScript syntax/whitespace and operational-boundary contract1PASS. Earlier8c070aee nine-case/56CI evidence and745f74ef management/notification evidence retained separately.

Evidence [P0-CONVERSATION-HTTP-PRIVACY-20261024.json](evidence/P0-CONVERSATION-HTTP-PRIVACY-20261024.json) preserves original proof and corrected followup. Full HTTP and complete role/field gates remain **OPEN/PARTIAL_HTTP_VERIFIED**;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. This accepts only the tested conversation privacy/recovery and replay-binding contract, not provider sending, operator reconciliation UI, whole-app, hosted, device or whole-P0 release requirements.

Next single actionable batch: populated correction/media/learning metadata HTTP fixtures against actual PostgreSQL, after reconciling producer fields and ConversationsPage correction_review.status consumer; prove own projection/foreign and stale-session denial before any projection change. Then privileged import/deletion and full-app/alternate consumers. Prior PREPARED/PENDING/next-test headers below are historical and superseded only for this verified scope. **NO-GO**; no main/merge/deploy/hosted/P1/P2.

---

## P0 conversation-bound manual replay correction — 2026-10-24

Candidate `e8bc8b060d7f4ead1f8b19c447ae17bead436a42` adds a minimal source guard: compare persisted conversation_id and text hash before returning an existing manual reply. Merchant-wide idempotency uniqueness/error code and authorized own replay preserved; no schema/grant/provider/credential change. Regression793f264b was saved but no standalone pre-fix run was observed; no red baseline claimed.

Targeted [run40076278947/job120820201546](https://github.com/nora953/fawri-production-source/actions/runs/40076278947/job/120820201546) SUCCESS:10 functional cases+parent=11TAP PASS,0fail/skip/cancel;52migrations and owned cleanup SUCCESS. Includes cross-conversation key rejection, unchanged SQL, valid replay/return and all nine prior privacy/recovery cases. Checkout124dbc3db19f3ead88235c71cea1512b0161bfb3 matches source treecca16927b147185a44f97a9fc3fc7b9161a1282c. Local TypeScript syntax/whitespace and operational-boundary contract1PASS. Broader exact-source CI PENDING; do not yet mark the whole corrected executable accepted.

Previous executable8c070aee completed56/56 workflows SUCCESS; isolated40075632085/job120818236391:92invocations/90unique/715TAP PASS,0fail/skip/cancel. Prior745f74ef evidence retained. [P0-CONVERSATION-HTTP-PRIVACY-20261024.json](evidence/P0-CONVERSATION-HTTP-PRIVACY-20261024.json) preserves baseline and corrected targeted proof separately. Full HTTP/role/field gate remains OPEN;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Next verify broader candidate CI; then populated message.metadata/audit field matrix, successful privileged import/deletion and full-app/alternate-path proofs. Existing UI reads correction_review.status; source media/learning provenance fields require explicit reconciliation before any projection change. NO-GO; no hosted/main/merge/deploy/P1/P2.

---

## P0 conversation HTTP privacy/recovery accepted within bounded scope — 2026-10-24

Source8c070aee75f67f1d1efcad525a0467baf8b45954; targeted run40075632155/job120818236959 SUCCESS:9 functional cases+parent=10TAP PASS,0fail/skip/cancel;52migrations and owned cleanup SUCCESS. Source and PR checkout c998dc00293c3b2abb7adeb804e243340ae1c060 share tree20b4d647fa87d3142233c5f247aa01e273313377. Broader exact-source CI PENDING; last fully accepted executable remains745f74ef. New tests/CI/docs only; no application policy/schema/provider changes.

Two tenants/actual SQL sessions/restricted LOGIN: own aliases/detail/takeover,12foreign denials with unchanged SQL, anonymous/admin/role/device/revoked-session denials, pending/uncertain return refusal, confirmed failure/sent recovery, delivered HTTP replay and changed-content rejection PASS. Completion/failure use real SQL services; uncertain-to-failed reconciliation is explicit fixture SQL, not implemented operator repair. No provider sends, hosted checks, whole-app or complete metadata/field acceptance. Evidence [P0-CONVERSATION-HTTP-PRIVACY-20261024.json](evidence/P0-CONVERSATION-HTTP-PRIVACY-20261024.json); bounded field/route map in [P0-ACCESS-HTTP-MATRIX-NEXT-BATCH-20261024.md](P0-ACCESS-HTTP-MATRIX-NEXT-BATCH-20261024.md).

Gate P0-RESIDUAL-MERCHANT-PRIVACY-001/http remains OPEN/PARTIAL_HTTP_VERIFIED; counts29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Next inspect broader CI once complete; then reconcile populated metadata/audit projections, privileged import/deletion and whole-app/alternate-path proof before choosing missing runtime assertions. Earlier conversation PREPARED/next-test headers are historical. NO-GO; no merge/deploy/main/secrets/hosted/P1/P2.

---

## P0 bounded management and notification HTTP acceptance — 2026-10-24

Verified executable [`745f74ef29169f698219b51c8e852ce309d7e05a`](https://github.com/nora953/fawri-production-source/commit/745f74ef29169f698219b51c8e852ce309d7e05a): **55/55 returned workflows completed SUCCESS**, zero pending/failure/cancellation at acceptance. Actual PR checkout `2e95b96f161b16b567c15d95688bb34a1db22bea` independently matches source tree `f18efc60933aa4601be26b712fe0cc171f98d718`. Changes are tests/CI/docs only; no application or policy repair was needed in these tested paths.

- [Management HTTP40074546840/job120814999684](https://github.com/nora953/fawri-production-source/actions/runs/40074546840/job/120814999684): 10 functional subcases + parent = **11 TAP PASS**, zero fail/skip/cancel. Actual restricted primary LOGIN + separate authentication LOGIN; owner/granted/ungranted assistants and two synthetic merchants; 50 denied HTTP actions with unchanged private rows, legitimate note/channel/log/review operations, peer preservation, wrong device/origin denial, live permission removal and actual session revocation.
- [Notification HTTP40074546889/job120814999619](https://github.com/nora953/fawri-production-source/actions/runs/40074546889/job/120814999619): 6 functional subcases + parent = **7 TAP PASS**, zero fail/skip/cancel. Actual parent auth router and SQL sessions; tenant/admin-audience isolation, expiry/unread filtering, foreign/admin read-marker404 with unchanged SQL, exact own replay, wrong-device/role-cookie/revocation denial. Both owned network-none PostgreSQL16 migrations52 and cleanup succeeded.
- [Broader isolated40074546914/job120815258010](https://github.com/nora953/fawri-production-source/actions/runs/40074546914/job/120815258010): **92 clean invocations / 90 unique files / 715 TAP PASS**, zero fail/skip/cancel. The two new HTTP suites run in separate targeted lanes above; they are not added to this92 count. Broad workflow SUCCESS is not a claim that every historical optional test had zero skips.

Evidence: [P0-RESIDUAL-HTTP-PRIVACY-20261024.json](evidence/P0-RESIDUAL-HTTP-PRIVACY-20261024.json), including both preserved fixture failures (suspended-merchant precondition; revocation constraint), corrected by valid fixture state and actual revokeSession service, without application/schema/assertion weakening. Local syntax/whitespace PASS; a local optional guard invocation was environment-blocked by missing pg dependency, not SQL acceptance.

Gate `P0-RESIDUAL-MERCHANT-PRIVACY-001/http` remains **OPEN / PARTIAL_HTTP_VERIFIED**. Counts remain29 CLOSED_SOURCE/7 OPEN/9 BLOCKED; completeP0Inventory=false. Full app middleware order, successful owner import/deletion, all audit projections, manual-conversation failure/recovery, alternate paths and complete actor/field inventory are not certified by these16 functional cases. No hosted/browser/device/load/operational acceptance. Existing SQL evidence is retained; source map in [P0-ACCESS-HTTP-MATRIX-NEXT-BATCH-20261024.md](P0-ACCESS-HTTP-MATRIX-NEXT-BATCH-20261024.md).

Next exact action: add only missing restricted-LOGIN PostgreSQL + actual conversation-router HTTP cases (own/foreign list/detail/takeover/return/messages, pending/uncertain vs failed/delivered recovery and revoked session); the old manual-conversation built-server test uses legacy JSON and cannot substitute. Reconcile field/alternate consumers before any full gate closure. GitHub-only; #550 stays Draft/unmerged with its existing base; no main push/deploy/credentials/production DB/P1/P2. **NO-GO**.

---

## P0 management HTTP privacy matrix prepared — 2026-10-24

Recovery HEAD `607e6b8efa33c0b7e633e70f4efceda1aa4a1971`, Draft PR #550 open/unmerged. Accepted executable remains `d8001a4163862198f035fb385bbe7738def7b288`; live GitHub API independently returned 52 completed/success workflows. This supersedes the historical 0051 PREPARED headers below; no accepted SQL suite was manually rerun.

Gate `P0-RESIDUAL-MERCHANT-PRIVACY-001/http` remains OPEN. New targeted actual-HTTP/SQL fixture covers administrative note, channel override, deletion-review and audit routes with two merchants; owner, granted/ungranted assistants, unauthenticated and merchant callers; peer preservation, device/origin denial, current permission removal and session revocation. Uses actual restricted primary LOGIN plus separate authentication LOGIN, not mocked auth or bootstrap application access. The production `auth-security.ts` mounts this management router before legacy admin routes; targeted harness mounts that actual router with the actual origin middleware. It does not certify full-app middleware ordering or the complete eight-table matrix.

Changed: new `merchant-management-privacy-http-postgres.integration.test.mjs`, targeted `p0-management-privacy-http.yml`, explicit `management-privacy-http` owned-runner selector. No application, policy, schema, grants or production changes. Static syntax/whitespace PASS locally; new runtime assertions PREPARED/CI_PENDING. Workflow uses existing disposable PostgreSQL16 network-none containers and refusal/cleanup controls. Acceptance requires all runtime cases pass with zero skip/cancel, fresh denial responses with no private-row mutation, and authorized positive controls.

Next exact action: inspect targeted exact-source workflow and raw TAP/`P0_MANAGEMENT_PRIVACY_HTTP` marker; distinguish fixture error from authority behavior. Then reconcile remaining notifications/manual conversation/draft/processed-event entrypoints, alternate routes and field projections against existing evidence. Owner import success and complete deletion/retention policy are outside this bounded batch. Counts remain 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED; completeP0Inventory=false. Hosted/incident/product-policy limitations unchanged. NO-GO; no merge/deploy/P1/P2.

---

## P0 0050 source accepted;0051 remaining tenant boundaries prepared — 2026-10-24

Verified executable `931acbfcfb0cbd2601eec053a7bd2e06aefb02cf` completed **52/52 workflows SUCCESS**. Checkout `c75d12964487717e6166101f82062fe8d65a996d` matches tree `1ca16a25ad732a1979bf6e3a842cd3ba9edd39bd`. Normal quality40056263139/job120759808005 **4new declarative/snapshot regressions PASS**, API879PASS/1existing opt-in SKIP. Native40056263207/job120759808022 SUCCESS (8cases). Isolated40056263189/job120759883715 **91clean invocations/89unique files/709TAP passes,0fail/skip/cancel**. Strict3-table marker confirms9read/18mutation denials,3readiness disable probes and actual note/override/request creation/review/rollback/peer preservation. Restore51migrations/95tables/69effective policies/17functions and equal seed/verify fingerprint7ffaa54596f36b785acf3d408f7d53d936e140bc46b814e8e216fc845bbc8564. Management3-table source subgate VERIFIED; HTTP/hosted acceptance still OPEN. Residual diagnostic separately confirms3protected/5remaining unprotected; green harness not privacy acceptance.

Prepared smallest remaining5-table tenant isolation correction for audit_events,manual_reply_requests,notifications,order_drafts,processed_channel_events: preserve genuine own-tenant operations, allow existing trusted auth global work, deny directory-only authority, keep administrative notifications invisible/unwritable to ordinary tenant scope. Existing admin audit append/system incident history now use the already-required authentication transaction rather than unscoped primary; response/business behavior unchanged. Other own-merchant notification/manual services retain their existing scoped transaction routing.

Append-only reviewed0051SQL/journal/preimages pinned SHA256 `1773f8314f11c832a1c03453204af2896b204b80695066ebc06cded7b11e62ea`; source readiness requires all5boundaries. New owned strict suite preserves documented broad fixture grants and checks genuine own reads/no-op writes/rollback, no-scope/foreign read-write denial, admin notification protection, directory-only rejection, actual notification dedupe, manual failure persistence, admin audit and global incident lifecycle. No provider send/network or hosted access. Syntax, unattested refusal before SQL, pinned SQL and existing journal/preflight2PASS locally; new runtime assertions **PREPARED/CI_PENDING**. Generated0051snapshot is pending candidate retrieval; intermediate smoke failures until artifact completion are not final product results.

Exact next: inspect canonical0051generation, retrieve/hash-review snapshot and unchanged historical files, adopt, then require all5strict actual-service assertions plus retained3-table private proof and8-table diagnostic with no foreign visibility/mutation. Preserve source/HTTP/hosted distinctions. P0-RESIDUAL-MERCHANT-PRIVACY-001 remains OPEN; complete actor/field/retention inventory, hosted key/role/schema/provider/device/rollout, incident and retention/ownership policy remain OPEN/BLOCKED_HOSTED_VERIFICATION. **NO-GO**; no percentage/main/merge/deploy/P1/P2.

---

## P0 0050 generated management snapshot adopted — 2026-10-24

Source9b767e5 canonical candidate40055851337/job120758548939 **SUCCESS**: committed_reproducible=true,historical_reproducible=true,51entries. Artifact12544339907 ZIP SHA256 `9ecdc4ee9757065c9dc76a7b6a896a8ab68f627eb8744de1d698f4ef46e17c42` verified; all102existing canonical/historical files byte-identical. Adopted only generated0050snapshot,626498bytes,SHA256 `e74addb89781fdb3b0577ea6aabfb0bc2b950b8f7915941434b971bf92b2a305`. Semantic changes limited to policies+isRLSEnabled for merchant_admin_notes,merchant_channel_overrides,merchant_deletion_requests plus snapshot identifiers.95tables/1245fields retained; all70required RLS declarations present.

Four actual Drizzle/latest-snapshot unit regressions now join the strict3-table SQL/service proof. Current containing source is complete for0050 metadata but **normal exact-source CI PENDING**. Prior missing0050snapshot smoke failures are intermediate artifact-completion failures, not accepted final source. No prior snapshots/SQL, tenant predicate, source service routing, fixture grants, smoke expectations or security thresholds changed.

Keep P0-RESIDUAL-MERCHANT-PRIVACY-001 OPEN pending strict9read/18mutation denial targets and actual trusted note/override/request creation/review/rollback/peer results; these counters are targets until raw proof is read. Retained8-table diagnostic must separately show3protected and5remaining unresolved tables. No inference from a green diagnostic or synthetic grant plan to hosted/HTTP acceptance. Last fully executed source62bed3c remains52/52 with90invocations/704TAP but observed privacy gap.

Next inspect completed-source4units, strict management marker, residual observations, canonical51entry reproduction, owned full migration/restore/SQL/native/security/quality CI; fix real failures, preserve baseline evidence and trusted operations. Remaining5tables, full field-role/privacy/retention inventory and hosted/incident/ownership gates stay OPEN/BLOCKED_HOSTED_VERIFICATION. **NO-GO**; no percentage/main/merge/deploy/P1/P2.

---

## P0 residual privacy baseline verified;0050 management remediation prepared — 2026-10-24

Executed source `62bed3cd19dfe6ec4273194cc1d0e5045b825752` finished **52/52 workflows SUCCESS**. Isolated40054814184/job120755341034: **90clean invocations/88unique files/704TAP passes,0fail/skip/cancel**, including new residual suite4PASS. Its diagnostic success explicitly does NOT accept foreign visibility. Two synthetic merchants/actual restricted primary LOGIN with documented broad fixture CRUD: all8tables lacked RLS, unscoped/scoped queries each exposed own+foreign synthetic records, foreign no-op UPDATE affected1row per table then forcibly rolled back; trusted global reads/exact rollback/pooled scope reset PASS. No HTTP breach or hosted privilege exposure inferred. Canonical finding **P0-RESIDUAL-MERCHANT-PRIVACY-001 HIGH/OPEN** is bounded to that verified authority/privilege configuration; no complete P0 privacy acceptance.

Source trace identifies3 private administrative management tables—merchant_admin_notes,merchant_channel_overrides,merchant_deletion_requests—whose legitimate consumers already exclusively use authenticationDatabasePool/withAuthenticationTransaction/withMerchantAuthenticationTransaction in postgresMerchantManagementAuthority.ts. Prepared smallest3-table correction: auth-only actual-LOGIN RLS policies, matching declarative flags and readiness requirements, append-only reviewed0050SQL/journal/preimages. No new service routing/configuration/business policy or grants. Pinned SQL SHA256 `75ec211ebfec841219fd37b2c8f68324e8b10059cf81dd02c7c7f274cdef53f1`. Historical0000–0049 unchanged.

New strict owned suite exercises readiness fail-closed for each table, no-scope and genuine tenant read denials, update/delete/upsert denials with forced rollback, actual trusted note/channel-override/deletion-create/review services, peer preservation and rollback. Registered before the retained8-table diagnostic in the existing audit-boundary lane. New SQL assertions **PREPARED/CI_PENDING**, not executed locally. Syntax/whitespace, pinnedSQL/journal controls2PASS and unattested refusal before DBsetupPASS. Generated0050snapshot intentionally pending; smoke gates may report its absence until canonical candidate is retrieved and committed. No expectation/guard weakening.

Remaining5 residual tables audit_events,manual_reply_requests,notifications,order_drafts,processed_channel_events stay OPEN; do not apply blanket policy without preserving own-tenant/background/admin contracts. Complete field/actor/privacy/retention denominator, hosted identity/ACL/keys/provider/device/rollout, incident and retention/ownership policy stay OPEN/BLOCKED_HOSTED_VERIFICATION. **NO-GO**, no overall percentage/main/merge/deploy/P1/P2.

Exact next: retrieve canonical0050candidate and verify unchanged historical artifacts, adopt only generated0050snapshot; inspect new3-table strict proof and revised8-table diagnostic (3denied/5still open), fix fixtures vs product failures distinctly; require final exact-source canonical/build/types/native/full SQL/restore/security acceptance before bounded source closure.

---

## P0 0049 exact-source accepted; residual privacy baseline prepared — 2026-10-24

Verified executable `62d274f4f05a5332ed8bd62b733c20b3e1bf87b9`: **52/52 workflows SUCCESS**,0pending/failed/cancelled. Checkout `092ec1038b08c2e0d98b0d4f29ebe2c90f0a9445` independently matches tree `88f0095fbdb50fecb49d0e2749d2cc39e29aa757`. Three actual Drizzle table/policy/latest-snapshot regressions PASS in normal quality40054017738/job120752842495: API875PASS/1existing opt-in SKIP, frontend188PASS/0SKIP. Canonical40054017544 and complete-schema40054017389 SUCCESS; prior missingSQL/missingSnapshot failures retained, no rule weakened.

Isolated40054017508/job120753095194 **89clean invocations/87unique files/700TAP passes,0fail/skip/cancel**. Full restore50migrations/95tables/66effective policies/17functions, seed/verify fingerprintf3fbabc87766315742be46f49c723f5a557493a60ef3fe8306883c39e111b8a7 identical; restricted tenant reads/private scope ACL preserved. Native40054017403 initial120752840020 timed out launching Chrome before0assertions; exactly one scoped failed-job retry120753320590 **8/8PASS** on same source. Native ACK remains synthetic; HTTP/SQL proof separate. Security40054017603 all4jobsSUCCESS; dependency120752841266 **0High/0Critical/4Moderate** at latest scan (earlier2Moderate was historical). No advisory exceptions.

0049 source-generation drift subgate is SOURCE_RUNTIME_VERIFIED. Existing runtime0035 tenant policy is unchanged; no new tenant authority/grants or hosted acceptance. Previous snapshots/SQL immutable. Full field/actor/privacy/retention inventory still incomplete.

Next authorized test-only batch adds residual-merchant-privacy-authority-postgres.integration.test.mjs first in existing owned audit-boundary/priority lane:8 previously unclassified merchant-key tables,2 synthetic merchants, actual restricted primary LOGIN plus distinct trusted auth, genuine scoped/unscoped/global reads, no-op foreign UPDATE with unconditional rollback, exact trusted snapshots and pooled authority reset. Observational diagnostic only: successful harness execution does NOT accept any observed foreign visibility or certify HTTP/hosted permissions. Existing broad fixture CRUD is explicit, not a production grant plan. New runtime assertions **PREPARED/CI_PENDING**, not counted executed; syntax, unattested refusal before DB setup and15existing guard controlsPASS locally. Current containing head is new test/evidence source and not the verified62d274f executable above.

Exact next: inspect new suite's P0_RESIDUAL_MERCHANT_PRIVACY_BASELINE plus AUDIT_SUITE_RESULT/cleanup, distinguish fixture errors from authority observations; reconcile intended actor/privacy boundaries before focused remediation while preserving trusted legitimate operations. Expected new suite/invocation totals must be taken from logs, not inferred. Hosted key/schema/role/provider/device/rollout BLOCKED_HOSTED_VERIFICATION; incident review, complete P0 inventory and retention/ownership policy OPEN. **NO-GO**; no percentage/main/merge/deploy/P1/P2.

---

## P0 0049 generated snapshot adopted — 2026-10-24

Corrected source0563880 migration candidate40053684154/job120751772077 **SUCCESS**: committed_reproducible=true,historical_reproducible=true,50entries. Reviewed artifact12544088050 ZIP SHA256 `556a4c3d7f2995b87ce4d5f8f9faf77697c5b04ce0f6111f8e2780fd9638ed14`; all100existing files in archive match local canonical/historical SQL, snapshots and journal byte-for-byte. Only new0049snapshot adopted, SHA256 `d2a0ba3596db2f9470d5bd8139cfda45befc24b5f03fb800fade9c692b8d6868`,624113bytes. Snapshot semantic diff is only order_items policies+isRLSEnabled, plus snapshot id/prevId;95tables/1245fields retained. All67required RLS tables now declared; this is source metadata, not hosted ACL proof.

Added a third regression comparing the latest committed snapshot's read/write tenant predicate to actual Drizzle policy metadata, in addition to the two table/policy runtime unit cases. Local syntax and journal/preflight2PASS; new3case execution **CI_PENDING**. Initial source29848c4 candidate missing pinnedSQL and corrected0563880 auth40053684269/location40053684367 smoke failures due missing0049snapshot remain historical. The required artifact is now committed; no smoke expectation/security gate weakened. Quality0563880 full build/typecheckSUCCESS; complete-schema source29848c4 candidate40053578420 SUCCESS is separate from complete historical migration acceptance.

Existing order_items SQL/runtime isolation proof retained; this patch aligns source/metadata and reasserts same predicate without changing grants. **Containing exact-source canonical/full CI PENDING**. Previous complete executable736e79652/52 with body-parser0High/0Critical remains last full acceptance. Next inspect final3metadata units, canonical50entry reproduction, committed SQL application, native signed offline8 and full isolated/restore/security/quality; fix genuine failures before source closure. Keep hosted/incident/complete field-role-retention gates OPEN and release **NO-GO**. No hosted connector/mutation/deploy/main/merge/P1/P2.

---

## P0 0049 candidate prerequisite correction — 2026-10-24

Initial prepared source29848c4, migration candidate40053578399/job120751432186 failed before generation: reviewed_sql stage49 requires the pinned SQL file in committed drizzle history. No generated artifact or success was claimed. Added the exact72f41752… reviewedSQL to0049_order_items_declarative_rls_alignment.sql and the matching journal49 entry; no prior SQL/snapshot/journal entry changed. Canonical0049snapshot remains absent until generated/retrieved from CI. Local committed-journal/order/hash and read-only preflight controls **2PASS**. New actual Drizzle unit/canonical/migration/runtime CI pending.

Next inspect corrected migration candidate and metadata units, retrieve generated0049snapshot, compare reviewedSQL/journal/historical hashes, commit exact artifact, then exact-source full CI. Keep previous736e79652/52 source acceptance separate. **NO-GO**; no hosted/main/merge/deploy/P1/P2.

---

## P0 0049 declarative order-item RLS alignment prepared — 2026-10-24

Previous executable `736e796b5fe25ceac9f1cfb128ba3f640ff6ebe5` is verified **52/52 workflows SUCCESS**. Actual checkout `a06b629ebc5b57fe0703d04d00ddd46885007af0` matches tree `d36329bc466ce748b2c2f3be4d196a957daea184`. Security40039180233 all4jobsSUCCESS; dependency job120706018042 **0High/0Critical/2Moderate** closes body-parser GHSA-27r3-jxmh-p828 source remediation. Native40039180440/job120705942879 Chrome155.0.8059.39 **8PASS**; isolated40039180582/job120706272417 **89clean invocations/87unique files/700TAP passes,0fail/skip/cancel**; full restore49migrations/95tables/66policies/17functions and equal fingerprints. Quality40039180575 build/typecheckSUCCESS. These are exact-source CI evidence, not hosted release acceptance.

New source-only reconciliation found **67 required RLS tables vs66 declared** in0048 snapshot: order_items already has effective0035 SQL isolation but its Drizzle table lacks enableRLS and linked policy. No new runtime tenant leak is asserted; complete-schema generation/future schema diff could omit existing protection. This is a source drift subgate of the existing order_items issue, not reopening its accepted SQL denials.

Prepared append-only reviewed stage0049 with orders/tenant-security preimages, pinned SQL SHA256 `72f41752819cbccc57a8857d0a4aceb84477a40cc3c0a816cae4be4154a32e19`. Adds enableRLS and the same tenant policy to declarative source; SQL reasserts existing0035 predicate without new grants/authority. Two actual Drizzle metadata/policy unit regressions prepared. Local TS syntax/whitespace PASS; runtime and canonical generation **CI_PENDING**. Historical0000–0048 SQL/snapshots remain unchanged. Do not invent0049 snapshot/integrity or mark stage accepted before retrieving generated candidate and checking reproducibility.

Existing proof inventory now indexes95unique source tables/1245fields and source anchors. Full field/actor/export/retention matrix remainsTRIAGE; RLS flags are declarations, not hosted ACL certification. Bounded Support/emergency/auth proofs linked without expanding their acceptance.

Exact next: inspect canonical migration candidate and new metadata unit results; retrieve/hash-check/review generated0049SQL/snapshot/journal, require only0049 additions+journal extension and unchanged historical artifacts, adopt on this branch, verify full canonical/migration/native/HTTP CI. **NO-GO**; hosted gates BLOCKED_HOSTED_VERIFICATION; no merge/main/deploy/P1/P2.

---

## P0 body-parser fixed graph adopted from verified CI — 2026-10-24

Candidate source `83e1aa5c9a0c7d2230a7bcb47be04e54e13a8dfc`, run40038895996/job120705010283 **SUCCESS**. Candidate0High/0Critical/2Moderate; frozen install, full build/typecheck, source contracts, API872PASS/1existing opt-in SKIP, frontend188PASS/0SKIP and isolated actual HTTP1PASS all passed. New loopback Express compressed JSON/raw verification/malformed-input recovery test PASS. Not a full hosted app or independent complete upstream vulnerability reproduction.

Adopted exact artifact12538391823: ZIP SHA256 `ff71ce459db9a362aeee17146bc63ce59ccc2c9bfde180a2af5c1e0937017e8a`; catalog `a35572c0b8725628bde008b398e36bf7adec3dbd855fec7dacb9f97c6e84f0c9`; lock `40605533804a6f83434d386839901b0a4bdacc05fac166032efef2226da35e8c`. Reviewed generated diff26added/17removed across two files: body-parser2.3.0→2.4.0, content-type2.0.0→2.1.0, iconv-lite0.7.2→0.7.3 and parser qs6.16.1 plus corresponding Express/raw-body/type-is snapshot references. Existing Express qs6.16.0 and zod4.6.7 preserved. No handcrafted integrity, unrelated package upgrade or advisory exception. **Normal containing-source security/CI PENDING**; GHSA-27r3-jxmh-p828 is SOURCE_REMEDIATED_CI_PENDING.

Reconciled four already-executed bounded requirements in existing access inventory using recovered6f79933/run40033977598/job120688827685: retention/management6PASS; tenant deletion/local media1PASS; unmatched receipt18PASS; full-schema restore seed1PASS+verify1PASS. No tests rerun or new execution credit. This expands indexed requirements, not the full-P0 denominator. Receipt duration/privileged deletion/ownership repair policy, complete sensitive-field/actor matrix and hosted object/backup/PITR acceptance remain explicit open subgates.

Exact next: verify normal adopted-source security0High/0Critical, quality/parser regression/native offline/full isolated results, preserving prior failures and bounded proof limits. Then continue unaccounted P0 data/actor/retention requirements. Hosted gates BLOCKED_HOSTED_VERIFICATION; incident review OPEN; PR550 Draft/existing base retained. **NO-GO**; no percentage, hosted operation, deployment, main, merge or P1/P2.

---

## P0 recovery: newly published body-parser High — 2026-10-24

Recovered GitHub HEAD `6f79933e89aa9409083741f06cf2be15c7316ab2`; PR550 remains Draft with its existing base. Its final CI is **50/52 SUCCESS,2FAILURE,0pending**: security40033977706 and candidate40033977566 fail on **body-parser GHSA-27r3-jxmh-p828** (1High/0Critical/2Moderate), not zod. Security job120688828415 and candidate120688827737 both identify this advisory. Earlier 52/52 on2f782c8 is historical valid evidence; it is not the current security gate result.

Primary GitHub advisory-database entry published2026-10-23T20:53:11Z identifies installed2.3.0 as affected and2.4.0 as fixed; upstream expressjs/body-parser v2.4.0 release confirms correction. Existing scoped override resolves Express's2.2.2 request to2.3.0. No advisory exception, compression-policy change or security threshold reduction.

Prepared the existing read-only dependency-candidate workflow to resolve body-parser2.4.0 in its disposable checkout, validate frozen install/security/full build/typecheck/source/API/frontend/isolatedHTTP and upload bounded hashed catalog+lock artifacts. Branch catalog/lock remains unchanged until that candidate passes and generated diff is reviewed. Added loopback-only actual Express parser compatibility test for valid compressed JSON/raw verify bytes, malformed compression/unsupported charset rejection, URL-encoded/plain JSON and subsequent health. Syntax1PASS; existing HTTP security contract1PASS and workflow/lock policyPASS locally. New Express runtime test **NOT_RUN locally / CI_PENDING**; does not independently claim full upstream vulnerability reproduction or hosted application proof.

Next: inspect candidate failures/results, retrieve exact artifact and hashes, review only intended parser/dependency changes, adopt corrected graph on authorized branch, verify normal security+regressions. Local package-manager command exited without generating a new lockfile; CI avoids repeating ineffective local resolution. No hosted services, main, merge, deploy or P1/P2. **NO-GO**; hosted gates BLOCKED_HOSTED_VERIFICATION, full requirement inventory/incident review OPEN.

---

## CURRENT VERIFIED P0 CHECKPOINT — 2026-10-24

Executable `2f782c850c50526e2fe977f026b6f07ff0d867b7`, tree `8b0f1905cceaad6e9e25a6f0efa7441bb896fb36`; actual CI checkout `310e19e98baf809e455f2a20045d46443a5063db` independently has the identical tree. **52/52 workflows SUCCESS;0pending/failed/cancelled.** This final source evidence supersedes pending observations above/below only within its tested scope. A containing documentation-only checkpoint does not imply a separate runtime execution.

**Completed:** authenticated server-only ES256/P-256 offline issuance; merchant/station/device/location/credential/subscription/version/expiry/main-station claims; pinned release-key checks before persistence, offline restore and each offline sale; unsigned legacy-cache rejection; safe online-only/missing-key rollout behavior; current employee policy before online sale; preserved authorized discount permissions and reconnect refresh; pre-bundle rejection of private JWK material; validated zod3.25.76→4.6.7 catalog/lock migration. Private signing key never included in browser/API/source. No operational key provisioned.

**Executed evidence:** native40032570066/job120684154158 Chrome155.0.8059.39 **8/8PASS**. Isolated40032569968/job120684424579 **89/89clean invocations/87unique files,700TAP passes,0fail/skip/cancel**, including actual signed login/refresh/secondary/missing-config HTTP and retained historical-sale ACK/replay/stock/attribution proof. Quality40032570016 full build/typecheck SUCCESS: source413PASS/1retained opt-in SKIP, API871PASS/1retained opt-in SKIP, frontend188PASS/0SKIP; these broader skips are not hidden in native counts. Security40032569921 all four jobs SUCCESS: **0high/0critical/2moderate**. Candidate40032569923/job120684152253 SUCCESS confirms exact adopted catalog/lock hashes and isolated HTTP compatibility; original candidate40031885405 also ultimately SUCCESS after slow oversized optional log emission. Bounded hash-only output now replaces that unnecessary text. Failed cleanup/startup attempts and scoped failed-job retry remain recorded, not overwritten.

[Exact current evidence and all52 runs](evidence/P0-CASHIER-OFFLINE-SIGNED-20261024.json) · [bounded access proof reconciliation](evidence/P0-ACCESS-CONTROL-PROOF-INVENTORY-20261023.json) · [offline implementation/rotation/migration/limits](P0-CASHIER-OFFLINE-ENTITLEMENT-TRUST-BOUNDARY-20261023.md).

| Requirement | Current disposition |
| --- | --- |
| CASHIER-OFFLINE-001 | SOURCE_RUNTIME_VERIFIED; hosted acceptance OPEN/BLOCKED_HOSTED_VERIFICATION |
| GHSA-mrhx-c7xc-m3w5 / zod High | SOURCE_REMEDIATED_AND_CI_VERIFIED on4.6.7; no exception or weakened threshold |
| Existing emergency0048 source scope | Current strict remediation/HTTP regressions PASS; obsolete pending inventory row reconciled; no hosted acceptance inferred |
| Hosted key/release/schema/role/identity/pooling/device/branch/provider/rollout evidence | BLOCKED_HOSTED_VERIFICATION under GitHub-only restriction; no hosted connector or mutation performed |
| Incident review and complete unique P0 requirement/role/privacy inventory | OPEN; bounded proof inventory is not the full P0 denominator |

**Release NO-GO.** No overall P0 percentage. Seven-day signed licensing/grace bounds do not extend operator-session lifetime or provide instant offline revocation/trusted hardware time; complete-profile/OS-clock tampering and hosted production readiness are not certified. Native acknowledgement is synthetic; actual network-none SQL/HTTP original-shift recovery is separately verified.

**Exact next GitHub-only action:** use the updated bounded proof inventory to reconcile remaining unique P0 requirement/actor/privacy/retention/missing-order rows and their evidence; keep whole-P0 completeness false until every required row is accounted for. Do not restart signed-entitlement, zod, Support or0048 remediation without changed code/new demonstrated failure. Any live key provisioning, hosted identity/schema/ACL/provider/device acceptance, rollout or deployment remains blocked under current authorization. Keep PR550 Draft and existing base; no main/merge/deploy/P1/P2.

---

## P0 zod fixed graph adopted from validated CI candidate — 2026-10-24

Candidate40031885405/job120681864338 on base44dcb003f12004b2b5fd120a48d7329d01cd43f8 passed security, full root build/typecheck/signing guards, full source/API/frontend unit groups, isolated HTTP, bounded diff and repository secret scan. Artifact12534199975 downloaded via GitHub: exact ZIP SHA25696288aaf5dba88dee56bbb9b24e8ab0e4042c5d47176191f37c926be6b09e4a6 verified. Public catalog/lock hashes are recorded in existing machine evidence. Reviewed diff changes only zod3.25.76→4.6.7 and existing OpenAI/drizzle-zod peer references (16added/16removed lines across two files); no unrelated package, handwritten integrity or security exception.

Adopted those exact candidate files in this source batch. Normal current-branch CI is PENDING; GHSA-mrhx-c7xc-m3w5 is SOURCE_REMEDIATED_CI_PENDING, not release-closed. Candidate's optional giant base64 log emission stalled after every validation and artifact upload; no overall successful job was claimed. Replaced that unnecessary output with bounded file hashes, retaining normal uploaded artifacts and cleanup. This source commit may automatically cancel the prior telemetry-stalled run; original state/evidence preserved.

Latest bounded offline runtime proof remains57276df: native8PASS, isolated89clean invocations/700TAP. Later44dcb003 native40031885243 first job120681863358 failed browser startup before0assertions; only that failed job was retried, job1206826972358/8PASS. No successful-suite manual retry. Pre-bundle private-key guard passes two actual tests and candidate Vite build. [Exact evidence](evidence/P0-CASHIER-OFFLINE-SIGNED-20261024.json).

Next: inspect containing source normal security (require0high/0critical), quality/build/typecheck, native8 and owned SQL/HTTP regressions plus hash-only candidate completion; fix genuine failures without weakening gates. CASHIER-OFFLINE-001 bounded source verification retained, hosted key/release/session/device/branch parity and rollout BLOCKED_HOSTED_VERIFICATION. Incident review and full P0 inventory still OPEN. NO-GO; no percentage/main/merge/deploy/P1/P2.

---

## P0 zod High remediation candidate prepared — 2026-10-24

Offline runtime source57276df remains bounded verified (native8PASS/isolated89clean invocations700TAP;50/51CI with only zod security failure). Latest published guard source9c2b450be41ffb894a34f62903fb52624bd6dfe9 CI is pending; pre-bundle public/private key guard2local testsPASS.

Next independent P0 batch prepares a read-only GitHub Actions zod4.6.7 candidate in a disposable checkout. Current authorized branch dependency catalog/lockfile remain unchanged until candidate security scan, full build/typecheck, source/API/frontend units and isolated HTTP runtime pass and exact generated diff is reviewed. Candidate has contents:read, no push/deploy/provider/database connection; uses existing safe CI dependency-install and network-none test facilities. It uploads only public catalog/lockfile and emits exact hashed recovery text after all checks. No unsupported manual integrity edits or advisory bypass.

Candidate PREPARED/CI_PENDING. Known blocker GHSA-mrhx-c7xc-m3w5 remains OPEN until current branch graph is safely updated and verified. Next inspect candidate result, retrieve/hash-check/review only expected zod+peer lock changes, commit compatible catalog+lockfile to this same authorized branch, then verify normal CI. If candidate fails, classify/fix without muting security gates. Hosted gates BLOCKED_HOSTED_VERIFICATION; NO-GO, no merge/main/deploy/P1/P2.

---

## P0 signed offline bounded source verification — 2026-10-24

Verified executable `57276dfbe26e5f05743255c7727f3b3b0a9fed05`, tree6690ec3d1af42320d0b67445952f1d11a6f6f529. Actual checkout1b6bb62b66ec5f2d50fe844fbc8e6de4f166ecaa independently has the identical tree. Final CI50/51SUCCESS,1securityFAILURE,0pending/cancelled. This supersedes earlier pending observations for this exact source only; not whole-release acceptance.

Native40030678854/job120677883632 Chrome155.0.8059.39:8/8PASS, real WebCrypto/IndexedDB/main sale, persistent authorization, altered/unsigned denial, identity/branch/credential binding, stale version/rotation/rollback/expiry and local synthetic ACK inventory/outbox invariants. Isolated40030678747/job120678384112:89/89clean invocations/87unique files,700TAP passes including parents/repeated lanes,0failed/skipped/cancelled. Expanded original-shift HTTP suite1PASS verifies actual authenticated signed issuance/refresh, missing-key online operation, secondary offline non-issuance plus retained session/device denial, historical ACK/exact replay/no duplicate stock/attribution. Full restore49migrations95tables66policies17functions, equal seed/restore fingerprint and restricted tenant reads PASS. Quality40030678730 full build/typecheck/unit/source tests SUCCESS.

Security40030678847: repository scan120677883804/lockfile120677883764SUCCESS; dependency audit120677883670/review120677883338FAIL due zod HIGH GHSA-mrhx-c7xc-m3w5 (1high/0critical/2moderate). Fixed>=4.6.6/current3.25.76, primary advisory source retained. No exception/false green. [Machine evidence](evidence/P0-CASHIER-OFFLINE-SIGNED-20261024.json).

Next meaningful batch adds pre-bundle rejection of private JWK material in VITE public-key configuration; two new local tests PASS, missing configuration still permits online-only build. Containing source build/CI PENDING. No signing/authorization/SQL/sync behavior changed by this final configuration guard.

CASHIER-OFFLINE-001 is BOUNDED_SOURCE_RUNTIME_VERIFIED / HOSTED_OPEN, not release-closed. Hosted key/release/session/device/branch parity and operational rollout BLOCKED_HOSTED_VERIFICATION; offline revocation/OS-clock/profile-reset limits remain explicit in the offline report. Further P0 blockers: zod migration, incident/security review and complete P0 release inventory. NO-GO; no overall percentage/main/merge/deploy/P1/P2. Exact next: verify final guard build/CI, perform validated zod dependency remediation, then remaining authorized P0 source work; hosted gates stay blocked.

---

## P0 offline rollout compatibility and HTTP recovery proof — 2026-10-24

Actual published client source `c8ce5060dfa60ff188fbe5c72ff1f13516c98d73`: full quality40030037834 SUCCESS, including typecheck120675748181, full build120675748278 and source/API/frontend tests. Last51-workflow observation47SUCCESS/2FAILURE/2executing; not whole-source acceptance. Signed native40030037846/job120675748039 failed Chrome-profile cleanup ENOTEMPTY before evidence emission; no native outcomes accepted. Security40030037777 remains failed. Earlier issuerb7b86d9 had48SUCCESS/1securityFAILURE/1isolatedCANCELLED (automatic concurrency on substantive next commit), not50green.

Follow-up source fixes signed-native Chrome process-group teardown/retry and preserves online login while client public-key rollout is incomplete: offline verification failure clears cached authority and cannot create offline privilege. Online validation now applies the actual current operator policy before sale permission evaluation; reconnect policy refresh also persists the signed envelope. Both authorized discount permissions remain supported. Added guarded actual HTTP issuance/refresh/missing-config/secondary-station assertions to existing original-shift recovery suite, preserving revoked-session/wrong-device denials, historical sync ACK, replay/no duplicate stock and attribution. These new SQL/HTTP assertions are PREPARED/CI_PENDING, not locally executed.

Local35 targeted tests PASS,0failed/skipped; separate tooling22PASS. New-source full typecheck/build/native/isolated CI PENDING. zod advisory verified through immutable GitHub advisory-database source76f6efb1: affected <4.6.6, requiring reviewed major-version migration from current3.25.76; no advisory bypass or unsupported dependency bump. Release NO-GO. CASHIER-OFFLINE-001 remains OPEN pending exact-source native/HTTP acceptance and hosted rollout; hosted verification BLOCKED_HOSTED_VERIFICATION. Next: inspect final source native8-case marker and expanded closed-shift HTTP suite, all regressions/security, then complete remaining P0 gates. No deployment/main/merge/P1/P2.

---

## P0 signed offline client integration — 2026-10-24

Server issuer checkpoint `b7b86d901b512fe0eaa687d720af08702ca09dbc` is published. Client integration verifies release-pinned signatures before storing/restoring authorization and every offline sale; binds main station, merchant/device/location/credential and subscription version; rejects unsigned legacy cache, stale retained versions, altered claims, rollback and expiry. Online sales obtain current server authorization and remain available with absent offline signing config; HTTP denials cannot fall back. Existing branch inventory and outbox/server-sync algorithms unchanged.

Local targeted tests28/28 PASS,0 failed/skipped. Storage adapter proof is distinct from native IndexedDB. New CI real-browser eight-case audit is PREPARED / CI_PENDING; no native acceptance claimed. Full build/typecheck and existing cashier SQL/sync acceptance pending containing source. Key rotation, migration and offline revocation/clock limits documented in [existing offline report](P0-CASHIER-OFFLINE-ENTITLEMENT-TRUST-BOUNDARY-20261023.md).

CASHIER-OFFLINE-001 remains OPEN. Hosted key/configuration/parity/device/session/sync proof **BLOCKED_HOSTED_VERIFICATION**. Recovered fdcf security failure (zod HIGH GHSA-mrhx-c7xc-m3w5) remains OPEN. NO-GO; no main/merge/deploy/P1/P2. Exact next: inspect signed native marker, typecheck/build and existing isolated regression; correct failures before bounded source acceptance.

---

## P0 offline signing issuer — 2026-10-24

Recovered actual PR550 HEAD `fdcf9541bba12a15bffef5c9c4adde41f13e9c0b`; draft/base unchanged. CI observation: 47 SUCCESS, 1 FAILURE (security40028233610), 1 executing (isolated40028233764), total49. Security dependency-audit120669704535 reports zod HIGH GHSA-mrhx-c7xc-m3w5; this is an OPEN release blocker, not a signature-test failure. No retry/ignore/downgraded gate.

Server now emits an optional ES256/P-256 offline envelope from authenticated station context and licensed subscription on station/me, operator/login and operator/me. It binds merchant/station/device/location/credential version/subscription version and main-station authority, with explicit signing key ID and expiry capped by credential, seven-day lease and billing+seven-day grace. Private JWK stays server-only; configuration/public-key mismatch returns null without breaking online authentication. Browser enforcement is the next batch; CASHIER-OFFLINE-001 stays OPEN.

Local actual issuer/browser crypto interoperability tests4/4 PASS,0 skipped/failed; included in build. New-source CI PENDING until commit publication. Hosted configuration/identity/parity/revocation remains **BLOCKED_HOSTED_VERIFICATION**. NO-GO; GitHub-only, no deploy/main/merge/P1/P2. Exact next: connect envelope verification to persistence/restoration/every offline sale, reject legacy cache and preserve server-validated online sales/sync.

---

## CURRENT P0 STATUS — 2026-10-23 (supersedes historical 0048 pending entries)

Source correction 0048 has verified candidate 48/48 successful CI and 89/89 clean native suite invocations (700 TAP passes); PR merge comparison showed zero file changes relative to candidate. Documentation-only checkpoint 5aac594263a17707b4572f59f0b0a9e18f12869e subsequently completed 48/48 successful workflows. References: [source proof](P0-0048-CI-VERIFICATION-20261023.md), [documentation-head CI](P0-0048-DOC-HEAD-CI-OBSERVATION-20261023.md). Previous statements below that 0048 CI is PENDING are historical, not current blockers.

OPEN RELEASE BLOCKERS: hosted deployed schema/role/identity/pooling parity not tested under GitHub-only restriction; incident/security readiness review not closed; complete P0 inventory and release evidence not accepted. Source CI success alone does not close these. **NO-GO**, no defensible P0 completion percentage. No Railway, Neon, deployment, migration, merge, main or P1/P2.

---

## Support privacy accepted; next emergency authority proof prepared — 2026-10-23

## Emergency baseline verified;0048 correction prepared — 2026-10-23

Baseline `fc4534402723d3cc75294518450f28683dce1f93` has48/48 successful workflows; native39901265636/job12024315331888 complete clean invocations/86 files,693 TAP passes,0 failure/skip/cancel. Actual checkout169c3701ab5932edd99b5c5ea50cbdb88c2ac5c7 matches treeaae824855c025cc7b3fa69f7f81b2ae5f2fb7575. Diagnostic4PASS and retained actual-session HTTP1PASS confirm measurement/authorized behavior, not emergency SQL privacy closure. Four emergency tables remain a demonstrated source privacy blocker in that baseline; mutation was not attempted. Foundation final PASS, owned image5PASS; quality build/typecheck PASS with two retained opt-in skips. Exact evidence:`evidence/P0-EMERGENCY-PRIVACY-BASELINE-20261023.json`.

Prepared0048 source correction protects all four tables through the existing trusted authentication authority, preserves secure actor/session routes, filters merchant notices by session merchant, validates notice ancestry and keeps snapshots tenant-scoped. New strict SQL denial/rollback/legitimate notice tests join the retained baseline/HTTP suites. Local syntax/whitespace and source expiry1PASS; new canonical/runtime CI PENDING,89 native invocations is only a target. See`P0-EMERGENCY-PRIVACY-REMEDIATION-20261023.md`.

Next: inspect exact candidate checkout/tree and49-migration reproducibility, all89 native summaries, strict emergency marker, existing owner/assistant/session/expiry/revocation/audit HTTP behavior and Support/Foundation regression. Accept only actual same-source results. Accepted Support94bc0546 remains preserved. Release **NO-GO**; hosted gates, incident review and complete P0 inventory open; no defensible overall percentage. No hosted changes/deploy/migration/ACL/secrets/main/merge/P1/P2.


Accepted executable94bc0546a8cdfa54884f1b0d3826ba2d43c52fe0:48/48 workflows SUCCESS,0 pending/failed/cancelled. Native39900140208/job12023959573886/86 complete clean invocations across84 unique files,688 TAP passes including parents/repeated lanes,0 failed/skipped/cancelled. Executed checkoutd59c77488804981b9e6b6673f9d99bf577225eab independently matches source treeb4d530918b95c115d576c62884ea268feb9a1067. Actual Support25 read denials/15 mutation denials, authorized merchant/global/observability operations, parent checks/preflight, rollback and atomic reminders PASS. This closes the5-table Support source scope only;4 emergency tables stay OPEN.

Foundation39900140195/job120239595525 final marker PASS, owned image5PASS/0FAIL/SKIP/CANCEL. Schema39900140237/job120239596022 reproduces committed/historical0047 and all48 migrations; SQLd2201f98.../snapshot61b7ef0f... match. Artifact12478463250 saved with digest. Quality39900140221 full build/typecheck SUCCESS; broader groups retain2 existing skips separately documented, not hidden in native counts. Security39900140290 audit120239596097/review1202395961880 high/0 critical/2 moderate. Previous39/48 and45/48 source failures preserved without retry/cancellation or duplicate requirement credit. [Acceptance](P0-SUPPORT-PRIVACY-ACCEPTANCE-20261023.md) · [Exact runs/counters/artifact](evidence/P0-SUPPORT-PRIVACY-ACCEPTANCE-20261023.json).

Next batch contains only missing emergency proof: actual restricted-LOGIN4-table read/catalog classification with2 synthetic merchants and exact restoration; existing owner/assistant/merchant HTTP assertion set moved to owned actual tenant/auth LOGINs, mandatory attestation and visible scoped cleanup. No production source/SQL/privilege change in this next batch. Local MJS/TS syntax and whitespace PASS only; native results PENDING, target88 invocations not accepted count. [Next scope](P0-EMERGENCY-PRIVACY-PROOF-20261023.md). Next exact action: inspect containing new test source, every native summary and P0_EMERGENCY_PRIVACY_AUTHORITY_BASELINE plus unchanged authorized HTTP cases, classify before focused remediation.

Release NO-GO. Hosted deployment/schema/identity/pooling, incident handling and completeP0 inventory stay open; no percentage. No hosted operation/change/deploy/migration/ACL/secret rotation/main push/merge/P1/P2.

---

## Support runtime proof green; final declarative RLS alignment prepared — 2026-10-23

Source e2c1da253a496b3987ecc27bf00a097bc8c30c60 completed45/48 workflows SUCCESS,3 schema reproducibility failures; it is NOT full-source accepted. Native39887868060/job120200194366:86/86 complete clean invocations across84 files,688 TAP passes including parents/repeated lanes,0 failed/skipped/cancelled. Actual Support marker25 read denials/15 mutation denials PASS, authorized merchant/global operations and rollback PASS. Existing Support HTTP permission/session and deletion regressions PASS. Foundation39887868166/job120200194694 final marker PASS; owned image5PASS/0FAIL/SKIP/CANCEL. [Exact bounded runtime proof](evidence/P0-SUPPORT-PRIVACY-RUNTIME-PROOF-20261023.json).

Isolated canonical mismatch reproduced exactly by changing only5 snapshot RLS booleans to false and recomputing canonical ID: generated21dfde8e... vs committed61b7ef0f.... Root cause is missing declarative enableRLS() on Support tables. Final correction keeps protective SQL/snapshot unchanged, adds enableRLS() to5 table definitions and adds original support.ts preimage to0047 so prior history remains reproducible. No tests cancelled or manually rerun; previous native completed before this source update.

Next exact action: inspect containing source canonical0047/all48 migrations and full CI/native acceptance, require exact source/checkout/tree, counters and Support marker before bounded source closure. Emergency authorizations/owner alerts have no tenant key and need distinct trusted-role/privacy treatment; request data and merchant notices require an explicit actor/field matrix. Existing emergency HTTP test is not in the current owned audit runner, so no current restricted-runtime acceptance is claimed. Emergency4-table scope, hosted identity/parity/incident and fullP0 inventory remain OPEN. NO-GO; no percentage; no hosted operation/change/deploy/main/merge/P1/P2.

---

## Support privacy first CI rejected; focused corrections saved — 2026-10-23

Source651785caa2b521ac4b800cd880f75104ad31d4e5 completed39/48 workflows SUCCESS,9 FAILURE. It is NOT accepted. Native39886897793/job120197063608 ran86 complete summaries:83 clean invocations,3 failed suites; exact TAP counters retained. Support own/foreign read/write and preflight subtests passed4 TAP items; authorized-global transaction subtest failed. No security closure from partial positives. [Original failure evidence](evidence/P0-SUPPORT-PRIVACY-FIRST-CI-20261023.json).

Corrected static schema SQL representation and synchronized reviewed SQL/snapshot. Policies use explicit trusted-auth first evaluation, reject directory-only authority, and delegate tenant scope to the accepted public/private predicate boundary. No added private predicate grants for global LOGINs. Restored authorized deletion/Support global compatibility without broadening primary authority. Updated reminder source contract to assert all resets in both message transactions and no post-commit route SQL. Moved Foundation image test into existing owned network-none provisioner; attestation remains mandatory. Added directory-only denial plus actual global observability/Support positives without private-predicate grants.

Local9 updated Support guards plus2 related contracts PASS; MJS/bash syntax/whitespace PASS. Typecheck and full build passed on first source; new exact-source native/canonical/CI acceptance PENDING. Original 86 summaries and9 failed workflow conclusions remain preserved; no manual retry or assertion weakening. Next inspect containing correction's canonical0047 and all86 native summaries, Support HTTP, authorized deletion, observability and Foundation image assertions. Emergency4-table privacy scope and hosted/fullP0 gates remain OPEN. NO-GO; no percentage; no hosted operations/change/deploy/main/merge/P1/P2.

---

## Baseline CI complete; scoped Support privacy correction prepared — 2026-10-23

Recovered remote f6301e56/PR550 unchanged. Diagnostic d4ccf125 completed48/48 workflows SUCCESS,0 pending/failed/cancelled. Native39875671648/job120160553076:85 complete clean invocations/83 unique files,680 TAP passes including parents/repeated lanes,0 failed/skipped/cancelled. Schema39875671590/job120160553610 committed/historical reproduction PASS. Focused39875671803/job1201605536864PASS remains a diagnostic confirming the bounded finding, not remediation acceptance. [Final exact baseline evidence](evidence/P0-SUPPORT-PRIVACY-AUTHORITY-BASELINE-20261023.json).

Prepared canonical0047 Support privacy controls for5 tables: scoped merchant access, explicit existing trusted authentication LOGIN for global Support/lifecycle/observability operations, parent-reference checks and historical-link preflight. Directory audit authority is not added to these policies. No new roles/credential/grant path. Primary readiness now requires all5 tables protected. Merchant image operations use scoped transactions; authorized admin/worker/image reads use existing identity-checked trusted transactions. Reminder resets move into message transactions, eliminating post-commit unscoped route updates. Existing route permission/session checks preserved.

New owned native regression joins priority audit: effective RLS/readiness, missing-policy rejection, unscoped/foreign reads and writes, parent consistency, canonical historical preflight, authorized merchant/global operations, rollback/restoration and reminder semantics. Existing actual-HTTP Support5 and image-before-write tests retained; image fixture now uses restricted tenant/trusted auth LOGINs. Local10 contracts and MJS syntax/whitespace PASS. Native/typecheck/canonical/current-source acceptance PENDING. [Scope](P0-SUPPORT-PRIVACY-REMEDIATION-20261023.md).

Next exact action: inspect containing source CI, particularly canonical0047 snapshot reproduction, new P0_SUPPORT_PRIVACY_REMEDIATION marker, all86 expected native summaries and existing Support/image/retention/observability regressions. Fix actual failures without weakening denial assertions. Emergency4-table privacy scope remains OPEN and unchanged. NO-GO; fullP0 denominator incomplete; no hosted action/change/deploy/ACL/secrets/main/merge/P1/P2.

---

## Support privacy baseline completed; bounded SQL privacy blocker confirmed — 2026-10-23

Diagnostic source d4ccf125b67d8cb05c61190fa71dd7c46b67da20, executed checkout834f94d6a259849c252c2fee1fa4be4c6a02363f, identical tree55cf7686fc45500015a16f2f630be21abca9de6a. Focused run39875671803/job120160553686 SUCCESS:4 TAP passes,0 failed/skipped/cancelled; owned cleanup SUCCESS. Whole-source CI last snapshot43/48 SUCCESS,5 executing,0 failures; this is not final global acceptance.

New P0-SUPPORT-PRIVACY-AUTHORITY-001 OPEN_CONFIRMED_BOUNDED_SQL: isolated effective-authority measurement confirms missing SQL privacy separation in the tested Support record boundary, while legitimate same-merchant reads and exact restoration pass. Nine Support/emergency tables have no effective RLS in the canonical isolated schema. No mutation attempt, HTTP exploitability, emergency payload access or hosted conclusion. [Exact bounded evidence](evidence/P0-SUPPORT-PRIVACY-AUTHORITY-BASELINE-20261023.json).

Next exact action: finish remaining d4cc CI acceptance, then implement the smallest canonical Support privacy authority boundary with explicit trusted global administrator/background operations and scoped merchant reads/writes. Derive required actors from current routes/services; preserve permission revocation, exact-session preview, consent/expiry, lifecycle/image cleanup and audit-chain behavior. Do not add blanket RLS without preserving these paths or broaden primary authority. Settings00c56c26 remains accepted47/47+85/85; prior cashier acceptance untouched. NO-GO, no overall percentage, no hosted operation/change/deploy/main/merge/P1/P2.

---

## Support privacy authority diagnostic prepared — 2026-10-23

Settings source00c56c26 remains accepted47/47 workflows and85/85 native invocations; acceptance checkpoint3571f5ab independently verified remotely. No repeated cashier remediation or passing-suite retry.

Historical Support evidence already covers authenticated matching tenant, current permission revocation despite stale session claims, exact-session read-only preview and terminated preview denial. These assertions ran on00c56c26 as5 complete clean TAP tests in native39873207354/job120152397388. Historical consent-expiry/lifecycle evidence is retained in SEQ_286_289_SUPPORT_EXPIRY_POSTGRES_20261013.md and is not reclassified as current proof.

Next bounded gap is effective SQL privacy authority outside the existing protected-table inventory. Prepared a separate owned network-none diagnostic for9 Support/emergency tables, actual restricted LOGIN metadata, two synthetic merchants, legitimate scoped reads, read-only visibility classification and exact restoration. No HTTP/hosted/privacy closure inferred from a green diagnostic. Existing authorized global Support, lifecycle and emergency operations must be mapped before any ACL/RLS change. [Scope](P0-SUPPORT-PRIVACY-AUTHORITY-20261023.md). Local node/bash syntax and whitespace PASS only; runtime PENDING.

Next exact action: read containing P0 Support privacy authority diagnostic run and its P0_SUPPORT_PRIVACY_AUTHORITY_BASELINE/SUPPORT_PRIVACY_SUITE_RESULT markers, classify actual facts, then prepare a defensive access-control correction only if evidence warrants it. All prior accepted evidence remains bound to its original source. No hosted changes or deployment; NO-GO, complete P0 percentage UNMEASURED.

---

## Settings access controls accepted; remaining privacy matrix continues — 2026-10-23

Accepted executable `00c56c26b2a76e0b709aa616a745dc3681b15f2a`: **47/47 workflows SUCCESS**, zero pending/failed/cancelled. Native39873207354/job120152397388 completed85/85 clean invocations across83 unique files:680 TAP passes (includes parents and repeated lanes),0 failed/skipped/cancelled. Executed checkout135948477cb9b4ed5c9188174eca3865fb596542 independently matches source tree d6ce5e3bdde05f0d222e90418eb1e20a738219ca.

Focused settings proof:8 mutation-denial cases,105 grant/reachability cases; authorized management, default configuration, version checks, pending-approval invalidation, tenant boundaries, lock COMMIT/ROLLBACK and exact restoration PASS. Foundation final marker, canonical0046/all47 migrations, quality and security SUCCESS; dependency audit/review0 high/0 critical/2 moderate. Prior approval remediation4acf1351 acceptance preserved. No successful-suite rerun. [Acceptance](P0-CASHIER-SETTINGS-ACCESS-ACCEPTANCE-20261023.md) · [Exact evidence](evidence/P0-CASHIER-SETTINGS-ACCESS-ACCEPTANCE-20261023.json).

Next exact action: reconcile Support/emergency privacy actors and existing restricted-runtime tests against effective SQL and global authorized operations; add only missing defensive proof before any further source authority change. Existing Support cutover on this source passed5 TAP tests; that alone is not full-domain acceptance. Whole-P0 inventory incomplete; percentage UNMEASURED. Hosted last verified28 migrations vs accepted source47, deployed DB target/login/pooling and approved rollout unresolved. **NO-GO**. No hosted action, deployment, migration, privilege/secret change, main push, merge, P1 or P2.

---

## Settings authority diagnostic complete; access-control fix prepared — 2026-10-23

Diagnostic6fe2d4a4ab56a17dcacc134f7a6d3cca1c1f1112 completed47/47 workflows SUCCESS; native39871639878/job120147216866 has85/85 complete clean invocations/83 files. Checkoutffd8e0c1f9669fccab4bee7d9537b2bc44a29712 matches source tree32d60a328a86bba5ac36f695a5faeb9c713b56ff. Configuration mutation authority requires remediation; authorized management/tenant boundary/rollback/restoration PASS. Diagnostic green is not fix acceptance. [Exact evidence](evidence/P0-CASHIER-SETTINGS-AUTHORITY-BASELINE-20261023.json).

Prepared source: settings mutations require trusted auth; merchant kind-management PUT dispatches through existing identity-checked auth transaction, with scoped primary lock/read retained by0046 projection. Pending invalidation accepts existing trusted auth or private scope; no GUC trust/new principal or role grants. Version/advisory/row lock/transaction/invalidation/replay invariants preserved. Native regression requires mutation denial, authorized management/default/version0 positives, auth marker revocation, lock COMMIT/ROLLBACK behavior, column/role ACL recovery and safe callable metadata/owner boundary. Local24 contracts/syntax/diff PASS; full native/typecheck/canonical/CI PENDING. [Scope and verification](P0-CASHIER-SETTINGS-ACCESS-CONTROL-20261023.md).

Next inspect containing source P0_CASHIER_DISCOUNT_SETTINGS_AUTHORITY_REMEDIATION plus85 clean summaries and all workflows/Foundation/canonical47/security. Last accepted remediation4acf1351 remains47/47+84/84. Proof inventory updated to preserve the settings finding, not claim closure. Source candidate47 vs hosted last28; no hosted operations/change/deploy/migration/ACL/secrets/main push/merge/P1/P2. NO-GO, full P0 percentage UNMEASURED. Keep user-facing reporting high-level.

---

## Approval access controls accepted; settings authority diagnostic prepared — 2026-10-23

Accepted executable4acf13517337a4038f46f2fb672d76fde42db77a:47/47 workflows SUCCESS; native39869692485/job120140702367 has84/84 complete clean invocations/82 files, zero failures/skips/cancellations. Actual checkout3d64dfc90f8f46eb9e9899fb8d2bb66afe2fbc70 matches source tree8e910f6ac0ded63664f9161b51fcbc25f9c80aaa.14 direct denial/195 grant-reachability cases PASS; authorized flows, replay, tenant boundaries, transaction rollback/locking and exact restoration preserved. Foundation final marker,0045 canonical schema reproduction/all46 migrations, quality and security SUCCESS. Audit120140702494/review120140702455:0 high/0 critical/2 moderate. [Acceptance](P0-CASHIER-APPROVAL-ACCESS-ACCEPTANCE-20261023.md) · [Exact counters/runs](evidence/P0-CASHIER-APPROVAL-ACCESS-ACCEPTANCE-20261023.json). No retry or rerun.

Next group: new settings-authority actual-LOGIN diagnostic prepared/registered, covering two-merchant boundary, configuration authority/business validation consistency, authorized versioned management/pending invalidation/rollback and exact snapshots. Local syntax/diff PASS; native/CI PENDING. No production/schema modification in this next group. Read containing executable's P0_CASHIER_DISCOUNT_SETTINGS_AUTHORITY_BASELINE and all complete native summaries before classification/remediation. Diagnostic success is not security acceptance. Current approval source acceptance must not be confused with the containing new test executable.

NO-GO; P0 percentage UNMEASURED; full requirement/proof inventory and other critical gates OPEN. No hosted operations/deploy/migration/ACL/secret/main push/merge/P1/P2. Source46 vs hosted last28; actual deployed DB identity/pooler unresolved. User-facing security updates stay high-level.

---

## Approval provenance bypass proven; scoped mutation remediation prepared — 2026-10-23

Diagnostic1716a354153fff43994dc80a33c184f880046dc1:47/47 workflows SUCCESS,84/84 clean native invocations/82 files. Native39867836738/job120134422668, checkoutab9913435a238b01d6cca2eac9b02c7d51f0b21b matches source treedd691a701a05f0d8b6c437dad8fd933bd85da4e4. Actual primary forged pending/pre-consumed approvals accepted by unchanged validator without issuance/PIN; issued operation rebind/consumed reset accepted by actual consumer. Cross-tenant denial/genuine issuance/replay/restoration PASS. No HTTP/full sale/hosted exploit claimed. [Exact baseline](evidence/P0-CASHIER-APPROVAL-PROVENANCE-BASELINE-20261023.json).

Prepared fix: approval mutations join auth-only admission inventory;0045 scope-checked locking/independently validated consumption/pending invalidation capabilities remain on original commerce transaction. Settings->approval->staff lock order, binding/window/exact replay/current manager policy, kind advisory lock/invalidation/rollback retained. No auth-connection consumption or hosted ACL change. New readiness requires safe existing callable capabilities/unreachable owners. Expanded native regression requires original attacks denied plus direct RPC denial, column/role grant matrix, metadata safety and preserved genuine flows. Local24 contract tests and syntax/diff PASS; native/canonical/typecheck/complete CI PENDING. [Design/tests/limits](P0-CASHIER-APPROVAL-PROVENANCE-20261023.md).

Next read containing exact-source P0_CASHIER_APPROVAL_PROVENANCE_REMEDIATION marker/full native84 summaries and complete CI/Foundation/schema/security. Green diagnostic is not fix acceptance; last accepted remediation bcebf0e remains47/47+83/83. No passing-suite rerun. Source candidate46 migrations vs last hosted28;28/28 historical canonical hashes match. Actual deployed DB login/target/pooler and hosted rollout remain unverified/unapproved. NO-GO; whole P0 percentage UNMEASURED. No hosted changes/deploy/main push/merge/P1/P2.

---

## Canonical hosted ledger reconciliation — 2026-10-23

Read-only hosted staging ledger matches **28/28 canonical executable hashes and timestamps**, after applying the repository preflight's stabilizeMigrationDependencyOrder transformation. The earlier raw-file comparison's3 differences are expected normalization, **not migration drift**. Source45 versus hosted28 leaves17 missing migrations0028–0044. Canonical per-entry hashes appended to [hosted evidence](evidence/P0-HOSTED-READONLY-RECOVERY-20261023.json). No migration or hosted write executed.

Approval provenance diagnostic executable1716a354153fff43994dc80a33c184f880046dc1 is remotely saved and47 CI workflows started; native39867836738 PENDING. Last accepted remediation remains bcebf0e (47/47+83/83), documentation checkpoint d9c0e72c is not an executable acceptance. Next read the exact baseline marker and full clean summaries; green diagnostic may establish a defect, not fix acceptance. Preserve real primary setting->approval->staff lock order, exact replay and transaction rollback/kind invalidation; do not solve provenance with a separate auth transaction. NO-GO; P0 percent unmeasured.

---

## Approval provenance diagnostic prepared — 2026-10-23

Previous source bcebf0e accepted47/47 workflows+83/83 clean invocations; checkpoint d9c0e72c remotely verified. New actual-LOGIN diagnostic covers genuine PIN-issued approvals and replay for two merchants, missing/cross-tenant denial, primary forged pending/consumed INSERT through actual manual-discount validator, immutable operation rebinding and consumed reset through real consumer with exact rollback/snapshot checks. No production or schema change. Node syntax and diff checks PASS; native runtime/CI PENDING. Green diagnostic may prove a defect and is not remediation acceptance.

Next: inspect exact P0_CASHIER_APPROVAL_PROVENANCE_BASELINE marker and complete native summaries; classify before any provenance fix. Preserve lock order and primary transaction atomicity. Never transfer consumption onto a separate auth connection. Source acceptance and fresh hosted drift evidence: [report](P0-SOURCE-HOSTED-RECONCILIATION-20261023.md).17 missing0028–0044 migrations need approved rollout; all28 hosted canonical hashes match; actual deployed DB target/login/pooler still unverified. NO-GO, percentage UNMEASURED. No hosted writes/deploy/main/merge/P1/P2.

---

## Discount policy accepted; hosted read-only recovery complete — 2026-10-23

Executable bcebf0e436a7805b60822d0338a5d4e511b36846 accepted:47/47 workflows SUCCESS;83/83 clean native invocations/81 unique files; actual checkout95ce575d0cafd9f9862311dfcb86cc7801a960f7 tree80dae12b29f96bd1c25b9745ba406873f32cb816 matches. Primary mutation42501/approval-required validator/trusted-auth positive/exact rollback,12 denials/165 grant cases PASS. Foundation/schema/quality/security accepted;0 high/0 critical/2 moderate. No test rerun. [Acceptance](evidence/P0-CASHIER-DISCOUNT-POLICY-ACCEPTANCE-20261023.json).

Railway connection restored and identities verified; hosted old main d38d292 (2026-10-10) ready200, not current P0. Neon explicit staging-runtime still28 vs45 source migrations, no private scope, unsafe candidate role attributes/non-RLS grants. Actual deployed DB target/login/pooler UNVERIFIED; no secrets read. [Report, limits and incident checklist](P0-SOURCE-HOSTED-RECONCILIATION-20261023.md) · [Hosted catalogs](evidence/P0-HOSTED-READONLY-RECOVERY-20261023.json). Latest user instruction authorizes read-only Railway/Neon; historical GitHub-only restriction superseded for these reads only.

Next exact engineering task: actual-LOGIN approval provenance diagnostic with trusted issuance/replay/rollback and two-tenant controls, then classify before remediation. Hosted rollout/ACL/rotation requires separate approval. NO-GO; whole P0 percentage UNMEASURED; full remaining P0 inventory OPEN. No hosted writes/deploy/main push/merge/P1/P2.

---


## Policy mutation validator bypass proven; trusted-auth restriction prepared — 2026-10-22

**Baseline d051f0c32e29e66ddda60787f6f873c6948a841f:**47/47 parent workflows SUCCESS;83/83 clean native invocations/81 unique files. Native39826479484/job119990994336, source and checkout5013e81e6373d7cb727f66ca7571be6af719c7f5 tree338d5d9067d65aec29f530827469c39690233131 match. Actual primary own-policy100->300 ACCEPTED; readiness ACCEPTED; unchanged real validator discount250 without approval ACCEPTED. Auth exact restoration returned original approval-required denial; other merchant/staff/permission/PIN/session/approval state unchanged. No HTTP/full sale/hosted exposure claimed. [Exact baseline](evidence/P0-CASHIER-DISCOUNT-POLICY-BASELINE-20261022.json).

**Prepared fix PENDING native/CI:** add policy table to auth mutation inventory (one production table-name addition); fixture uses derived existing restriction. No migration/business/PIN/discount-threshold/lock/grant/hosted change. Admission rejects unsafe policy ACLs; does not revoke hosted privileges. Native requires original primary42501/no-approval rejection, trusted-auth policy positive/exact restoration,12 direct mutation denials,165 table/column/reachable-role grant/revoke cases and both scoped read positives. Older business-RLS own-policy primary write changed to explicit denial plus auth rollback positive; attribution writes/rollback unchanged. Local node --check PASS; corrected-source acceptance not claimed. [Fix/report/continuation](P0-CASHIER-DISCOUNT-POLICY-INTEGRITY-20261022.md).

**Next:** read final source P0_CASHIER_DISCOUNT_POLICY_INTEGRITY_REMEDIATION and full native/CI/Foundation/quality/schema/security exact results once available. No polling/wait loop, duplicate test run or passing-test rerun for docs. Preserve failures before correction/bounded justified retry. Last accepted remediation645b534 remains47/47+82/82; diagnostic d051 green is not fix acceptance. After acceptance, actual approval provenance proof follows saved source trace, preserving locks/replay/kind-change atomicity.

NO-GO; whole-P0 percentage UNMEASURED; full remaining P0 scope OPEN. GitHub/Actions only; hosted runtime BLOCKED_BY_RAILWAY, hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. No external connector/hosted change/deploy/main push/merge/credential rotation/P1/P2.

---

## Policy diagnostic executing; approval provenance source review saved — 2026-10-22

Current test executable d051f0c32e29e66ddda60787f6f873c6948a841f is PENDING. One resume inventory:25/47 parent workflows SUCCESS,22 queued/in_progress,0 failures. Native39826479484/job119990994336 executing migrations/selected tests. No repeat status poll, retry, rerun or cancellation. Last accepted isolated source645b534aea0d32848b4467b5bbebf8fd671deddb remains47/47+82/82 with174 direct/20 role grant cases. Do not call the policy mutation/validator outcome until its marker exists.

Independent five-file source review completed for subsequent approval-provenance group: auth PIN issuance, primary setting->approval->staff lock consumption, exact binding/window/replay, kind-change advisory lock/atomic pending invalidation and tenant schema constraints. Potential primary INSERT or immutable/consumed-marker tampering requires actual LOGIN proof; no forged-approval/PIN/HTTP/hosted bypass claimed. Preserve legitimate replay and transaction boundaries. [Review/proof plan](P0-CASHIER-APPROVAL-MUTATION-TRACE-20261022.md) · [Exact blobs and single current status observation](evidence/P0-CASHIER-APPROVAL-MUTATION-TRACE-20261022.json).

**Next remains current policy test first:** read P0_CASHIER_DISCOUNT_POLICY_INTEGRITY_BASELINE and full suite results once available; prove/classify before policy remediation. Approval provenance proof follows that group. If pending, advance independent review without loops or cancelling its CI. This checkpoint docs-only [skip ci]; no new code/tests/schema/grants/native execution.

NO-GO; P0 percentage UNMEASURED; full remaining P0 scope OPEN. GitHub/Actions only. Hosted runtime BLOCKED_BY_RAILWAY; hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. No external connector/hosted changes/deploy/main push/merge/credential rotation/P1/P2.

---

## Non-row admission accepted; policy-validator baseline prepared — 2026-10-22

**Accepted645b534aea0d32848b4467b5bbebf8fd671deddb:47/47 parent workflows SUCCESS,82/82 isolated invocations clean,80 unique files.** Native39824457555/job119983935469:58 protected tables/174 direct non-row grant denials and20 role/column cases, original three probes now REJECTED, revocation recovery/catalog/rollback PASS. Checkoutcadabf4a7f4287bf7ea8899a60fed72a860e6887 shares source tree3fa9347d7286d9059f556652180d375eaa7bad4a. Foundation39824457202/job119983933998 final marker, schema39824456460/job119983931446 reproduction, quality39824457487 and security39824456372 SUCCESS, audit119983930705/review119983930995:0 high/0 critical/2 moderate. No failure/retry/rerun. [Exact acceptance](evidence/P0-CASHIER-NONROW-PRIVILEGE-ACCEPTANCE-20261022.json). Previous pending observations historical only; guard rejects admission, does not revoke SQL privileges or certify hosted ACLs.

**Next group advanced:** real actual-LOGIN discount-policy diagnostic prepared and registered. Two-merchant authority refuses discount250/limit100 without manager approval; attempt primary own-limit UPDATE300 then call identical actual validator and record mutation/readiness/decision. Finally restore exact fields/version/PostgreSQL microsecond timestamps through auth and check other merchant/staff/permission/PIN/session/approval invariants and restored rejection. Local node --check PASS, native result PENDING; diagnostic success may report a gap and is not security acceptance. No HTTP/full sale executed. [Bounded proof/limits](P0-CASHIER-DISCOUNT-POLICY-INTEGRITY-20261022.md).

**Exact next:** read final new test source's P0_CASHIER_DISCOUNT_POLICY_INTEGRITY_BASELINE marker, full native summaries and source/checkout/run/job; classify observations before remediation. One status check per continuation, no wait loop or rerun passing tests for docs. If confirmed, restrict policy table mutations while preserving auth writers/primary reads, role/column grants, HTTP version/role/rollback and manager issue/consume locks. Earlier accepted source not rerun for metadata.

**NO-GO**, P0 percentage UNMEASURED; full same-tenant/alternate-path/auth/privacy/offline/grace/sync/retention/provider/storage/P0 inventory OPEN. GitHub/Actions only; hosted runtime BLOCKED_BY_RAILWAY; hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. No external connector/hosted changes/deploy/main push/merge/credentials/P1/P2.

---

## Sequential continuation: non-row CI pending; policy authority source trace saved — 2026-10-22

Executable645b534aea0d32848b4467b5bbebf8fd671deddb remains PENDING native/CI acceptance. A single resume inventory observed15/47 parent workflows SUCCESS,32 queued/in_progress,0 failures; isolated39824457555 queued. No second status read, wait loop, rerun, retry or cancellation. Latest globally accepted isolated executable remains bec6e7114be692981df07bc7b25ad456116fda42 (47/47+81/81). Green baseline5d3dde10 (82/82 native) proved the non-row grant-admission gap and is not fix acceptance.

**Independent work completed:** nine exact-source files traced for staff discount-policy mutation authority. Policy PUT/hardening use trusted auth, while sale validation reads policy through scoped primary and returns without approval inside the stored limit. Policy table is RLS-protected but absent from authentication mutation restriction; existing accepted business-RLS suite allows own primary policy upsert100->125 with rollback. A possible own-limit escalation is an inference; actual validator bypass/HTTP exploit/hosted exposure NOT_PROVEN. [Trace/proof plan](P0-CASHIER-DISCOUNT-POLICY-MUTATION-TRACE-20261022.md) · [Exact blobs/status/facts](evidence/P0-CASHIER-DISCOUNT-POLICY-MUTATION-TRACE-20261022.json).

**Next:** check645 result once and classify exact native/CI evidence first. If pending, continue independent source review without polling. Afterward prove actual validator discount250/limit100 missing-approval rejection; attempt scoped primary policy increase to300 and repeat identical validator call, restore via auth and verify two-merchant/manager/PIN/permission/session/approval invariants. Only then restrict policy mutation if confirmed, preserving trusted-auth writes/primary reads/HTTP version-rollback and approval locks. Do not launch a subsequent runtime source merely to cancel645 queued CI.

This checkpoint is docs-only [skip ci], no production/test/schema changes or new native assertions. P0 scope OPEN, release NO-GO, percentage UNMEASURED. GitHub/Actions only; hosted runtime BLOCKED_BY_RAILWAY, hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. No external connector/hosted changes/deploy/main push/merge/credentials/P1/P2.

---

## Native non-row privilege gap confirmed; remediation pending CI — 2026-10-22

**Proven baseline:** executable5d3dde10a03ca3c3f92a9435c005f8334546b315, isolated39821762823/job119974573789 SUCCESS;82/82 invocations clean. Source/checkout tree5dab5e9028856478e07edf762a2068543368977e matches. Actual LOGIN18 cashier tables: active RLS, no baseline non-row privileges or reachable owners;0 observed user-schema views/15 routines. Explicit disposable grants of TRUNCATE/REFERENCES/TRIGGER on settings were all incorrectly ACCEPTED by readiness. Actual privately scoped TRUNCATE removed both synthetic rows; rollback restored2 and grants revoked. This is an admission gap under grant drift, not an existing unsafe hosted/default grant. [Exact baseline](evidence/P0-CASHIER-NONROW-PRIVILEGE-BASELINE-20261022.json).

**Remediation prepared:** runtime readiness inventories protected-table TRUNCATE/TRIGGER/REFERENCES and column REFERENCES across current/session/inherited/SET-reachable roles, including effective PUBLIC; strict missing/malformed evidence rejects. New error PRODUCTION_DATABASE_NONROW_PRIVILEGE_REACHABLE; existing auth mutation precedence preserved. Native test requires denial for174 direct grant cases across58 protected tables plus20 role/column cases, revocation recovery and rejection despite original-LOGIN privileges behind SET ROLE. Raw SQL demonstration remains to show guard does not revoke grants. Unit malformed-inventory/positive/negative coverage updated. Local node --check PASS only; corrected-source runtime validation PENDING. No production DDL/ACL/business/scope/lock/policy changes. [Report and exact limits](P0-CASHIER-NONROW-PRIVILEGE-ADMISSION-20261022.md).

One baseline parent-status read:43/47 SUCCESS,4 pending,0 failed; no polling loop/retry/rerun. Last globally accepted isolated executable remains bec6e7114be692981df07bc7b25ad456116fda42 (47/47+81/81). Baseline diagnostic success is not security acceptance; earlier green results do not cover the new runtime fix.

**Exact next:** read final remediation source's native P0_CASHIER_NONROW_PRIVILEGE_REMEDIATION marker and clean suite summaries, plus Foundation/quality/schema/security. Check once; if pending preserve status and continue independent source review, never wait-loop. Preserve any failure before correction/bounded justified retry. Then continue complete alternate routine/trigger/view and same-tenant authority review. Full auth/privacy/offline/grace/sync/retention/provider/storage/P0 inventory OPEN.

**NO-GO.** Whole-P0 percentage UNMEASURED. GitHub/Actions only; hosted runtime BLOCKED_BY_RAILWAY, hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. No external-service connector/hosted changes/deploy/main push/merge/credential rotation/P1/P2.

---

## Cashier business RLS accepted; alternate privilege diagnostic prepared — 2026-10-22

**Accepted executable `bec6e7114be692981df07bc7b25ad456116fda42`:47/47 parent workflows completed SUCCESS;81/81 isolated invocations clean,79 unique files.** One bounded resume read reconciled regional39797882225/catalog39797882190/security39797881966 to success. No retries or reruns. Native39797881955/job119889907395, all45 migrations/full-schema restore/cleanup/Node22 HTTP, Foundation/schema/quality and security0 high/0 critical/2 moderate remain accepted. Source tree445ea1378759f227f598547936279977e5c3f1d6 matches checkout950170c62cc42c47c7d07a4a96a22e6dd0ecfa7e. [Exact results](evidence/P0-CASHIER-DISCOUNT-ATTRIBUTION-RESULTS-20261022.json) · [report](P0-CASHIER-DISCOUNT-ATTRIBUTION-TENANT-RLS-20261022.md).

**Next sequential group advanced:** canonical45 SQL migrations inspected:20 function declarations including replacements, no CREATE VIEW declarations in that bounded SQL inventory. Readiness source rejects non-row privileges on authentication-integrity tables but has no blanket TRUNCATE/REFERENCES/TRIGGER rejection on the remaining protected tables. This is a source hypothesis, NOT a hosted exposure or executed finding. [Exact source inventory and diagnostic contract](evidence/P0-CASHIER-ALTERNATE-PRIVILEGE-SOURCE-20261022.json).

New `cashier-alternate-privilege-postgres.integration.test.mjs` diagnostic is registered in the isolated audit boundary. It inventories actual LOGIN ACLs/owner reachability for18 cashier tables, views and routines; records readiness responses to disposable grants; attempts scoped TRUNCATE on synthetic settings, inspects both rows with an explicitly fixture-only definer observer, and rolls back/restores/revokes. Diagnostic success can record unsafe admission; it is NOT remediation or security acceptance. Production readiness/business logic/schema/grants unchanged. Local node --check PASS only; native result pending.

**Exact next:** retrieve the new diagnostic result once when available, preserving its exact source/run/job/inventory/probes and all failures. If still pending, document and advance independent source work; no wait/poll loop or rerun passing tests. Prove a concrete gap before remediation; cover direct/PUBLIC/inherited/SET/unreachable grants and column REFERENCES as applicable. All18 cashier source tables have RLS, not full same-tenant mutation/alternate-path certification. Full auth/privacy/offline/grace/sync/retention/provider/storage/P0 inventory OPEN.

**NO-GO.** Whole-P0 percentage UNMEASURED. GitHub/Actions only; hosted runtime BLOCKED_BY_RAILWAY, hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. No external connector/hosted change/deploy/main push/merge/credential rotation/P1/P2. Preserve accepted evidence and continue sequentially.

---

## Cashier identity tenant RLS accepted in isolation — 2026-10-22

**Accepted executable `81aeaf6e2ccd4f652d435da0775a5b4dffb062da`:47/47 workflows SUCCESS;80/80 isolated invocations exit0/failed0/skipped0/cancelled0/summaryComplete,78 unique files.** Native39789294155/job119860712686: identity RLS8PASS, staff-lock7PASS, permission/session8PASS, housekeeping10PASS, manager PIN10PASS, auth63PASS/50 sensitive-read ACL cases/10 columns (parents included). All44 migrations/full schema dump-restore/owned cleanup/Node22 HTTP, schema39789294139/job119860711191 and Foundation39789294370/job119860713266 types/build/readiness/native-RLS/integration/final marker PASS. Checkout4178279c91a971331029da586aa67281b1d01d43 matches source tree80cc0aac58de49c8116c0ba3bce27c7f6cc458e8. [Exact acceptance](evidence/P0-CASHIER-IDENTITY-TENANT-RLS-ACCEPTANCE-20261022.json) · [bounded report](P0-CASHIER-IDENTITY-TENANT-RLS-20261022.md).

Migration0043 adds established private-scope/auth/audited-admin RLS (USING/WITH CHECK) to seven staff/permission/station/pairing/credential/shift/session tables, schema declarations/linked policies/preimages/reviewed SQL/snapshot/journal and production admission inventory. New actual-LOGIN two-tenant proof: catalog7 active policies, unscoped/forged-GUC hiding, A/B private scope/contrary GUC, no scope leakage, cross-merchant station/shift write hiding/insert-rebind42501, own work rollback, global auth without tenant GUC/marker revocation, merchant-bound staff service, actual historical primary join/wrong-device denial,7 disabled-RLS admission cases PASS. Three existing ordinary-read positives now require scope and assert empty unscoped rows; original secret/mutation/locking/rollback checks preserved.0042 real commerce staff locks, durable PIN lockout and approval replay/concurrency remain green. No issuer/predicate/business policy/credential/hosted ACL or role change.

Security39789294182 attempt1 SUCCESS; audit119860712503/review119860711692:0 high/0 critical/2 moderate. No CI failures or retries in this increment. Canonical SQL/preimages/journal/snapshot reproduced, hash in exact evidence; local dependency links were unavailable and no local canonical success was claimed. Containing checkpoint docs-only[skip ci]. Previous44f4643146/46+79/79 remains historical; schema paths cause47 workflows now. New source/schema/test justify this run; no rerun for docs alone and no workflow/test count as P0 percentage.

**Next bounded group:** four remaining source-snapshot cashier tables without RLS: merchant_cashier_discount_settings, merchant_cashier_staff_discount_policies, merchant_cashier_discount_override_approvals, cashier_operation_attribution. Source inventory only, not hosted proof. Trace settings/policy/override/sync/report business and auth writes/locks; prove two-tenant read/write denial and own/auth positives while preserving sale binding/window/advisory-row lock order/replay/rollback, then canonical provenance/inventory. Alternate views/functions, complete auth/privacy and offline/grace/sync/retention/provider/storage/full-P0 inventory OPEN. No full cashier or release certification.

**NO-GO.** Whole-P0 percentage UNMEASURED. Hosted runtime BLOCKED_BY_RAILWAY; hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. No external-service connector/hosted change/deploy/main push/merge/credential rotation/P1/P2. Resume sequentially, preserve accepted evidence. Older pending notes below superseded only within this bounded proof.

---

## Staff mutation isolation and scoped approver lock accepted — 2026-10-22

**Accepted executable `44f46431c63e7ca723d4e1e283259a9872ab8abf`:46/46 workflows SUCCESS;79/79 isolated invocations exit0/failed0/skipped0/cancelled0/summaryComplete,77 unique files.** Native39749682352/job119727410924: new staff-lock7PASS, manager PIN10PASS, permission/session8PASS, authentication63PASS/50 sensitive SELECT ACL cases/10 columns (parents included). All43 migrations/full schema dump-restore/Node22 HTTP/owned cleanup, schema reproducibility39749682448/job119726808272 and Foundation39749682531/job119726986131 types/build/readiness/native-RLS/integration/final marker PASS. Checkout7f612db589e1f500af71a3dfb57525519e670368 matches source treea4938667bfa5c19e4ecdc8ebddef2e989faddb66. [Exact acceptance](evidence/P0-CASHIER-STAFF-LOCK-ACCEPTANCE-20261022.json) · [design/results](P0-CASHIER-STAFF-LOCK-BOUNDARY-20261022.md).

Migration0042 adds a fixed public-field staff row-lock routine guarded by private actual LOGIN/backend/full-transaction merchant scope. Commerce retains underlying FOR UPDATE until its COMMIT/ROLLBACK with no staff UPDATE privilege. Tenant admission now bans all staff table/column mutations; no writable-column exemption. Native denial of all14 column UPDATEs/INSERT/DELETE/TRUNCATE/PIN hash read;45 direct/PUBLIC/inherit/SET/unreachable mutation grant scenarios; five-field projection, forged GUC/other backend/wrong merchant/expired/completed scope negatives PASS. Real auth UPDATE times out55P03 while commerce holds staff lock, succeeds after either COMMIT/ROLLBACK. Function invoker/path/volatility/EXECUTE/existence drift fail readiness. Original consume rollback/replay/concurrency/demotion and PIN policy preserved. No hosted ACLs/roles/credentials provisioned or policy relaxation.

Initial583492a5 had3 unit SQL-adapter failures, retained in evidence/P0-STAFF-LOCK-INITIAL-UNIT-ADAPTER-20261022.json. Correction only matches new SQL/asserts parameters/removes secret fixture fields; business assertions unchanged, final full quality39749682344 all4 jobs PASS. Corrected auth39749682683 attempt1 failed Docker image download before isolated tests; evidence/P0-STAFF-LOCK-AUTH-INFRA-ATTEMPT1-20261022.json retained. One same-source failed-job retry succeeded attempt2/job119728151440 (seven clean auth-contract invocations). Security39749682487 attempt1 SUCCESS:0 high/0 critical/2 moderate, audit119727140452/review119727140678. Source/guards/dependencies not relaxed. Containing checkpoint docs-only[skip ci]; previous2b4d154f46/46+78/78 remains historical. New migration/source/test justify this run; no rerun for docs alone.

**Next bounded task:** non-secret cashier row isolation. Canonical source snapshot inventory lists11 cashier tables without RLS (source only, not hosted certification). Begin seven identity/permission/station/credential/shift/session tables; trace historical commerce reads and trusted auth writers, then prove two-tenant private-scope isolation/auth positives with scoped row locks intact. Discount settings/policies/approvals and attribution remain separate subsequent groups. Alternate view/function exposure, offline/grace/sync/retention/provider/storage/full-P0 inventory OPEN; do not claim full cashier integrity.

**NO-GO.** Whole-P0 percentage UNMEASURED; workflow/TAP counts are not its denominator. Hosted runtime BLOCKED_BY_RAILWAY; hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. No external-service connectors/hosted change/deploy/main push/merge/credential rotation/P1/P2. Preserve accepted evidence and resume sequentially. Older pending/source hypotheses below are superseded within this bounded proof.

---

## Cashier permission/session authority accepted in isolation — 2026-10-22

**Accepted executable `2b4d154f01521318abb02f7080cdf6c02e834e05`:46/46 workflows SUCCESS;78/78 isolated invocations exit0/failed0/skipped0/cancelled0/summaryComplete (76 unique files).** Native39746441245/job119715940401: new permission/session8PASS, authentication63PASS (50 sensitive SELECT ACL cases/10 columns), manager PIN10PASS; parents included. All42 migrations/full dump-restore/Node22 HTTP/owned cleanup and Foundation39746441434/job119715941742 types/build/readiness/native-RLS/integration PASS. Actual checkout6484818c27cba31f1f02c4c171e1fb97bc7277f3 matches source treeeae74e44da5047f37246539e1960e37d728b5323. [Exact acceptance](evidence/P0-CASHIER-PERMISSION-SESSION-ACCEPTANCE-20261022.json) · [bounded report](P0-CASHIER-PERMISSION-SESSION-AUTHORITY-20261022.md).

Merchant HTTP staff discount-policy writes and non-manager role cleanup now run their existing atomic permission/policy/staff/snapshot statements on trusted auth LOGIN. Tenant readiness rejects permission/session table mutations and raw operator token-hash reads. Native actual-LOGIN denies CRUD/TRUNCATE, permits ordinary session reads, passes12 mutation grant/revoke admission cases; auth-only cleanup remains scoped/idempotent/role-aware with0 primary calls. Real cookie/device/entitlement HTTP save, cashier role restrictions, cross-merchant404/stale409 and late SQL failure full rollback PASS. Missing/tenant auth URL and revoked marker fail without fallback. Existing manager approval commerce FOR UPDATE/rollback/replay/concurrency retained. No business policy, migration, issuer/RLS/hosted ACL or dependency changes.

Security39746441357 attempt1 all jobs SUCCESS; audit119715949059/review119715949269:0 high/0 critical/2 moderate. No retry or policy relaxation, no CI failures in this increment. This containing checkpoint is docs-only[skip ci]. Previous executablef0418c1346/46+77/77 remains historical; the new invocation and regression gates justify this source run. No rerun for documentation alone.

**Next bounded task:** close direct merchant_cashier_staff mutation authority with a narrow privilege/locking design. Preserve public staff-row FOR UPDATE used by commerce; prove actual-LOGIN credential/role/status/counter/version and insert/delete/truncate denial with trusted auth writer positives and commerce concurrency/rollback. Staff mutation remains OPEN; do not claim full cashier integrity. Non-secret cashier row isolation/alternative view-function exposure, offline/grace/sync/retention/provider/storage/full-P0 inventory remain OPEN.

**NO-GO.** Whole-P0 percentage unmeasured; test/workflow counts are not a P0 denominator. Hosted runtime BLOCKED_BY_RAILWAY; hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. No external-service connector/hosted change/deploy/main push/merge/credential rotation/P1/P2. Resume sequentially; preserve accepted evidence. Older pending candidate entries below are superseded within this bounded scope.

---

## Manager override PIN lockout remediated in isolation — 2026-10-22

**Accepted executable `f0418c1350a4d51dc112fb805304978541ab1dfc`:46/46 workflows SUCCESS;77/77 isolated invocations exit0/fail0/skip0/cancel0/summaryComplete.** Native39740821742/job119697340772: manager PIN10PASS/auth58PASS (parents included),45 sensitive-column ACL cases, primaryPoolCalls0. All42 migrations/dump-restore and Foundation types/build/unit/native-RLS/integration PASS. Actual checkout6f2c8791a84f80006d93d0d60cf58bc4ca1570a6/tree18946b39ab1fe8974f52dd86ab43eb30b908dd52 matches source. [Exact acceptance](evidence/P0-MANAGER-PIN-PERSISTENCE-ACCEPTANCE-20261022.json), [report](P0-MANAGER-OVERRIDE-PIN-PERSISTENCE-20261022.md).

Baselinef0023060 strict native test confirmed counters all0/no lock/correct PIN accepted after five errors, with production unchanged; only new test failed while previous76 invocations stayed clean. [Baseline retained](evidence/P0-MANAGER-PIN-BASELINE-20261022.json). Fix commits PIN refusal decisions on auth LOGIN before throwing outside; SQL/business/conflict errors still roll back. Non-secret commerce approver projection retains FOR UPDATE/binding/window/replay/role checks. Tenant PIN-hash read admission added;9 protected columns. Fixed counters1,2,3,4,0/fifth locked/correct PIN blocked, concurrent failures/recovery/rollback/consume/replay/demotion/no-fallback all PASS. Threshold5/15min, RLS/issuer/migrations and policies unchanged.

Dependency audit first attempt failed closed without vulnerability counts; exact failure retained. One same-source failed-job retry request recovered successful security attempt2 (audit119699938164/review119699988452):0 high/0 critical/2 moderate. No policy/dependency/source relaxation. Containing checkpoint is docs-only[skip ci], not new tests. Prior76-invocation acceptance stays historical.

**Next bounded task:** trace primary staff/permission/operator-session snapshot mutations in cashier-discount-policy-operations and cashierStaffDiscountRoleHardening, preserving commerce locking; design actual-LOGIN mutation restriction proof before expanding privileges checks. Remaining staff/session integrity and non-secret cashier row isolation, offline/grace/sync/retention/provider/storage/full P0 inventory OPEN.

**NO-GO.** Hosted runtime BLOCKED_BY_RAILWAY; hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. No external service connector/hosted change/deploy/main push/merge/credential rotation/P1/P2. Whole-P0 percentage unmeasured; TAP/invocations are not a P0 denominator. Preserve acceptance; do not rerun77 suites for docs-only changes. Older pending/hypothesis entries below are superseded.

---

## Cashier credential housekeeping accepted in isolation — 2026-10-22

**Accepted executable: `be497124f86ce12b6e2041f1246f0a5e33874cef`.46/46 workflows SUCCESS;76/76 isolated invocations exit0/fail0/skip0/cancel0/summaryComplete.** Native39722922331/job119640266600: new housekeeping10PASS/authentication53PASS (parents included), auth40 sensitive-column ACL cases, primaryPoolCalls0 in both. All42 migrations/full dump-restore and Foundation types/build/readiness-unit/native-RLS/integration PASS. Actual checkout19586602febbf282e952e16c58fae38ffbe75995 and source share tree8318994b4ac017f9ec57ea3c21294a7f730f6c05. Dependency audit/review0 high/0 critical/2 moderate. [Exact evidence](evidence/P0-CASHIER-CREDENTIAL-HOUSEKEEPING-ACCEPTANCE-20261022.json), [source trace/remaining work](P0-CASHIER-CREDENTIAL-HOUSEKEEPING-20261022.md).

Two production files: station credential refresh/global short-lived expiry use identity-checked auth transaction; tenant admission now rejects station credential/pairing table mutations and raw token/code SELECT. Ordinary historical reads remain. Real tenant denied credential reads/CRUD/TRUNCATE/SET auth role under forged GUCs; auth-only binding refresh/invalid/revoked/device/version negatives, both-merchants expiry/terminal preservation, second-statement failure rollback, no primary fallback and business shift/staff/station preservation PASS. SQL predicates/policy, migrations, issuer/RLS and hosted ACLs unchanged. No failed attempt in this increment. Prior2cf55e25 remains historical46/46+75/75; new runner adds one invocation. Containing checkpoint docs-only[skip ci], not new tests.

**Next bounded task:** actual-LOGIN manager discount-override failed-PIN counter/lockout regression. Source writes then throws within the transaction, a rollback hypothesis not yet runtime proven. Then split primary approval-consumption pin_hash projection/FOR UPDATE from secret issuance while retaining atomic revocation/consume/replay behavior. Primary staff/permissions/operator-session mutation and non-secret cashier row-isolation gates remain OPEN; do not call complete cashier integrity accepted. Existing offline/grace/sync/retention/provider/storage/full-P0 inventory queue preserved.

**NO-GO.** Hosted runtime BLOCKED_BY_RAILWAY; hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. No Railway/Neon/external service connectors, hosted changes/deploy, main push/merge, credential rotation or P1/P2. Whole-P0 percentage unmeasured; invocation/TAP counts are not a P0 denominator. Preserve accepted source, do not rerun76 suites for docs-only changes. Older pending-source entries below are superseded.

---

## Authentication sensitive SELECT admission accepted in isolation — 2026-10-22

**Accepted executable: `2cf55e258762402f001a6960f4521d389a96822f`. 46/46 workflows SUCCESS; 75/75 isolated invocations exit0/fail0/skip0/cancel0/summaryComplete.** Native run39721170510/job119634687396: authentication43PASS (parent included), all30 credential column/ACL grant-revoke cases and original signup/OTP/session/admin/rollback positives; primaryPoolCalls0. Actual checkout e1e206fc6b15d6cd703f09d9119813d3986808f6 and source share tree2ea8af20b2fb92b1e62500f48f748361f2123a75. Full42 migrations/dump-restore and Foundation types/build/unit/RLS/integration PASS. Dependency audit/review:0 high,0 critical,2 moderate. [Exact evidence](evidence/P0-AUTH-SENSITIVE-SELECT-ACCEPTANCE-20261022.json), [bounded report](P0-AUTH-SENSITIVE-SELECT-20261022.md).

One production file adds fail-closed readiness inventory for six credential/recovery columns, including current/session/PUBLIC/inherited/SET-reachable SELECT and schema completeness. Ordinary account identity/status reads remain allowed. Disposable helper only restores previously-readable non-sensitive columns after removing legacy direct credential SELECT; auth LOGIN and all business assertions remain. Initial44668bde auth42PASS but full fixture refusals are retained in [initial evidence](evidence/P0-AUTH-SENSITIVE-SELECT-INITIAL-20261022.json); no blanket rerun masks those failures. No migrations/issuer grants/RLS changes. Containing commit is docs-only [skip ci], not a new executable test result.

**Release NO-GO; whole-P0 percentage unmeasured.** Bounded admission acceptance does not certify all auth/privacy or alternate function/view exposure. Hosted runtime BLOCKED_BY_RAILWAY; hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. No external service connectors, hosted changes/deploy, main push/merge, credential rotation or P1/P2. Cashier credentials/offline/grace/sync/retention/provider/storage/full P0 inventory gates remain open.

**Next bounded task:** trace cashierRuntimeExpiryReconciliation's operational station refresh/expiry mutations against authentication-based cashier validation and legitimate housekeeping, then design actual-LOGIN credential read/mutation isolation regression. Do not blindly ban cashier-table mutations before this trace. Preserve this source acceptance; do not rerun75 suites for docs-only edits. Older pending-candidate instructions below are historical and superseded.

---

## Sensitive authentication SELECT candidate — 2026-10-22

New executable candidate `44668bde6fd0da69511d6cf57770cb396ebe2315` is **PENDING GitHub Actions**, not covered by previous-source 46/46+75/75 acceptance. [Bounded source trace and test design](P0-AUTH-SENSITIVE-SELECT-20261022.md). Tenant production readiness now rejects SELECT access to six credential/recovery columns through current/session/direct/PUBLIC/inherited/SET roles and fails closed on missing schema or malformed evidence. Ordinary account identity/status SELECT is preserved. Existing auth actual-LOGIN suite adds 30 ACL grant/revoke cases plus ordinary-read/table-read/missing-column controls while keeping signup/OTP/session/admin/rollback/fallback assertions. No migration, issuer/RLS or hosted ACL changes. Syntax check PASS; native/type/unit results PENDING. Next inspect exact-source Isolated PostgreSQL and Foundation jobs, fix any failures and save actual counters. Remaining cashier/offline/sync/full-inventory/hosted gates remain open. **NO-GO**, whole-P0 percentage unmeasured. Hosted runtime BLOCKED_BY_RAILWAY; hosted DB outside GitHub-only session scope.

---

## GitHub-only recovery: 0041 full source acceptance — 2026-10-22

**Accepted executable: `43065bda4b032244016d0fc78823f5579b01deca`. All46/46 GitHub Actions workflows SUCCESS, none pending.** Native run39713145055/job119608939313 independently re-read:75/75 invocations exit0/fail0/skip0/cancel0/summaryComplete; counters exactly match saved evidence. Source/actual checkout share tree b5f8bfa86d716ce62098d057bd8207a02dc0016d. Previous baseline c60914b8 independently verified46/46 and75/75; that older source still trusted raw tenant GUCs and is superseded for this fix.

Migration0041 public predicate uses private allows_merchant; all six transitional production tenant GUC writes are absent and trusted issuance remains. Manual SQL matches migration and journal index41. Existing native canonical RLS/positive tenant/auth/admin/receipt rollback/expiry/replay/restore proofs are preserved. No new issuer grants or application changes in this recovery batch.

Recovered HEAD `8659289c1ae2d683e8d8bda571f070195fca6e0f` contained stale39/46 infrastructure status. Live attempt3 was40/46. One bounded retry of the six remaining failed jobs recovered all46 workflows; failed attempts remain preserved. Both dependency audit and review now report actual counts:0 high,0 critical,2 moderate (total2). Exact runs/jobs/counters and limits: [GitHub-only full acceptance](evidence/P0-GITHUB-ONLY-FULL-ACCEPTANCE-20261022.json). Containing commit is documentation/evidence only [skip ci], not a new executable test result.

**Release NO-GO; whole-P0 percent unmeasured.** Raw-GUC remediation is verified in isolated source tests, not hosted acceptance. Hosted deployment/runtime identity: **BLOCKED_BY_RAILWAY**. Hosted database schema/roles/owner/ACL/pooler checks: NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. Historical hosted observations remain dated2026-10-21 and must not be described as fresh. Remaining auth/privacy/cashier/offline stock/sync/retention/provider/storage and full P0 requirement/proof inventory gates stay open. No Railway/Neon connector, hosted write/deploy, main push/merge, credential rotation or P1/P2 work.

Next: preserve this exact-source acceptance; do not rerun75 suites for docs-only changes. Continue independent GitHub P0 review/inventory. Keep hosted steps blocked under this session restriction. Older entries below are historical and their pending0041/39-of46 instructions are superseded here.

---

## VERIFIED recovery / central merchant scope acceptance — 2026-10-21

**Accepted executable: `c60914b8d954cb1d82e9a3706adfd0b669d9144d`. ALL46/46 workflows completed SUCCESS.** Isolated [39649327517](https://github.com/nora953/fawri-production-source/actions/runs/39649327517),job119393191547: **75/75 invocations exit0/fail0/skip0/cancel0/complete**. Actual checkout6f6ab7f3cbcdd017bb72151d0c1335b84ec7282c and source have identical tree8d33b3364a5f47461a2df7940fcf892121d8bc92. Full dump/restore and41 migrations PASS. Exact workflow links, all75 counters, proof flags and limits: [P0-CENTRAL-SCOPE-FINAL-ACCEPTANCE-20261021.json](evidence/P0-CENTRAL-SCOPE-FINAL-ACCEPTANCE-20261021.json). Containing checkpoint is documentation/evidence ONLY [skip ci]; do not claim a new executable run for its SHA.

Recovery independently confirmed previous74fc702f:46 green/72 clean and12 saved commits after251b8329. Only TWO production source files changed during this recovery: central merchant operational/subscription wrappers now commit private issuance after BEGIN/before locks; generic/auth wrappers do not mint. Actual LOGIN fixtures retain original billing/receipt races, HTTP, refund, wire-loss, Meta and clock/lease assertions. Central scope6, scope protocol16/auth10/admin9/runtime81, discovery19/inbox18, executor15/HTTP20/wire17, Meta full-app13/restore6, clock1/lease6 and every other invocation PASS. Counts include parents/repeated runtimes, not unique P0 coverage. Earlier failures/cancellations remain preserved in attempt JSONs.

**PUBLIC RAW TENANT GUC TRUST REMAINS OPEN.** The actual successful P0_TENANT_GUC_TRUST_PROOF remains in this accepted log. Private caller acceptance is preparatory, not global RLS closure. Fresh read-only hosted evidence shows staging28 vs source41 migrations, no private scope schema/resolver, unsafe candidate runtime role attributes/non-RLS grants, old main deployment, deployed DB login unverified. [Hosted evidence](evidence/P0-HOSTED-READONLY-RECOVERY-20261021.json). [Complete status/measurement/effort](P0-RECOVERY-RELEASE-STATUS-20261021.md). Full-P0 percent NOT MEASURABLE; historical85% unverified. Provisional20–40 focused engineering hours excludes waiting/new defects. **RELEASE NO-GO.** No hosted write/migration/grant/deploy/main push/merge.

**Next exact action:** fetch live branch HEAD/use a fresh clean checkout; preserve dirty old worktrees. Implement canonical0041 public predicate cutover to private allows_merchant, with stage/journal/deterministic snapshot reproduction and removal of six transitional source tenant GUC writes. Update only affected old SQL fixtures to actual trusted issuance, retain GUC-forgery denial and all positive business/rollback/session/expiry/race proofs. No issuer grants to primary, no bootstrap/role bypass, no hosted rollout. Then reconcile remaining hosted/privacy/cashier/offline/retention/provider/storage/full-inventory gates. P1/P2 remain out of scope.

---

## All73 isolated invocations accepted; Foundation clock/lease caller correction — 2026-10-21

Exact executable `6706aafbf18c14ded0aab864ac83018667024e5e`: **45/46 workflows SUCCESS**; only Foundation clock test FAILURE. Isolated39648267076/job119389499701 SUCCESS: **73/73 invocations exit0/fail0/skip0/cancel0/complete**. Meta full-app13 PASS (all original refunds/release/once-only assertions); scope6, provider19/inbox18, receipt executor15/HTTP20/wire17, all other counters and schema/restore41 PASS. Evidence: [P0-CENTRAL-SCOPE-73-ACCEPTANCE-20261021.json](evidence/P0-CENTRAL-SCOPE-73-ACCEPTANCE-20261021.json). Not full46-workflow acceptance.

Foundation then exposed old clock fixture's root application identity (OPERATIONAL_TENANT_SCOPE_ROLE_UNSAFE), with queue lease fixture queued behind it. Containing correction moves BOTH unchanged clock-skew and five lease-race scenario assertions to actual tenant/auth LOGINs and owned network-none runner. Both also join priority audit (expected75 invocations, actual count pending). No product source/migration/grant/admission change. Local syntax/whitespace/YAML PASS. New exact-source acceptance PENDING. Next verify containing source and all75 counters, save final evidence; public predicate cutover/hosted/privacy/full-P0 inventory still open. **NO-GO**. No hosted write/deploy/main/merge.

---

## Central scope 72/73 clean; final Meta privacy expectation correction — 2026-10-21

Source `34fdfcc4c90121fb2ba44471b1dc23d066db5a1e`:43/46 workflows SUCCESS,3 FAILURE. Isolated39647042910/job119385472074:73 invocations,72 clean and only Meta full-app not clean (9PASS/4FAIL, parent/cascade included). New scope6, provider discovery19/inbox18/receipt executor15/HTTP20/wire17, auth compatibility11, private16/auth10/admin9/runtime81, cashier and restore/migration41 accepted at this exact scope. Detailed counters: [P0-CENTRAL-SCOPE-META-ATTEMPT-20261021.json](evidence/P0-CENTRAL-SCOPE-META-ATTEMPT-20261021.json). Earlier cb5 attempt40SUCCESS/2FAIL/4CANCELLED, isolated cancelled; not accepted.

Containing correction changes ONE obsolete parent Meta denial expectation: actual restricted tenant cannot see foreign reservation, so expects reservation_not_found (matching existing child), instead of bootstrap-only reservation_identity_invalid. Preserves restored=false/no-credit and all following refund/release/once-only/balance/transport assertions; no source/security/migration change. New exact-source CI PENDING; markers alone never establish acceptance.

Fresh read-only Neon/Railway catalog confirms hosted13-migration gap, missing private schema/resolver, unsafe candidate role attributes/non-RLS broad grants, old main deployment and actual deployed login unknown. [Hosted evidence](evidence/P0-HOSTED-READONLY-RECOVERY-20261021.json), [full status/measurement/estimate](P0-RECOVERY-RELEASE-STATUS-20261021.md). Whole-P0 percentage NOT MEASURABLE; provisional20–40 engineering hours excluding access/policy waiting and new findings. Public raw GUC trust remains OPEN. Next verify containing source then canonical public predicate cutover; no hosted writes/deploy/main/merge. **NO-GO**.

---

## Explicit owned-bootstrap fixture attestation — 2026-10-21

Published consumer correction `cb5eaa4eb4d92811d480eac7200062ed9a7407fc` is pending CI. Source review found that role-grant helpers re-attested process DATABASE_URL after it had correctly changed to tenant LOGIN. Containing helper correction verifies the EXPLICIT original bootstrap URL against the SAME network-none/namespace/database/user/marker guard; no flag or role bypass. Authentication creation already receives that URL; tenant-revocation/executor grant helpers now accept it explicitly, with old default unchanged. Original role-grant SQL and production source unchanged. Native lock observer in receipt executor uses explicit bootstrap connection, while replay remains forbidden from borrowing the primary pool. Local guard/security34 and syntax/whitespace PASS. Native new results PENDING; public GUC exploit and other P0 gates OPEN, NO-GO. Inspect latest exact-source CI before further changes; do not call cb5 or containing source accepted without counters.

---

## Central private scope proof / legacy consumer correction — 2026-10-21

Exact executable `2fe24ef4cdae762d657e8551505ace9f7642e238`: **35/46 workflows SUCCESS,11 FAILURE**. Isolated39645535304/job119379983364:73 invocations,61 clean/12 not clean. **New central actual-LOGIN scope proof6 PASS** (includes parent), including committed issuer before locks, generic no-mint, forged setting cannot rebind private scope, rollback/reuse, issuer revoke/recovery and subscription caller. Existing core private16/auth10/admin9/runtime81 and cashier proofs retain their exact-source counters. Full migration41/schema/restore unchanged. This is NOT full-source acceptance. Evidence: [P0-CENTRAL-SCOPE-CONSUMERS-ATTEMPT-20261021.json](evidence/P0-CENTRAL-SCOPE-CONSUMERS-ATTEMPT-20261021.json).

Containing correction separates primary/auth actual LOGINs from root seed/inspection in six legacy settings/regional/channel/catalog/inventory/media fixtures, Auth compatibility child, four Meta parent fixtures, receipt executor/HTTP/wire parents, provider discovery/race parents and Meta directory. Keeps original child credentials, transport faults, chronology, concurrency, source business assertions and operator-only execution. Seven dedicated legacy workflow proofs move to the canonical network-none runner with committed migrations; all original Auth unit files retained. No bootstrap bypass or primary issuer grants. Source/migrations/security checks UNCHANGED by correction. Local syntax/whitespace/YAML PASS; new DB/CI acceptance PENDING.

Raw public tenant GUC trust remains OPEN; public predicate cutover must follow exact-source consumer acceptance. Hosted identity/ACL/pooler, auth/privacy/cashier integrity, provider/storage/retention and full P0 case inventory remain uncertified. No measured whole-P0 percentage. No hosted write/deploy/main/merge. **NO-GO**. Next inspect containing HEAD/CI and all counters, repair remaining failures before cutover.

---

## Central merchant scope increment — 2026-10-21

Recovered fixture source `5b7f7cb9065d2686ccd3ffdc209c4e27addfb3ad`: isolated39644611813/job119376758882 **72/72 clean invocations**, support5/reminder1/reviewHTTP20/MetaRestore6 PASS using actual LOGINs. Overall45/46 workflows SUCCESS; Foundation host-service attestation failure retained. Evidence: [P0-RECOVERY-FIXTURE-ACCEPTANCE-20261021.json](evidence/P0-RECOVERY-FIXTURE-ACCEPTANCE-20261021.json).

Containing source now awaits canonical private issuance in central operational/subscription merchant transactions AFTER BEGIN/BEFORE locks. Generic/auth transactions do not mint. Adds actual-LOGIN central scope/rollback/revocation/subscription regression; Foundation reminder uses an owned network-none suite. Local actual-function/control29 and guard/security34 PASS; native SQL/new full CI PENDING. Transitional tenant setting/public predicate are UNCHANGED; raw GUC exploit remains OPEN. No hosted writes/deploy/main/merge. Full P0 denominator remains unreconciled (UI manifest is P1 only), so85% and a replacement whole-P0 percentage are not defensible. **NO-GO**. Next inspect containing exact-source CI, repair failures, then public predicate canonical migration and remaining consumers/hosted/privacy gates.

---

## Crash recovery verified — 2026-10-21

GitHub branch HEAD recovered at `74fc702f8d7759abd4f34ac4d367e8e126439c21`, exactly the user-observed checkpoint. PR #550 remains open Draft, actual base `test/p0-integrated-billing-meta-20261015`; no merge. Fresh independent API inspection: **46/46 exact-HEAD workflows SUCCESS**, isolated run39541854104/job119031160756, **72/72 invocation summaries exit0/fail0/skip0/cancel0/complete**. Evidence: [P0-CRASH-RECOVERY-20261021.json](evidence/P0-CRASH-RECOVERY-20261021.json). Source and saved handoff confirm 12 subsequent commits after251b8329, covering transaction discard, receipt/provider scope issuance, explicit direct billing context, actual tenant/auth fixtures and subscription directory operator. Prior session uncommitted files are inaccessible; no claim that unsaved work was recovered. Current recovery checkout was clean at74fc702f.

**OPEN P0:** actual log still records successful `P0_TENANT_GUC_TRUST_PROOF` (raw tenant setting trusted; arbitrary SQL and foreign tenant identifier required; HTTP exploit not tested). Green CI must not be interpreted as exploit remediation. Remaining canonical central issuance/public predicate cutover, hosted identities/owners/ACL/pooler, auth/privacy/cashier integrity and provider/storage/retention gates remain uncertified. Historical85% is not a measured completion rate.

Containing fixture increment separates actual tenant/auth LOGINs for support and subscription reminders, Meta restore parent/child, and actual review-only LOGIN from primary checkout/auth in receipt review HTTP. Native bootstrap stays setup/inspection/cleanup only. Retains original fault/chronology/exactly-once/owner assertions. **New increment is PENDING CI**; four JS syntax checks and whitespace PASS. No local PostgreSQL/Docker. Local frozen pnpm11 install rejected xlsx@0.20.3 missing tarball integrity; no lockfile or policy relaxation. Source remains unchanged in this increment. Inspect new exact-source CI before central merchant issuance; fix actual failures without bypass/grants/skips. No hosted DB writes/deployment/main push/merge. **NO-GO**.

---

## Replay capability owner matrix — initial acceptance, 2026-10-16 UTC

Source `f14c3cb354cc7723efbb270df2249eee1e276bfe`,Draft#550: **362PASS/0FAIL/0CANCELLED/0SKIP**,55unique/57invocations;25/25workflowsSUCCESS. Isolated [38969053191](https://github.com/nora953/fawri-production-source/actions/runs/38969053191),job117202615539. Both replay review/execution suites20PASS each, including8newcases each. All16native owner proofs cover0031/0032 x SaaS/cashier x no FORCE/receipt/SaaS-order/cashier-order FORCE; exact identity/current denied operator/audit/42501/rollback checks pass, original real HTTP assertions retained. Fullrestore/cleanupPASS,34migrations/95tables/45policies/9functions and unchanged matching fingerprint. Evidence `evidence/P0_REPLAY_OWNER_RESULTS_20261016.json` retains this initial source. Counts overlap346/344/342; no wholeP0 percentage inferred.

A subsequent assertion-only source additionally measures receipt/order/entitlement state inside the transaction BEFORE fixture rollback for0029/0030/0031/0032. This is necessary to certify absence of temporary grants/writes, independently of post-rollback equality. Local syntax/diffPASS; actual stronger SQL/CI PENDING at publication. No product defect was established or production implementation changed. Hosted/policy/offline/mapping gates remainOPEN; releaseNO-GO.

---

## Audited directory owner acceptance — 2026-10-16 UTC

Draft #550 source `2ddc4cc11190b7f87f5dfbe83bc4505469e6ad02`: **346 PASS /0 FAIL /0 CANCELLED /0 SKIP**,55unique/57invocations;25/25workflowsSUCCESS. Isolated [38968339665](https://github.com/nora953/fawri-production-source/actions/runs/38968339665),job117200274011. Directory11PASS includes two new0030 bounded SQL owner cases: original actor authorization/redaction/audit succeeds with restricted shared owner; receipt FORCE raises42501 and no audit survives. All principals/catalog owners/RLS/function configuration/receipts/audits/entitlement counts restored after rollback. Original real HTTP/session/device/pagination/audit-fault assertions retained. Fullrestore34migrations/95tables/45policies/9functions and original matching fingerprint. Evidence `evidence/P0_DIRECTORY_OWNER_RESULTS_20261016.json`. Counts overlap344/342. Not hosted or alternate-owner full HTTP acceptance. P0 percentage unmeasured/releaseNO-GO; no production source/migrations/main/hosted changes.

---

## Receipt admission owner acceptance — 2026-10-16 UTC

Draft #550 source `66a1259c64f9f2c61f935b2d710e42da9ff4d241`: **344 PASS / 0 FAIL / 0 CANCELLED / 0 SKIP**,55unique files/57invocations; **25/25 observed workflows SUCCESS**. Isolated [38967543213](https://github.com/nora953/fawri-production-source/actions/runs/38967543213),job117197651440,mergefaa06f7. Inbox18PASS includes two new0029 restricted shared function/table owner cases: no-FORCE exact timestamp-only admission/immutable next-day replay/hash collision denial/naked DML denial; FORCE42501 with no receipt. Both rollback to original catalog owners/RLS/function configuration, no synthetic role/receipt remains, entitlement counts unchanged. Fullrestore34migrations/95tables/45policies/9functions; original matching fingerprint388515b2f9bd94c03cded652f5f39a5414fb1f6950f80f2521d033c237392035. Evidence `evidence/P0_ADMISSION_OWNER_RESULTS_20261016.json`. Counts overlap342, not additive. Bounded SQL proof, not hosted or alternate-owner full handler acceptance.

Recovered eight staged acceptance files are published at `d721571111d616e47a8c6bed7490a3b331628ed8`. Fresh read-only Railway still oldmain/d38d2922,200ready,checkSuitesfalse/noRailwayvolumes/buckets/pendingwork; Neon connector still Tool list_projects not found. Evidence `evidence/P0_RAILWAY_READONLY_RECOVERY_20261016.json`; hosted/policy gates OPEN, P0 percentage unmeasured/releaseNO-GO. No production source/migrations/hosted writes/main merge/deploy.

---

# Latest verified P0 continuation — 2026-10-15

Draft#550 / `fix/p0-provider-receipt-order-discovery-20261015`, tested source **`6c34961a36ceec848f53060f87990437c9fc13f0`**: **342 PASS /0 FAIL /0 CANCELLED /0 SKIP**,55unique files/57invocations including parent/repeated-runtime counts; **25/25 observed workflows SUCCESS**. Isolated [38785273961](https://github.com/nora953/fawri-production-source/actions/runs/38785273961),job116595545067,merge98016d8. Signed billing11PASS and original complete Meta app→queue→subscription→worker13PASS now use actual restricted LOGIN connections: current_user=session_user after RESET ROLE, original production RLS readiness accepted. Synthetic fixture credentials only. Both billing authorities apply once/preserve immutable receipt/original time; original duplicate/denial/isolation assertions retained. RLS28PASS; Meta bounded resolver10PASS; full restore34migrations/95tables/45policies/9functions and matching fingerprint388515b2f9bd94c03cded652f5f39a5414fb1f6950f80f2521d033c237392035.

Prior e91e6d96 also342PASS/25green includes8new original confirmed-provider SQL owner/FORCE-RLS cases, with restricted owner success and expected42501 per protected dependency, unchanged receipts/orders and0premature grants after rollback. Sourcef4a40de1 is retained as failed workflow:331PASS/0failed assertions/3CANCELLED/0SKIP from incorrect nested test context, not8SQLfailures. Context repaired without raising original timeouts; runner now emits explicit cancellations in all57summaries. Counts overlap and are not additive. Report `P0_REACHABLE_ROLE_AND_META_OWNER_ACCEPTANCE_20261015.md`; exact evidence `evidence/P0_DIRECT_LOGIN_FULL_PATH_RESULTS_20261015.json`, `P0_BILLING_OWNER_MATRIX_RESULTS_20261015.json`, and baseline JSON.

Fresh read-only Railway snapshot18:10Z still old main/d38d2922/deployment11f22954SUCCESS, one online replica, readiness200/ready without runtime role flags; checkSuitesfalse/no Railway volume or bucket/pending work. This does not prove absence of external storage or GitHub branch protection; previous Neon tool BLOCKED and protection403 UNKNOWN remain unverified, not retried. No hosted changes, main merge/deploy, real payments or credential changes. Hosted owner/EXECUTE/provider/storage/deployment acceptance and retention/privileged deletion/manual missing-order ownership policy remain open. Provider mapping race remains NOT RUN. Historical P0 **85% complete/15% remaining is unmeasured**; no new percentage inferred from test counts. Release **NO-GO**.

---

## Session and receipt RLS readiness accepted — 2026-10-15

Draft#550 / fix/p0-provider-receipt-order-discovery-20261015, tested source `92ad7bbef94bda674194205220975d0220190856`: **25/25 workflows SUCCESS**. Isolated `38723072880` / job `116382166372`, checkout `8b9eaca442f46c605aabb85fee59d25a32707f18`: **329 PASS / 0 FAIL / 0 SKIP**,55unique/57invocations including parents/repeated runtimes. RLS25PASS; knowledge and deletion each1PASS using direct restricted LOGIN connections with current_user=session_user. Production gate checks current and session role superuser/BYPASSRLS/protected-table ownership; the protected inventory includes the global receipt inbox and an independent migration inventory test. Local unit8/0. Fullrestore/cleanupPASS, unchanged34migrations/95tables/45policies/9functions/fingerprint388515b2f9bd94c03cded652f5f39a5414fb1f6950f80f2521d033c237392035. Exact evidence: evidence/P0_SESSION_RLS_READINESS_RESULTS_20261015.json; report SEQ_377_P0_RLS_RESTORE_ADMIN_SYNC_READINESS_20261014.md. Current commands and remaining gates in WORK_HANDOFF. Historical85%/15% unmeasured; releaseNO-GO. Earlier pending headings below are superseded only by this accepted source.

## Active session identity readiness hardening — CI pending, 2026-10-15

Active Draft#550 / fix/p0-provider-receipt-order-discovery-20261015. Separate root cause: readiness checked current_user only; a privileged session_user can remain behind SET ROLE. New local unit reproduced7PASS/1FAIL (missing rejection), repaired8/0; TypeScript/diffPASS. New code separately checks session role superuser/BYPASSRLS/protected-table ownership. New disposable cases reject bootstrap-superuser session behind restricted current role, and independently test non-superuser session roles with BYPASSRLS or receipt-table ownership; RESET ROLE is observed to restore unsafe RLS state, all fixture DDL rolls back. Existing normal acceptance fixtures now set both current/session identities to the restricted role with SET SESSION AUTHORIZATION, preserving original ownership membership cases. Actual new SQL/CI NOT RUN until publication; do not count previous326PASS as this source's acceptance.

Next: inspect new CI/source, exact session-role SQL outcomes, fullrestore/cleanup and all workflows; record results. Resume git fetch origin fix/p0-provider-receipt-order-discovery-20261015; git switch --detach FETCH_HEAD. Owned runner only: bash scripts/run-isolated-postgres-audit.sh tenant. Prior provider mapping-change concurrency remainsNOTRUN after delegated content flag; no bypass of that block is attempted here. Hosted owner/grants/provider/storage/deployment and ownership/retention policy remainOPEN; historical85%/15% unmeasured, releaseNO-GO. No main merge/deploy/hosted writes. PostgreSQL rationale: https://www.postgresql.org/docs/17/sql-set-role.html and https://www.postgresql.org/docs/17/role-attributes.html . This is bounded startup/session-readiness hardening, not certification of actual hosted credentials or every reachable privileged-role configuration.

## Receipt inbox RLS readiness accepted — 2026-10-15

Draft#550 source `e1b31378ff7acc3ead9850db2eb418dee90b31c7`: **25/25 workflows SUCCESS**. Isolated run `38684893840`, job `116257386044`, checkout `2f4abef901f29cb9295800f80ae0e5b25472abfa`: **326 PASS / 0 FAIL / 0 SKIP**,55unique/57invocations (parents/repeated runtimes included). RLS suite22/0/0 includes two new global inbox drift cases. Independent migration-inventory unit baseline6/1 identified only verified_provider_payment_receipts missing; repaired7/0. Runtime protected-table inventory now covers the capability-only inbox alongside tenant tables, while keeping legacy field/error IDs compatible. No policy/migration/grant changes. Fullrestore/ownedcleanupPASS:34migrations/95tables/45policies/9functions, unchanged fingerprint388515b2f9bd94c03cded652f5f39a5414fb1f6950f80f2521d033c237392035. Evidence: evidence/P0_RECEIPT_INBOX_RLS_READINESS_RESULTS_20261015.json.

## Current acceptance and handoff — 2026-10-15

Active Draft #550, branch `fix/p0-provider-receipt-order-discovery-20261015`, base Draft #549. Tested code commit: `cd7408ee178393a5a63a02e6bbdc9a163cd54c00`. All **25/25 observed workflows SUCCESS**. Isolated run `38681867802`, job `116247985222`, merge checkout `181b04e212b5c98e8848652e56d4f517b19464e5`: **324 PASS / 0 FAIL / 0 SKIP**, 55 unique files / 57 invocations. Counts include parent tests and repeated runtimes; never add overlapping workflow totals.

The original signed SaaS/cashier callback now finds an existing mapped order under a nonowner, non-superuser, NOBYPASSRLS runtime with empty tenant/admin context. Independent SQL proves one immutable receipt, one application and one subscription for each authority; fresh duplicate replay retains original receipt/paid time. Naked global reads remain zero and pooled context resets. Permission denial, request/amount mismatch, same-authority and cross-authority ambiguity fail closed without grants. The capability only resolves existing authoritative orders; arbitrary ownership repair is not implemented. Operator authorization remains separate.

Baseline failure is preserved: source `1f3d743a78d7716b21b6e875e62e4fe477e324a4`, run `38681215276` / job `116245975903`, 321 PASS / 3 FAIL / 0 SKIP (parent plus two new cases). Both returned ORDER_NOT_FOUND despite mapped orders, with receipt1/apps0/grants0. Exact report: `P0_RESTRICTED_PROVIDER_ORDER_DISCOVERY_20261015.md`; baseline and repair JSON evidence under `evidence/P0_RESTRICTED_PROVIDER_DISCOVERY_*_20261015.json`.

Canonical regeneration/reproducibility and actual SQL PASS in schema run `38681868158`, job `116247986045`; this provides CI evidence despite the local symlinked-pnpm generator block. Full restore PASS: 34 migrations / 95 tables / 45 policies / 9 functions, matching seed/verify fingerprint `388515b2f9bd94c03cded652f5f39a5414fb1f6950f80f2521d033c237392035`. New resolver remains non-PUBLIC after restore. Owned container/volume cleanup PASS. Parent #549 cashier RLS readiness repair `36f955e` remains accepted (321/0/0, 14 workflows), now included in this source.

Remaining: provider-specific mapping changes after initial discovery and between receipt-admission commit/application are **NOT RUN**. Additional delegated instrumentation was interrupted by an automated content flag; incomplete unpublished changes were removed, so they are not part of this accepted source. Next exact unit is a controlled fixture concurrency proof at those actual database boundaries, with immutable receipt/no premature grant/context-reset assertions. Merchant mutation after admission is constrained by existing composite FKs; do not weaken them. Also independently review receipt/function-owner readiness coverage. Hosted owner/RLS/EXECUTE/provider acceptance, deployment gating/storage, arbitrary ownership repair and retention-duration/privileged-deletion policy remain OPEN. No new percentage is measured: historical85% complete/15% remaining only; release **NO-GO**.

No main merge, Railway deployment, hosted migration/grant/secret changes or real payment was performed or authorized. Documentation-only final checkpoint uses [skip ci]; tested code is the SHA above. No tests are running at this checkpoint.

Exact resume commands and remaining unit are in WORK_HANDOFF.

## Restricted signed-provider discovery repair — 2026-10-15 (CI pending)

Active dependent Draft#550/fix/p0-provider-receipt-order-discovery-20261015, base#549. Baseline1f3d743a78d7716b21b6e875e62e4fe477e324a4, isolated38681215276/job116245975903 FAIL:321PASS/3FAIL/0SKIP,55unique/57invocations (failing new suite0PASS/3FAIL includes parent+2cases). Five other workflowsSUCCESS. Both actual signed original callbacks (SaaS/cashier) returnSUPERQI_SANDBOX_VERIFIED_PAYMENT_ORDER_NOT_FOUND under nonowner/NOBYPASSRLS with empty tenant/admin context despite mapped orders. Independent SQL proves durable inbox1/originaltime, orders unchanged/apps0/grants0; nakedreads0 and pooledcontextempty. This is availability failure, not demonstrated tenant leakage.

New bounded repair adds non-PUBLIC0033 confirmed-receipt/order resolver, separate private-symbol provider scope, tenant-scoped reference attachment and revalidation inside both original billing transactions; operator replay authorization unchanged. Existing authoritative order only, no inferred ownership repair. Negative cases cover absentEXECUTE/request/amount mismatch/same-authority/cross-authorityambiguity/decoyisolation, followed by success/duplicate/originaltime checks. Restore asserts newcapabilitynonPUBLIC. Localtypecheck/syntax/diff/staticmigrationlineagePASS. Full local canonical generation BLOCKED by symlinkedpnpm module directory restriction atlegacy stage2; actual newSQL/CI NOT RUN until published.

Current resume commands in WORK_HANDOFF.

## Cashier production RLS readiness acceptance — 2026-10-15

Draft#549 source36f955e32d0f6f7284b5fcfb850ea117e0c00ee0, isolated38681113382/job116245665218:321PASS/0FAIL/0SKIP,54unique/56invocations;14/14workflowsSUCCESS. Runtime gate now includes all7 cashier licensing/billing RLS tables omitted after0027. Local baseline5PASS/1FAIL→repair6/0; actual RLS suite20/0/0 includes14new disabled-RLS/runtime-ownership drift cases and rollback-restored readiness. Fullrestore33migrations/95tables/45policies/8functions and cleanupPASS, identical fingerprint793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498. Exact report: SEQ_377_P0_RLS_RESTORE_ADMIN_SYNC_READINESS_20261014.md; evidence/P0_CASHIER_RLS_READINESS_RESULTS_20261015.json.

Next executable unit is separate dependent Draft#550/fix/p0-provider-receipt-order-discovery-20261015, baseline1f3d743a78d7716b21b6e875e62e4fe477e324a4. It reproduces actual signed-provider callbacks under nonowner/NOBYPASSRLS/no tenant context, preserving durable receipt before desired success assertion. Baseline CI38681215276/job116245975903 still running at checkpoint; NOT RUN/PENDING until logs are inspected. Bounded receipt-backed existing-order resolution repair in progress locally, not accepted. No automatic ownership repair/deletion policy. Hosted owner/grants/provider/storage/deployment gates OPEN; historical85%/15% not newly measured, releaseNO-GO. No main merge/deploy/hosted migration/grants permitted without separate explicit approval.

## Integrated #523/#535 evidence — 2026-10-15

Combined Draft#549/8a694b43 passes307/0/0 and14workflows. This supersedes the need for a combined synthetic regression, not hosted rollout or ownership/retention policy. #523 keeps remaining policy/discovery/hosted acceptance OPEN; #535 keeps reviewed function owner/RLS/EXECUTE and hosted full path OPEN. No new product defect found by three directory boundaries or integration. Current next actions in WORK_HANDOFF.

## #523 bounded acceptance update — 2026-10-15

Three additional directory/evidence/durable-audit boundaries PASS on df31f752 (run38679137264); no new production defect found. Restricted DML protection does not define a financial retention duration or authorize privileged deletion. Order discoverability/ownership repair, approved retention and hosted capabilities remain OPEN; combining accepted billing/Meta stacks into one tested Draft is next.

## #523 / #535 scope reconciliation — 2026-10-15

#523 stays OPEN. Actual autocommit verified-inbox response-loss now PASS for SaaS/cashier (bb0ac4e0, run38677861248, new5 counted tests); existing explicit-COMMIT transport, durable inbox and operator17 proofs must not be rebuilt. No production defect reproduced by this new extension. Remaining: operator ownership/discoverability/retention and reviewed hosted capabilities.

#535 full original restricted-role Meta pipeline already PASS on separate #547/217a40c8 (287/0/0,14 workflows); issue comment6183869401 reconciles stale scope. Hosted owner/RLS/EXECUTE rollout stays OPEN. Railway readiness endpoint200/ready is now observed, but old main/d38d2922 code, checkSuites=false, storage architecture and Neon tool unavailability retain release NO-GO. See WORK_HANDOFF and hosted gate; no percentages freshly measured.
## Verified supplied Meta recipient admission and pure module extraction — 2026-10-15 Baghdad

Accepted source `198f9145e6021c15352ca9edae7939e9c2151f1b`, Draft PR #547. Isolated run `38655918835`, job `116165872633`, merge checkout `8450ce4f18fa84a4d4769dd8c9d3c4fbf90b461c`: **283 PASS / 0 FAIL / 0 SKIP**, 51 unique files / 53 invocations. All 14 observed workflows succeeded. Parent tests and repeated runtime invocations are included; overlapping workflow counts are not added. Meta run `38655918971`, job `116165526685` succeeds with 20 identity tests including parent.

Original signed app/encrypted queue/restricted live worker accepts both valid controls: signed second-tenant channel and an original encrypted job with omitted optional recipient. Sixteen malformed cases dead-letter before changing nine exact domain snapshots or increasing provider calls beyond those two valid sends. Supplied recipient must match canonical page, including rejection of conflicting, empty and null values; completely omitted recipient remains compatible. Pooled isolation/context reset passes.

Baseline `8bdb14cfb305b373dee98ca6933d020c08988e77`, Meta run `38655454807`, job `116164017803`: 16 PASS / 4 FAIL including parent. Each malformed supplied recipient completed with an extra provider call and seven changed domain snapshots including subscription/reply ledger. Canonical page/sender still routed the outbound reply; no wrong outbound destination, foreign-tenant writes or external exploit demonstrated.

First repair `c4334399` passed full Meta/20 identity tests but hit the unchanged structure gate at 1802 intent-service lines (critical threshold 1800), quality run `38655684372`/job `116164762558`. Pure admission parser/type and deterministic digest/JSON helpers now live in `metaReplyJobAdmission.ts` (176 lines), imported before SQL orchestration (1634 lines). Exact extracted-text comparison after export/name normalization, TypeScript, syntax, diff and unchanged structure audit pass. Current all-CI proof includes that refactor.

Full schema restore and owned container/volume cleanup pass: 33 migrations, 95 tables, 45 policies, 8 functions; fingerprint `793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498`. Report `P0_META_RECIPIENT_ADMISSION_20261015.md`; immutable evidence `evidence/P0_META_RECIPIENT_ADMISSION_RESULTS_20261015.json` retains baseline, gate failure and corrected acceptance.

Prior docs `2fd90087` ended 12 successes/2 cancellations, not full acceptance. Providers are synthetic; no schema/RLS/grants or hosted rollout changes. #535 remains open for hosted capability review. Derived-event format and broader precommit process termination remain separate audit candidates. PR stays draft; no merge/deploy.

## Verified normalized Meta reply envelope admission — 2026-10-15 Baghdad

Accepted source `cfc9e279bb7022716b79f9fa55484b52fbbdc841`, Draft PR #547. Isolated run `38654600094`, job `116161483164`, merge checkout `57d157e7c7846229d92d25dc581a5e95bac8ddeb`: **279 PASS / 0 FAIL / 0 SKIP**, 51 unique files / 53 invocations. All 14 observed workflows succeeded. Counts include parents and repeated runtime invocations; overlapping workflows are not added. Meta run `38654600099`, job `116161259617` also succeeds; identity suite has 16 passing tests including parent.

Original signed app/encrypted queue/live worker under a restricted nonowner role rejects thirteen malformed identity/envelope cases before changes to nine exact domain snapshots or provider calls beyond the valid signed second-tenant control's one call. New guards require object `page`, one entry, one messaging event and no boolean `is_echo=true`, matching normalized original reply ingress. Existing media/collision/restart/restore tests pass. Pooled isolation/context reset passes.

Baseline `7e10c21252df4c284401ea9f2c13187d7f4ffe83`, Meta run `38654095685`, job `116159663016`: 11 PASS / 5 FAIL including parent. Wrong object, echo, extra entry and extra message all completed, each called the provider and changed seven domain snapshots including subscription/reply ledger. No tenant bypass or external exploit is established; later events were ignored, not demonstrated executed. First repair `47f57938` passed all sixteen identity tests but failed the old captioned-image direct fixture missing object `page`; accepted source adds that field only and preserves media suppression/storage assertions.

Full schema restore and owned container/volume cleanup succeeded: 33 migrations, 95 tables, 45 policies, 8 functions; fingerprint `793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498`. TypeScript/syntax/diff checks pass. Report `P0_META_ENVELOPE_ADMISSION_20261015.md`; immutable evidence `evidence/P0_META_ENVELOPE_ADMISSION_RESULTS_20261015.json` preserves baseline and corrected proof.

Prior documentation checkpoint `6cff5bb5` has 10 successful and 4 cancelled workflows, not full acceptance. These cancellations do not invalidate the separately completed 275-test source proof. Providers are synthetic local services. No schema/RLS/grants or hosted rollout change; #535 remains open. Recipient/derived-event identity and broader precommit process termination remain separate audit candidates. PR stays draft; no merge or deployment.

## Verified Meta webhook-body identity admission — 2026-10-15 Baghdad

Accepted source `15a2b0d6e83eb6aec8fc4f284cc8a6ab24c630d3`, Draft PR #547. Isolated run `38653303268`, job `116157339326`, merge checkout `60d64af543b42ddc31c216a74f48665b5b804972`: **275 PASS / 0 FAIL / 0 SKIP**, 51 unique files / 53 invocations. All 14 observed workflows succeeded. Counts include parent tests and repeated runtime invocations; overlapping workflow counts are not added. Meta run `38653303727`, job `116157046053` also succeeded; the identity suite has 12 passing tests including its parent.

The original signed app, encrypted queue and restricted live worker reject nine malformed jobs: row/payload merchant and event conflicts, missing explicit event, and conflicting or missing body page/sender/message identifiers. Every denial returns `META_JOB_PAYLOAD_INVALID`, preserves exact snapshots of nine domain tables and keeps provider calls at 1 for the valid signed second-tenant positive control. Pooled isolation/context reset passes. Repair requires body identifiers to equal the already-required explicit payload fields before SQL preparation.

Baseline `22f62bbe06af99546c0870de25560671749e98da`, Meta run `38653087929`, job `116156323167`: 8 PASS / 4 FAIL including parent. Each of three missing body identifiers wrongly completed with one provider call and changes to conversations, messages, inbound events, outbound deliveries, notifications, subscriptions and reply ledger. Tenant/event row and payload were consistent, so no tenant bypass or external exploit is demonstrated. Body conflicts already rejected correctly.

Full restore and owned container/volume cleanup succeeded; 33 migrations, 95 tables, 45 policies, 8 functions, fingerprint `793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498`. Local TypeScript/syntax/diff checks passed. Report: `P0_META_WEBHOOK_BODY_IDENTITY_20261015.md`; immutable machine evidence: `evidence/P0_META_WEBHOOK_BODY_IDENTITY_RESULTS_20261015.json`.

Documentation checkpoint `9dd839d` had 13 successes and a cancelled isolated run; it is not counted as 14/14 acceptance. Graph/embedding are synthetic. No schema/RLS/grants or hosted rollout changes. #535 remains open for hosted capability review. Next audit candidates: object/recipient/echo/cardinality/envelope semantics and broader precommit termination; these identifier tests do not close those scopes. PR remains draft, without merge/deployment.

## Verified Meta durable job identity admission — 2026-10-15 Baghdad

Draft PR #547 accepted source `f76f4db29811864cd885aa4fb0eafd5577e490e2`; isolated run `38652116750`, job `116153247325`, merge checkout `71db6931587456b44938ec43135c3b6f84a55b05`: **269 PASS / 0 FAIL / 0 SKIP**, 51 unique files / 53 invocations. All 14 observed workflows succeeded. Counts include parent tests and repeated runtime invocations; overlapping workflow counts are not added. The new identity suite contributes 6 passing tests including its parent.

The original signed app, encrypted queue and live worker under a restricted nonowner role accept the valid second-tenant channel control. Conflicting payload merchant, conflicting event, and missing explicit event all dead-letter with `META_JOB_PAYLOAD_INVALID` before changing any of nine exact domain snapshots or increasing provider calls beyond the positive control's one call. Naked tenant reads and pooled context reset pass. The service admission check precedes `ensureInboundState`; the existing inbound-event collision fixture now uses a consistent canonical queue identity and retains its collision assertion.

The baseline event mismatch completed, and missing event wrote inbound/conversation/message/notification state before late rejection. Merchant mismatch was already protected by a composite foreign key (`23503`); no foreign-domain writes or RLS/FK bypass were demonstrated. Earlier failures, including the corrected fixture-reference mistake, remain documented in `P0_META_JOB_IDENTITY_20261015.md` and machine evidence `evidence/P0_META_JOB_IDENTITY_RESULTS_20261015.json`.

Full restore passed with 33 migrations, 95 tables, 45 policies, 8 functions and fingerprint `793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498`; owned container/volume cleanup succeeded. TypeScript, syntax and diff checks passed. Graph and embedding are synthetic local providers. No schema/RLS/grant change, hosted rollout, merge or deployment is included. #535 remains open for hosted owner/RLS/runtime capability review. Further audit candidates include canonical webhook-body identity and broader precommit process termination; those are not closed by this checkpoint.

## Verified original Meta DLQ/refund-enqueue restart gap — 2026-10-15 Baghdad

Draft PR547 acceptedsource2af43ccec88b4588584018c0cb2c2b1691fe3758; isolated38648764448/job116142085204 mergecheckoutb0d294eb95c5c5e84679b88d9cdb10a874b281a1 SUCCESS:263PASS/0FAIL/0SKIP,50unique files/52invocations. Newactualworkerrestart4PASS(parent+3stages); all14observed workflowsSUCCESS. Prior documentationheadf759a31 all14CI SUCCESS. Fullrestore33migrations/95tables/45policies/8functions same793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498 and ownedcleanupPASS. Test-only source changes; no production app/schema/RLS/grants change.

Signed originalapp/queue/liveworker under nonowner/NOSUPERUSER/NOBYPASSRLS, ownedGraph400 confirmsfailure. Passive nativeSQL/result observation forwards promise/callback forms unchanged, recognizes actual target job UPDATEdead_letter/META_REPLY_FAILED then arms existing exactCOMMIT wireproxy. BackendCOMMIT withheld/selfSIGKILL beforefailJob return/onDeadLetter. Independent SQLproves1failedreplyjob/saferequeuepolicy/debit1/no credit/no refundjob and providerCalls1. Fresh originalstartup scan discovers debt; testobserves originalqueuedrefund/no credit within10s before manualrun. Original enqueue/decrypt/claim/refund processes1job/1credit, originalreplyrequeue blocked, balance20. Two concurrent newworkers restart: no extrajob/credit/providercall, exactcreditledger unchanged, owned+decoybalances20, nakedreads0/contextreset. No fixturecreatesrefundjob or replacesworker/route/auth handlers.

Preserved88cbe8b2: isolated38647618878/job116138286317newrestart4PASS, Metapipeline38647618893/job1161382863321PASS/3FAIL(parentincluded), FoundationFAIL. Preservedc570b143: isolated38648214182/job1161402617474PASS, Metapipeline38648214205/job1161402612891PASS/3FAIL, FoundationSUCCESS. Explicitworkerconstructor starts500ms polling despitebootstrapdisable; ownedpoll60000ms separatesmanualclaim. IPCready onlymeansconstructed; original recoverMissingRefundJobs asynchronous, runOnce caninitiallyfindnojob beforestartup enqueue. Boundedsuccessful observation of originalqueuedjob is correct fixtureprecondition, preservingmanualrun=true and exactstate checks; no runtime/readiness/pollbehavior repair. Faileddependent ledger assertions fromundefined expectation retained, notnew productdefects oracceptedsource. Local syntax/diff/proxy5PASS separate/overlapping.

Next concreteunit: hostileencryptedjob payload vsdurable row merchant/event identity beforepreparation. Source postgresMetaAutoReplyIntent.parseJob prefers payload.merchant_id and preparePostgresMetaAutoReply enters ensureInboundState before latercorevalidateJob; sourceconcern, dedicatedruntimeNOT_RUN. Construct validforeignchannel/body as positivecontrol, canonicalrowA/payloadB viaoriginalencrypt/enqueue; require rejectionbeforeconversation/message/notification/ledger/providerwrites, then truthful codefix ifruntimeconfirms. Do not use missingforeignchannel as falsegreen. Broaderprecommit/processkill and reviewed schemaowner/RLS/runtimeEXECUTE rollout535 separateOPEN. This proves boundedactualworker startuprecovery, not fullproductionbootstrap/scheduler/realMeta/AI/hostedDB/fullUI/release-ready; no merge/deploy/payment action orwholeauditpercentage. Report:P0_META_WORKER_RESTART_20261015.md; machineevidence:evidence/P0_META_WORKER_RESTART_RESULTS_20261015.json.

## Verified restricted Meta restore COMMIT-ack/process recovery — 2026-10-15 Baghdad

Draft PR547 accepted sourceb62ab0e663da9064596856d2dd21a8e8a9f73fe0. Isolated38646289223/job116133845970, mergecheckout10f23f7e37c250f8ea02fbaa17efee1c26640488 SUCCESS:259PASS/0FAIL/0SKIP,49unique files/51invocations; new scopedrestorewire6PASS(parent+4faultcases+1chronology). All14observed workflowsSUCCESS. Prior documentationhead686730c2 also14/14CI SUCCESS. Fullrestore33migrations/95tables/45policies/8functions matching793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498 and ownedcleanupPASS. No production source/schema/RLS/grants changed for this unit.

Original authoritative refund/release wrappers and scopedSQL in fresh nonowner/NOSUPERUSER/NOBYPASSRLS children. Existing ownedTCP proxy forwards role/read-denial assertions then arms immediately before restore; exact actual backend COMMIT CommandComplete withheld. Fourcases(refund/release × handleduncertainty/selfSIGKILL) independently prove committed1credit/balance20, originaldebitunchanged, wrongtenantdenied without eitherbalancechange. Two concurrent freshprocess retries each returnalready_refunded/already_released, exact originalcredit/id/time/metadata unchanged, tenantcontextreset. SIGKILL occursafteractualcommit beforecaller acknowledgment, not arbitraryprecommitkill. Prior originalsignedworker13PASS remains separate; this unit is restoreprimitive transport/process acceptance, not full-worker scheduling/restartgap.

Preserved firstsource45428643: isolated38645703979/job116131890089256PASS/2FAIL (newwire3PASS/2FAIL,parentincluded); Meta pipeline38645703996/job116131890635newwire2PASS/3FAIL. Failedfunctional cases stopped atinitialrawfixture reservation beforewirefault. Deterministic originalSQL observer-only fixture reproduces23514 with microsecondcreated_at vs JavaScriptmilliseconds; originaldenial/unchangedrollbackPASS. Positiveownedfixtures nowcreated1minuteearlier, no applicationguard/constraint/faultassertion weakening. Localproxy5PASS; initialwronglocaltestpath corrected withoutclaimingpass. Counts overlap priorproofs, no additiveauditpercentage.

Next concrete unit: full originalworker crash after confirmedfailure/deadlettercommit before refundenqueue, freshworker discovers owedrefund, once-onlycredit; then hostile encrypted payload/rowtenant mismatch runtimecase and broaderprecommit/processinterruptions. Existing boundedwire proof mustnot substitute for thatworker lifecycle.535 reviewed schemaowner/RLS/runtimeEXECUTE rollout remainsOPEN; globaldiscovery behavior needs its ownruntimeevidence. No hostedDB/grants/realprovider/payment/merge/deploy/fullUI/bootstrap/scheduler/release-ready claim. Report:P0_META_RESTORE_WIRE_RECOVERY_20261015.md; machine evidence:evidence/P0_META_RESTORE_WIRE_RECOVERY_RESULTS_20261015.json.

## Verified restricted Meta refund and postreservation release — 2026-10-15 Baghdad

Draft PR547 accepted source0efc5c547b201ec80031901f540d4d91cf38d494. Isolated run38644555624/job116128093363, mergecheckout08dd6779604d091d352b5d417055f73d5c16cd5e SUCCESS:253PASS/0FAIL/0SKIP,48unique files/50invocations. Original actual-app suite13PASS(parent+12cases), superseding prior10 withoutaddingruns. All14 observed workflowsSUCCESS; previous documentationhead35a4a3 all12CI SUCCESS. Fullrestore33migrations/95tables/45policies/8functions identical793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498, ownedcleanupPASS.

Signed original app/manualfilter/tenantqueue/liveworker under nonowner/NOBYPASSRLS. New owned Graph400 confirmedfailure with attemptlimit1 follows original deadletter/refundjob:1debit then1credit/balance19. Original afterReservation hook changes actual merchantsettings; beforesend check suppresses withoutGraphsend and releases1credit/balance19. Fourdebits/twocredits total includes prior2successfulresponses; successfulGraphsendcount2 staysunchanged. Two concurrent replay calls AFTER each original restoration returnalready_refunded/already_released and noextra credit; not racingtwoinitialcredits. Wrongtenant blocked before refund under restricted RLS (reservation_not_found) and under owner role (reservation_identity_invalid), and after bothrestorations; balances/contextreset/directtenantreads0PASS.

Restore supports explicit verifiedmerchant and sets transaction-local tenant context beforeledgerlookup, verifies debitmerchant beforealready-restored path. Refundworker uses durablejobmerchant; postreservationrelease uses validatedjobmerchant. No RLS/grant/capability/migration change. Payload/jobmerchant mismatch guards source-reviewed but dedicated hostile-job runtimecase NOT_RUN. Legacy event-only administrative compatibility remains; global subscriptions/missingrefund discovery/restart recovery are unverified separate scopes, not demonstratedfailures. No realGraph/AI, hostedDB, auto-scheduler/bootstrap/fullUI orwholeauditpercent/release-ready credit.

Next concrete unit: restart between confirmedfailed replydeadletter commit and refundjobenqueue, plus lostCOMMITack during refund/release and freshprocess duplicate recovery under restrictedrole. Reuse existing ownedTCPproxy, do not broaden grants or infer tenant from hidden ledger. Add hostile encrypted jobpayload/rowmerchant mismatch runtimeacceptance separately. Reviewed schemaowner/RLS/runtimeEXECUTE rollout stillOPEN in535; no merge/deploy/liveDB/payment authorized. Report:P0_META_RESTRICTED_RESTORE_20261015.md; machineevidence:evidence/P0_META_RESTRICTED_RESTORE_RESULTS_20261015.json. Existing failureattempt and250pass predecessor remain in history.

## Verified signed actual Meta app / restricted subscription RLS — 2026-10-15 Baghdad

Draft PR547 accepted source f7c88b16633b1a2435a0c9470fac1f90d736fca4. Isolated run38642887506/job116122514964 SUCCESS:250PASS/0FAIL/0SKIP,48unique files/50invocations; actual-app Meta suite10PASS (parent+9cases). All12 observed workflowsSUCCESS. Local original-function transaction adapter5PASS and existing static contracts6PASS remain separate/overlapping, not additive SQL proof. Full restore33migrations/95tables/45policies/8functions fingerprint793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498 identical seed/verify; owned cleanupPASS.

Original app.ts signedHTTP/manualfilter/encryptedqueue/original liveworker runOnce, nonowner/NOSUPERUSER/NOBYPASSRLS. Two owned tenants: each sends1/debits1/balance19, duplicate ingress no extra job or grant, manual inbound persists once/noautomaticreply, expiredsubscription suppressed, invalidsignature401 and unknown/disconnected/revokedcapability503 without tenant leakage. Original subscription reads now scope known merchant inside BEGIN with transaction-local set_config; naked tenant tables including subscriptions/replybatches remain0 and pooled tenant resets. Synthetic loopback Graph and configured embedding only; no real Meta/AI/hosted proof.

First attempt039fe108/run38633527935/job116090836480 failed worker admission because merchant-identified subscription transactions omitted tenant context and RLS hid valid subscriptions. Failed-dependent debit/expired assertions preserved. Repair scopes read/reserve/emergency/action transactions only, preserving policies/grants/locks; no blanket RLS bypass. Approved publication used connected GitHub after shell push lacked credentials. Prior automatic approval rejections and later explicit destination consent retained.

#535 remainsOPEN for reviewed schema-owner/RLS/runtime capability rollout; bounded fullapp happy/manual/expired acceptance now verified. Event-only restore/refund/release and global list discovery remain separate unscoped source concerns, not runtime-verified defects or covered by this acceptance. Next concrete unit: actual liveworker confirmed-failure refund and postreservation release under restricted RLS, pass verified merchant from owned durable job, reject identity mismatch, prove concurrent replay once-only credit/contextreset. Do not weaken RLS/infer tenant from hidden event or repeat accepted happy path without new fault. No merge/deploy/hosted DB/grants/provider/payment/fullbrowser/mainbootstrap/scheduler/wholeauditpercent/release-ready action. Report:P0_META_FULL_APP_RESTRICTED_20261014.md; machine evidence:evidence/P0_META_FULL_APP_RESTRICTED_RESULTS_20261014.json.

## Verified actual operator HTTP PostgreSQL wire recovery — 2026-10-14

Draft PR546, branch test/p0-operator-replay-wire-recovery-20261014 stacked on545/d15aa5fd. Accepted2e3acfea62c6c7e1ad14e2f088e33fb0998ba3d8; isolated38631830513/job116085119744, merge71db03cc64f5916b81806d96c14a8de2810ab5c8:240PASS/0FAIL/0SKIP,47unique files/49invocations. New operator suite5PASS (parent+4cases);7/7 observed workflowsSUCCESS. Prior545 documentation head7CI SUCCESS verified. Totals overlap earlier proofs; no additive/whole-audit percentage.

Original operator HTTP/router/admin session/device/currentpermission and original SaaS/cashier SQL authorities run in fresh children under nonowner/NOBYPASSRLS. Owned TCP proxy forwards authentication then arms after fresh synthetic provider confirmation; exact actual backend COMMIT CommandComplete withheld at receipt/grant boundaries. All4cases return503 without success and independently observed committed state. Fresh genuine session after current finance permission removal returns403 before provider/audit/state changes even after completedgrant. Two concurrent new-process/session retries each recheck provider: receipt boundary applied+duplicate, grant boundary duplicate+duplicate. Exactly1application/subscription per owned order, original six-digit receipt/event/paid UTC time, immutable evidence and durable execution auditPASS. Four owned grants total; prior generic service/browser proofs remain separate.

Fullrestore33migrations/95tables/45policies/8functions/restrictedtenantreads seed/verify identical793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498. LocalAPI typecheck/syntax/5proxytests/diffPASS. First source accepted without correction; documentation checkpoint preserves testedsource. [Report](P0_OPERATOR_REPLAY_WIRE_RECOVERY_20261014.md), [machine evidence](evidence/P0_OPERATOR_REPLAY_WIRE_RECOVERY_RESULTS_20261014.json). Unrelated pre-existing capture PNG remains untouched/unstaged/excluded.

523 remainsOPEN: bounded actual operator TCP-ack uncertainty accepted; expiry/device-race extensions, broader arbitrary process termination, independently known order discoverability/ownership-retention and reviewed hosted capability rollout separate.535 full downstream signed restrictedMeta HTTP acceptance is next concrete unit; do not substitute bounded directory/middleware-only proof or repeat accepted source without a new fault. Route-levelHTTP plus synthetic provider in owned offline DB only, not full mainapp/browser/mobile/fullvisual/accessibility/222baseline/release-ready. No production application/schema change, hosted DB/grants/provider/payment/merge/deploy. Publication of code/tests/docs/DraftPR/CI already authorized.

## Verified operator review/confirm/replay UI — 2026-10-14

Draft PR545, branch fix/p0-operator-receipt-replay-ui-20261014 stacked on544/dec8497f. Tested4e95b72e27fa60ba2a59da2c8569854c196eccee; browser38629698500/job116077862920 mergecheckoutc62a528ea2a000e671693d6f67b9290d3d2b3e97:36PASS/0FAIL (11new+25existing). Localfrontend typecheck/build and9client testsPASS (5new+4existing); policyPASS. 7/7 observed workflows SUCCESS for tested source. Prior544 docshead26/26CI SUCCESS. No new backend or SQL proof credit.

Successful SuperQi receipt controls require explicit existing authority/order, separate fresh review and confirmed execution, cancel0writes, editinvalidates review. Identity-matched server applied/duplicate only; no optimistic success. Denied/conflict clears review; network/malformed/5xx execution staysuncertain/noautoretry, explicitfreshreview required. Pending locks controls/listnavigation; abort/late response ignored on permission unmount. Confirmationfocus/cancelrestore and exacttechnicalorderdigits PASS in all3languages. No merchant/amount/ownership override, inferred mapping, browser persistence or rawrefs/hash. UI requires independently reviewedexistingorder ID; discovery remainsOPEN.

Original-parent mountedBrowser with real controller/role permission logic/productionCSS and synthetic GET/POST HTTP; no hookreplacement. Full bot flow3languages; explicit financecashier confirmation/intent, conflict/403/409, simulatedlostack(after1syntheticapplication)/explicitduplicateretry, inputinvalidation, pendingnavigation/permissionremoval, failedreceipt nocontrolsPASS. This is frontend simulated acknowledgement/application acceptance, not real backend grant/transportuncertainty;544 bounded real SQL evidence separate. No full main-App/router/mobile/fullvisual/accessibility/222baseline orwholeauditpercent/releaseclaim.

Initial5773bfce browser38629211770/job11607618220535PASS/0FAIL retained, overlapping; extended with cashierexecution and focusassertions, not additive. [Report](P0_OPERATOR_REPLAY_UI_20261014.md), [machine evidence](evidence/P0_OPERATOR_REPLAY_UI_RESULTS_20261014.json). Documentation-only checkpoint preserves testedsource. Unrelated pre-existing modified docs/final-audit/evidence/seq345-captures/UIR-005-ku-1280.png remains untouched/unstaged/excluded; do not overwrite or publish it inadvertently.

523 remainsOPEN for operator-specific process/TCPcommit uncertainty/expiry-device-race extensions, orderdiscoverability/ownership-retention and reviewedcapabilityrollout;535 full downstreamsignedrestrictedMeta separate. No newbackend/migration/RLS/grant/hosted/provider/payment/merge/deploy action.

Next concrete unit: operator-specific replay real TCP/COMMIT-ack loss and fresh-session retry under restricted role using existing disposable guard/frameproxy, assert one grant/originalreceipt time/currentpermission and durable audit. Existing generic billingwire proof must not substitute for actual operatorHTTP lifecycle. Then full downstream signed restrictedMeta535, with expiry/device-race and orderdiscoverability separate acceptance. Do not repeat verified frontend/backend/review/identity proofs absent changedsource/newfault. Code/tests/docs/DraftPR/CI publication already authorized.

## Verified tenant-scoped authorized receipt replay execution — 2026-10-14

DraftPR544, branch fix/p0-authorized-receipt-replay-execution-20261014 stacked on543/f343649b. Tested1df0e82185e130d86f4b42c831a189c28fd663bb: isolated38610296207/job116011585090235PASS/0FAIL/0SKIP,46unique files/48invocations; actual executionHTTP12PASS. 26/26 observed workflows SUCCESS for tested source. Fullrestore33migrations/95tables/45policies/8functions, matching seed/verify fingerprint793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498/restrictedtenantreads/non-PUBLICexecutioncapPASS. LocalAPI typecheck/build/syntax/canonical33 and5transporttestsPASS; historicalmetadata unchanged. Prior543 docsheadf343649b24/24CI SUCCESS.

POST replay requires existing authority/order intent, nonempty allowed origin, real device-bound admin manage_subscriptions. Trusted-backend-only bounded non-PUBLIC capability validates exact assigned receipt/order, current session/versions/expiry/device/permission, returns one authoritative tenant privately. Initial execution-attempt audit commits before fresh provider check; each original receipt/grant transaction reauthorizes under tenant RLS, holds SHARE locks through commit and checks locked order identity. No merchant/amount override, mapping/order repair, or review-response authority. Original durable receipt admission/once-only SaaS+cashier grant remains; exact paidtimestamp from raw firstreceipt retained.

Proof: real new router+session/device/origin+SQL under nonowner/NOBYPASSRLS with injected provider. Revokedpermission/session and changedmapping duringprovider deny beforebillingevent; auditfailure0providercalls/0writes; concurrent applied+duplicate in eachauthority; partialSQLfault received-event/0grant then once-only retry. Owned grantbarrier proves permission DELETE waits behind commit. Exactly5owned reviewed orders receive applications; rawreceipts unchanged/directtenantlessreads0. Not full mainapp/UI/mobile/accessibility or new operator-specific process/TCP commit-uncertainty proof; no baseline/wholeauditpercent/release-ready credit.

Preserved attempts3d6919bf (38608549904/job116005648212) and3c7b89ae (38609344794/job116008366366), each228PASS/7FAIL; newexecution5PASS/7FAIL. SafeSQLSTATE23514 confirmed original updated_at>=created_at constraints: fixturefixed12:00 receipt preceded realcheckout creation after17:00. Correct owned original chronology provider+50ms/receipt+100ms withsixfractionaldigits fromcheckoutcreated_at; assert chronology beforeseed. No constraint/runtimeguard/cleanup or acceptance weakening. [Report](P0_RECEIPT_REPLAY_EXECUTION_20261014.md), [machine evidence](evidence/P0_RECEIPT_REPLAY_EXECUTION_RESULTS_20261014.json).

Documentation-only checkpoint preserves tested application/SQL/test/workflow source. No hosted database/grant/realprovider/payment/merge/deploy.523 remainsOPEN for frontendexecution workflow, operator-specific transport uncertainty/expiry-device-race extensions, ownership/retention and reviewedcapability rollout.535 full downstream signed restricted-role Meta separate.

Next concrete unit: operator replay frontend using review+execute as separate freshly authorized calls, explicit existing expectedauthority/order, confirmation, clear safe errors and pending/retry behavior; never invent tenant/order mapping or amount, never treat review as grant token. Add original-parent mountedbrowser acceptance with synthetic HTTP; actual backend execution is already boundedverified. Then operator-specific commit-uncertainty transport and full downstream restrictedMeta535. Do not repeat acceptedexecution/review/identity/UI/receipt proofs absent changedsource/newfault. Code/tests/docs/DraftPR/CI publication already authorized.

## Verified audited fresh-provider receipt replay review — 2026-10-14

Draft PR543, branch fix/p0-audited-receipt-replay-review-20261014 stacked on542/59c01d7d. Tested36e34b0250c9e5551cfe36eada09bbc0c91fca49: owned offlinePostgreSQL run38605943109/job115996722476223PASS/0FAIL/0SKIP,45unique files/47invocations; new realHTTP replayreview12PASS.24/24 observed workflowsSUCCESS. Full restore32migrations/95tables/45policies/7functions, identical seed/verify fingerprint56a8482170dc08ded441a06a2c174e954b273be4cf4bf0bd61a41b6c0fe02773, restrictedreads/non-PUBLIC reviewcapPASS. LocalAPI typecheck/build/syntax/canonical32 and5transporttestsPASS; historicalmetadata unchanged. Prior542 docshead59c01d7d also11/11CI SUCCESS.

POST replay-review validates device-bound current admin manage_subscriptions and strict existing authority/order intent. Trusted backend-only non-PUBLIC capability checks current SQL permission, exact unambiguous identity and commits audit before raw receipt lookup. Fresh synthetic-provider status/event/hash/amount/currency verified; SQL permission/mapping audited/rechecked after I/O. Returns verified/applied:false and bounded intent; raw references/hash staybackend. It is review-only, not execution or futuregrant authority. No merchant/amount override/order creation/mapping repair/entitlement action.

Proof: actual route+origin/session/device middleware/SQL in controlled Express host under nonowner/NOBYPASSRLS role; no authstubs. Denials/no providercall, malformed override/wrongorder, both authorities, providerfail/nonterminal/changed identities, crossauthorityambiguity, SQLdisabled actor, permission/mapping change during I/O, auditfault beforeprovider, concurrentreview and exact unchanged receipt/order/entitlementPASS. Source typecheck first found Express scalar/array param union and was corrected before publication; no failed CI attempt for this unit. Not full main-app router/UI/mobile/accessibility, no baseline/wholeaudit percentage/release-ready claim.

[Report](P0_RECEIPT_REPLAY_REVIEW_20261014.md), [machine evidence](evidence/P0_RECEIPT_REPLAY_REVIEW_RESULTS_20261014.json). Documentation-only checkpoint preserves tested app/SQL/test/workflow source. No hosted DB/capability grant/realprovider/payment/merge/deploy.523 remainsOPEN for execution, frontend action, ownership/retention and reviewedcapability rollout;535 full downstream signed restricted-role Meta separate.

Next concrete unit: trusted execution/replay after fresh provider confirmation, retaining audited current operator permission through grant decision and once-only existing receipt/application authority. Review response must never authorize later execution. Existing global order-owner discovery requires a separately reviewed bounded tenant resolution/tenant-scoped entrypoint; never weaken RLS or expose raw capability to merchants. Test true execution with real admin/session/SQL, audit fault, provider/mapping/permission changes, concurrent duplicate retry, partial entitlement fault and uncertaincommit while preserving original receipt time. Do not repeat acceptedreview/identity/UI/receipt proofs unless changedsource/newfault. Publication code/tests/docs/DraftPR/CI already authorized.

## Verified provider/order exact identity binding — 2026-10-14

DraftPR542, branch fix/p0-provider-order-identity-binding-20261014 stacked on541/f5827c1f. Tested2f39b22c8461b65bee233ec731319fbe103ede7f; isolated38603808035/job115989443270211PASS/0FAIL/0SKIP,44unique files/46invocations; extended inbox16PASS (10new+6existing).11/11 observed workflowsSUCCESS.31migration/95table/45policy/6function restore seed/verify fingerprint297fb7562f1ad1425ca955c1b9ad2b5537cc32517b308f20d362aa1d2b8e01ef exact, restrictedtenantreadsPASS. Local API typecheck/build/syntax and5transporttestsPASS. Previous541 documentation headf5827c1f also7/7workflowSUCCESS.

BILLING_PROVIDER_ORDER_IDENTITY_BINDING_20261014: source-confirmed OR candidate discovery lacked exact stored request validation when payment matched. Correct both SaaS/cashier: matching confirmed request mandatory; non-null payment must match, null recoverable only with request match. Confirmed amount must match before attachment; UPDATE rechecks request/amount/provider/payment. Eight negativecases: full order snapshots unchanged, no subscription/application grant, one durable receipt on replay. Six identity-fixture repairs concurrent applied+duplicate with firstreceipt time; two nullpayment positivesPASS. No hosted incident claim, manual API or identity/tenant repair mechanism. FindingFIX_VERIFIED_BOUNDED; broader reconciliation523 remainsOPEN.

[Report](P0_PROVIDER_ORDER_IDENTITY_BINDING_20261014.md), [machine evidence](evidence/P0_PROVIDER_ORDER_IDENTITY_BINDING_RESULTS_20261014.json). No new migration/RLS/grant, mainmerge/deploy/hostedprovider/payment. Actual signed service+SQL injectedgateway in owned offlinePostgreSQL, not full main-app HTTP/operator write acceptance or hostile metadata race proof. No baseline/wholeauditpercent/release-ready credit. Documentation-only checkpoint preserves tested application/test/workflow source.

Next concrete unit: implement trusted admin manual replay capability/action with durable current-permission audit and fresh provider confirmation; receipt event ID+expected existing order authority/id only, no merchant/amount override. Exact immutable receipt/order/provider identities/currency/amount must agree; unresolved/ambiguous mapping failsclosed without creating orders or guessing ownership. Preserve firstreceipt time and existing once-only authorities under retries/commit uncertainty. Test real admin session/SQL permission, audit failure, provider outage/nonterminal/changed identity, ambiguity, concurrent replays and entitlement partial failure. Ownership/retention and reviewed hosted capability rollout under523; full downstream signed restricted-role Meta535 separate. Do not repeat completedidentity/UI/receipt proofs without changedsource/newfault; publication alreadyauthorized.

## Verified operator receipt review UI — 2026-10-14

Draft PR541, branch fix/p0-operator-receipt-review-ui-20261014 stacked on540. Tested source9fd5155eee05e74fb88d0d3f3bec2d777034a406; browser merge checkout6f8f78fa94897fbc91951f0180582c1b5d502245. Actual mounted AdminPage/controller/shell/view/i18n and production CSS, synthetic loopback HTTP. Browser38602501013/job115984989856:25PASS/0FAIL (10 new receipt cases +15 existing parent cases). Arabic/English/Sorani pagination, exact UTC/reference digits, masked/allowlisted fields, empty/permission-denied/no-request, finance403/503 clear/retry and refresh permission removal PASS. Local frontend typecheck/build and4client tests PASS; combined9client/session tests overlap4, not additive. 7/7 observed workflows SUCCESS for tested source9fd5155e; full repository typecheck/build/unit/source contracts/translations, security/supply chain, parent browser, storage, clean deployment contract, staging and foundation integration PASS. Documentation-only checkpoint preserves tested application/test/workflow source.

Preserved failed source3d55c1ae browser38602225533/job11598405686923PASS/2FAIL: i18n digit MutationObserver changed Arabic/Sorani technical timestamps/reference suffixes. Product uses original data-fawri-preserve-digits exclusion only on technical values; money stays localized. All25 assertions retained. [Report](P0_OPERATOR_RECEIPT_UI_20261014.md), [machine evidence](evidence/P0_OPERATOR_RECEIPT_UI_RESULTS_20261014.json).

No receipt persistence/export or entitlement write. Client uses cookie/device-bound existing audited read API; old data clears and stale aborted responses are ignored. Permission-gated tab unmounts on actor/capability change. This is browser frontend synthetic HTTP acceptance, not full App router/real backend combined proof, mobile/complete visual/accessibility certification,222baseline credit, wholeaudit percent or release approval. Existing backend SQL proofs are separate; no new migration or hosted/provider/payment/merge/deploy action.

Next concrete unit: safe manual reconciliation under523: fresh provider confirmation, exact immutable payment/request/order/amount/currency agreement, unambiguous authoritative mapping, current permission and durable audit, once-only existing entitlement authority. Inbox presence/short suffix must never grant or guess tenant. Ownership/retention and reviewed capability rollout remainOPEN. Full downstream signed restricted-role Meta535 separate. Do not repeat verified receipt read/UI proofs without changed source/new fault. Code/tests/docs/draftPR/CI publication remains authorized.

## Verified audited operator receipt read — 2026-10-14

DraftPR540, branch fix/p0-audited-operator-receipt-read-20261014 stacked on539/caafd5f2. **Tested source a79b600713af94633761a1e59333324284d5e671**: isolated38598864396/job115972566934 **201PASS/0FAIL/0SKIP**,44unique files/46invocations; operator HTTP6PASS. **27/27 observed workflows SUCCESS**. Real new route+secure session middleware+PostgreSQL under controlled Express host, restricted NOLOGIN/NOBYPASSRLS/non-owner application role; no auth stubs or entire-frontend acceptance claim.

GET /api/auth/admin/billing/verified-receipts requires PostgreSQL admin authority, secure device-bound session and manage_subscriptions permission. Actor from validated context only; DB rechecks active/enabled/password-ready profile and owner/current permission under shared locks. Bounded/redacted pages preserve microsecond cursor precision; no full references/hash/signature/guessed merchant. Durable scoped audit commits before response; injected audit failure503/no receipt data. Direct table access remains denied; receipt snapshots/global entitlement count unchanged. Trusted-backend read capability non-PUBLIC, no RLS relaxation/merchant grant. Migration0030/canonical31PASS. Full restore31migrations/95tables/45policies/6functions and identical fingerprint/restricted tenant readsPASS; both receipt capabilities remain non-PUBLIC.

Preserved failures:44837e83 isolated38597073031/job115966439784195PASS/1FAIL (device fixture omitted approver, no HTTP credit);0fb0156d isolated38598060193/job115969804431200PASS/1FAIL (operator5PASS then fatal cleanup hook). Correct complete trust via original authority and delete only owned device dependencies before owned accounts; constraints/all acceptance/cleanup assertions retained. [Report](P0_OPERATOR_RECEIPT_READ_20261014.md), [machine evidence](evidence/P0_OPERATOR_RECEIPT_READ_RESULTS_20261014.json).

Issue523 remainsOPEN for frontend/operator manual actions, provider reconfirmation/ownership-retention and reviewed hosted owner/runtime grant rollout;535 remainsOPEN for full downstream signed restricted-role Meta. No merge/deploy/hosted writes/real provider/payment, UI baseline credit, whole-audit percentage or release-ready claim. Documentation-only checkpoint leaves tested app/SQL/test/workflow source unchanged.

---

## Verified unmatched provider receipt admission — 2026-10-14

DraftPR539, branch fix/p0-verified-provider-receipt-inbox-20261014, stacked on538/441d1016. **Tested source e1681e4f462e013d7b0837c5482de17ff879b2e5**: isolated38554285754/job115819667019 **195PASS/0FAIL/0SKIP**,43unique files/45invocations; new inbox6PASS. **29/29 observed workflow runs SUCCESS**. Signed synthetic/gateway-confirmed SaaS/cashier orphan persists1receipt/0entitlement, concurrent duplicate preserves first time and identity, exact restored mapping replay applies1entitlement. Invalid signatures/confirmed-state mismatch create0; SQL failure rejects; restricted role cannot enumerate/directly mutate or use non-PUBLIC admission without explicit owned capability grant.

Migration0029, canonical30 history/snapshot/reviewed SQL hash/preimage included. Global unassigned identity evidence, no tenant guess/raw payload/signature/credential, immutable provider/event/payment/request/type/amount/hash and first time. Admission before lookup; unknown order remains retryable503, never grants from inbox alone. Trusted bounded SECURITY DEFINER function fixed search_path, qualified table, deny-by-default RLS, PUBLIC EXECUTE revoked; no hosted grants/migration performed.

Full restore30migrations/95tables/45policies/5functions and restricted tenant readsPASS; seed/verify fingerprints identical. Effective ACL entries expand defaults and sort without dropping grants; temporary added-grant probe detects real changes; receipt function stays non-PUBLIC after restore. Preserved first70375a57 and second6461059a attempts194PASS/1FAIL each, inbox6PASS: table default-vs-explicit ACL and legacy function grant-order representation only. Stronger final checks replace storage-form comparison while retaining overall fingerprint assertion. Native ordering correction805a68bd was superseded before runtime acceptance; never credit it as tested.

[Receipt report](P0_VERIFIED_RECEIPT_INBOX_20261014.md), [machine evidence](evidence/P0_VERIFIED_RECEIPT_INBOX_RESULTS_20261014.json). Issue523 staysOPEN for operator API/UI authorization, manual reconciliation/ownership/retention and reviewed hosted function owner/runtime grant rollout;535 staysOPEN for full downstream signed restricted-role Meta. SuperQi remains sandbox-only/production-forbidden. No merge/deploy/hosted writes/real payment, UI baseline credit, whole-audit percentage or release-ready claim. This documentation checkpoint leaves tested app/SQL/test/workflow source unchanged.

---

## Verified actual PostgreSQL wire response loss — 2026-10-14

DraftPR538 tested source **abe851db0bf40ecf2dcf294dc73f5a32c6c78a44**: isolated38550530635/job115807106721 **189PASS/0FAIL/0SKIP**,42unique files/44invocations; receipt recovery15PASS including four actual TCP dropped-COMMIT-response cases. All **26/26 observed workflow runs SUCCESS**. Admin corrected lane38550531165/job11580754187941PASS includes original admin proof1PASS; overlaps tenant batch, adds no unique credit. Framing4PASS separate from SQL total.

Product correction: lib/db/src/index.ts drains active-client and idle-pool connection error events, preserves failed query/transaction rejection, and reports only bounded SQLSTATE. Wire proxy observes actual server COMMIT CommandComplete, withholds it/ReadyForQuery and closes TCP; authority returns controlled failure, independent parent sees committed state and fresh concurrent next-day processes apply exactly once or both duplicate, preserving original paid_at. All original billing/process/backend/known-COMMIT-rejection and cashier-history assertions retained. Legacy global-admin service/push-force lane replaced with reusable attested network-none runner, guard preserved.

Preserved failures: c4acd6cb isolated38549209533/job115802750100184PASS/5FAIL (four wire cases plus parent);38c41f26 broad25/26PASS, global-admin38549878445/job115804963066 rejected missing attestation before DB import. Corrected source above proves the fixes; prior attempts are not relabeled green. [Report](P0_WIRE_COMMIT_ACCEPTANCE_20261014.md), [machine evidence](evidence/P0_WIRE_COMMIT_RESULTS_20261014.json).

Wire acknowledgment boundary now covered under523; issue staysOPEN for unmatched verified-payment durable inbox/operator reconciliation.535 staysOPEN for full downstream signed restricted-role Meta and hosted grant review. No UI baseline credit, whole-audit percentage or release-ready claim. No merge/deploy/hosted mutation/real provider/payment. This documentation checkpoint leaves tested application/test/workflow source unchanged.

---

## Verified COMMIT caller-outcome checkpoint — 2026-10-14

Draft PR538 tested source **d418feaf63288411b0b135a6d0c50ad3bdb9caf7**. Owned offline PostgreSQL run38525448026/job115724620052: **185PASS/0FAIL/0SKIP**,42unique files/44invocations. Receipt suite11PASS includes four new driver08006 outcomes after successful actual receipt/entitlement COMMIT, fresh concurrent next-day processes, one entitlement and original paid_at. **13/13 observed workflows SUCCESS**. Cashier history fixture2PASS with database-clock rounding, original location/stock/catalog/idempotency checks intact. Prior documentation-head30020abf lifecycle failure38524878617/job115722776644 is preserved; never claim that head was wholly green.

Proof is injected driver outcome after actual server COMMIT, not a proxy dropping wire acknowledgment frames. Issue523 remainsOPEN for true transport proof and unmatched verified payment inbox;535 remainsOPEN for full downstream restricted-role Meta/grant acceptance. No production source change in this acceptance revision, no merge/deploy/hosted writes/real provider actions; no UI baseline credit or release-ready claim. [Report](P0_COMMIT_ACK_ACCEPTANCE_20261014.md), [machine evidence](evidence/P0_COMMIT_ACK_RESULTS_20261014.json).

---

## Verified durable payment receipt checkpoint — 2026-10-14

Draft PR538, tested source **7302359705a509cc25cefbc3f6e14849b0f68508**: isolated run38524397545/job115721219577 **181PASS/0FAIL/0SKIP**,42unique files/44invocations; **12/12 observed workflows SUCCESS**. New receipt recovery suite7PASS covers four process/backend interruptions, two known admission-COMMIT failures, fresh concurrent next-day retries, original payment time, unresolved-receipt checkout barriers and one entitlement. Admission commits before application; merchant-first locks align checkout. Prior8ad83ea typecheck/barrier failures remain recorded, corrected without weakening lifecycle assertions.

Evidence: [receipt report](P0_DURABLE_RECEIPT_ADMISSION_20261014.md), [machine results](evidence/P0_DURABLE_RECEIPT_RESULTS_20261014.json). Owned offline PostgreSQL/fake providers only; this does not change the UI audit baseline or imply release readiness. No merge/deploy/hosted database/grants/real payment actions. Issues523/535 stay OPEN for unmatched orphan inbox, ambiguous successful COMMIT acknowledgment loss and full downstream restricted-role Meta/grant acceptance.

---


## Authoritative continuation — SEQ-366–371 (2026-10-14 Baghdad)

Latest [SEQ-366–371](SEQ_366_371_EMERGENCY_WORKSPACE_INTEGRITY_20261014.md). **Next SEQ-372**. Audit only; application/original tests/schema unchanged.

Full Vite main/App/emergency management owner ×AR/EN/KU ×390/1280:6 new baseline PASS.18 extra assistant/denied UI-branch/503→retry PASS, zero baseline credit. Initial run38500731533/job115646801848:24PASS/6 diagnostic locator FAIL; original failure preserved. Only6 diagnostics re-executed after audit-locator correction in run38501087503/job115647945992:6 reproduction PASS, not product acceptance. Both builds/uploads/cleanup succeeded;234+44 GET with device headers,0 unexpected/mutation.48 PNGs reviewed/persisted.

New **EMERGENCY-AUDIT-STATUS-MISREPORT-001 MEDIUM/OPEN/NATIVE_DOM_CONFIRMED**: owner UI calls chain healthy despite synthetic overview valid:false, six DOM probes/three mobile visual captures. PostgreSQL overview source allows false payload; actual SQL corruption/HTTP tamper not executed. Legacy invalid-chain503 path distinguished. Desktop owner-card visibility/clipping TRIAGE; actual directory403 not executed (denied200 pair tests frontend branch only). No app repair.

Current seq371CSV222 baseline:84PASS_BOUNDED_FULL_APP/138NOT_RUN;36 cumulative extra state cases and8 diagnostic cases outside baseline.37.84% baseline execution only; whole-audit percentage **NOT_YET_MEASURABLE**, releaseBLOCKED.21 selectors unmapped/11 domains partial; no real authorization/SQL/RLS/provider or complete responsive/accessibility clearance.

# Fawri final audit — issue and decision ledger

## Authoritative continuation — SEQ-360–365 (2026-10-14 Baghdad)

Latest [SEQ-360–365](SEQ_360_365_FULL_SNAPSHOT_CSS_20261014.md). **Next SEQ-366**. Audit only; application/original tests/schema unchanged.

ActualVite main/App/support/emergency snapshots ×AR/EN/KU ×390/1280: headc311d48e16baf1c361775a9fb0ab1e1e5683fb49/merge33ddb076cd9657fa9a8db45b8f8b9c7def27eae1, run38498401910/job115639330331: **12newbaselinePASS/0FAIL**,42allowedGET/deviceheaders/0POST/runtimeerrors,12captures reviewed/persisted. Additional2diagnosticPASS run38498978000/job115641143612: test-onlycatalogCSSdisable returnsbadges702.69/547.92px→40px andexpands titles;4before/aftercaptures. No apprepair.

New **UI-KU-CATALOG-CSS-SPILLOVER-001 LOW/OPEN/NATIVE_CAUSE_CONFIRMED**: broadcatalogSorani640–1399rule matchessecuritybadge onbothsnapshots at1280. Mobilecrampedheader notattributed tothatmedia rule. ExistingSoraniOct/AM datefinding extendedtoemergencysnapshot, noduplicate. Currentseq365CSV222baseline:78PASS_BOUNDED_FULL_APP/144NOT_RUN.18negative+2diagnosticcases outsidebaseline. No realcookie/grant/backend/RLS/read-onlysecurity/timer/deeptab certification; fallbackfonts.21selectors unchanged; wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED.


## Authoritative continuation — SEQ-354–359 (2026-10-14 Baghdad)

Latest [SEQ-354–359](SEQ_354_359_FULL_ADMIN_ROUTES_20261014.md). **Next SEQ-360**. Audit only; application/original tests/schema unchanged.

Full actualVite main/App/globalauthvalidator/previewlauncher/owner-setup/workmonitor ×AR/EN/KU ×390/1280: head9f9fe04a278a366b7235bd5731a3cb0efd9645f2/merge03fd41d1a3b23cb25ed56816342811de6e79e620, run38494339483/job115626569603. **12newbaselinePASS/0FAIL**,12captures reviewed/persisted.48allowlistedGET/deviceheaders present; title/direction/overflow/disabledemptygeneration/syntheticassistanttarget PASS;0unexpectedPOST/runtimeerrors. No realcookie/backend-role/SQLproof.

New **I18N-MONITOR-SORANI-DATE-001 LOW/OPEN/NATIVE_VISUAL_CONFIRMED**: Sorani activity date showsEnglish Oct/AM inbothviewportcaptures; sourceusesckb-IQ/Intl fallbackcauseinferred, notresolvedOptionsconfirmed. PriorfindingsOPEN. Currentseq359CSV222cases:66PASS_BOUNDED_FULL_APP/156NOT_RUN; extra18negativestatesoutsidebaseline.21selectors unchanged; wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED.


## Authoritative continuation — SEQ-348–353 (2026-10-14 Baghdad)

Latest [SEQ-348–353](SEQ_348_353_FULL_NEGATIVE_ROUTES_20261014.md). **Next SEQ-354**. Audit only; application/original tests/schema unchanged.

Full Vite main/App negative OTP/pending/recovery ×AR/EN/KU ×390/1280, headb47b937c5927f7a62787fdceb82a3be80d9adef4/merge9e0f0933d0ca1bd68060c5fa921ebfb791d94aa1, run38493530475/job115624007088: **18 extra UI cases PASS/0FAIL**,30captures inspected/persisted. Missing challenge disables input/verify and redirects via signup link; synthetic503→manualrefresh200 recovers pending title; denied synthetic recovery key shows generic error/hides server sentinel/retains key1.12GET+6POST allowlisted,0unexpected requests/runtime errors. Existing heading issue remains OPEN; no new canonical defect.

These18 negative states are outside222defaultbaseline, baseline_credit0. Baseline unchanged54PASS/168NOT_RUN; prior54notrerun. No actual backend key/OTP/SQL/provider/auth/RLS proof; fallback fonts.21selectors unchanged; whole percentage **NOT_YET_MEASURABLE**, release BLOCKED. Next full App admin/owner baseline fixtures.


## Authoritative continuation — SEQ-342–347 (2026-10-14 Baghdad)

Latest [SEQ-342–347](SEQ_342_347_FULL_LIFECYCLE_ROUTES_20261014.md). **Next SEQ-348**. Auditonly/application/tests/schemaunchanged.

ActualVite main/App OTP/pending/recovery ×AR/EN/KU ×390/1280: headb8502d58406f66279ed9bccebb02f110173c39ee/merge0768cd0c40f8ad9aa06a18ae67a5826e2ae17afb, run38493001942/job115622347297. **18newbaselinePASS/0FAIL**;18captures inspected/persisted. SyntheticOTPinput/emptydisabledverify, pendinginitial+refresh12GET, key1emptydisabled/title/direction/overflowPASS. New **A11Y-OWNER-RECOVERY-HEADING-001 LOW/OPEN/DOM_CONFIRMED**: allsixrecoverycases have0semanticheadings; visibleCardTitle isdiv. Notauthfailure/WCAGcertification.

Currentseq347CSV222cases:54PASS_BOUNDED_FULL_APP/168NOT_RUN. Prior36notrerun. No realOTP/recovery/backend/RLS/provider orlaternegative-state proof; fallbackfonts only.21selectors unchanged; wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED. NextnegativeUIstatesoutsidebaseline.


## Authoritative continuation — SEQ-336–341 (2026-10-14 Baghdad)

Latest [SEQ-336–341](SEQ_336_341_FULL_ENTRY_ROUTES_20261014.md). **Next SEQ-342**. Sixsequentialstages/auditonly; application/originaltests/schemaunchanged.

FullactualVite main/App/router/providers/landing/login/signup onChrome154: head925abe7ca26d2d1b536a3b579d27f7fadc99036d/merge1cb7742870daab9d788697f3b0c2cd8b10bddf7d, run38491939756/job115618926761. **18newdistinctPASS/0FAIL** xAR/EN/KU x390/1280. Exacttitle/direction/overflow/CTA/formstructure/passwordinputtypes/empty-signupdisabled/scrollsubmit/destinationpath+exacttitle;0API/0runtimeexceptions.30captures reviewed+persisted (18initial+12submitviews, not30cases). No newcanonicalfinding; metadata/priorissuesremainOPEN.

Currentseq341CSV:222baselinecases,36PASS_BOUNDED_FULL_APP/186NOT_RUN. Prior18notrerun. Fallbackfonts/guestonly; submittedcredentials/OTP/provider/backend/allbelowfold/fulltranslation/accessibility notcertified.21selectors unchanged; wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED. NextOTP/pending/recoveryfixture applicability/authenticatedroles.


## Authoritative continuation — SEQ-330–335 (2026-10-14 Baghdad)

Latest [SEQ-330–335](SEQ_330_335_FULL_PUBLIC_ROUTES_20261014.md). **Next SEQ-336**. Six sequentialstages/auditonly; application/originaltests/schema unchanged.

Full actualVite main/App/router/providers/publicpages on nativeChrome154: head56138e8a6d10d9aff5094222d3139aa799852d97/merge76306173e6f045c8d28cb93a0730852c39991158, run38489837137/job115612162119. **18distinctPASS/0FAIL**: privacy/terms/fallback xAR/EN/KU x390/1280. Exacttitle/all9policyitems/direction/overflow/controls/home URL navigation;0unexpectedAPI/0uncaughtsnapshoterrors.18first-view captures inspected andpersisted withhashmanifest. Belowfold/pixel/productionfonts/legal/accessibility/backend notcertified.

New **PUBLIC-METADATA-TEMPLATE-001 LOW/OPEN/SOURCE_CONFIRMED**: index.html description/OG/Twitter retain Replit/template updateinstruction; notdeployedSEO incident proof. Otheropenfindingsretained. Currentseq335caseCSV:222baselinecases,18PASS_BOUNDED_FULL_APP/204NOT_RUN; historical222NOT_RUN superseded.21selectors unchanged. Wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED. NextremainingfullApppublic/rolecases; no repeatcredit.


## Authoritative continuation — SEQ-324–329 (2026-10-14 Baghdad)

Latest [SEQ-324–329](SEQ_324_329_SESSION_HTTP_20261014.md). **Next SEQ-330**. Six sequential stages/audit only; application/original tests/schema unchanged.

Source204b23402a07c4ad209b4be1156344fee64d07f6, run38487200244/job115603591089: **14distinct businessPASS/0FAIL**, raw15P/0F/0SKIP includes1parent.28migrations/ownedcleanupSUCCESS. Owner2perdevice/assistant2peraccount caps, selfsession list/delete ownership, expired SQL marker, touch absoluteclamp, HTTProtation/replacement/oldcookie401, originalcookie logout over2links, one concurrent200/401winner, selflogout-all and tamperedsecret/kindconfusion boundariesPASS. Fourlocal runner refusals separate; prior cases notrerun.

DisposableSQLtimestamps adjusted under unchanged constraints; absoluteexpired case alsoidleexpired. Concurrent loser emitted no cookieclear in singletrial, not browser response-order/load guarantee. Trust/sessions seeded, not login/OTP/RLS/provider/fullApp proof. No newcanonicalappfinding; allpriorissuesOPEN.21selectors/222fullApproute visualcases unchanged. Wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED. Prioritize fullApp route harness/role inventory next.


## Authoritative continuation — SEQ-318–323 (2026-10-14 Baghdad)

Latest [SEQ-318–323](SEQ_318_323_ADMIN_LIFECYCLE_HTTP_20261014.md). **Next SEQ-324**. Six sequential stages/audit only; application/original tests/schema unchanged.

Source9824331fdded014a7bf98808a0dde035847dff47, run38486456958/job115601177970: **14distinct businessPASS/0FAIL**, rawTAP15P/0F/0SKIP includes1parent.28migrations/owned cleanup SUCCESS. Assistant creation/input/duplicate, owner monitor session isolation and selected private fields, third device trust cap, logout-all role/target/two-device/unrelated-account protection, password reset invalid/valid/versions/revocation, forced-change restriction/reused-temporary denial/different-password recovery PASS. Fourlocal runner refusals separate; no earlier cases rerun.

No new canonical app finding; legacy fixture and native stale UI issues remain OPEN. Trust/sessions seeded, not interactive login/OTP/browser/RLS/provider proof; concurrency/fault rollback and failed-login telemetry not exercised.21selectors/222full-route visual cases unchanged. Whole percentage **NOT_YET_MEASURABLE**, release BLOCKED.


## Authoritative continuation — SEQ-312–317 (2026-10-14 Baghdad)

Latest [SEQ-312–317](SEQ_312_317_DEVICE_PERMISSION_HTTP_20261014.md). **Next SEQ-318**. Six sequential stages, audit only; application/original tests/schema unchanged.

Actual Authv2/device/permission/enabled HTTP + ownedSQL: **10 distinct business cases PASS** across initial6 and corrected remaining4. Initial e412b4ed8e40e73048ae758a0b3c37cb3821eb1c run38484571902/job115595011417:6PASS, case7 audit endpoint expectation failure,3NOT_RUN; raw6P/2F includes failed parent. Remaining65bd43a462b8f46271ee39b9bad3e08c770f4a26 run38484821000/job115595809185:4businessPASS/raw5P includes one parent,0FAIL/0SKIP.28migrations and owned cleanup SUCCESS eachrun. Corrected admin identity /admin/me, application unchanged; six completed cases not rerun.

Wrong/missing device, foreign device record, wrong password, selective device revocation, assistant role, invalid permission/enabled values, permission removal, disable and reenable/nonrevival boundaries PASS. Four local runner refusal controls separate. No new app finding; existing stale UI and legacy fixture issues remain OPEN. Seeded trust is not OTP onboarding/browser/RLS/provider proof.21selector paths/222full route visual cases unchanged. Whole percentage **NOT_YET_MEASURABLE**, release BLOCKED.


## Authoritative continuation — SEQ-306–311 (2026-10-13)

Latest [SEQ-306–311](SEQ_306_311_CURRENT_MANAGEMENT_HTTP_20261013.md), executed source `cc27ff5aef9d2e8e9347c0604e53efa23d2c19a7`, run38444767251/job115460157268. **Next SEQ-312**. Sixsequentialstages/auditonly; application/original tests/schema unchanged.

ActualaggregateAuthv2HTTP/SQL **15businesscases15PASS/0FAIL**, rawTAP16P/0F/0SKIP includes1parent.28migrations/ownedcleanupSUCCESS. Managementpermissions/approval/note/channel/suspension+cookie401/requestduplicate/ownerreview/spoofpassword/purgeanonymization and realowner-sessionrole/account/password/cookie401 boundariesPASS. No newcanonicaldefect. Originalphone/devicefixturemaintenance andnativeUIstaleaction findings remainOPEN.

Firstattemptzero targetcases blocked ownerDEVICE_REQUIRED; audittrusteddevicefixture correctedusingcurrentservices/boundheader, noguardrelaxed. FourlocalrunnerrefusalsPASSseparate; actualOTP/provider/media/RLS/fullAppscopepending.21selectorpaths/222fullroutecases unchanged; wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED.


## Authoritative continuation — SEQ-302–305 (2026-10-13)

Latest [SEQ-302–305](SEQ_302_305_ACTUAL_RETENTION_LIFECYCLE_20261013.md), executed source `29be3ed302f1d307129a3999b1e978f8fb20ee19`, run38442860689/job115453629407. **Next SEQ-306**. Audit-only, application/original tests/schema unchanged.

Actual ownedPG28migrations **8businesscases8PASS/0FAIL/0SKIP**, cleanupSUCCESS. Readonly/suspension+sessionrevocation/repeat/isolation, renewal0/10replies(no oldsessionrevival), manual/closedprotection, sessionrevocationfaultatomicrollback andconcurrentdeletionrequest1pending/1auditPASS. No newfinding; originaloldphonefixture remainsfailed/stale, notretroactivelygreen. Service/SQLscope, not fullHTTP/currentrole/purge/provider/RLSproof.

Local4runnerrefusalsPASS separate; previousretentionadapters notrerun.21selectorpaths/222fullroutecases unchanged; wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED.


## Authoritative continuation — SEQ-298–301 (2026-10-13)

Latest [SEQ-298–301](SEQ_298_301_NATIVE_MONITOR_ACTIONS_20261013.md), head `8382a73faeb95ba284db70f05468a93c3430f26c`, merge071f16b2, run38439068416/job115440607861. **Next SEQ-302**. Audit-only, application/original tests unchanged.

ActualnativeChrome154WorkMonitor/Dialog/PasswordInput **6cases4PASS/2FAIL**, noinfraerror. Cancel/success/incorrectpassword/doubleconfirmcontrolsPASS. Pendingaction sendsPOSTaftersilent403; afterReacttargetswitchB sendsoldsessionAunderB. Syntheticfixture rejects403/404, no realbackendmutation. Existing **WORK-MONITOR-STALE-001 / OPEN / NATIVE_ACTION_CONFIRMED**, no duplicate/backendbypass. Realowner/assistantHTTP/SQL/App/nativeotheraction scope pending.

Previous7monitor cases notrerun;21selectorpaths/222fullroutecases unchanged. Wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED.


## Authoritative continuation — SEQ-294–297 (2026-10-13)

Latest [SEQ-294–297](SEQ_294_297_SELECTOR_MOUNTED_MONITOR_20261013.md), head `5da92ffd4423cea44f2681d8eaa87128c93c26bf`, mergecheckout21b72bd0, run38437736590/job115436032580. **Next SEQ-298**. Audit-only, application/original tests unchanged.

Actual mountedChrome154WorkMonitor/I18n/CSS **7cases4PASS/3FAIL**, noinfraerror. AR/EN/KU390px direction/title/nooverflow andinitial403errorPASS. Real15second silent403/503 retain olddata/noerror, oldadminresponse replaces newtarget afterReactpropswitch. Existing **WORK-MONITOR-STALE-001 / OPEN / MOUNTED_BROWSER_CONFIRMED**, no duplicate/backendbypass. Pendingactions/realroles/fullAppHTTP stillopen.

959source selectorcensus:21unchangedMJScontracts/nofilename references; priorSEQ226execution reused, no repeatedtestcredit.21unmapped repositoryselectionpaths stayOPEN;222fullroutecasesNOT_RUN unchanged. Wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED.


## Authoritative continuation — SEQ-290–293 (2026-10-13)

Latest [SEQ-290–293](SEQ_290_293_LICENSED_CASHIER_HISTORY_20261013.md). **Next SEQ-294**. Audit-only; application/original tests/schema unchanged.

Actual ownedSQL **4 distinct business cases PASS**: initial source3c03392c/run38434410022/job115424558317 gives3targetPASS/1seedBLOCKED; remaining-only corrected source9f9806b3/run38435030672/job115426684838 gives1PASS/0FAIL/0SKIP. Previously verified3notrerun.28migrations/ownedcleanupSUCCESS both. New licensed zero-stock sale history persists; zero-location-row blocks archive/inventorydisable; deliberate ownedmissing-level archive retains sale and exactreplay, unsafe returndenied without history/stock mutation. No new canonical defect; no productioncleanup/HTTP/UI/RLS proof.

Local4runnerrefusalsPASS separate. Originalretiredlicense fixture finding remainsOPEN; prioratomicity/expiry findings unchanged.21selectors/222fullroutevisualcases unchanged; whole percentage **NOT_YET_MEASURABLE**, releaseBLOCKED.


## Authoritative continuation — SEQ-286–289 (2026-10-13)

Latest [SEQ-286–289](SEQ_286_289_SUPPORT_EXPIRY_POSTGRES_20261013.md), executed source `23efe18cb9089507909b3d390fea790272e22cd7`, run38433417141/job115421169603. **Next SEQ-290**. Audit-only; application/original tests/schema unchanged.

Actual owned PostgreSQL28migrations: **7 business cases / 5 PASS / 2 FAIL / 0 SKIP**, cleanup SUCCESS. Existing LOW **SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001** now CONFIRMED_SQL: expired consent/preview access denied but marker UPDATE rolls back; rows remain pending/active. No access bypass. Canonical lifecycle sweep commits expiry, preserves live other tenant and repeats with0expiryupdates. No duplicate issue; scheduler/HTTP/role/RLS proof still pending.

Local4runner refusal controlsPASS separate. First newauditseed lacked required adminphone:7fixtureseedfailures/zero targetbusiness assertions, corrected auditfixture only.21selectors/222fullroutevisual cases unchanged; whole percentage **NOT_YET_MEASURABLE**. ReleaseBLOCKED.


## Authoritative continuation — SEQ-282–285 (2026-10-13)

Latest [SEQ-282–285](SEQ_282_285_CATALOG_ARCHIVE_POSTGRES_20261013.md), executed source `ce48910f71cfd910c0b86fe24aa9fdb805083cec`, run38431991119/job115416248457. **Next SEQ-286**. Audit-only new runner/fixtures; application/original tests/schema unchanged.

Real owned PostgreSQL28migrations: **2 business cases / 1 PASS / 1 FAIL / 0 SKIP**, cleanup SUCCESS. Successful archive preserves immutable mutation and hides retained variant through later rebuild. NEW MEDIUM **CATALOG-ARCHIVE-ATOMICITY-001 / OPEN / CONFIRMED**: injected archive-marker SQL failure rejects request after core commit; name/version changed, zero-stock unmarked variant visible, ledger preserved. No hosted outage/history loss claim. Initial CJS fixture import failure is separate HARNESS_IMPORT_BLOCKED/zero business cases; corrected audit ESM only.

Local four runner refusal controls PASS; not SQL acceptance. Existing fixture-maintenance finding remains, successful inventory-archive uncertainty now resolved within bounded case. Cashier/order/location/concurrent/recovery/HTTP/UI scope pending.21selectors/222full-route visuals remain open; whole percentage **NOT_YET_MEASURABLE**. Release BLOCKED.


## Authoritative continuation — SEQ-274–281 (2026-10-13)

Latest [SEQ-274–281](SEQ_274_281_REAL_RESIDUAL_POSTGRES_20261013.md), auditexecutioncommit `3d4a4f529e7463448a4587b9d729e60f534734ac`. **NextSEQ-282**. NEW audit-onlyworkflow/executors; application/originaltests/schema/existingworkflows/scanner unchanged.

Actualoriginal13files on13freshnetwork-nonePGclusters/28migrations each:12complete summaries16PASS/8FAIL/0SKIP;1incompletefixture.4fullygreenfiles/8completefailed/1incomplete. OwnedteardownSUCCESS. Failures largely obsoletefixtures; variantremovalarchivecontractTRIAGE, no newlyconfirmedproductdefect. NEWMEDIUM RESIDUAL-FIXTURE-CONTRACT-001 groupsfixturemaintenance. No originaltestpatched.

Local4newrunnercontrolsPASS;7canonicalconsentadaptercases6P/1F strengthens existingexpiryrollbackfinding. Safe13selection resolvesuncertainty34→21/277;notuntestedcodepercentage.222fullroutecasesNOT_RUN/actualblockedbusinessassertions/externalgates remainopen. Wholepercentage **NOT_YET_MEASURABLE**. Historicalcheckpointresults retained;ReleaseBLOCKED.


## Authoritative continuation — SEQ-266–273 (2026-10-13)

Latest [SEQ-266–273](SEQ_266_273_PREVIEW_BINDING_EXPIRY_ROLES_20261013.md), baseline `583774144dc24a840e7462227865db35bd19a0dc`. **NextSEQ-274**. Audit only; application/originaltests/workflows/schema unchanged.

15newcases13PASS/2FAIL/0SKIP:actualpreviewvalidator+transactionhelper11cases9P/2F and actualassistantinspectionguard4P, inertSQL/sessionadapters. TwoNEWLOW entries: SUPPORT-PREVIEW-SESSION-BINDING-001 serviceblankcallercontractgap(noHTTPbypass), SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001 attemptedexpirymarkerrolledback(accessstilldenied;scheduledexpiryworkermaypersist).

Supportpreviewroutefixture refinedfromowner toassistantwithbothgrants;222fullroutevisualcases remainNOT_RUN. Baseline33Actions25SUCCESS/8FAILURE; existinghistoricalsyntheticgate retained. Wholepercentage **NOT_YET_MEASURABLE**.13integration/34selectors/fullUI/actualSQL/provider/hosted gatesopen. Priorhistorypreserved;releaseBLOCKED.


## Authoritative continuation — SEQ-258–265 (2026-10-13)

Latest [SEQ-258–265](SEQ_258_265_MEDIA_CONCURRENCY_UI_CASES_20261013.md), baseline `b97df88c43e99940a9d50638a9334422da00982d`. **NextSEQ-266**. Audit only, no application/CI/scanner/historyrepair.

5newtests4PASS/1FAIL/0SKIP realownedFS/inertSQL-storage. NEWMEDIUM MEDIA-CLEANUP-CONCURRENT-UNLINK-001: loserconcurrentdelete removes winnerpendingmanifest. Oldretry canreopencomplete;idempotentretryrecovers. NEWLOW AUDIT-SYNTHETIC-HISTORY-GATE-001: currentrepositoryscanSUCCESS but reachablehistoryFAIL1oldsyntheticfixtureblob; no realsecretclaim.

37namedroutes inventoried;1conditionaldevexcluded,36×3languages×2viewport+6fallback=222minimumfullroutevisualcases, allNOT_RUN. Scope excludes role/write/error/lifecycle/cashier/accessibility; not wholepercent. Baseline33Actions25SUCCESS/8FAILURE. Wholepercent **NOT_YET_MEASURABLE**;13integration/34selectors/fullUI/actualSQL/provider/hosted gatesopen. Historicalevidence retained;ReleaseBLOCKED.


## Authoritative continuation — SEQ-248–257 (2026-10-13)

Latest [SEQ-248–257](SEQ_248_257_MEDIA_RETENTION_SECURITY_20261013.md), baseline `0e0c457638f1016bda1c22b246688bc7898a94fd`. **NextSEQ-258**. Application/applicationtests/workflows/schema/scannerrules unchanged; auditfixture representation corrected only.

14newcases12PASS/2FAIL/0SKIP;twoNEWMEDIUM findings MEDIA-CLEANUP-CORRUPT-001 and MEDIA-CLEANUP-STARVATION-001 (realownedFS/inertSQL/storage). Retention7adaptercasesPASS. Separate26fencecontrolsPASS reverified; notrecounted asnewcoverage. Localrepositoryscanner1706files/0findingsPASS after syntheticfixtureliteral adjustment.

Baseline33Actions24SUCCESS/9FAILURE: extraadminparentfailure ENVIRONMENT_BLOCKED/0tests; securityscanflags1syntheticURL in oldauditfixture, correctionhostedCIpending. No realsecret or applicationrepair. Wholepercent **NOT_YET_MEASURABLE**;13integration/fullUI/actualSQL/provider/hosted gates remainopen. ReleaseBLOCKED; historical records preserved.


## Authoritative continuation — SEQ-240–247 (2026-10-13)

Latest [SEQ-240–247](SEQ_240_247_ENTRYPOINT_FENCES_META_RECOVERY_20261013.md), baseline `17e521408b9fdc5621c18839f88d5f22a2c5992b`. **NextSEQ-248**. Audit only; original application/tests/workflows/schema unchanged.

46localcontrols46PASS/0FAIL/0SKIP:26pre-import guardrefusals for13 residual entrypoints,20actualMeta recovery function cases with inertrefund/state adapters. **Original13 integration runtime NOT_RUN**, native direct-entrypoint safety/CI wiring not certified. Prepared per-file freshcluster executionmanifest; no guard weakened.

Current33Actions26SUCCESS/7FAILURE. Receipt run38350269903/job115140836967 native8PASS; previous launchtimeout0assertions preserved. Zero new canonical product defects; prior refund-cycle/shutdown/DBsafety findings remainopen. Wholepercent **NOT_YET_MEASURABLE**; remaining13integration/fullUI/actualPG/provider/hosted proofs unchanged. Historical evidence retained. ReleaseBLOCKED.


## Authoritative continuation — SEQ-232–239 (2026-10-13)

Latest [SEQ-232–239](SEQ_232_239_WORKER_SIGTERM_MONITOR_RACES_20261013.md), baseline `6ef87566bb55f6d6c9d7fc17698e4af210980482`. **NextSEQ-240**. Audit only; application/existing tests/workflows/schema unchanged.

15actual localtests10PASS/5FAIL/0SKIP. Real childSIGTERM leaves persisted unfinished local queue claim; restart protects uncertain outcomes from automatic retry and preserves row; explicit known reconciliation completes without rerun. RequiredPostgreSQL worker stop observed with SQL adapters, not actualSQL. Monitor callback races/pending action after403 strengthen previous UI stale finding; no mountedReact/backend bypass.

No new canonical product finding; strengthens OPS-WORKER-DRAIN-001 and WORK-MONITOR-STALE-001. Baseline33Actions25SUCCESS/8FAILURE; receipt extraFAIL is browser startup ENVIRONMENT_BLOCKED with0assertions, not receipt regression. No whole-project percent: **NOT_YET_MEASURABLE**.13integration and mountedbrowser/guardedSQL/recovery/fullUI inventory still pending. Historical checkpoints preserved. ReleaseBLOCKED.


## Authoritative continuation — SEQ-225–231 (2026-10-13)

Latest batch: [SEQ-225–231](SEQ_225_231_SELECTION_CONTRACT_PRECISION_20261013.md), baseline `1db2beb108aea0b507012428cce7ab5129f388be`. **Next SEQ-232**. Audit only; application, existing tests, workflows and schema unchanged.

Actual local105tests:98PASS/7FAIL/0SKIP.28 previously unresolved contract files:92tests87P/5F; five stale source-contract expectations. Actual discount runtime9P; independent precision oracle2P/2F. New LOW findings CASHIER-DISCOUNT-PRECISION-001 (extreme safe-integer percentage floor/one-unit acceptance; no real sale proved) and AUDIT-STALE-SOURCE-CONTRACT-001 (five stale expectations, no five product defects).

Expanded243-source selector review resolves7paths through commerce validator/CI;34/277 remain unresolved,13 integration NOT_RUN. Original41-file queue28executed/13not run; this is a bounded inventory, not whole audit coverage. Current baseline33Actions:26SUCCESS/7FAIL. Provider deletion currentrun38343460680/job115119606452 source1P and SQL1P; older pendingrun38342332323 cancelled before assertions.

Overall remaining percentage **NOT_YET_MEASURABLE**. Next mounted WorkMonitor, owned worker SIGTERM recovery, safe residual13 integrations and applicable UI case denominator. Historical records below preserved. Release BLOCKED.


## Authoritative continuation — SEQ-215–224 (2026-10-13)

Latest completed audit batch: [SEQ-215–224](SEQ_215_224_COVERAGE_WEBHOOK_MONITOR_20261013.md), baseline `7e0da5ebe93ee7cc444d0f2b9a1ed98c5476e1a3`. **Next SEQ-225**. Audit/test/documentation only; no application repair, final remediation plan, main merge, deployment or hosted DB/provider mutation. Historical checkpoints below are preserved and are not the current queue.

Actual local application-body adapter harness Node24.19.0: **18 tests /14 PASS /4 FAIL /0 SKIP**, exit1. Four failures strengthen two existing findings: BILLING-WEBHOOK-ORPHAN-015 and WORK-MONITOR-STALE-001. This is not Express/network, SQL, browser or real provider proof. New OPS-WORKER-DRAIN-001 is a MEDIUM operational proof gap/TRIAGE; no lost job demonstrated.

Current isolated Actions run38342332307/job115115887752:43 complete summaries,41unique files,144PASS/24FAIL/0SKIP, known failures reused without new coverage credit. Current cashier deletion SQL run38342332394/job115115888003:1PASS, no skips; separate static1PASS. Workflow snapshot33runs:25success/7failure/1in_progress at observation; provider identifier deletion still pending, not passed.

[Measured sub-inventories and remaining gates](COVERAGE_INVENTORY_20261013.md):277API test files,91integration,41selection paths unresolved in bounded search;37routes plus fallback,5cashier modes plus demo and nested panes. **Overall remaining percent NOT_YET_MEASURABLE**;54/46 remains historical planning judgment, not current measured coverage. Release BLOCKED.

Next: resolve catalog/history dynamic selection and safe isolated execution; mounted WorkMonitor denials/action state; owned child-process SIGTERM worker drain/restart; applicable route-role-language-device case denominator. Do not rerun unchanged failing suites just to raise SEQ count.


## SEQ-167 checkpoint — 2026-10-13

ADMIN-JOURNEY-DISPOSABLE-ATTESTATION-001 root cause refined: secure network-none Docker provisioning already exists in scripts/run-isolated-postgres-audit.sh and audit-isolated-postgres.yml, but separate global-admin-golden-journey.yml bypasses it. No confirmed defect in isolation runner from source alone.


## SEQ-166 checkpoint — 2026-10-13

ADMIN-JOURNEY-DISPOSABLE-ATTESTATION-001 remains OPEN: isolated audit runner consumes valid network-none DB proof but global-admin-golden-journey.yml directly invokes test against services.postgres without proof. Also CI concurrency cancels runs on audit-only commits; distinguish CANCELLED from test FAIL.


## SEQ-165 checkpoint — 2026-10-13

ADMIN-JOURNEY-DISPOSABLE-ATTESTATION-001 HIGH test-gate blocker: global admin golden journey CI run 38335320862 fails before application import; workflow services.postgres lacks mandatory network-none proof, attestation file/run ID and DB marker required by disposable-postgres-test-guard. Do not disable fail-closed guard.


## SEQ-161–163 checkpoint — 2026-10-13

WORK-MONITOR-STALE-001 source-confirmed: silent 15s GET failure retains old privileged monitor data without error; browser/backend tests pending. Owner recovery has explicit owner_admin 403 role gate and transactional credential/session/device revocation; no confirmed bypass.


## SEQ-159–160 checkpoint — 2026-10-13

PREVIEW-SILENT-REFRESH-001: Chrome154 silent409 and silent503 retain unmarked private snapshot; PREVIEW-EXPIRED-RETAINED-001: expiry countdown retains visible preview; PREVIEW-END-UNCONFIRMED-001: end503 navigates without confirmation. These are UI lifetime findings, not fresh server authorization bypass. SuperQi missing-order HTTP200 and generic SQL HTTP503 remain untested route-level TRIAGE.



## SEQ-143–158 checkpoint — 2026-10-13

SEQ-153–158 open/triage: CASHIER-IDB-IDEMPOTENCY-001 local same-ID changed-input silent replay (Chrome+source, backend has request_hash 409); CASHIER-BILLING-SQL-RECOVERY-001 synthetic P0001 rolls back event/order, webhook returns 503; SUPERQI-ORDER-NOT-FOUND-ACK-001 TRIAGE missing-order webhook ignored with HTTP 200. No real lost payment or cloud bypass proven. [Root causes](SEQ_153_154_CASHIER_ROOT_CAUSE_20261013.md) · [Cloud boundaries](SEQ_155_157_SYNC_WEBHOOK_BOUNDARIES_20261013.md) · [Webhook HTTP](SEQ_158_SUPERQI_WEBHOOK_HTTP_20261013.md).


## Current issue checkpoint — SEQ-141 (2026-10-13)

Confirmed in actual source and browser: EMERGENCY-SNAPSHOT-END503-001 (MEDIUM/OPEN, end 503 navigates without confirmation) and EMERGENCY-SNAPSHOT-END401-001 (MEDIUM/OPEN, finally overwrites /login). EMERGENCY-SNAPSHOT-KU-001 remains TRIAGE only (Sorani empty-tab timeout, root cause unconfirmed). Evidence [SEQ-140/141](SEQ_140_141_ADMIN_PARENT_EMERGENCY_20261013.md). Do not duplicate CASHIER-REPORT-PROFIT-001. No repair authorized.


## Definitive current handoff — SEQ-138–139 complete; next SEQ-140

Continue from saved evidence. Comprehensive audit and evidence recording only; no application repairs or consolidated repair plan until the audit is complete. No main merge, deployment, hosted DB/secrets or real payment.

Latest Support browser run [38318079531](https://github.com/nora953/fawri-production-source/actions/runs/38318079531), job115039529673, Chrome154: **12 PASS /1 FAIL /0 SKIP**,13 cases. The one confirmed failing assertion is `ADMIN-SUPPORT-STALE-001` MEDIUM/OPEN/UI reliability: after AdminSupportTab’s silent list refresh receives503, the old ticket is retained while reply and resolve controls remain enabled. Synthetic GET only; no message write or authorization bypass shown. The separate real SQL/HTTP Support proof still showed current `manage_support` revocation returns403 for list/image/reply on the same cookie.

The additional overlapping-refresh case returned `old:false,newer:true,requests:3`: this controlled fixture did **not reproduce** an older response replacing the newer display. Treat this as a bounded negative test only; the synthetic API did not exercise database snapshot ordering, hosted session state or the full admin route.

SEQ-138 mounted actual merchant `SupportPage` and admin `AdminSupportTab` with React/I18nProvider/Radix and Vite CSS against loopback synthetic GET API. Verified AR/EN/KU direction and390px overflow, hostile message text/no active image/script, loading/empty/503/retry, merchant stale-refresh mutation blocking/recovery, owner/assistant/inspection-prop child action surfaces and Escape dialog close. A native focusable new-ticket control was observed; click-to-form and actual keyboard activation remain unverified in this headless harness. Full parent admin tab/route/session, visual/accessibility, backend writes, hosted grants and device clearance remain open.

Earlier SQL/HTTP result remains separate and unchanged: run38288686551 **144 PASS /24 FAIL /0 SKIP**,41 unique files/43 invocations,9 canonical findings in that bounded suite including HIGH/OPEN CASHIER-REPORT-PROFIT-001. Browser assertions are not added to SQL counts. Overall planning estimate remains about54% audited/46% remaining (40–60% uncertainty), not readiness. Release BLOCKED.

**Next SEQ-140:** exercise the actual parent AdminPage `canManageSupport` tab and content gate through an authorized synthetic session/role, then continue remaining owner/admin/merchant route groups. Preserve all existing proofs; hosted grants/media/PITR/rollback/monitoring, offline/device, provider and commercial acceptance remain open.
## SEQ-134 reconciled; SEQ-135 prepared; SEQ-136 local media verified

See [SEQ_134_136_ADMIN_SUPPORT_20261012.md](SEQ_134_136_ADMIN_SUPPORT_20261012.md) for exact scope and limits. Source3019e9a4 / run38287120221 / job114938040636: real admin auth/router journey1PASS. Support fixture fails before HTTP on normalized phone constraint23514; child exit7 has no terminal TAP counters.43invocations/41unique; completed summary counters139PASS/24FAIL/0SKIP **plus one observed uncounted fixture-setup failure**. Not an exhaustive139/24 aggregate. No new product defect. Owned cleanup, restore, Meta54 and Node22 PASS.

Corrected test-only Support phones, pre-mutation aggregate cleanup with visible errors, fixture admin audit deletion and direct-entry attestation. Runner reports summaryComplete and observed failure fallback, rejecting incomplete summaries. SEQ-135 adds4 real negative HTTP child tests: missing/foreign-tenant ticket/image/reply access/no mutation, current revoked support permission despite stale session claims, read-only/exact-session preview, terminated preview rejection. Runtime pending next source; no new SQL pass claimed. SEQ-136 local actual filesystem functions5PASS: paths/private modes/symlink denial/atomic bytes/no collision overwrite. Separate from DB counts and hosted durability.

Planning approximately54%audited/46%remaining; no further increment for fixture correction or these limited local controls. No repairs/consolidated plan/merge/deploy/live changes. Next inspect corrected Support/negative tests and complete SQL counters; continue remaining owner/admin/merchant/support browser roles afterward.


## Current checkpoint — SEQ-128–133 verified; SEQ-134 prepared (2026-10-12)

This supersedes earlier next-step/prepared statuses below; keep them as history. Continue the comprehensive audit, tests/documentation only. No application repair or consolidated repair plan until the audit is complete.

Executed PR head `4b9bc639ff35addb6babb1d28f266a1c10d9bc90`, Actions checkout merge `2790ed78f2545c76c8cd317869502ed724c3d81b`:

- Isolated SQL/HTTP [run38204575983](https://github.com/nora953/fawri-production-source/actions/runs/38204575983), job114665101797: **138 PASS / 24 FAIL / 0 SKIP**,39 unique files/41 invocations. Counters computed from all41 AUDIT_SUITE_RESULT records.24 failed markers =16 functional+8parents for9 canonical application findings, not24 independent defects. Owned-container cleanup step SUCCESS; full-schema seed/restore, Node22 HTTP and injected Meta54 passed. This automatic CI repeat is corroboration, not new coverage.
- CASHIER-REPORT-PROFIT-001 **HIGH / OPEN**: actual authenticated operator HTTP without reports.profit returns can_view_profit:false and omits currency profit, but nested product/ranking disclose gross_profit_minor500. Authorized grant positive control passes. New suite1PASS/3FAIL (2functional+parent). No anonymous or cross-tenant leak established; no repair.
- Receipt [run38204576080](https://github.com/nora953/fawri-production-source/actions/runs/38204576080), job114665101839: **8 PASS / 0 FAIL** in Chrome154. AR/EN/Sorani×58/80mm each1PDFpage, exact2400total, no horizontal overflow, lastitem/saleID and reprint marker retained, escaped hostile labels/noactive markup/privatecost. Two additional actual iframe/srcdoc/load/helper checks remove frame after explicitly dispatched afterprint and after injected print failure. print method is inert at the physical boundary; no hardware/native dialog event or fallback-timer certification.
- Central reactive report [run38204576014](https://github.com/nora953/fawri-production-source/actions/runs/38204576014), job114665101732: **5 PASS / 0 FAIL**. Actual complete component/toolbar/I18nProvider/Recharts/Vite CSS, synthetic loopback API. AR/EN/Sorani each4nonempty PDFpages,6metrics,30operations, exact697910net, localized partial notice and lastproduct. Empty removes stale report;503disablesexport then actual7day range/apply controls recover. Not owner authentication/backend accounting/fullvisual/mobile clearance.
- Local admin UI authority **14 PASS / 0 FAIL / 0 SKIP**, Node24.19.0, actual capability/refresh/effect bodies with inert state/HTTP adapters; no mounted admin or real server auth proof. Reuse results; do not add the earlier10test run to14.

Planning estimate approximately **54% audited /46% remaining**, uncertainty40–60%. Same weighted milestone model (source20,functional30,adversarial20,target20,acceptance10), equal11domains. Modest bounded evidence increments: security68→69, dashboards44→47, reports49→53, language27→29. Other domain estimates unchanged; no credit for automatic CI repeats or fixture corrections. This is not measured universal coverage or launch readiness. Release BLOCKED.

**SEQ-134 PREPARED:** execute existing previously audit-unverified admin-auth-router and support-postgres-cutover journeys first in guarded tenant batch. The preload attestation runs before application/DB imports; runner is disposable loopback/network-none with owned teardown. Actual Auth v2 admin login/device OTP/trust/password-change/session-disable/device-revoke HTTP; Support merchant/admin tickets/images/approval/read-only preview/secret redaction/reminders. These are bounded mounted-router/default disposable-role fixtures, not full application route fallthrough, restricted deployed grants, OTP provider, browser or media durability proof. Support tiny signature-only PNG fixture cannot establish full image decode validation. Existing internal cleanup quality is not separately fault-certified; owned entire DB teardown is the containment boundary. Results NOT_RUN until CI read. Provisional inventory41unique/43invocations; preserve verified138/24 until complete new aggregate.

Next read SEQ-134 runtime and cleanup, classify fixture/product failures without weakening assertions; then remaining owner/admin/merchant/support browser and negative permission/tenant scope from37route inventory. No main merge, deploy, live DB/secrets or real payment.


Current continuation checkpoint: **SEQ-113, 2026-10-12**, source `23563ffba019a666e3d2f61f29769723d56b7e03`. The SEQ-109–113 section below supersedes historical source-only/pending statements only within its explicit scope. Release remains BLOCKED; no application fixes authorized or implemented.

Issues are not automatically defects. Classify as DEFECT, PROOF_GAP, EXTERNAL_DEPENDENCY, or PROCESS.

| ID | Class | State | Finding / next proof |
| --- | --- | --- | --- |
| FA-I-001 | PROOF_GAP | OPEN | Direct Neon connector returned tool-not-found errors. Need non-secret read-only DB role/readiness evidence before FA-004 PASS. Do not infer database is absent. |
| FA-I-002 | PROCESS | OPEN | GitHub branches page 1 has 100 results; full branch pagination and comparison required in FA-001. |
| FA-I-003 | PROCESS | OPEN | [Draft PR #476](https://github.com/nora953/fawri-production-source/pull/476) awaits review and evidence; not part of core freeze automatically. |
| FA-I-004 | PROOF_GAP | OPEN | Reported Claude offline cashier integration concern not supplied verbatim. Request precise reproduction/code path before reopening existing cashier tests. |
| FA-I-005 | EXTERNAL_DEPENDENCY | OPEN | Production provider activation, backups/PITR, durable media storage and release gates tracked in [release blockers](../FAWRI_RELEASE_BLOCKERS.md). |


| FA-I-006 | CONFIRMED_RESTRICTED_ROLE_RUNTIME_FAILURE | OPEN / HIGH PRIORITY | Meta page-to-merchant routing under RLS: `listActiveMetaPageMappingsAuthoritative()` executes a cross-merchant `SELECT page_id, merchant_id FROM merchant_channels` through `withOperationalTransaction()`, which does not set `fawri.tenant_id`. Migration `0025_tenant_rls_policy_predicate_cutover.sql` sets the `merchant_channels_tenant_boundary` predicate to `fawri_tenant_or_audited_admin(merchant_id)`. If the deployed runtime role is subject to RLS and lacks a specifically authorized cross-tenant resolver, this SELECT may return zero rows. Validate actual role, table RLS flags, policy grants and a synthetic connected-page lookup in staging. Do not disable RLS or add BYPASSRLS to runtime; design a narrowly scoped, audited, least-privilege resolver if reproduction confirms. |

## Reopening a closed audit
Record exact commit/config delta or reproducible failure, affected components, minimal necessary tests, and closure evidence. No broad restart.

## Decisions
- 2026-10-10: freeze new features; stage-by-stage final audit; visual QA last.
- 2026-10-10: GitHub documents are continuity source; conversation memory is supplementary.
- 2026-10-10: Railway staging already exists; no duplicate environment creation.

## 2026-10-10 staging security follow-up (read-only)

| ID | Class | State | Finding / next proof |
| --- | --- | --- | --- |
| FA-I-007 | PROOF_GAP | OPEN / SECURITY REVIEW | On Neon `staging-runtime`, 94 public tables exist, 45 with RLS enabled and 49 without. The restricted runtime role has SELECT/INSERT/UPDATE/DELETE on non-RLS tables including `accounts`, `account_sessions`, `merchants`, `merchant_cashier_staff`, and `cashier_station_credentials`. This does not establish an API exploit: inspect authorization and least-privilege access, then run two-merchant negative access tests on disposable infrastructure before release. Do not blindly enable RLS on global/auth tables. |
| FA-I-008 | PROOF_GAP | OPEN | `staging-runtime` has 28 applied Drizzle migration records and 94 public tables; Neon's separate default `production` branch lacks the migration ledger. Verify deployed DATABASE_URL branch safely without publishing its value; never migrate the default branch accidentally. |
| FA-I-009 | PROOF_GAP | OPEN | `/ops/readiness` screenshot at 2026-10-10T18:17:58.935Z reports `ready`, `postgresql_authority: up`, `production_release_configuration: up`. Railway `FAWRI_DEPLOYMENT_MODE=staging` and `FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE=fawri_staging_rls_runtime` were supplied by operator. This proves expected-role match for the readiness query, not complete tenant isolation or production release gate. Verify operational flows and safe branch target. |

FA-I-006 follow-up: GitHub `postgresMetaChannelAuthority.ts` still calls `listActiveMetaPageMappingsAuthoritative()` via `withOperationalTransaction()` without `fawri.tenant_id`; Neon staging has zero connected Meta channels, so real routing cannot yet be reproduced. Preserve RLS; test a synthetic mapping on disposable infrastructure and design a narrowly scoped resolver if needed.

FA-I-006 update (2026-10-10): The webhook middleware calls the authoritative page map before merchant authorization; missing page mapping returns HTTP 503. PostgreSQL-only map lookup is an all-pages query without tenant context. Migrations 0024/0025 use tenant-or-audited-admin RLS. Local Meta ingress integration tests do not prove behavior with the restricted staging role. Reproduce on disposable PostgreSQL before any least-privilege fix.

## 2026-10-11 reconciliation: actionable register findings not yet indexed in this issue ledger

This is an **index**, not a second evidence register. Detailed source observations remain in `AUDIT_REGISTER.md`; IDs below are stable existing IDs unless explicitly marked NEW. These findings are not all vulnerabilities.

| Register ID | Classification | State | Specific next proof / decision |
| --- | --- | --- | --- |
| CASHIER-SW-001 | DEFECT (source mismatch) | OPEN | Align SW cache generation and cold-start readiness check only after app-code approval; run targeted browser test. |
| CASHIER-DEMO-001 | PROOF_GAP | OPEN | Test `?demo=1` UI and normal POS runtime authorization; do not infer unauthorized sale from UI alone. |
| CASHIER-OFFLINE-001 | SECURITY_DESIGN_DECISION | OPEN | Decide whether offline license must be server-signed; test cache tampering under agreed threat model. |
| CASHIER-SYNC-SESSION-002 | PROOF_GAP | OPEN | Negative test legacy merchant-session bridge with historical operator permissions and device binding on disposable DB. |
| CASHIER-ATTRIBUTION-006 | PROOF_GAP (existing retry mitigation) | OPEN | Fault-inject after core sale commit and before attribution; retry must avoid duplicate sale and persist correct operator. |
| CASHIER-HIST-PERMISSION-009 | PROOF_GAP (PR #519, NOT MAIN) | OPEN | Historical `permission_snapshot` check absent in attribution lookup; decide historical vs current authorization policy and test unauthorized historical operator case. |
| CASHIER-HIST-IDENTITY-010 | PROOF_GAP (PR #520, NOT MAIN) | OPEN | Forge occurred_at and mismatched sequence/session; prove all binding checks across service boundaries. |
| TEST-DB-SAFETY-008 | PROCESS / TEST_SAFETY | OPEN | Add local disposable allowlist guard before running compensation-history integration suite; code approval required. |
| SAAS-BILL-TEST-001 / PG-TEST-GUARD-002 / PG-TEST-GUARD-003 | PROCESS / TEST_SAFETY | OPEN | Audit unsafe billing, subscription and RLS suites; complete CI workflow command inventory; do not run on Neon. |
| SUPPORT-IMAGE-TEST-002 | PROCESS / TEST_SAFETY | OPEN | Add disposable DB protection to support-image write-order integration suite before execution. |
| CATALOG-MEDIA-001 / SUPPORT-STORAGE-001 | EXTERNAL_DEPENDENCY | OPEN | Decide durable object storage or mounted volume; demonstrate survival across redeploy. |
| BACKUP-DRILL-001 | EXTERNAL_DEPENDENCY | OPEN | Document and safely prove hosted backup/PITR restoration separately from disposable drill. |
| RELEASE-GATE-STATIC-001 / FASTPAY-RELEASE-001 | EXTERNAL_DEPENDENCY | OPEN | Establish production Meta/AI/payment/billing evidence and release-gate clearance design. |
| FA-005 | PROCESS | PENDING | Perform owner/merchant/cashier and AR/KU/EN visual QA after functional and safety gates. |

**Status:** PR #518 verified merged; PRs #519 and #520 verified open drafts on 2026-10-11. This index is committed to PR #520 only, **not main** until reviewed and merged. CI inventory remains incomplete: attempting `.github/workflows/ci.yml` returned 404, but no inference is made about other workflow filenames. No integration test, database mutation, code change, or deploy performed.

**Resumption order:** (1) inventory CI/workflow paths and PostgreSQL integration test commands, (2) close safe-test guard coverage with approved code fixes, (3) historical operator negative test and Meta restricted-role reproduction on disposable PostgreSQL, (4) external media/backup/provider proof, (5) visual QA. Do not raise audit completion estimate for documentation-only activity.

## UI findings from historical staging notes — current main source review (2026-10-11)

| ID | Status | Evidence / next proof |
| --- | --- | --- |
| FAWRI-UI-001 | SOURCE_CONFIRMED_FIX_PENDING | Merchant DetailsModal bottom Close and shared DialogContent top X both present. Confirm unsaved note behavior before UI fix. |
| FAWRI-UI-002 | VISUAL_QA_PENDING | Permission footer has Cancel then Save and responsive flex layout; verify AR/KU/EN desktop/mobile. |
| FAWRI-UI-003 | SOURCE_CONFIRMED_FIX_PENDING | LogsTab unknown action codes fall back to raw codes; reason rendered verbatim. Localize display only, preserve stored audit data. |
| FAWRI-UI-004 | INVESTIGATE | Possible unsaved merchant note loss on dialog dismissal: local noteText and explicit save; parent close behavior and runtime reproduction still pending. |

These findings are documentation-only on draft PR #520, not merged into main and not repaired.

| FAWRI-UI-005 | SOURCE_CONFIRMED_FIX_PENDING | Merchant note save success toast fires before async PUT result: `AdminPageDialogs.tsx` lines 933-938 calls `onSaveNote(noteText)` then `toast.success`, while `AdminPageView.tsx` passes a voided async `doSaveNote` and `useAdminPageController.tsx` lines 1244-1268 awaits PUT and handles failure. Need awaitable save contract, success only on confirmed result, failure messaging, and pending-state protection; no runtime test or code fix yet. |

| CASHIER-STATION-ENTITLEMENT-011 | NEGATIVE_TEST_PENDING | Main `CashierManagementPage.tsx` lines 265-266 derives management eligibility from `cashierEntitlement.state === 'active'`; Add Station launcher line 727 is disabled unless active, but modal submit line 908 checks only `busy || !stationCreateBody` and `addStation` lines 433-440 posts the body without local entitlement recheck. UI restriction is not an API security guarantee. Identify server POST `/api/cashier/management/stations` handler and verify server-side entitlement/authorization rejects inactive, grace, restricted, suspended, and cross-merchant attempts using disposable test DB. No confirmed server bypass and no runtime test executed. |

**CASHIER-STATION-ENTITLEMENT-011 update (2026-10-11):** `SOURCE_GUARDED_NEGATIVE_TEST_PENDING`, not a confirmed server authorization defect. Server route `cashier-staff-operations.ts:280-301` requires merchant session; station creation `postgresCashierStaffAuthority.ts:901-978` inserts and assigns seat in a merchant transaction; `cashierEntitlementAuthority.ts:608-676` enforces active entitlement and seat limit. Pending disposable-DB negative/concurrency/rollback proof; see PROGRESS. The original issue row records the initial UI-only concern and is superseded by this evidence.

## Billing checkout reliability — source-reviewed, tests pending (2026-10-11)

| ID | Status | Evidence / remaining proof |
| --- | --- | --- |
| BILLING-IDEMPOTENCY-012 | CONFIRMED_SAAS_CHECKOUT_RACE / CASHIER_PENDING | `cashierBillingAuthority.ts:489-595` and `saasBillingAuthority.ts:509-595` check same-merchant idempotency keys under `FOR UPDATE` and reject mismatched retries, but absent-row SELECT alone cannot prove concurrent uniqueness. Verify actual DB unique constraints and simultaneous checkout attempts on disposable PostgreSQL. Catalog/price changes can also cause 409 on retry; agree replay contract. |
| BILLING-EXTERNAL-TX-013 | SOURCE_CONFIRMED_RELIABILITY_TEST_PENDING | Both cashier (`cashierBillingAuthority.ts:639-665`) and SaaS (`saasBillingAuthority.ts:628-657`) invoke SuperQi **sandbox** while DB checkout transaction remains open, then attach external payment reference. Test provider latency, external success + DB rollback/commit failure, retry and reconciliation on disposable DB with mocked provider. No observed production incident. |
| CASHIER-PRORATION-014 | POLICY_AND_BOUNDARY_TEST_PENDING | `cashierEntitlementAuthority.ts:132-241` uses UTC calendar-month clamp and BigInt whole-IQD half-up proration; near expiry a positive amount below 0.5 IQD rounds to zero and is rejected. Decide intended minimum/next-cycle policy; test leap year, month-end, expiry and grace boundaries. |

These are **audit work items, not three proven vulnerabilities**. No integration tests, external payment, DB mutation or deployment performed.

## 2026-10-11 source review continuation — test gaps (not executed)

| ID | Status | Source observation / exit proof |
| --- | --- | --- |
| BILLING-WEBHOOK-ORPHAN-015 | RECONCILIATION_TEST_PENDING | `superQiSandboxWebhook.ts` verifies signed payload and gateway status, but returns `ignored/order_not_found` when no order matches. Together with BILLING-EXTERNAL-TX-013, inject sandbox provider-success/DB-rollback and prove recovery, retries and reconciliation. No confirmed incident. |
| CASHIER-SEAT-RELEASE-016 | SERVICE_RUNTIME_PASS / SOURCE_CONFIRMED_UI_SELECTION_GAP / BROWSER_PENDING | `cashierEntitlementAuthority.ts` seat assignment returns existing snapshot for both `active` and `release_scheduled` rows; test whether merchant retention of a scheduled-release station cancels the release as intended. |
| REPLY-LEDGER-DUPLICATE-017 | OFFICIAL_TRANSPORT_RUNTIME_DENIAL_PASS / OTHER_CALLERS_OPEN | `postgresSubscriptionEntitlement.ts` duplicate reservation returns allowed/duplicate after matching prior debit and checking current subscription row, without reapplying the initial new-event status checks; verify caller does not send an unauthorized new reply on replay after suspension. |
| REPLY-RESTORE-CYCLE-018 | CONFIRMED_SYNTHETIC_CROSS_CYCLE_FAILURE | `restoreMerchantAutoReplyPostgres` credits the original subscription/batch and guards duplicate credits. Test late refund after renewal, old batch missing/expired and balance invariants. |
| CASHIER-STATION-ROLLBACK-019 | VERIFIED_SERVICE_DB_NEGATIVES | `postgresCashierStaffAuthority.ts` station insert and seat assignment share merchant transaction; test exhausted-seat rollback, no orphan station and concurrent create. |

All entries are source review or test design, not executed proof. No changes to application code, live DB, payment providers, or deployment.

## 2026-10-11 integration entrypoint safety

| ID | Status | Evidence / required fix |
| --- | --- | --- |
| DB-TEST-TARGET-GUARD-020 | VERIFIED_SOURCE_GAP / NOT_EXECUTED | `artifacts/api-server/tests/global-merchant-auth-bootstrap-postgres.integration.test.mjs:79` and `global-merchant-golden-journey.integration.test.mjs:223` skip only when `DATABASE_URL` is absent, with no disposable/local DB assertion in those entrypoints. Both use `@workspace/db` and write/delete synthetic accounts; `test:global-merchant-journey` invokes both. Require pre-import fail-closed target attestation and isolated ephemeral Postgres; prove rejection of remote/tunneled DB. No test execution or real-data impact observed. |

| DB-TEST-CLEANUP-021 | VERIFIED_SOURCE_GAP / NOT_EXECUTED | `global-merchant-golden-journey.integration.test.mjs:238-380` creates accounts, merchant, cashier subscription, billing order and entitlement application before registering `t.after` at line 377. Any error during fixture setup leaves synthetic rows behind. `global-merchant-auth-bootstrap-postgres.integration.test.mjs` also registers cleanup after initial pool query, temp directory and port reservation. Register cleanup before first mutation and use an isolated transaction/teardown strategy with failed-setup tests. |
| GOLDEN-LEGACY-FIXTURE-022 | CLOSED_BY_EXECUTED_CONTRACT | `global-merchant-golden-journey.integration.test.mjs:321-344` still writes a `merchants.json` compatibility fixture described as pre-PR #139. Confirm whether current runtime still needs this; if not, remove fixture and assert fully PostgreSQL-backed behavior. No runtime test performed. |

| GOLDEN-CONTRACT-DIVERGENCE-023 | CLOSED_BY_EXECUTED_CONTRACT | `global-merchant-golden-journey.integration.test.mjs:321-344` explicitly writes a pre-PR-#139 `merchants.json` fixture, while `global-merchant-postgres-http-journey.integration.test.ts:46-56,704` asserts no root-level `.json` files in its test data directory. The latter tests a stricter no-legacy-JSON contract but is not the same entrypoint as `test:global-merchant-journey`. Establish whether the legacy fixture is still necessary and make the npm command exercise the canonical contract. Source evidence only; neither test was executed. |

## Autonomous sequential audit — task SEQ-01 (2026-10-11)

User authorizes test guards, test additions and isolated CI on the audit branch; earlier approval-only wording for these scoped actions is superseded. No app/business changes, main merge or hosted DB mutation authorized.

| ID | Classification | State | Evidence / next action |
| --- | --- | --- | --- |
| DB-TEST-CLEANUP-024 | CONFIRMED_TEST_PROCESS_DEFECT | OPEN | Both MJS merchant journeys swallow account DELETE failures with `.catch(() => {})`; the direct TS HTTP journey and Meta ingress do the same with `.catch(() => undefined)`. This can report a green test after failed cleanup. Separate from late hook registration DB-TEST-CLEANUP-021. Use teardown that attempts every resource release, propagates redacted aggregate errors, and register before setup; test failed setup and failed cleanup. Source evidence only at baseline 09d5b8cd; no DB execution. |

DB-TEST-TARGET-GUARD-020 through GOLDEN-CONTRACT-DIVERGENCE-023 already exist; no duplicate entries created. Merchant deletion RLS suite has finally-based role cleanup but retains fixture rows until instance disposal; runner must destroy its owned instance.

## SEQ-02 — scoped guard and cleanup remediation (audit branch only)

- DB-TEST-TARGET-GUARD-020: IMPLEMENTED / 15 SAFETY REGRESSIONS PASS / ACTUAL CI INSTANCE PROOF PENDING. Five priority suites now call shared attestation before application DB imports. Guard requires a loopback-only network namespace matching runner-owned Docker identity, exact fawri_ci target/role, per-run marker verified by read-only probe, no URL query overrides and NODE_ENV=test. An environment flag or local tunnel URL alone cannot pass.
- DB-TEST-CLEANUP-021: both MJS cleanup hooks moved before mkdir/first mutation; removed unnecessary initial DELETE. Failed-setup helper regression PASS; actual failed-DB-fixture cleanup proof still pending.
- DB-TEST-CLEANUP-024: swallowed DELETE errors removed in both MJS journeys, TS HTTP and Meta ingress. Aggregate teardown attempts every cleanup and fails with redacted errors. Helper failure-injection PASS; actual PostgreSQL cleanup behavior pending.
- GOLDEN-LEGACY-FIXTURE-022 and GOLDEN-CONTRACT-DIVERGENCE-023 remain OPEN; compatibility fixture intentionally retained until measured canonical journey proof. No application implementation changed.
- Unselected unsafe suites under PG-TEST-GUARD-002/003 and TEST-DB-SAFETY-008 remain OPEN; the five-suite guard is not a repository-wide claim.

SEQ-03a follow-up to DB-TEST-TARGET-GUARD-020: first real CI refused at preflight because test guard used the per-database comment function instead of shared-object database comment function. Corrected to shobj_description; no application or hosted DB defect claimed. Closure remains pending fresh CI proof.

FA-I-006: dedicated restricted-role test added in SEQ-03b. Requires real tenant-reset passes and known-page routing passes; do not close from source or owner-role Meta suite. Runner startup race fixed by TCP readiness after actual CI init failure; no application defect inferred from that failure.

| AUDIT-FIXTURE-SCAN-025 | TEST_INFRASTRUCTURE / FALSE_POSITIVE_REVIEW | OPEN | Security run 38171061371 flags three fabricated remote connection strings in guard regression tests. Current inputs now use recognized placeholder passwords; historical blobs may still be flagged. These inputs were rejected before connections. Do not suppress real secret findings or rewrite history; verify narrowly scoped false-positive handling if needed. |

DB-TEST-TARGET-GUARD-020 SEQ-04: actual isolated instance matched database/role/run marker; address failed exact text comparison due PostgreSQL inet mask representation. host(inet_server_addr()) corrects the comparison, retains strict loopback-only rule. Wider legacy suites protected by runner preload only; direct-entrypoint PG-TEST-GUARD findings remain OPEN. No integration PASS yet.

| BILLING-TEST-E164-026 | CONFIRMED_TEST_FIXTURE_DEFECT | FIXED_AND_CI_VERIFIED | SaaS billing and signed SuperQi positive fixtures use local077... phones; actual migration0026 now requires E.164. Run38171428265 showed accounts_phone_shape_check SQLSTATE23514 before payment assertions. Changed test fixtures only to +964...; source constraint preserved. No billing runtime defect established by those failures. |

AUDIT-FIXTURE-SCAN-025: local current repository+history scans now PASS after recognized current placeholders and six exact immutable historical fixture exceptions (two blob SHAs/path/rule/offset/length). Regression rejects any widened match. CI security proof pending.

## SEQ-06 — isolated rerun, actual restricted-role failure (2026-10-11)

FA-I-006 is now reproduced under committed schema on disposable PostgreSQL16. [Commit284a5fa4](https://github.com/nora953/fawri-production-source/commit/284a5fa476ad975261099be74597e4cbeb23ba68), [run38171811645](https://github.com/nora953/fawri-production-source/actions/runs/38171811645), job114565798191: roleNOLOGIN/NOSUPERUSER/NOBYPASSRLS, merchant_channels RLS enabled; tenant-only lookup and pool context reset PASS; unknown-page generic503/noidentity leak PASS. Global approved mapping count actual0/expected2 FAIL; known approved page actual503/expected accepted FAIL. Three Node failures include the parent, representing two failed functional subtests, not three independent defects. No cross-tenant leak demonstrated. Live staging has no approved connected-page reproduction. Preserve RLS; application resolver change requires user approval.

Twenty of21 suite files PASS, totals48NodePASS/3FAIL/0SKIP. Deletion RLS, seven cashier suites, four billing suites and four tenant suites PASS. Four fresh DB instances each applied28 committed migrations; teardown PASS. BILLING-TEST-E164-026 is verified fixed by successful SaaS4/SuperQi2 cases. All other workflow runs on this commit, including final security/supply chain and final quality gates, completed SUCCESS. These facts do not establish release readiness or omitted failure paths.

Prepared next: remove golden journey legacy merchants.json fixture and assert no root JSON persistence; add synthetic late-paid-expired, mismatched-paid replay and shared-payment-reference concurrency tests. Not yet executed. Dependency audit reports two moderate advisory records (postcss-selector-parser GHSA-rj75-hqrm-r3gf; fast-copy GHSA-jggr-w7fw-pc2j); exploitability/dependency path pending, no new issue until reconciled with existing register.

## SEQ-07 — negative billing and fixture-free journey; SEQ-08 restore safety

[Source91d639ff](https://github.com/nora953/fawri-production-source/commit/91d639ff17dad866a89b06c1cea736e8f57bae6f), [run38172237280](https://github.com/nora953/fawri-production-source/actions/runs/38172237280), job114567076990:22suite files,49NodePASS/6FAIL/0SKIP;20filesPASS. Four committed-schema chains28migrations eachPASS; owned-container teardownPASS. Six failures are four failed subtests plus two parent failures (Meta two, SaaS two).

| ID | Classification/status | Actual evidence / next action |
| --- | --- | --- |
| BILLING-LATE-EXPIRED-027 | CONFIRMED_SYNTHETIC_RUNTIME_DEFECT / OPEN HIGH | Create checkout1hour in past, list orders proactively marks expired, then verified matching test_fake payment throws SAAS_BILLING_ORDER_NOT_PAYABLE instead of durable paid_reconciliation_required. Source saasBillingAuthority.ts checks nonpending status before late-payment reconciliation. No production charge; operational consequence is missing automatic reconciliation for a received payment. Approved business correction and replay recovery proof needed. |
| BILLING-PAID-REPLAY-028 | CONFIRMED_SYNTHETIC_RUNTIME_DEFECT / OPEN HIGH | Valid payment applied, distinct verified event with same payment ref and amount1 changes durable order paid -> paid_reconciliation_required. Amount mismatch branch precedes paid terminal guard. Existing entitlement stays applied; no double-credit demonstrated. Preserve terminal state and audit rejected event after approved fix; also test refunded state. |
| RESTORE-LIBPQ-OVERRIDE-029 | CONFIRMED_TOOL_GUARD_GAP / FIXED_LOCAL_TEST_PASS_CI_PENDING | Backup/restore accepted loopback URLs containing hostaddr/service parameters and inherited libpq routing variables. Six new rejection tests failed before patch;15passed after URL search/hash rejection, then17passed including mocked binary PGHOSTADDR/PGSERVICE/PGOPTIONS stripping. No database connection occurred (local pg tools absent; fake tools only). Existing direct tools still lack ownership/network attestation; arbitrary loopback tunnel and SELECT side effects remain unproven safety gaps. Do not run these direct against unproven DB. |
| SUPPLYCHAIN-MODERATE-030 | ADVISORY_DETECTED / EXPLOITABILITY_UNPROVEN | pnpm audit2moderate,0high,0critical; selector-parser6.0.10 via frontend dev @tailwindcss/typography (GHSA-rj75-hqrm-r3gf; fixed>=7.1.6); fast-copy4.0.3 via API dev pino-pretty/esbuild-plugin-pino (GHSA-jggr-w7fw-pc2j; fixed>=4.1.0). Recursive pnpm why confirmed paths. Dev declaration does not alone prove absence from deployed bundle. Patch/override compatibility and artifact reachability pending. No lockfile changes. |

GOLDEN-LEGACY-FIXTURE-022 and GOLDEN-CONTRACT-DIVERGENCE-023: CLOSED_BY_EXECUTED_CONTRACT on source91d639ff. MJS journey removed pre-PR139 merchants.json compatibility fixture; unchanged operational journey passes and asserts zero root JSON. HTTP journey alsoPASS. No claim all legacy app routes are removed.

SaaS concurrent distinct orders/shared provider payment ref PASS: exactly one entitlement, other rejected SAAS_BILLING_PROVIDER_PAYMENT_COLLISION in this execution. This single simultaneous attempt narrows earlier absent-row race concern; stress distribution and commit-failure recovery remain untested. Existing positive billing/refund suites stillPASS.

## SEQ-09 prepared — checkout concurrency and station rollback

Scope: test-only evidence additions for BILLING-IDEMPOTENCY-012 and CASHIER-STATION-ROLLBACK-019. Existing subscription test already proves final-seat serialization; added database station-count assertions after unlicensed, exhausted and losing concurrent creation, plus exact rejected code. Reason to rerun: orphan persistence was not asserted before. Added same-key simultaneous SaaS checkout test with up to6independent merchant trials, expects both callers receive one durable order; no result claimed until CI. Cashier entrypoint now has direct pre-import disposable guard and aggregated cleanup (extends020/024 coverage). Isolated workflow path trigger includes changed PostgreSQL integration tests and negative billing file. Golden fixture-free contract already established; do not re-open022/023 from unrelated failed suites.

## SEQ-09 verified; SEQ-10 prepared

[Sourcef956b689](https://github.com/nora953/fawri-production-source/commit/f956b689b0135ebe56503687a8557e8c8a579739), [run38172594527](https://github.com/nora953/fawri-production-source/actions/runs/38172594527), job114568154729:22files49NodePASS/7FAIL/0SKIP; four28migration chains andcleanupPASS. Seven failures include2parents: Meta2functional failures, SaaS3functional failures. Prior027/028persist.

BILLING-IDEMPOTENCY-012: CONFIRMED_SYNTHETIC_CHECKOUT_RACE. Trial0both callers succeeded; trial1one caller failed SQLSTATE23505, other succeeded. Test stopped on trial1; do NOT claim all6trials executed. Identical merchant/operation/plan/key concurrent requests should replay one checkout for both callers; unique constraint prevents duplication but service lacks successful conflict replay in this observed path. This is an idempotent response/reliability defect, not evidence of duplicate charge or entitlement. Source SELECT FOR UPDATE cannot lock absent key. Approved business fix and concurrent regression required.

CASHIER-STATION-ROLLBACK-019: VERIFIED_SERVICE_DB_NEGATIVES. Unlicensed insert rolls back to0stations; exhausted seat preserves1station; competing final-seat creation preserves2stations/2assignments and loser CASHIER_LICENSED_SEAT_LIMIT_REACHED. Existing cashier grace/suspension/tenant checksPASS. No HTTP/browser claim; retention016pending.

Restore evidence: [source861524b4](https://github.com/nora953/fawri-production-source/commit/861524b46143668079055a280db32e4c403d436e), [run38172470218](https://github.com/nora953/fawri-production-source/actions/runs/38172470218). Actual fresh PostgreSQL16 workflow service creation and synthetic fixed loopback URL verified in job114567775409 logs;1835byte dump checksum verified;3row restore count and source/target consistency hashPASS;2localobjectsrestore/hashPASS; secret scans/evidence uploadPASS; normal DROP database and service removalPASS. Observabilityjob11456777521312PASS/0FAIL/0SKIP; typecheckPASS. This proves tiny synthetic drill, not complete Fawri schema/full merchant recovery, external storage/PITR/RPO/RTO or production recovery.

| RESTORE-SELECT-EFFECTS-031 | CONFIRMED_TOOL_VALIDATION_GAP / FIXED_LOCAL_TEST_PASS_CI_PENDING | SELECT prefix guard accepted writable function/SELECT INTO/locking/predicate function. Four denial tests failed prepatch. Restricted verification to simple SELECT count(*) FROM unquoted optional-schema table; combined backup/restore/object tests21PASS/0FAIL/0SKIP. No SQL effects executed: missing manifest prevented tool use. Workflow now verifies owned running PostgreSQL service loopback-only published port and empty public schema before writes; cleanup no longer swallows psql failure. New workflow proof pending. |

Prepared SQL-fault/retry test: pre-importguard, synthetic verified payment, temporary trigger raisesP0001 during entitlement INSERT; captures persisted order/event/subscription state, removes trigger, tests exact eventretry/duplicate and expects durable reconciliation. New test23rdfile not executed yet; no defect claimed. Cleanup attempts trigger/function/accounts/pool independently. No hosted data/provider calls.

## SEQ-10 actual SQL fault and restore ownership; SEQ-11 prepared

[Sourcefbbb9d0c](https://github.com/nora953/fawri-production-source/commit/fbbb9d0cb8806d1e0fc7bd04d57aa7fdd34f1132), [run38172886288](https://github.com/nora953/fawri-production-source/actions/runs/38172886288), job114569035624:23files50NodePASS/9FAIL/0SKIP;20filesPASS; four28-migration chains andcleanupPASS. Nine failures include3parents;6functional failures. Prior Meta/012/027/028persist.

| BILLING-SQL-RECONCILIATION-032 | CONFIRMED_SYNTHETIC_FAILURE_RECOVERY_LIMIT / OPEN | Inject P0001 trigger on entitlementapplicationINSERT during verified syntheticpayment. Entiretransactionrollsback: orderpending,events0,applications0,subscriptions0; no durablepaid/reconciliationwork. Faultremoved/exacteventretryPASS(appliedonce,duplicateonreplay). Thus atomic rollback and repeat recovery work; a permanent error or exhausted providerretry leaves no received-payment evidence in these tables. No realpaymentorpermanentlossproven. Operator reconciliation/replay SLA and approved durable failure recording needed; cashier equivalent remains untested. |

[Restore run38172886344](https://github.com/nora953/fawri-production-source/actions/runs/38172886344) on same source, job114569035881:21unitPASS/0FAIL/0SKIP; RESTORE_SERVICE_OWNERSHIP_PASS, RESTORE_FRESH_DATABASE_PASS before writes;3rowdump/restore/hashPASS;2localobjectrestorePASS;cleanupPASS. Guards029/031now CIverified. Full Fawri schema/storage/PITR recovery remains open.

Cashier subscription legacy workflow run38172886355/job114569035424 failed disposable attestation before DB import; this was the newly protected test refusing the old push-force/service runner, not cashier business failure. Replaced only DB job with reusable isolatedcashier suite; preserve frontend/APItypecheck/policyunitjob and add previously presentfull-lifecycle suite to isolatedbatch, pendingCI.

SEQ-11 prepared: add existing Meta bot/AI full PostgreSQL testfile to new isolatedbatch with injected send/media/embedding providers and no externalnetwork/credentials; add directguard/early aggregatedpool/tempcleanup. New duplicate reservation/suspended subscription test expects sendguard rejection and zero fake sends (017). Add cross-cycle replyrefund test (018) preserving new-cycle debit after late old-cycle refund. Total26suitefiles planned, no results yet. Syntax transform and MJSchecksPASS; TypeScript type coverage for this test remains runtime/CI rather than full new compile proof.

## SEQ-11 verified: cross-cycle accounting; Meta harness corrected

[Source9331c489](https://github.com/nora953/fawri-production-source/commit/9331c489903c315a24d41726a3efa1b77954513b), [run38173288435](https://github.com/nora953/fawri-production-source/actions/runs/38173288435), job114570243330:26files,52NodePASS/62FAIL/0SKIP;21filesPASS. Five fresh isolated instances each28migrationsPASS; cleanupPASS. Of62failures,52are the Meta harness prematurely ending its pool after first awaited top-leveltest; other10include3parents and7functionalfailures. Do not label52Meta failures as product defects or completed functional coverage.

REPLY-RESTORE-CYCLE-018: CONFIRMED_SYNTHETIC_CROSS_CYCLE_ACCOUNTING_FAILURE. Old-cycle base reply reserved; subscription renewed after expiry; new-cycle reply reserved; refund oldevent returns refundedtrue and changes newcycleused1->0/remaining3999->4000. Renewal reuses subscription ID; refund has no original-cycle discriminator. The new event debit stays in ledger while base usage is erased. No real balances touched. Approved accounting policy/fix needed: reject or reconcile historical refund separately, preserve new-cycle debit, prove duplicate/concurrent cases and add-on batch behavior.

Meta harness correction (024 follow-up): early root afterhook incorrectly ran after first awaited top-level test and closed shared pool. Move all53cases under one parent with early parent t.after, retain aggregatedcleanup and disposableguard. This is an audit test-infrastructure correction; the original application Meta cases remain unproven until rerun.017suspended duplicate send negative did not reach its assertions in this run. Add independent knowledge-learning-cycle file with fakeembedding to isolatedbatch (27files planned). Syntax transformPASS; real CIpending.

[Cashier workflow38173288724](https://github.com/nora953/fawri-production-source/actions/runs/38173288724): both jobsSUCCESS. Job114570243664 API/frontendtypecheck and7policytestsPASS (calendar-month/leap-year/proration cases); job1145702440248suitefiles9NodePASS/0FAIL/0SKIP,28migrationsPASS. This verifies replacement for obsolete schema-push runner and full cashier lifecycle; near-zero proration policy and changed-retention selection stillpending014/016.

New FINAL_REPORT_DRAFT.md and REMAINING_WORK_MATRIX.md consolidate current evidence, priorities and14short-task planning estimate3.5–7hours excluding additional failures/queues/externalproof/fixes. Draft is not release approval.

## SEQ-13 — Meta/AI functional proof and cleanup fault preparation

[Source2964aba2](https://github.com/nora953/fawri-production-source/commit/2964aba2800274f704adbe5cf820e458958f0915), [run38173603888](https://github.com/nora953/fawri-production-source/actions/runs/38173603888), job114571197444:27files,106NodePASS/10FAIL/0SKIP;23filesPASS. Five isolated28migration chains andcleanupPASS. Four failedfiles correspond to existing006/012/027/028/032/018, sevenfailedfunctionalcases plus threeparents.

Meta parent harness corrected:54NodePASS/0FAIL/0SKIP (53functional subtests plus parent), owner-role committed-schema/injectedproviders only. Covers deduplicated send, confirmed failure retry, uncertain send prevention, tenant knowledge isolation, manual takeover, media provenance/forgery/redelivery, mixed attachments, SSRF-like unsafe URLs and event identity collision. No real Meta/OpenAI availability/token permission proof. Standalone knowledge learning-cycle1PASS. Restricted Meta page mapping failure006 is separate and persists.

017: reservation duplicate after subscription suspended returns allowedtrue/duplicatetrue; official PostgreSQL transport.send rejects MERCHANT_AUTO_REPLY_DISABLED and fake send counter remains0. This narrows concern to reservation API semantics/other callers; no unauthorized official send demonstrated.018crosscycle failure persists. Historical52Meta harness failures remain recorded, now corrected.

021/024 next real DB proof prepared: guarded child inserts synthetic account/merchant then setupthrows; first cleanup SELECT throws SQL error, subsequent DELETE and pool teardown must still run. Parent checks childexit1, bounded cleanup failure log, zero account/merchant rows and no raw PostgreSQL error. Node24 probe showed a setup error masks an after-hook error in reporter; helper now emits only TEST_CLEANUP_FAILURE count before aggregated throw.15guard/local cleanup testsPASS; real DB child proof pending28file rerun.

## SEQ-14 — failed-setup harness diagnosis; full schema restore prepared

[Source43e60b16](https://github.com/nora953/fawri-production-source/commit/43e60b164282beec5feba9546625b4c16faca21f), [run38173870161](https://github.com/nora953/fawri-production-source/actions/runs/38173870161), job114571997037:28files106NodePASS/11FAIL/0SKIP;23filesPASS. Five28migration chains andcleanupPASS. Existing10functional/parent failures persist; additional1is the new cleanup child harness, not app failure. Child unexpectedlyexit0, so DB cleanup proof not reached. Confirmed locally NODE_TEST_CONTEXT=child-v8 makes nested node --test skipfiles with a recursive-run warning; remove only this inherited context in childenvironment. No claim child fixture rows were inserted in failedrun.

Full-schema restore prepared: new separate sixth fresh offline cluster,28migrations; two synthetic merchants/channels; restricted NOLOGIN/NOSUPERUSER/NOBYPASSRLS readrole. Seed fingerprint includes publictables/RLSflags/ACLs,policies/functions,constraints/indexes,migrationjournal andfixturechanneldata. Dockerexec pg_dump/customdump, restore toemptyDB, replace only ownedsourceDB, reattest marker, compare fingerprint and rerun restrictedtenantreads without rerunning migrations. Roles remain in same disposablecluster (not cluster-role restore proof). Rawdump remains inside disposablecontainer, neveruploaded. Allcontainers/volumes/temp proof removed by existingtrap. MJS/shell/YAML/diffchecksPASS; actualrestorepending.29unique files planned,30invocations includingseed/verifyphases.

## SEQ-15 actual failed-setup cleanup and first full-schema restore

[Sourcefe892e69](https://github.com/nora953/fawri-production-source/commit/fe892e6973907e93c808f2c5af80b7273c224e9e), [run38174186237](https://github.com/nora953/fawri-production-source/actions/runs/38174186237), job114572937993:29unique files/30invocations,108NodePASS/11FAIL/0SKIP. Six fresh isolated instances each28migrationsPASS; cleanupPASS. Existing10functional/parent failures plus fullschema fingerprint comparison failure. Security/supplychain fourjobsSUCCESS onthissource; no productchange.

021/024 real failure proofPASS: child setup throws after synthetic account/merchant inserts, first SQLcleanup throws; expectedchildexit1, boundedcleanup error visible, rawerror redacted, remainingaccount0/merchant0. Later cleanup and pool end execute despite first failure. This proves common early-hook/aggregate strategy with actual DB writes/errors; it is not fault injection at every journey mutation.

Full-schema seedPASS:94publictables,45policies,3functions,28migrationrows,two syntheticconnectedchannels; restricted tenant readsPASS. Owned-container pg_dump/pg_restore commandPASS and source DB replacement/reattest completed. VerificationtestFAIL: fullfingerprint mismatch; no componentdetail yet, because assertion preceded restrictedrole reads. Do NOT call fullrestore verified or assume appdefect/data loss. Add bounded component/key/field diagnostics (no rawSQL/secrets) and run restricted tenant reads before finalfingerprint assertion. Roles remain in samecluster. Next actualrerun must identify semantic vs representation difference.

014: added nearzero half-up monthly boundary test;8localpolicytestsPASS/0FAIL/0SKIP using node --importtsx with DATABASE_URL absent. InitialtsxCLI failed sandboxIPCsocketEPERM beforetests; safe node-loader alternativePASS, no appfailure. Business choice for positive roundedzero remains policydecision. Existingcalendar/leapyear behavior alreadyCIverified, reused.016: explicitdowngradekeepselection switch cancels release + staleversion rejection prepared; directguard and aggregatecleanup added tothissuite. SyntaxPASS; DBassertionspending.

030artifact follow-up: local API build's pino-pretty.mjs.map lists fast-copy4.0.3 source; APIbuild always emits prettytransport, Dockerfile.staging copies fullnode_modules anddist withoutpruning. logger.ts skips prettytransport when NODE_ENVproduction; Dockerfile.staging sets production. Thus dev declaration does not imply artifactabsence, but defaultproductionruntime activation/exploit not demonstrated. Selector-parser frontendbuild dependency remains in copiednode_modules; not proven in browserasset. No dependency changes.

## SEQ-16 — restore difference localized; cashier retention proof

[Source3a9e83ab](https://github.com/nora953/fawri-production-source/commit/3a9e83ab580c7f0845c5b9309707901b9fe14523), [run38174557888](https://github.com/nora953/fawri-production-source/actions/runs/38174557888), job114574050281:29unique files/30invocations,108NodePASS/11FAIL/0SKIP; six28-migration chains andcleanupPASS. No newappdefect fromrerun.

Restoreverify restrictedtenantreadsPASS afteractualdump/restore. Tables/ACL/RLSflags,policies/functions,indexes,journal andfixturechannels compareidentically. Only constraint.definition differs; all638constraints and validation/deferral flags/counts preserved. SamplefullDDL notyetrecorded; semanticdifference remainsunknown. Add one original/restoredconstraint sample (publicschema metadata only) and retain finalfingerprintfailure until evidence permitsrepresentation normalization. No premature fullrestorePASS.

016explicit retention selectionPASS: keeperchange cancels its scheduledrelease, previouslykeptstation becomesrelease_scheduled; staleexpectedVersion rejected, validswitchback retainsoriginalkeeper through existinggrace/paidrenewalflow. assignseat helperis notexposedasretentionroute inreviewedsource; ordinaryassignmentnoop onrelease_scheduled isnot demonstrated UIretention failure. Officialscheduledselection servicebehaviorverified; UI/browser nottested.014nearzero proration8localpolicytestsPASS; pricingpolicydecision remainsopen.

Prepared newcashier billingnegativefile: latepaymentafterproactiveexpiry, mismatchafterappliedstate, samekey concurrentcheckout(up to6independent trials), globalpaymentrefcompetition and SQLfault/retry. Usesguard,syntheticfixtures/fakeprovider,earlyaggregatecleanup/faulttriggerremoval. SyntaxPASS; actualtestsnotrun. Next30unique files/31invocations. Updateexisting012/027/028/032 scope rather thanduplicatefindings if reproduced.

## SEQ-17 — cashier payment boundaries and restore representation evidence

Source [8dcc893e](https://github.com/nora953/fawri-production-source/commit/8dcc893ebf9c15a9162b93cb5276c392a7e4d4f9), [run 38174896098](https://github.com/nora953/fawri-production-source/actions/runs/38174896098), job 114575105770: 30 unique files/31 invocations, **110 PASS / 15 FAIL / 0 SKIP**. Six isolated PostgreSQL instances applied 28 migrations each; owned container/volume cleanup SUCCESS. Failures comprise ten existing functional/parent failures, four new cashier failures (three functional and their parent), and one restore comparison failure. These are not fifteen independent defects.

027 now confirmed for cashier as well as SaaS: matching verified payment after proactive order expiry throws CASHIER_BILLING_ORDER_NOT_PAYABLE. 028 now confirmed for cashier applied orders: a distinct mismatched-amount event rewrites applied to paid_reconciliation_required while entitlement remains applied. 032 cashier SQL trigger fault P0001 rolls back payment/application/subscription writes but leaves order pending and no durable provider-event evidence; removing fault permits exact-event retry and duplicate protection. These extend existing issue scope, not new issue IDs. No real provider charge or loss was tested.

012 remains confirmed for SaaS only. Cashier identical concurrent checkout succeeded for both callers with one stable order in all six independent trials, with no rejected SQLSTATE. Shared cashier payment-reference competition also passed. Do not generalize SaaS concurrency failure to cashier.

Full-schema dump/restore commands and restored restricted tenant reads passed. The sampled cashier_operation_attribution_identity_check differs only by flattening its leading associative AND group; 638 constraints retain counts/flags and other components match. One sample is insufficient to classify every constraint. Prepared native PostgreSQL parse/deparse normalization for CHECK constraints only, with equivalent-grouping positive canary and changed-predicate negative canary; all ACL/RLS/data/index/function/journal assertions retained. Syntax passed; actual normalization/restore proof pending.

Next guarded fixture covers addon-batch FK protection, concurrent duplicate refunds and expired-addon refund after renewal, separately from confirmed base-cycle defect018. Synthetic setup/early aggregate teardown; syntax passed, DB execution pending. Matrix expands to31 unique files/32 phase invocations. No application change.

## SEQ-18 — full committed schema restore and addon refunds verified

[Source fc1ee417](https://github.com/nora953/fawri-production-source/commit/fc1ee4171eac9b75189383539857664afa37b264), [run38175555975](https://github.com/nora953/fawri-production-source/actions/runs/38175555975), job114577082735:31 unique files/32 phase invocations, **114 PASS / 14 FAIL / 0 SKIP**. Six offline isolated PostgreSQL clusters each applied28 committed migrations; container/volume cleanup SUCCESS. Fourteen failures comprise ten functional failures and four parents across existing006/012/018/027/028/032. No new product finding.

Full committed-schema restore seed AND verify PASS. Native parser round-trips303 CHECK definitions on each side; equivalent-AND positive canary and changed-predicate negative canary PASS. Both fingerprints identical:54f2997b3d8a921daf2aa3d11bef4ab7e62114570d9ecb132cd10fe9bdee05ee.94 public tables/RLS flags/ACLs,45 policies,3 functions,638 constraint definitions/counts/flags, indexes,28 migration journal entries and two fixture channels match; restricted tenant reads PASS after real pg_dump/pg_restore. Previous mismatch is now experimentally classified as CHECK deparse representation, not data loss. This is synthetic schema/channel recovery in one owned offline cluster; roles remain pre-existing. No cluster-role/PITR/external-media/redeploy/RPO-RTO guarantee.

018 addon controls PASS (three Node tests including parent): committed FK rejects referenced batch deletion with23503; concurrent refunds credit exactly once and preserve batch identity; expired addon refund after renewal keeps current baseused1/baseRemaining unchanged and addonAvailable0. Confirmed base-cycle defect018 still FAIL. Do not conflate safe addon behavior with unsafe base refund.

020 expanded source inventory:64 candidate DB-dependent integration files,16 direct guard markers,31 isolated selections,33 outside both at sourcefc1ee417. Candidate scan is textual, excludes transitive imports and is not a mutation/CI safety proof. Add guarded merchant-password recovery entrypoint to isolated selection; two local direct invocations (missing URL and unattested hosted-shaped URL) rejected before dynamic application DB imports. New early aggregate hook registered before seed/temp/server setup. TS syntax/API typecheck/diff check PASS. Actual password recovery HTTP tamper/replay/concurrent-reset assertions pending next CI; broader32 unprotected/unselected candidates remain open. No legacy workflow references this filename literally; no blanket attestation change was made to legacy service workflows.

## SEQ-19 — password recovery proof and CI evidence reconciliation

[Source1c498c06](https://github.com/nora953/fawri-production-source/commit/1c498c06e27da42ccb73bfbadb4bd7599d9e2601), [run38175863733](https://github.com/nora953/fawri-production-source/actions/runs/38175863733), job114578004547:32 unique files/33 invocations, **115PASS/14FAIL/0SKIP**. Six28-migration chains and teardownSUCCESS. New password recovery HTTP proofPASS: tampered cookie rejected without password/version change; valid reset revokes prior sessions and increments versions; replay rejected; two concurrent confirmations serialize to200/400 with one further version change. Existing ten functional/four parent failures persist; schema restore/addon controls stillPASS. No application change.

R11 reused completed sourcefc1ee417 CI logs, not reran its proven checks. Returned20 PR workflows:16SUCCESS/4FAIL. Bot adversarial22PASS and workflow-boundary1PASS; both synthetic runtime/SQL/provider substitutes. Quality tool18PASS; source contracts386PASS/0FAIL/1SKIP (387total), APIunit818PASS/0FAIL/0SKIP, frontendTS179PASS/0FAIL/0SKIP; full typecheck/build SUCCESS. Translation structure SUCCESS; reported core777 keys and admin299 keys each in en/ar/ku, missing0/extra0; this is structural, not semantic or browser proof. Security fourjobsSUCCESS; dependency audit retains two moderate advisories030, so green blocking policy is not zero advisories.

Recorded skipped DB subtest: auth-cutover-contract.test.mjs, validated PostgreSQL merchant context reaches business routes without merchants.json authority, skip when DATABASE_URL absent. Now selected explicitly under attested isolated runner; early aggregate teardown before mutations, child stop awaits exit. Local source-only invocation10PASS/0FAIL/1SKIP; DB assertion pending. Its intentionally empty legacy fixture checks absence of legacy merchant authority, unlike removed golden JSON compatibility fixture. No standalone guard added because legacy workflows need separate migration; preloader protects selected execution.

Two other CI failures were infrastructure, not product findings: Meta pipeline audio mixed command60PASS/1FAIL/0SKIP because guarded Meta DB file was invoked on unattested legacy service; foundation knowledge-gap step failed at same pre-import guard. Corrected both workflow invocations to owned offline meta-bot runner, preserving full seed/parent/teardown and pool-contention assertion. No weakening of guard or removing business assertions. YAML, bot workflow path1test and diff checksPASS; actual workflow repair pending. Cashier reusable job failure was existing027/028/032 (policy8PASS), not new infrastructure. Isolated audit failure is existing six indexed findings. CI table/counts in CI_EVIDENCE_RECONCILIATION_2026-10-11.md. PR body updated and publication verified to current evidence before this checkpoint.

## SEQ-20 — safe legacy CI callers verified; critical UI source review

[Source05456ea9](https://github.com/nora953/fawri-production-source/commit/05456ea9c5bfdf9c007159aae0226f8c949db1e6), [isolatedrun38176210529](https://github.com/nora953/fawri-production-source/actions/runs/38176210529), job114579031278:33 unique files/34invocations, **126PASS/14FAIL/0SKIP**. Six28-migration chains/cleanupSUCCESS. auth-cutover-contract11PASS/0SKIP includes previously skipped PostgreSQL business-route assertion; empty legacy merchant fixture remains empty. NoJSON golden and fullschema recovery remainPASS. Ten existing functional failures/fourparents persist.

Legacy Meta pipeline [run38176210628](https://github.com/nora953/fawri-production-source/actions/runs/38176210628), job114579031565 SUCCESS: isolated knowledge1PASS/Meta54PASS,28migrations. Foundation [run38176210612](https://github.com/nora953/fawri-production-source/actions/runs/38176210612), job114579031408 SUCCESS: deletion1PASS plus isolatedknowledge1/Meta54PASS across two28migration chains; finalFOUNDATION_CLEAN_INTEGRATION_FINAL_PASS reached. Guard refusals from previous source repaired by safe invocation, not weakened checks. TEST_CLEANUP_FAILURE failedResources2 in isolated logs is deliberate no-DB guard unit fixture before suites; no teardown failure inferred from that expected marker. Source-linked job cleanup stepsSUCCESS.

R12 bounded source task complete (not browser/linguistic certification). Existing016 now SOURCE_CONFIRMED_UI_SELECTION_GAP / SERVICE_PASS / BROWSER_PENDING: CashierSubscriptionPanel filters release_scheduled out of loaded selection, request and checkboxes although backend accepts both; merchant cannot pick that pending-release station as replacement through this component. Service keeper switch previouslyPASS. New FAWRI-UI-006 SOURCE_CONFIRMED_LOCALIZATION_GAP: billing operation/status render raw and server English errors pass into toast in AR/KU, despite translation key parity. No runtime display test, app fix, payment breach or data leak claimed. CRITICAL_UI_SEMANTIC_REVIEW_2026-10-11.md has exact bindings/accessibility/editorial limits. Existing003 admin logs is a different surface; no duplicate016 created.

## SEQ-21 — restricted-role sensitive-session HTTP proof prepared

Bounded FA-I-007 follow-up fixture merchant-session-restricted-http-postgres.integration.test.mjs prepared, **not DB-executed yet**. Pre-import attestation runs before @workspace/db; actual local no-attestation invocation exits1 with expected refusal before DB import. Syntax/diffPASS. Owner connection reserved exclusively for setup/teardown; all newly created application pool connections use startup rolefawri_audit_sensitive_http. Fixture must assert current_user, NOSUPERUSER/NOBYPASSRLS/non-owner and allfourDMLprivileges on five sensitive tables before HTTP. Account_sessions RLSflag must befalse to model application defense rather than rely on a protective RLS predicate there. Two synthetic merchants, three bound sessions; no external provider or hosted data.

Four planned HTTP subtests: missing/tampered/wrongdevice rejection; own-only session list with no rawtokens/tokenhash and no-store; cross-merchant revoke404 versus selected-own revoke200; origin denial before logout mutation and own logout-all leaving othermerchant active. Early aggregate teardown closes HTTP, deletes own accounts, removes role grants/role, restores pooloptions, releases ownerclient and ends pool. Actual outcome/cleanup awaited in next isolatedCI,34 unique files/35phaseinvocations. Role is modeled from historical observation, not live staging role; staff/credential endpoints and complete grantleastprivilege remain openFA-I-007. No new vulnerability ID and no change to app or actual grants.

## SEQ-22 — restricted HTTP session defense verified; deployment/recovery boundaries

[Sourcefccd677a](https://github.com/nora953/fawri-production-source/commit/fccd677a1798470b3dba70e20ccbc37662177ceb), [run38176766705](https://github.com/nora953/fawri-production-source/actions/runs/38176766705), job114580690925:34 unique files/35invocations, **131PASS/14FAIL/0SKIP**; six28-migration chains/owned cleanupSUCCESS. New restricted HTTP suite5PASS (four subtests+parent). Actual applicationrolefawri_audit_sensitive_http is nonowner/NOSUPERUSER/NOBYPASSRLS; fourDMLprivileges on accounts/account_sessions/merchants/merchant_cashier_staff/cashier_station_credentials proven and allfive actualRLSflagsfalse. Own-only session list/tokenredaction/no-storePASS; no-cookie/tampered/wrong-device401PASS; crossmerchantrevoke404/ownrevoke200PASS; foreignOrigin403/no mutation and ownlogout-all preservingothermerchantPASS. This partially addressesFA-I-007 with modeled broadgrants, not actualhostedgrants/staff/credential endpoints or total leastprivilege certification. No newvulnerability.

R13source review/drill proposal saved in DEPLOYMENT_RECOVERY_REVIEW_2026-10-11.md. Clean-deployment gate is isolatedHTTP, container contract runs shellfile/default checks rather thanserverstartup, DockerfileNode22 differs fromNode24testedjourney; hostedauto-deploy/mount/roles notqueried. Catalog/supportfilesystemroots and priorreleasefreeze statements do not close existingstorage/PITR/currentfindings. No duplicate externaldependency IDs and no hostedmutation.

Prepared fixednode22-http isolated selection with sameguard/migrations/assertions; explicitruntime/auditBatch summaries, seventhfreshcluster,34unique/36phase-runtimeinvocations. Repetition technically justified by runtimeversiondelta; syntax/shell/YAMLPASS, actualNode22HTTPproofpending. This remainsNODE_ENVtest, not packagedimage/stagingproductiongate proof. Proposed role/media/rollback/recoverydrill requires approvedsyntheticenvironment and explicit hostedmutation approval for redeploy; RPO/RTO/retention undecided, not invented.

## SEQ-23 — Node22 HTTP compatibility verified; external checkout rollback proof prepared

[Source83999ff1](https://github.com/nora953/fawri-production-source/commit/83999ff1ff1986ce5284142f089b1c459abab2e9), [run38177206914](https://github.com/nora953/fawri-production-source/actions/runs/38177206914), job114581998702:34unique files/36phase-runtimeinvocations, **132PASS/14FAIL/0SKIP**; sevenfresh28-migration chains/cleanupSUCCESS. Existing HTTPassertionsPASS onactualNodev22.23.3 andv24.21.0 (runtime/auditBatch logged). Repetition reason is DockerfileNode22 versus previously testedNode24. This closes boundedcompiledAPI/testmode compatibility only; actualpackagedimage/stagingproductionstartup remainsunproved. Restricted session5PASS andfullschema recovery remainPASS. Tenfunctional/fourparent failures unchanged.

Prepared guarded billing-external-checkout-rollback-postgres.integration.test.mjs for existing013/015, **DB_NOT_RUN**. Each SaaS/cashier synthetic fixture creates a sandbox-shaped payment through injectedfetch, observes an open INSERTtransaction via pg_stat_activity, then triggers SQLP0001 on referenceattachment; mustinspect durableorderstate. Removesfault, verifies signed status-confirmed orphan webhook through injectedfetchImpl, then retries identicalbusinesskey and comparesproviderrequest/orderidentity. Statusmockcall countasserted, preventing accidentaldefaultfetch from producing falsegreen. RSAkeys are generated transiently; onlyfake credentials, no liveprovidercall. Two nestedcontracts perkind separate identityretention and orphanpaymentacknowledgment; actualoutcome awaited.

Earlyaggregateteardown removesfixturetriggers/functions/accounts/pool. Local noattestation invocationexit1beforeDB/providerimports, syntax/diffPASS. Next35unique files/37phase-runtimeinvocations. Interpretfailureas modeled reliability evidence, neverreal duplicatecharge/loss. Updateexisting013/015 rather thancreate duplicateissue IDs; external latency/actualCOMMITfailure/liveproviderretrycontract still separateproof.


## 2026-10-12 — executed external checkout SQL rollback and orphan payment (new proof for existing 013/015)

Evidence: [audit run 38180374172](https://github.com/nora953/fawri-production-source/actions/runs/38180374172), job 114591512528; source test `artifacts/api-server/tests/billing-external-checkout-rollback-postgres.integration.test.mjs`. Disposable PostgreSQL, synthetic merchant accounts, injected fake provider POST and signed status GET; **no real payment or hosted DB mutation**. Both SaaS and cashier produced the same recorded structured outcome: `firstOrderRows=0`, `fakeProviderCreations=2`, `requestIdReused=false`, `orderIdReused=false`, `retryOrderExists=true`, `openTransactionAtProviderCall=true`, and `orphanWebhook={status:"ignored",reason:"order_not_found"}`. Assertions for identity durability/reuse and durable orphan processing failed. SQL P0001 was injected after fake external creation on provider reference attachment; rollback removed the first order, then same-key retry generated a new provider request/order identity. A signed, status-confirmed first-payment webhook was ignored because the order was missing.

**BILLING-EXTERNAL-TX-013 — CONFIRMED_SYNTHETIC_EXTERNAL_SIDE_EFFECT_GAP (SaaS + cashier).** Preserve provider-side request identity durably before network side effect, or implement safe recovery/lookup and deterministic same-key retry. Acceptance: no second external payment request after SQL failure; verified first provider payment remains discoverable and reconcilable; test concurrency, retries and crash/COMMIT boundaries.

**BILLING-WEBHOOK-ORPHAN-015 — CONFIRMED_SYNTHETIC_ORPHAN_ACK_GAP (SaaS + cashier).** Verified orphan webhook currently returns ignored/order_not_found rather than persisting recoverable work or issuing retryable failure. Acceptance: durable orphan reconciliation or retryable response, with signature/status validation and idempotent replay; no false paid entitlement. Actual provider settlement, production retry contract and real charges remain UNPROVEN.

These are additional proofs for existing canonical IDs, not newly numbered defects. Keep ten earlier functional/four parent failure counts separate; this new suite adds its own failed assertions/parents and must not be merged into the earlier SEQ-23 totals. Meta injected-provider, full-schema restore, Node22 HTTP and owned cleanup steps succeeded in this run; quality/security workflows succeeded, isolated PostgreSQL and isolated cashier workflows failed. Release remains BLOCKED.

## SEQ-29 — source-level root cause for existing 013/015 (2026-10-12)

Correlated actual CI run 38180374172 (132P/21F/0S) with source in the audited branch. `artifacts/api-server/src/services/saasBillingAuthority.ts` lines 509-510 open the SQL transaction; lines 609-626 insert pending order, lines 628-639 invoke `createSuperQiSandboxPayment` **before transaction commit**, and lines 640-653 attach the provider reference inside that transaction. `artifacts/api-server/src/services/cashierBillingAuthority.ts` lines 489-490 open merchant operational transaction, lines 610-637 insert pending order, lines 639-650 invoke the external provider **before commit**, and lines 651-664 attach the reference inside the transaction. An injected SQL P0001 on attachment rolls back the local order but cannot roll back the fake external payment; same-key retry creates another fake payment and the signed orphan event is ignored. This is the source-level explanation of existing BILLING-EXTERNAL-TX-013 and BILLING-WEBHOOK-ORPHAN-015, not a separate defect ID. No app code modified.

Remediation design constraint for approved engineering work: avoid remote payment creation inside an uncommitted SQL transaction; first durably reserve a stable checkout/provider request identity, then call provider with safe idempotency and reconcile outcome after network failures; record/retry verified orphan payment events without granting an unverified entitlement. Test process crash, SQL attachment failure, concurrent same-key retries, duplicate webhook, provider timeout and sandbox settlement. Provider-side idempotency guarantees must be verified rather than assumed.

## SEQ-30 — retry identity loss traced (2026-10-12)

Additional source inspection: `saasBillingAuthority.ts:595-605` and `cashierBillingAuthority.ts:596-605` independently create a fresh `orderId` and `providerRequestId` using `crypto.randomUUID()` **inside** the transaction callback, then insert that identity only into the uncommitted order/metadata. A SQL rollback after the provider call loses those generated identifiers; a subsequent invocation with the same merchant/idempotency key regenerates different IDs. The existing duplicate-order lookup at SaaS lines 518-522 / cashier lines 498-505 cannot recover a row rolled back before commit. This is a second source-level causal link for canonical BILLING-EXTERNAL-TX-013 / BILLING-WEBHOOK-ORPHAN-015, consistent with the synthetic CI observation `requestIdReused=false`, `orderIdReused=false`, `fakeProviderCreations=2`. No actual provider idempotency semantics or real duplicate charge established.

Acceptance refinement: persistent same-business-key identity must survive DB attachment errors and process restart; checkout provider request identity must be stable across retries and independently reconciled against provider outcome. Avoid solving solely by catching 23505 or moving UUID generation outside the callback: neither alone durably records an external side effect. Add a test asserting stable IDs and exactly one fake external creation after fault/retry for both SaaS/cashier, then a provider sandbox contract test when authorized. This is source review, not a new test execution or code fix.

## SEQ-31 — SaaS SQL transaction lifecycle verified (2026-10-12)

Read the actual transaction helper in `artifacts/api-server/src/services/saasBillingAuthority.ts:171-184`: it issues `BEGIN` at 175, awaits its callback, issues `COMMIT` at 177 only after callback completion, and attempts `ROLLBACK` at 180 on callback errors. Checkout callback starts at line 509 and awaits external `createSuperQiSandboxPayment` at 632 before returning at 659-668. Thus the external call is definitively made while the local transaction is uncommitted; provider success followed by SQL attachment error enters rollback. This confirms the transaction-boundary mechanism for existing BILLING-EXTERNAL-TX-013 and BILLING-WEBHOOK-ORPHAN-015, beyond test-only inference. Cashier checkout similarly calls provider within `withMerchantOperationalTransaction` callback (489, 643); its wrapper internals were not separately inspected in this step. This does not prove real provider settlement or duplicate charging.

Engineering handoff: approved repair should separate durable order reservation and remote side effect with stable provider request identity, then persist attachment/reconciliation with replay-safe webhooks. Preserve atomic merchant entitlement changes and do not prematurely mark payment paid. Re-run fault-injection and concurrency regressions for SaaS and cashier; check provider sandbox idempotency separately. No source mutation or test run in SEQ-31.

## SEQ-32 — cashier transaction wrapper verified (2026-10-12)

Inspected `artifacts/api-server/src/services/operationalPostgresAuthority.ts:68-84`: `withOperationalTransaction` executes BEGIN at 74, awaits callback at 75, COMMIT at 76, and ROLLBACK on error at 79. `withMerchantOperationalTransaction` at 86-105 delegates to that helper and sets transaction-local `fawri.tenant_id` at 99-102. `cashierBillingAuthority.ts:489` invokes that merchant wrapper, creates pending order at 608-637, calls external `createSuperQiSandboxPayment` at 643-650, and only then attaches provider reference at 651-664. Therefore cashier checkout, like SaaS, performs external provider side effect **before SQL COMMIT**; rollback cannot undo it. This resolves the wrapper-inspection caveat from SEQ-31. Tenant setting itself is not the root cause and must be retained when restructuring transactions.

Confirmed code-level scope of canonical BILLING-EXTERNAL-TX-013 / BILLING-WEBHOOK-ORPHAN-015 now covers BOTH checkout transaction wrappers. Preserve tenant-scoped DB access and order authorization in any future repair; separately durable checkout identity, remote request and webhook reconciliation. Existing synthetic test run 38180374172 provides behavior evidence; SEQ-32 is source review only, not new test or live provider settlement. No application source edits.


## SEQ-109–113 — actual sync caller, replay and recovery audit (2026-10-12)

Baseline: audit head `23563ffba019a666e3d2f61f29769723d56b7e03`, main `d38d29229bed0f9575a98e7026e7819fe363bfd4`. Full local checkout search replaces the earlier failed GitHub search; production integration is present. Reopened runtime scope is justified because SEQ-107/108 established only envelope declarations. No application code was changed.

| ID | Phase / classification / severity | Evidence and reproduction | Release consequence / proposal / acceptance / state |
| --- | --- | --- | --- |
| CASHIER-SYNC-SEQUENCE-001 | SEQ-111 / PROOF_GAP with mocked behavior reproduced / HIGH recovery priority | `artifacts/api-server/src/services/cashierHistoricalOperationAuthority.ts:295-317,380-399`: reject sequence <= latest, but accept higher sequence with gaps. Real function bodies under in-memory query adapter: accept1, accept3, reject2 with CASHIER_OPERATION_SEQUENCE_CONFLICT. Test `runtime observation: sequence gap accepted; later missing operation cannot backfill` in `scripts/fawri-sync-audit.test.mjs`. | Cannot certify late missing-operation recovery or gap detection. Gaps can represent intentionally non-uploaded local inventory adjustments, so do not blindly demand contiguous sequences. Define explicit commerce gap/tombstone contract, durable missing-operation recovery and bounded reordering; preserve unique merchant/device sequence and replay protections. Required disposable PostgreSQL proof:1→3→2, initial sequence>1, skipped non-commerce operation, concurrent requests, rollback, exact replay and altered replay. OPEN; no SQL/device incident reproduced and no fix made. |
| CASHIER-SYNC-SHIFT-001 | SEQ-110/112 / PROOF_GAP with client rejection reproduced / HIGH recovery priority | `artifacts/fawri/src/lib/cashierOperatorCloudSync.ts:783-803` compares pending binding to current merchant/station/staff/shift/device; mismatched shift rejects before fetch. Runtime adapter proves same staff/device/station with previous shift leaves outbox intact, uploads0. Server historical resolution exists at `cashierOperatorCommerceAuthority.ts:200-255,489-550`. | Recovery after expired/admin-closed session or switching operator not established; first rejected group aborts remaining upload. Important mitigation: normal `cashierOperatorSessionRuntime.ts:647-658` logout forbids closing shift with pending envelopes. Thus no claim that ordinary logout strands data. Propose explicit authorized historical-upload recovery preserving original attribution, or enforce/recover session transition with pending operations. Never rewrite bindings to the new operator. Required real-browser + disposable HTTP tests: expiry, admin closure, PIN/session restoration, staff change, old-shift sale/return/void, attribution-fault retry and cross-tenant denial. OPEN; product defect status awaits feasible lifecycle reproduction. |
| CASHIER-OFFLINE-001 (existing) | SEQ-113 / existing SECURITY_DESIGN_DECISION, bounded runtime observation / HIGH integrity priority | `cashierOfflineEntitlementAuthority.ts:111-141` validates structural fields and grace>billing end, without signature. Actual `validAuthority` accepts a structurally valid record whose grace_until is edited to2036. Actual clock helper rejects >120000ms rollback and preserves durable last_estimated_server_time_ms after restart model. | This proves structural acceptance, not full POS authorization bypass or tamper-resistant licensing. Preserve existing ID. Server-signed certificate, device/merchant binding, trusted time/reconnect and threat model need explicit design approval. Test altered expiry/version/seat/identity/signature, exact7day boundary, offline restart/clock changes and real browser storage before closure. OPEN; unchanged application. |

**Existing mitigations now bounded-runtime verified (not issue closure):**
- Server sale replay compares normalized request_hash, operation/device/sequence/location before inventory (`postgresCashierSyncAuthority.ts:1291-1320`). Actual function plus mocked DB: identical sale replay has0 inventory mutation; changed note and coherent changed quantity/totals reject409; cross-tenant mismatch rejects before transaction. This does not close earlier local IndexedDB replay-content concerns.
- Actual operator uploader checks complete ACK fields/entities before local deletion (`cashierOperatorCloudSync.ts:676-738,805-818`). Six invalid ACK variants and network ambiguity retain pending operation; accepted first operation remains deleted when second rejects; complete replay ACK deletes once. Actual IndexedDB durability, power-loss between response and deletion and real HTTP remain untested here.
- Cross-device stock uses product/variant/location row locks and current-version guarded updates (`postgresCashierSyncAuthority.ts:762-817,890-972`) within tenant transaction; device advisory lock at1254-1257 protects same-device operations. No new simultaneous multi-device execution performed. Reversed multi-item order/deadlock recovery, last-stock competition, sale-vs-return and compensation replay require disposable DB tests; do not infer correctness from locks alone.

**Prior observations retained without duplicate IDs or repeated testing:** local sale/compensation changed-payload replay (SEQ-93/94 and preceding PR notes), cached closed IndexedDB connection after versionchange (SEQ-99/100). Both remain source-confirmed observations needing actual browser proof. Existing current CI historical/compensation service tests pass; they do not cover these local browser scenarios.

**Test interpretation:**27/27 new audit observations/controls PASS,0FAIL/0SKIP on Node24.19.0;18/18 existing source-contract assertions PASS. The observation tests deliberately assert current problematic behavior; green means reproducible evidence, not repaired product. Imports are replaced by inert mocks before executing stripped committed function bodies. No DB or provider imports/network, no native IndexedDB, no browser proof. Playwright launch refused because bundled Chromium executable is absent: ENVIRONMENT_BLOCKED, not an application test failure.


## SEQ-114a / SEQ-115 — new execution classifications

CASHIER-SYNC-SEQUENCE-001 now has actual disposable PostgreSQL observation: run38194961047/job114635479479 on d0be9ea3; accept1→3, reject2. State remains OPEN / PROOF_GAP until intended skip/backfill contract and safe recovery accepted. Multi-device suite did not prove stock correctness: loser rejected DEVICE_AUTHORITY_REQUIRED before contention; timestamp fixture corrected with both-device historical preflight, runtime CI_PENDING.

**TEST-RECOVERY-TAMPER-001 — TEST_FIXTURE_DEFECT / corrected, integration verification pending.** Existing `merchant-password-recovery-postgres.integration.test.ts:238-245` changed final Base64url tag char, producing same decoded tag bytes when original endsA. First run password proof0PASS/1FAIL, HTTP200 vs401. Actual codec local test proves alias acceptance and rejects64provably changed tags; no cryptographic bypass established. Test-only correction changes first tag char and asserts decoded-byte inequality. User authorized safe tests; application codec unchanged. Required closure: corrected disposable HTTP tamper/replay/concurrent-reset testPASS plus cleanup. Local harness29PASS; actual updated SQL/HTTPCI_PENDING.

**CASHIER-SYNC-SHIFT-001 scope refinement (SEQ115 source):** login reuses an open same-staff shift (staffAuthority1547-1606); expired local session parsing alone does not demonstrate data stranding. Normallogout/pairing blockpending operations; disabling/revokingstaff orstation closes shift580-617,831-840. Currentoperator authentication still needed even on historical-sync routes. Test actualdisable/re-enable/adminclose with pending originalbinding before declaring a defect. No normallogout/sessionexpiry-only defect or issueclosure claimed.


## SEQ-114 real service proof verified; recovery fixture follow-up

Sourcebc8ca369, run38195395321/job114636790344:134PASS/22FAIL/0SKIP. New multi-device suite3PASS: four last-stock races, concurrent replay/no duplicate mutation, altered-note conflict, loser rollback/retry and SQLgap observation. Exact boundaries and evidence inEXECUTION_RESULTS. Extra recovery failure was duplicatefirst variable introduced in test correction; renamedtagFirstCharacter, full-file transformed syntaxPASS, actualHTTPretestawaited. Existing21product failuremarkers remain. ReleaseBLOCKED; no applicationchange. Exactresume: inspect newcommitrecovery/runcounts/cleanup before feasibleclosedshift/browserproof. WORK_HANDOFF andISSUES preserveopen scope; local29runtime/18sourcePASS, no browsercertification.


## Final SEQ-114/115 adjudication

Source0d5b9ef8, run38195697724/job114637714590:135PASS/21FAIL/0SKIP. **TEST-RECOVERY-TAMPER-001 CLOSED / VERIFIED_TEST_FIX**: actual corrected disposable HTTP recovery suite1PASS, including byte-changing tamper rejection/replay/concurrent reset/session revocation; no application crypto fix or bypass found. Earlier duplicate-variable transform error was a test-only agent error, corrected and verified.

**CASHIER-SYNC-SEQUENCE-001 remains OPEN / PROOF_GAP** with actual SQL1→3→2 observation. Final-stock concurrency/replay subset now VERIFIED_ISOLATED_SERVICE_PASS (new suite3PASS over four races), not blanket sync correctness. **CASHIER-SYNC-SHIFT-001 remains OPEN / PROOF_GAP**, narrowed by normal logout/pairing/open-shift reuse safeguards; feasible closure recovery not executed. **CASHIER-OFFLINE-001 remains OPEN**; no signed licensing/browser certification.

Existing application findings FA-I-006 / BILLING-IDEMPOTENCY-012 / BILLING-EXTERNAL-TX-013 / BILLING-WEBHOOK-ORPHAN-015 / REPLY-RESTORE-CYCLE-018 / BILLING-LATE-EXPIRED-027 / BILLING-PAID-REPLAY-028 / BILLING-SQL-RECONCILIATION-032 remain unresolved. No new duplicate issue IDs. Twenty-one failed markers represent fourteen functional failures and seven parents. Closing these requires approved application repair and targeted regression, not further repeated source review.


### CASHIER-SYNC-SHIFT-001 — SEQ116 prepared proof

Guarded real HTTP recovery test saved, executionPENDING. Covers disable/re-enable administrative service closure (staffAuthority713–843), current-token middleware vs historical original attribution (cashierStaffSession134–183,commerceAuthority200–255/489–519), exact replay and no extra stock/order. Client binding checkcashierOperatorCloudSync783–803 remains independently reproduced; server success alone cannot close client recovery finding. No ordinary logout/expiry-only defect claimed. Local syntaxPASS/guard refusalPASS; no local SQL/browser assertion executed. Audit-only user directive: complete remaining coverage before preparing consolidated repair plan or changing application.


**SEQ116 first-run test classification:** source8d3f4888, cashier38197881066/job114644536563, new HTTPsuite0PASS/1FAIL. Historical-saleHTTP200/originalattribution/HTTP200replay precede failingassertion156; nonexistent`duplicate` instead of actual`replayed` field is fixture error. Correctedfixture awaits end-state proof; do not call recovery finding closed. Client mismatch stillOPEN.

**SEQ117 preparation:** native Chrome tests preserve priorSEQ93/94 changed-payload replay andSEQ99/100 cached-handle observations without duplicate IDs. Actual browserNOT_RUN; assertions and limits in register. Browser-storage source scanner is not a native IndexedDB test.


## Current SEQ-116–119 findings and classifications

| Finding | Evidence / classification | Impact / acceptance / status |
| --- | --- | --- |
| CASHIER-SYNC-SHIFT-001 (existing) | SEQ116 actualSQL/HTTP1PASS onb68d24e9,run38198172739/job114645417825; disable/re-enable administrative service createsnewshift; historicalsale andexactreplay preserveoriginal attribution. ClientcashierOperatorCloudSync783–803 and mocked prior-shift rejection remain. Loginruntime468–571 accepts/restoresnewcontext without pendingtransitionguard. | ServerboundedrecoveryVERIFIED_PASS; client recoveryOPEN/HIGH. Feasibleclosure nowproven, butfullbrowserlogin/outboxflow stillNOT_RUN. Do notrewriteoldbindings. Required: realclient recovery afteradministrativeclosure, crossstaff/tenant/currentpermission andhistoricalreturn/void, attributionfaultretry. Normal logout/pairing safeguardsunchanged. |
| SEQ93/94 local changed-payload replay (existing observation, indexed here without duplicate finding) | SEQ117nativeChrome154,run38198172776/job114645417274: sameoperationID/quantity1→2 acceptedreturnsoldsalequantity1. cashierIndexedDbAuthority573–635 replay bypassescomparison. Harness1functionalFAIL; finalstock controls andpending persistencePASS. | CONFIRMED_NATIVE_BROWSER_DEFECT/OPEN,HIGH operationintegritypriority. No doublededuction orfinancialloss demonstrated. Acceptance: exactreplay succeedsunchanged; changedvaliditem/quantity/payment/discount/note rejectsconflict beforemutation; simultaneoussamekey behavior remainsdeterministic. No repairperformed. |
| SEQ99/100 versionchange cached-handle (existing observation) | Nativeupgrade2→3 closesauthority handles; existing objectreadInvalidStateError; pendingrecords2survive; newoldv2authorityVersionError. cashierIndexedDbAuthority211–242,391–426 cachesresolvedDBpromise andonlyclosesonversionchange. | Nativeclosure/data-preservation observed; compatibleapp lifecycle/restart recoveryOPEN. OldschemaVersionError iscorrectfailclosedbehavior, not evidence thatsamev2client shoulddowngradev3. No datalossclaimed; requiredcompatibleupdatedapprefresh/blockedupgrade/inflighttransaction/browserrestart assertions. |
| REPORT-EXPORT-CURRENCY-001 (new) | SEQ118CONFIRMED_FUNCTION_RUNTIME_DEFECT/OPEN,MEDIUM reportsaccuracy. ReportsPage.tsx959–987 storesrawnet_revenue_minor thenexportsrow.cashier/online/sum withoutfractionmetadata; UI826–829/1072–1078 usesmoneyUi65–83 scaling. ActualexportclosureUSD12345vsdisplay123.45,KWD-1050vsdisplay-1.050; scripts/fawri-report-export-audit.test.mjs4PASS/2FAIL. | Foreigncurrency combinedExcel export is100×/1000× differentlyscaled fromUI; IQDdigits0 controlPASS. No corruptionofserveraccounting/paymentdemonstrated. Release impact: unclosedmulticurrencyreportacceptance, notclaimthatIQD-onlyexportfails. Requiredfuturefixacceptance: display/exportsameunits, explicitminor-unitcontract ifneeded, positive/negative/zero fractions0/2/3, separators/AR/EN/KU, actualXLSXopen/render andPDFcomparison. Consolidatedrepairplan deferreduntilauditcomplete. |

SEQ116 fixtureduplicate→replayed assertionCLOSED by actualHTTPPASS. Existing8productfinding21failmarkers remainOPEN andseparate fromnative1FAIL/report2FAIL evidenceclasses. No functionalapplicationfix. Coverageinventory lists37routesNOT_RUN withoutimplyingroleauthorization orallnestedmodals coverage.


## SEQ-120 bounded adjacent cashier export follow-up (2026-10-12)

Extended existing REPORT-EXPORT-CURRENCY-001 to actual centralcashierdownloadclosure. `CashierCentralReportsPage.tsx533–590,617–630` exportsrawminor net/profit/refund/average/product/operationamount under ordinary value/amount labels; liveview`formatReportMoneyMinor`169–177/235–236 scalesbycurrencydigits. NewcapturedcentralUSDsummary12345vs123.45FAIL; IQDsummaryandlimited-operationnoticePASS. Topproduct/operation scaling is SOURCE_REVIEW_ONLY, not separately executed. No duplicateissue.

Final`node --test scripts/fawri-report-export-audit.test.mjs` onNode24.19.0: **5PASS/3FAIL/0SKIP**,8tests. Threefailures=onecurrency-scale finding. InitialSEQ118six-test4/2 result is historical and superseded by this expanded sameharness8-test5/3 result; no homogeneousaddition toSQL136/21 ornative3/1. RealZIPgeneration/XLSXofficeopen,PDFpagination andvisual comparison remainNOT_RUN. Noapplicationchange.

**Current definitive continuation:**SEQ116–120 bounded workcomplete; nextSEQ121 actualworkbookZIP/consumer andPDF/range/completeness assertions, plusclosed-shiftreturn/void/currentpermission/crossstaff/tenant HTTPnegatives.37routeinventory remainsNOT_RUN forappjourneys. Sameexplicituserconstraint: completecomprehensiveaudit before consolidatedrepairplan; historicalpaymentproposalnotcurrentqueue. Allnoteddefects preserved, no repairs. Overallplanning~52%,48%remaining(40–60%uncertainty), releaseBLOCKED.


### SEQ-122 existing CASHIER-SYNC-SHIFT-001 follow-up prepared

`cashierOperatorSaleScope.ts:112–139` rejects own-staff compensation for an original sale outside the current shift, while `sale.view_all` bypasses the staff/shift comparison inside the same station/device. Routes `cashier-operator-commerce.ts:184–230` apply this check before historical compensation ingestion. Guarded actual HTTP proof prepared for both return and void; results pending. Historical pending operations vs newly initiated cross-shift actions need separate acceptance decisions after audit. No new duplicate issue or permission-policy defect declared solely from this source review.


## SEQ-121 verified; SEQ-122 bounded HTTP verified; SEQ-123 print prepared

Executed source `75c53d2b57c45a1f120d55c0a2904be3b16cbcb9` (PR head); workbook checkout merge SHA `c77747bff61be95c911321096182b1257feab93c`. Workbook run38199810989/job114650490522 SUCCESS: actual SheetJS0.20.3 ZIP writer and reader, 4240 bytes, six package parts. Independent Python ZIP CRC/all XML/Arabic-Sorani text/RTL/merge/filter/numeric0-negative/formula-as-string assertions PASS. DOM download is inert; no Office visual/PDF or actual report totals claim. Existing currency-scale finding remains OPEN.

Cashier subset run38199811297/job114650491045: new historical compensation suite1PASS. Both valid return and void of original-shift sale receive403/CASHIER_OPERATOR_SALE_SCOPE_FORBIDDEN from same-staff sale.view_own after closure; after synthetic manager sale.view_all grant and fresh login, HTTP200, complete ACK, original shift/session attribution, exact replay/no second inventory increment and stock1 PASS. This confirms documented own-shift scope and a historical recovery limitation, not unauthorized permission bypass. Current permission required for replay; broader cross-staff/tenant and missing-action-permission negatives still untested in this new suite. Owned cleanup step SUCCESS. Full aggregate must be read from isolated run38199810864 logs before recording totals.

SEQ-123 PREPARED: `scripts/fawri-report-print-audit.mjs` and minimal workflow. Extract actual online report presentation components/helpers (before useOnlineReport), compile with real React and actual translation/money modules; compile actual frontend CSS through Vite, then fresh headless Chrome renders AR/EN/Sorani synthetic report props and prints PDF. Assert nine metrics, last of eight products, nonempty first page and bounded page count through pdftotext. No HTTP/API/DB/provider imports or report data fetch; loopback CSP blocks external webfonts, so system fallback-font layout only. No full app/mobile/linguistic signoff or production font claim. Local syntax PASS; Chrome/build dependencies absent locally. Print assertions NOT_RUN pending CI.

Next inspect print and isolated aggregate logs; then report date-boundary/completeness and cross-tenant/action-permission negatives. Comprehensive audit only; no application repairs or consolidated repair plan. Planning estimate remains ~52% until the new target proof is assessed.


## SEQ-123 fixture correction; SEQ-124 calendar proof

First print run38200106257/job114651400190 on source43f64c6c: all three locale render waits timed out, so no PDF assertions executed or success claimed. Test extraction removed original Recharts imports but components use PieChart/ResponsiveContainer/Cell. Test-only entry corrected to import actual Recharts, with retained browser error diagnostics and actual SVG readiness assertion. This is an identified harness dependency omission, not an established application defect. Actual print rerun pending. No chart stubs or application edits.

SEQ-124: `node --test scripts/fawri-report-calendar-audit.test.mjs`, Node24.19.0,6PASS/0FAIL/0SKIP. Executes actual ReportToolbar date-query bodies in child processes with explicit TZ: Baghdad leap day/exclusive end, New York23h spring and25h autumn days,7-day preset includes today+6previous dates across DST, year-end advancement, all-time unrestricted. No React/browser/API or database execution; existing local-sale range tests are not repeated. Confirms local-browser timezone contract only, not merchant-timezone normalization or malformed-date validation.

Read completed isolated run38199810864/job114650489926: **137PASS/21FAIL/0SKIP,38unique files/40invocations**; new historical return/void suite1PASS. Existing14functional/7parent failure markers unchanged. Workbook producer/parser PASS previously saved; currency-scale finding remains OPEN. Next inspect corrected real-component print logs before further coverage or final status.


## SEQ-123 cleanup classification; SEQ-125 HTTP negative proof prepared

Print rerun38200387912/job114652264539 on f303575d reached browser execution after restoring real chart imports but did not emit evidence: removal of the temporary Chrome profile failed ENOTEMPTY while a Chrome descendant was still writing. No PDF pass/fail inferred from the lost summary. Test-only lifecycle corrected to own a detached process group, terminate all its descendants and retry bounded profile removal; cleanup failure remains visible in the final result and cannot produce green. Actual render/PDF assertions must be reread from a completed rerun. This is a test-resource cleanup failure, not an established app defect.

SEQ-125 PREPARED: extend existing guarded historical compensation HTTP fixture for each return/void with an actual second licensed tenant/manager denied403; remove current action permissions through staff service and fresh login then replay denied403; administrative closure plus a distinct same-tenant cashier with action+view_own denied403. Require no order in other tenant, unchanged original attribution count2 and restored stock1. This adds real boundary assertions missing from prior mocked tests, so rerun is justified. Local syntax PASS; SQL/HTTP pending CI. No hosted grants/DB or business behavior changed.

No change to verified SQL137/21, workbook package PASS, local calendar6PASS, prior native3/1 and export-input5/3 evidence. Do not count repeated unchanged assertions as progress. Next inspect corrected print and new denial logs, then finish bounded report completeness/source budget coverage. Audit first; repairs and consolidated plan deferred.


## SEQ-125 bounded HTTP verified; SEQ-126 completeness proof; print root correction

Source744372b4, cashier subset38200568005/job114652821787: new HTTP suite1PASS. For both historical return and void, actual second licensed tenant403, current action permission removed/fresh login403, distinct same-tenant staff view_own403; original stock1 and two attribution records unchanged, other tenant has0orders. Normal privileged historical recovery and replay remainPASS. Full aggregate awaits run38200567769 log reconciliation. These are actual disposable service/HTTP proofs, not hosted-role certification.

SEQ-126: `node --test scripts/fawri-report-completeness-audit.test.mjs`, Node24.19.0,4PASS/0FAIL/0SKIP. Actual function bodies with explicit inert SQL adapters: financial report requests50001 rows and rejects over50000 with413 rather than silently truncating totals; empty report explicitly0sales; activity detail500 can expose matching_count750; UI warning uses filtered matching count and does not incorrectly flag a30-of30 filtered set. No actual50000-row load, SQL window/paging, browser warning or Excel/PDF full-detail clearance. Existing source range/filter join remains separately source-only.

Third print run38200567854/job114652821367 on744372b4 emits locale failures at visible product text beforePDF generation. CSS reports-print89–125 hidesbody elements unless inside report-print-root; extracted-component fixture lacked this actual outer ReportsPage wrapper. Added existing report-print-root class to synthetic fixture DOM; applicationCSS unchanged. Prior dependencies/profile errors resolved enough to get this diagnostic. Real corrected PDF result pending; no app defect or print pass inferred.

Next inspect print/PDF first-page/text evidence and aggregateSQL result. No consolidation of repair plan/application changes; continue whole scope after this bounded report batch. Planning estimate stays~52% pending usable print evidence.


## SEQ-123 fourth result and stricter metric diagnostic; SEQ-127 query-budget source gap

Print run38200769264/job114653461100 on fa2f5968: actual-component PDFs EN and Sorani PASS, each2nonempty pages,9metrics,lastchartproduct present (EN81562bytes, firstpage1869characters; KU157941bytes, firstpage2285characters). Arabic reached PDF/text checks but failed a broad body.innerText numeric substring assertion. Actual original Arabic formatting function locally returns`٦٩٧,٩١٠ د.ع` correctly; no app defect inferred yet. Test now checks each actual revenue-card DOM text value with explicit Arabic/extended-Arabic digit normalization and requires exact697910; diagnostic emits synthetic metric strings if it fails. This is a stronger targeted value assertion, not removal of a failed numeric check. Printed numeric glyph placement is still outside text-only consumer clearance. Corrected AR assertion/PDF summary awaits CI; no all-language success claimed.

**REPORT-QUERY-BUDGET-001 / SEQ-127 / SOURCE_CONFIRMED_PROOF_GAP / OPEN MEDIUM:** `cashier-staff-operations.ts:160–177` launches finance and activity report transactions concurrently. `postgresCashierCentralReportAuthority.ts:1179–1237` caps returned affected sales50001; `postgresCashierCentralActivityAuthority.ts:281–340` computesCOUNT(*)OVER before detailLIMIT500. Neither sets an explicit statement deadline; `operationalPostgresAuthority.ts:68–105` does not add one; `lib/db/src/index.ts:20` configures only connectionString. Contrast online report`postgresOnlineOrderReportAuthority.ts:185–193` uses8second SET LOCAL statement_timeout. Row caps are not query-time budgets. Actual database/URL/global role timeout settings and observed slow-load behavior are unknown: no live unbounded query or DoS demonstrated. Launch implication: cashier reporting performance/resource-budget acceptance unverified at large tenant volume. Required proof: guarded disposable large-tenant/lock-contention test with measured bounded response, rollback/release, pagination/completeness and production-like configured timeouts. No application/config changes or repair plan.

SEQ125 actual HTTP denials already PASS in dedicated cashier subset. Some intervening full runs cancelled on new commits; do not report incomplete aggregate as137/21 proof for a new source. Authoritative aggregate remains executed75c53d2b/run38199810864/job114650489926 until a later complete run is inspected. Next read latest print and completedSQL logs; save exact final resume.


## SEQ-123 Arabic fixture charset diagnosis and correction

Fifth print run38201039466/job114654293191 (sourcee05f9701) confirms English/Sorani2-page PDF PASS but Arabic DOM monetary values contain onlycurrency labels, while Arabic integer counts are correct. Original Arabic formatter locally yields correct697910; the test HTTP fixture omitted charset on HTML/JS and omitted meta charset. This can decode raw non-ASCII regex ranges differently from escaped string literals in the esbuild bundle; `formatArabicIqd` uses rawArabic digit range to recover ASCII before grouping. Actual application `artifacts/fawri/index.html` andcashier.html explicitlydeclare UTF-8. Test-only fixture now matches that contract: HTMLmeta andHTML/JS/CSS Content-Type charset=utf-8; assert document.characterSetUTF-8 and retain exact revenue-card value check. Hypothesis must be confirmed by a successful corrected browser run; no Arabic application defect declared yet, no numeric assertion removed. Printed glyph positioning still not visually certified. Next inspect this corrected print run and completed aggregate before saving definitive handoff.


## FINAL VERIFIED SEQ-121–127 checkpoint — 2026-10-12

Executed PR head **e1320f8616b5607536c19b6527c92e8c74bf546e**; no application source changes in this continuation. This supersedes the intermediate prepared/failed-fixture notes only for the bounded assertions below.

| Stage | Evidence | Verified outcome and limits |
| --- | --- | --- |
| SEQ-121 workbook package | run38199810989/job114650490522; repeated unchanged producer run38201278452 SUCCESS | Locked SheetJS0.20.3 actual ZIP writer/reader plus independent Python CRC/XML parser PASS. Six package parts; AR/Sorani text, RTL, merge/filter,0/negative numbers and formula-as-text. DOM download inert; no Office visual or actual accounting clearance. Existing REPORT-EXPORT-CURRENCY-001 OPEN. |
| SEQ-122 historical compensation | run38201278470/job114655029862, new suite1PASS | Two independent return/void fixtures: same-staff view_own403 after original shift closure; manager view_all200 and original historical attribution, complete ACK, replay/no duplicate stock restore. This is policy/recovery evidence; own-shift historical recovery gap remains OPEN. |
| SEQ-123 actual online report print | run38201278442/job114655029719; checkout merge4a31b6150cceaec1efec5bc0ff4d3f571d807d21 | Chrome154.0.8037.97, real React/Recharts report components/helpers/translations and Vite CSS; AR/EN/Sorani **3PASS/0FAIL**. Each2nonempty pages,9metrics, exact revenue697910 in card, last of8products present in PDFtext. AR186462bytes/firstpage2359characters; EN81573/1869; KU157941/2285. Synthetic props, loopback/system fallback fonts, no full app/API/mobile or linguistic/visual signoff. |
| SEQ-124 date query | node --test scripts/fawri-report-calendar-audit.test.mjs; Node24.19.0 |6PASS/0FAIL: Baghdad leap/year-end boundaries, NewYork23h/25h DST days,7local-day preset/alltime. Actual function bodies; no HTTP/DB/browser-calendar proof. |
| SEQ-125 HTTP denials | run38201278470/job114655029862 | For return and void: real second licensed tenant403, missing current action permission403, distinct same-tenant cashier403; stock1/attributions2 unchanged and other tenant0orders. Default disposable role only, not live RLS/grants certification. |
| SEQ-126 completeness | node --test scripts/fawri-report-completeness-audit.test.mjs; Node24.19.0 |4PASS/0FAIL with inert SQL adapters:50001 financial rows cause413 rather than silent truncation; explicit0emptyreport;500activity details preserve750matchingcount; filtered30-of30 does not show false truncation warning. Actual large-data SQL/performance NOT_RUN. |
| SEQ-127 cashier query budget | ISSUES.md REPORT-QUERY-BUDGET-001 | Source-confirmed lack of explicit application deadline in two concurrent cashier report transactions. Database-level timeout settings and load behavior unknown; MEDIUM/OPEN performance proof gap, not demonstrated live DoS. |

**Final isolated SQL/HTTP aggregate:** run38201278470/job114655029862, **137PASS/21FAIL/0SKIP**,38unique files/40invocations. Existing21markers remain14functional+7parents for8existing application findings; no app defect repaired. Actual new suite and all three denial classes PASS. Owned cleanup, full-schema restore, injected Meta54, password recovery and Node22 HTTP PASS. Quality38201278432/security38201278488/schema38201278456 SUCCESS. The overall isolated and cashier workflows remain FAILURE because canonical product defects remain; green new tests do not override them.

**Print fixture failures correctly classified and resolved:** missing actual chart imports, missing original print-root wrapper, browser descendant/profile cleanup, and omitted UTF-8 declaration. Corrected harness retains actual chart/PDF/metric assertions, owns browser group and removes profile before result. Source app index.html/cashier.html already declare UTF-8. Local `node --test scripts/fawri-report-print-fixture.test.mjs`2PASS reproduces wrong decoding of raw Arabic regex (blank monetary number) and correct original UTF-8 output; corrected real browser3PASS confirms fixture diagnosis. Earlier failed runs remain history, not product defects or success. No old failed result silently overwritten.

**Open product/gate scope:** existing billing/Meta/refund defects; local changed-payload replay; unsigned offline cache/licensing and actual7day/device proof; current-shift historical outbox/own-scope recovery; foreign-currency export units; cashier query budget; actual central-cashier/receipt/mobile/PDF visual and37route role journeys; hosted grants/image/media/PITR/monitoring/rollback; real external providers and commercial signoff. All repairs and consolidated repair plan remain deferred until comprehensive audit completion.

**Definitive next SEQ-128:** bounded central-cashier report/receipt print and profit-visibility scope, separating genuine app role/PDF evidence from inert adapters. Then unverified owner/admin/merchant screen groups from the37route inventory. Reuse completed sync/compensation/workbook/date proofs; reopen only for changed code/config or a new justified assertion. No merge/deploy/live DB/secrets/real payments authorized.


### CASHIER-REPORT-PROFIT-001 — SEQ-128 candidate, runtime proof pending

Component: operator report API. Paths: `postgresCashierOperatorReportAuthority.ts:59–72,175–189`, product fields in `postgresCashierCentralReportAuthority.ts:936–1014`; actual route GET/cashier/operator/report requires reports.sales. Source candidate HIGH permission/data-confidentiality impact: currency-level redaction leaves nested profits/ranking. Guarded HTTP with known-cost positive control prepared. Not yet a confirmed HTTP incident; actual live role/provider/staging not tested. Required acceptance: withoutreports.profit no aggregate/nested profit/cost-derived confidential/ranked data in serialized response; authorized grant retains intended values; own/all-staff and merchant/station boundaries preserved. Consolidated remediation plan deferred. OPEN/PREPARED.


### CASHIER-REPORT-PROFIT-001 — SEQ-128 CONFIRMED_ISOLATED_HTTP_DEFECT / HIGH / OPEN

Source4ec5944e; run38203123023/job114660651958 and cashier38203123335/job114660652754. Real paired cashier permission reports.sales+sale.view_own, withoutreports.profit, getsHTTP200/can_view_profit:false while `report.by_currency[0].top_products[0].gross_profit_minor=500` and top_profitable_products exposes same amount and profit ranking. Currency-levelgross_profit correctlyabsent; known revenue1000/netunit1 permits inference of500cost. Explicitreports.profit grant positivecontrol passes. Two functional failures and parent are one finding, not three.

Paths `postgresCashierOperatorReportAuthority.ts:59–72,175–189`, nestedprojection `postgresCashierCentralReportAuthority.ts:936–1014`, GEToperatorreport `cashier-operator-commerce.ts:100–119`. Impact: authenticatedstaff sees commerciallyconfidentialprofit/ranking outsideexplicitgrant; no anonymous orcross-tenant disclosure established. Releaseblocker for permission/financial confidentiality acceptance. Required futureacceptance: recursive response redaction/no profit-rankedlist withoutgrant, authorizedaggregate/products retainvalues, own/allstation/tenant/cost privacy boundaries remain. Statusunrepaired; consolidatedrepairplan deferreduntilauditcomplete.


## SEQ-129 native receipt verified; SEQ-130 CSS fixture correction; SEQ-131 admin UI authority

Source262ee63e, receipt run38203617345/job114662158918 SUCCESS: Chrome154, **6PASS/0FAIL**, AR/EN/Sorani×58/80mm, each1PDFpage. Exact2400total, correct bodywidth/nohorizontaloverflow, lastitem/saleID present, reprint marker, no privatecostsentinel, no activeimage/script/iframe and injectedmarkerfalse. Original hostile labels are escaped. Physicalprinter, actualiframe/printdialog cleanup andfullPOS flow NOT_RUN. First bootstrap-script artifact resolved by replacingdocument afterload; producerunchanged.

Central report run38203617325/job114662159017 failed beforebrowser: esbuild needs an outputpath for actualReportToolbar importedcalendarCSS. Test bundle now sets logicaloutfile withwrite:false and explicitly servesJSoutput; actual stylesheet still comes from VitecompiledCSS. No app/component/CSS edits and no browser assertions counted as failures. Corrected actualreactivecentralreport/PDF/empty/error-period-recovery suite pendingnewCI.

SEQ-131 `node --test scripts/fawri-admin-ui-authority-audit.test.mjs`, Node24.19.0, **10PASS/0FAIL/0SKIP**. Actual hasAdminPermission andcontrollercapability/refreshcallback bodies with inertstate/HTTPadapters: owner allsurfaces, mandatorypasswordchange gatesall, logs-onlyassistant cannotmanageadmins/merchantdata, missingadminclosed;401/403 clearscachedowner evenpreserve option; successful serverowner→assistantdowngrade closesownercontrols;503preservesUIidentity onlyexplicittransientpreserve;initial503/malformedresponse clearsidentity andloginredirect. No Reactmount/realadminHTTP/cookies/backendpermission/15secondrefresh/browser visual clearance. The old localStorage-auth TODO atcontrollerheader is stale commentary; current authority calls server/api/auth/admin/me; do not labelit a currentbearertoken exploit. Prior source-contract authcutover tests notrerun.

Newprofitdisclosure remainsHIGH/OPEN; prioraggregate138/24 reused fromexecuted4ec5944e. Next readcorrectedcentralnativeproof andfullaggregate before finalcheckpoint; continue owner/admin/merchant scopes. Noapplicationrepair/consolidatedplan ormerge/deploy/livechanges. Planning~53% unchanged untiltargetresults assessed.


## SEQ-130 bounded first browser results; SEQ-132 pending-dialog authority

Sourcef90984cf, central native run38204031433/job114663443478:3PASS/2FAIL. Actual ENcentral report4nonemptyPDFpages,6summarymetrics,30operationrows, limitednotice/exact697910net/lastproduct PASS. Real empty state removes stale report;503disablesexport then real date-dialog7dayselection/apply recoversfetch andexport PASS. AR/Sorani fail at limited-notice exacttext comparison beforePDF because actualI18nProvider localizes ASCII30 toArabicdigitforms; expecteddictionarystring stillASCII30. Test now normalizes onlydigitforms onbothsides, preserving exactphrase/count30 assertion. This is an identified localized testexpectation mismatch, not a missing appwarning or permission failure. Corrected AR/KU actualcomponent PDFs pendingCI.

SEQ-132 extends same localadminharness: `node --test scripts/fawri-admin-ui-authority-audit.test.mjs`,Node24.19.0, **14PASS/0FAIL/0SKIP total**, superseding prior10test result withoutaddingthetwo runs. Actualcontroller permission-change effect bodies: losingmerchantmanagement cancels pending statusconfirmation/delete target; losingsubscriptiongrant cancels replyreset/plan/replymodals/filter; lostdata visibility closes privatedetails; retainedpermission preserveslegitimatependingactions. Inertstateadapters only, no mountedReact/nativeadmin/backendrevocation proof. No applicationcode/permission changes.

Receipt6nativePASS remains verified unchanged; profitdisclosureHIGH OPEN with actualHTTP1PASS/3FAIL. Next inspect corrected centralreportnative result andfullisolatedcounts before definitivecheckpoint. Then merchant/support/owner routes stillunverified. Wholeestimate~53% untiltarget proofreconciled; noapplicationrepair orconsolidatedfixplan.


## SEQ-130 central component workflow SUCCESS; SEQ-133 receipt lifecycle prepared

Corrected central native run38204282300 completedSUCCESS on sourced6f6b4a0. Preserve exact job/metrics afterlogread. Realreportcomponent/toolbar/I18nProvider +syntheticAPI5cases passed: AR/EN/Sorani report print andlocalizedpartialnotice, empty(no stale report),503exportdisabled→actual date-dialogrange/apply recovery/exportenabled. Normalizingonlydigitforms retains exactnotice/count contract; no appfield/textfix. FrontendAPIfixture isnot ownerbackend/auth/financial proof.

SEQ-133 PREPARED expands actualreceiptbrowserharness from6 to8cases: actual printCashierReceipt/nativeiframe srcdoc load, withexplicitinertprint method at the physicalprintboundary; explicitlydispatchafterprint thenframe0; fault-injectedprint method throws andactualhelpercatchmustremoveframe0 andpreserveerror. Assertiframe receiptretainslastitem/noprivatecostsentinel. Original6native thermalwidth/PDFcases retained. This is actualDOM/load/helper orchestration plus controlledprint/eventadapter, not realhardware/printdialog event proof. Local syntaxPASS; two new assertionsNOT_RUN pendingCI. Possible fallbacktimer behavior afterexception remainsseparate fromframe-removalproof.

CASHIER-REPORT-PROFIT-001 HIGH remainsconfirmed/unrepaired; aggregate138PASS/24FAIL includes16functional+8parents for9canonicalfindings. Existingreportsource/query/offline/provider/hosted/role/visualgates remainopen. Localadminauthority14PASS separate. Next inspect8receipt/central logs andcompletedSQL; then save definitivehandoff forremaining owner/admin/merchant scope. Noapplicationrepair orconsolidatedplan beforeauditcompletion.

## SEQ-215–224 evidence delta and deduplicated issue index

| Canonical ID | Classification | New evidence / boundary | State |
| --- | --- | --- | --- |
| BILLING-WEBHOOK-ORPHAN-015 (SUPERQI-ORDER-NOT-FOUND-ACK-001 alias) | Existing payment recovery finding | Actual service+route bodies with inert SQL/provider/signature adapters: confirmed missing order produces200/ignored and no durable write; acceptance fails.5adjacent deny/error controls pass. No real settlement or gateway retry claim. | OPEN; no duplicate created |
| WORK-MONITOR-STALE-001 | Existing private-data UI lifetime finding | Actual load callback with inert state/fetch: silent401/403/503 retains data and no error;3acceptance failures, initial error/retry control passes. Not mounted React/parent revalidation/actions or fresh backend bypass. | OPEN; new bounded runtime evidence |
| OPS-WORKER-DRAIN-001 | NEW operational PROOF_GAP / MEDIUM / TRIAGE | `src/index.ts:132–156` invokes synchronous worker.stop(), runtime.dispose(), server.close callback exit0. `durableJobQueue.ts:695–698` only disables polling; already running handler not awaited. `merchantPhysicalMediaCleanup.ts:482–485` same stop behavior. Actual shutdown body adapter demonstrates HTTP close can exit without worker completion notification;4shutdown controls pass. No actual job loss or provider duplicate demonstrated; lease/recovery mechanisms exist and need testing. | OPEN proof; owned child-process paused-handler SIGTERM + restart/lease/idempotency test needed |

Catalog/history unsafe/unselected test queue maps to historical DB_TEST_ENTRYPOINT_INVENTORY and PG-TEST-GUARD-002/003; not a newly proven product bug. Literal selection uncertainty is not evidence of nonexecution. No prior application finding closed or repaired.

## SEQ-225–231 new findings and deduplication

| ID | Severity / state | Evidence and limits |
| --- | --- | --- |
| CASHIER-DISCOUNT-PRECISION-001 | LOW / OPEN / FUNCTION_RUNTIME_CONFIRMED | Actual percentage floor at total9007199254740990,3333bps returns3002099511605172 vs BigInt3002099511605171; within-policy accepts extra1.2P/2F independent harness. Ordinary amounts controlsPASS; authenticated approval/SQL/sale reachability NOT_RUN. Source route passes base, authority validates safe integer; no ordinary financial loss claim. |
| AUDIT-STALE-SOURCE-CONTRACT-001 | LOW / OPEN / TEST_MAINTENANCE | Five failed text/regex assertions in manual discount, tenant catalog, clean deploy wrapper, Meta memory and readiness doc. Each exact divergence in SEQ-225–231 report;9actual discount runtimePASS. No application defect inferred from stale contracts; test repairs deferred. |

Residual13 integration entrypoints map to PG-TEST-GUARD-002/003 and DB-TEST-CLEANUP-021. No direct or transitive DB execution performed. No old issue closed.

## SEQ-232–239 deduplicated evidence

OPS-WORKER-DRAIN-001 MEDIUM/OPEN: realSIGTERM/realprocess.exit/realHTTPclose/localdurableFS unfinished claim confirmed; local restart uncertain blockeddeadletter/knownreconcilecomplete/reconciliationfaultblocked allPASS, no data disappearance. Actual requiredPostgres worker callback adapters show stop disables future polling but current handler continues; deployedSQL/provider proof still pending. Do not claim production job/payment loss.

WORK-MONITOR-STALE-001 OPEN: lateoldadmin response overwrites newadmin data; lateoldsuccess clears newer403error; pending revoke-session callback still attempts POST after visible/silent403.8callbacktests4P/4F; not mountedReact/backend bypass. Server route still requires secure session/owner/password. No duplicates.

Receipt run38348021288/job115133820484 ENVIRONMENT_BLOCKED before any assertions (browsernull/results[]/prerequisite timeout); prior native receipt PASS retained. Wholepercent NOT_YET_MEASURABLE.

## SEQ-240–247 evidence / no new duplicates

26pre-import negativecontrolsPASS for13residualtests through explicit existingpreload; native direct-entrypoint safety and CI wiring remain PG-TEST-GUARD-002/003/DB-TEST-CLEANUP-021 open. OriginalSQLcasesNOT_RUN.20actualMeta refund/dispatch/live-reconcile adaptersPASS; existing REPLY-RESTORE-CYCLE-018 accounting/runtimeSQL finding unchanged. Source pending-before-send ordering examined, no realprovider/crash proof. Receipt laternative8PASS run38350269903/job115140836967; previousenvironmenttimeout preserved. No new canonical product finding or closed issue.

## SEQ-248–257 new findings

| ID | Severity/state | Actual evidence / bounds |
| --- | --- | --- |
| MEDIA-CLEANUP-CORRUPT-001 | MEDIUM/OPEN/FUNCTION_RUNTIME_CONFIRMED | Corruptpersisted hashedmanifest silentlyreadnull/reconcilemissing/batch0pending/0logs.1observationPASS/1acceptanceFAIL on realownedFS,inertSQL/storage. No realcorruption/mediaretentionincident proved. |
| MEDIA-CLEANUP-STARVATION-001 | MEDIUM/OPEN/FUNCTION_RUNTIME_CONFIRMED | Actualdefault100batch,101validmanifests;first100permanentadapterfailures monopolize2polls/200attempts,tenant101attempts0/pending.1observationPASS/1acceptanceFAIL. Boundedordering/faultmodel; no realcloudobjects removed. |

SecurityCI scannerfailure1syntheticcredentialURL in auditfixture was a toolfixture classification, no realcredential exposure. Representationonlycorrected,26refusalPASS and scanner1706/0findingsPASS locally; hostedCIpending. Adminparentextra failure browserstartup0assertionsENVIRONMENT_BLOCKED. Existingfindings retained; no duplicate newentryfor these environment/fixture occurrences.

## SEQ-258–265 new findings

| ID | Severity/state | Evidence/limits |
| --- | --- | --- |
| MEDIA-CLEANUP-CONCURRENT-UNLINK-001 | MEDIUM/OPEN/FUNCTION_RUNTIME_CONFIRMED | Twoactualwrappercalls onrealownedFS;winnerpending aftersuccess/storagefault;loserconflict catchrmSync(sharedpath) removeswinnerintent.1observationPASS/1acceptanceFAIL;SQL/storageinjected, actualproductionraceNOT_RUN. Distinct fromcorrupt/batchstarvation. |
| AUDIT-SYNTHETIC-HISTORY-GATE-001 | LOW/OPEN/CI_PROCESS_BLOCKER | run38353681095/job115151569363 currentrepositorySUCCESS/fullhistoryFAIL1credential-url historicalsyntheticfixtureblob202a9fc041cb2cde0e8169683a6eb9eb7478e130. No realsecret;currentliteralcorrection doesn'tclearhistorygate. No scannerexception/historyrewrite. |

## SEQ-266–273 new scoped findings

| ID | Severity/state | Evidence/limits |
| --- | --- | --- |
| SUPPORT-PREVIEW-SESSION-BINDING-001 | LOW/OPEN/SERVICE_CONTRACT_PROOF_GAP | Existingnonnullsessionbinding acceptedwithblankcallerID;actualvalidatoradapterobservationPASS/acceptanceFAIL. MismatchednonnullIDdenied andunboundcontrolPASS. SoleHTTPcaller passesvalidatedcontextsessionid;noactualroutebypassproved. |
| SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001 | LOW/OPEN/CONFIRMED_SQL (SEQ-288; prior adapter evidence retained) | ExpiryUPDATEended thenthrow reachesactualhelperROLLBACK;adapterstateactive. Expiredaccessdenied;separatescheduledlifecycleexpirycancommit. NoSQL/browser/expiredaccessbypassclaim. |

Supportpreviewvisualroutefixturecorrected toassistantwithmanage_support+inspect_merchant_sessions;ownerdenial4roleadaptertestsPASS.222casesremainNOT_RUN. Priorfindingsretained;noactualproductionfix orclosedissue.

## SEQ-274–281 original runtime triage

RESIDUAL-FIXTURE-CONTRACT-001 MEDIUM/OPEN/TEST_MAINTENANCE: realownedPGinvocation13files shows oldcashierentitlement/localphone/legacyJSONauth/legacycookie/productiongate fixtureexpectations failcurrentcontracts.12complete16P/8F;oneincomplete23514merchantmanagementseed. Variantremoval Missingexpectedrejection conflicts withcurrentarchiveintent; actualpostremovalhistoryacceptancepending, no productdefectdeclared fromoldtest alone. Source/remapping inreport. Originaltests/appunchanged.

Fourfullygreenfiles:catalogpromotions/emergencyPG/knowledge lifecycle/runtime authorities. Mixedpositivecataloginventoryrows andactualownerprovisioningPASS, not blanketclearance. Incompletemerchantmanagementseed/latehook strengthens existingDB-TEST-CLEANUP-021;ownedcontainercleanupSUCCESS. Canonicalconsentexpiryadapter6P/1F extends existingSUPPORT-PREVIEW-EXPIRY-ROLLBACK-001, no duplicate. Allpreviousfindingsretained.

## SEQ-282–285 catalog marker atomicity

CATALOG-ARCHIVE-ATOMICITY-001 MEDIUM/OPEN/CONFIRMED: actual ownedSQL fault-injection rejects archive-marker UPDATE after corecatalog transaction committed. Product version2→3 and rename persist; zero-stock variant remains publicly visible because metadata marker is absent. Full immutable mutation retained. Run38431991119/job115416248457 1P/1F/0SKIP; sourcece48910f. Trigger fault controlled, not hostedincident evidence. Source and limits in completed report. No repair.

## SEQ-286–289 existing expiry finding strengthened

SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001 LOW/OPEN/CONFIRMED_SQL. Prioradapter-only evidence retained. ActualownedPG7cases5P/2F atsource23efe18cb9089507909b3d390fea790272e22cd7,run38433417141/job115421169603 confirmsconsent/preview markerrollback on timestampdenial. Accessdenied, no expirybypass. Canonical lifecycle commits pending/approved/session expiry and preserves liveother tenant; repeats0updates. Directsweep proof doesnot clear production timer/HTTP/role/RLS. No duplicate finding/repair.

## SEQ-290–293 licensed history acceptance

Fourdistinct actualSQL targetcasesPASS; no new issue. RESIDUAL-FIXTURE-CONTRACT-001 remainsOPEN/originallicensefixturesunchanged. Newcurrentlicensed salehistory surviveszero-stock rebuild andguarded denial; deliberately absentlevel archive retains sale/exactreplay, restitutiondenied withunchanged sale/mutationrows. Not successfulpostarchivecompensation/productiondeletionproof. Initial fourthseed denied deviceauthority; corrected timestampfixture runs onlyremainingcase. Prior3notrerun. ExistingCATALOG-ARCHIVE-ATOMICITY-001 andSUPPORT-PREVIEW-EXPIRY-ROLLBACK-001 stayOPEN.

## SEQ-294–297 native monitor and selector evidence

WORK-MONITOR-STALE-001 OPEN/MOUNTED_BROWSER_CONFIRMED:actualReact/nativeChrome154real15second silent403/503 retainsoldmonitor withouterror; delayedAresponse replacesnewlydisplayedBafterpropchange.7cases4P/3F,source5da92ffd/run38437736590/job115436032580, noinfraerror. SyntheticHTTPonly,noApp/currentrole/backendbypass/nativependingwriteclearance. Existingfinding,no duplicate.21unchangedcontracts nofilename refs in959sources; priorlocalexecution retained/no rerun; boundedCIselectiongap staysOPEN.

## SEQ-298–301 native pending action evidence

WORK-MONITOR-STALE-001 OPEN/NATIVE_ACTION_CONFIRMED:actualcomponentdialog/PasswordInput/nativemouse6cases4P/2F. PendingconfirmPOSTafteractual15s403; targetpropBconfirmusesoldsessionA. Syntheticserverrejects403/404; no realSQL/backendbypass. Fourpositivecontrols cancel/success/incorrectpassword/singlependingPOSTPASS. Head8382a73f/run38439068416/job115440607861. Realbackendsource owner/password/accountqualifiedsession gate retained, notexecutedhere. No newfinding/repair.

## SEQ-302–305 actual retention acceptance

EightnewSQLcases8P/0F/0SKIP,source29be3ed3/run38442860689/job115453629407; newE164/currentAuthv2fixture proves readonly,suspension/sessionrevocation/repeat/tenantisolation,renewalreplystate,no oldsession/closed/manualrevival,SQLfaultrollback,1concurrentpendingdeletionrequest+1audit. No newfinding. RESIDUAL-FIXTURE-CONTRACT-001 remainsOPEN/originaloldphonefiles unchanged; successfulnewbusinessproofdoesnot rewriteoldrun. Currentrole/HTTP/purge/media/provider/leastprivilegegates remainopen.

## SEQ-306–311 actual management HTTP and session binding

15newbusinesssubcases15PASS(raw16inclparent),sourcecc27ff5a/run38444767251/job115460157268. CurrentE164/trusteddevice/fullAuthv2fixture reachesmanagementrole/permission/password/review/anonymization andowner-sessionqualifiedbinding/livecookie401. No newfinding. RESIDUAL-FIXTURE-CONTRACT-001 extendsoldmanagementfixture's missingownerdevicecontract(originaloldphonefailedfirst); originaltestsunchanged. Initialzero-caseownerissuanceblockednotapplicationdefect. WORK-MONITOR-STALE-001 remainsOPEN; backend404bindingPASSdoesnotfixnativeUIstaleaction. HostedRLS/provider/media/fullroute/OTP gatesremainopen.


## PUBLIC-METADATA-TEMPLATE-001 — LOW / OPEN / SOURCE_CONFIRMED

Current artifacts/fawri/index.html:7/10/13 description, og:description and twitter:description retain built-on-Replit/template updateinstruction wording. Public social/search snippet quality issue; source proof on56138e8a, not currentlydeployedincident or credentialexposure. Discovered alongside firstfullApproute batch;18functionalbaselinePASS remainsseparate. Details/bounds inSEQ-330–335 report. No repair.


## A11Y-OWNER-RECOVERY-HEADING-001 — LOW / OPEN / DOM_CONFIRMED

OwnerRecoveryPage initialkey1stage, actualfullAppsixlocale/viewportcases: semantic h1–h6 count0 despite visibleportalTitle. OwnerRecoveryPage.tsx:203 usesCardTitle; card.tsx rendersdiv. Headingnavigationstructuralgap, notcredentialbypass/fullWCAG assessment. NativeDOM/source/captures inSEQ-342–347. No repair;18basicbaselinePASSdoesnotcloseaccessibilitygap.


## I18N-MONITOR-SORANI-DATE-001 — LOW / OPEN / NATIVE_VISUAL_CONFIRMED

Sorani work-monitor Last activity showsEnglish Oct/AM inactualfullApp390/1280captures for synthetic2026-10-14T00:00:00Z. formatDate usesIntlDateTimeFormat ckb-IQ; localefallbackcauseinferred, resolvedOptionsnotcaptured. Native mixed-language presentation proof only, nottimezone/security/allplatform failure. TwoPNGdetails/bounds inSEQ-354–359; no repair. Distinctfromdate-picker/billinglocalization surfaces.


## UI-KU-CATALOG-CSS-SPILLOVER-001 — LOW / OPEN / NATIVE_CAUSE_CONFIRMED

Globalindexcatalog-kurdish-layout-fix.css640–1399Sorani selector appliesflex1 1 28rem tofirstheaderchild, which is40pxshieldbadge inbothsnapshotpages. Native1280badgewidths702.6875/547.921875; test-onlystylesheetdisable gives40px andtitlewidth254.6875/99.921875→917.375/607.84375.2ownedbrowsercausalcontrolsPASS,source/appunchanged. Presentation/usabilitygap,notauth/writebypass; mobilecrampingnotattributedtothismedia rule. SEQ-360–365 has16captures/fullbounds. No repair.

I18N-MONITOR-SORANI-DATE-001 evidenceextension: emergency snapshot generated_at showsEnglishOct/AM inbothSoraniUIR-011captures; sourceusesckb-IQ/dateformatter. Sameexistingdatefinding, no newduplicate. Nativevisualproof, notresolvedOptions/alltimezone proof.

## EMERGENCY-AUDIT-STATUS-MISREPORT-001 — MEDIUM / OPEN / NATIVE_DOM_CONFIRMED

SEQ-366–371 full original App owner overview valid:false still renders localized healthy audit-chain text in all6 AR/EN/KU×390/1280 DOM probes. Three mobile390 chain-card PNGs corroborate; desktop card visibility not certified. AdminEmergencyAccessPage.tsx:658–663 unconditionally renders green shield/text.auditValid, ignoring boolean while showing event_count. PostgreSQL source verifier can return false, owner overview propagates it and HTTP handler serializes200; no actual SQL corruption/HTTP-tamper experiment or unauthorized-access proof. Legacy JSON path verifies/refuses503 before valid:true, not a bypass. SeverityMEDIUM for misleading security integrity indication. Original6 diagnostic locator failures preserved; corrected6-case-only diagnostic verifies reproduction. No application fix. Evidence [SEQ-366–371](SEQ_366_371_EMERGENCY_WORKSPACE_INTEGRITY_20261014.md), seq369/seq370 native results/captures. Owner desktop-card clipping potential remains separate TRIAGE.


## P0 verified-payment SQL recovery continuation — 2026-10-14

Issue #523 / BILLING-SQL-RECONCILIATION-032 remains OPEN. New local branch `fix/p0-verified-payment-sql-recovery-20261014` based on #533/2733cadae. SaaS/cashier savepoint recovery and exact-event concurrent replay regression prepared; API typecheck/build and guard15/15 PASS, real PostgreSQL NOT RUN for new code. Publication rejected by automatic approval review; no remote commit/PR/CI evidence. See active header in `WORK_HANDOFF.md` for design, limitations, exact next actions and publication blocker. P0 is not complete; no percentage recalculated.


## Verified P0 SQL recovery — 2026-10-14

Supersedes earlier local-only/NOT_RUN checkpoint: PR534/da4d0c05, isolated38517736663/job115700230288:168PASS/3FAIL,43invocations/41unique. Cashier SQL6/0 and SaaS SQL3/0 PASS, checkout9/0 PASS; remaining selected runtime failure is Meta FA-I-006/issue535 (2functional+parent). Security history1synthetic-fixture finding separately classified. See P0_PAYMENT_SQL_RECOVERY_20261014.md and active WORK_HANDOFF header. Issue523/P0 stay OPEN for broader acceptance; no merge/deploy or percentage claim.


## VERIFIED P0 execution checkpoint — 2026-10-14

Sourcea696046b, PR537 (stack534/536): isolated38520772813/job115709702562 **174PASS/0FAIL/0SKIP,41unique/43invocations**, restricted resolver+signed HTTP8PASS, seven29migration chains/cleanupPASS. **27/27 CI runsSUCCESS** on this source, including complete Meta pipeline38520772699, schema38520772844 and security38520772794. Exact source/results/limits in WORK_HANDOFF.md and evidence/P0_SELECTED_RESULTS_20261014.json. SQL application recovery and RLS routing fixes are verified drafts, main unchanged. Remaining523 receipt-before-application interruption/inbox and535 complete downstream signed restricted-role/hosted execute rollout remainOPEN. No wholeP0 completion/percentage or release clearance. Later docs-only checkpoint does not alter tested source; no unnecessary SQL rerun required solely for wording.

## Source-confirmed lifecycle watch — trusted device approver deletion

ADMIN_APPROVER_TRUST_DEPENDENCY_ORDER_20261014: existing trusted_devices.trusted_by_account_id FK ON DELETE SET NULL conflicts with trusted_devices_trust_state_check requiring a non-null approver while trusted. Owned fixture cleanup reproduced dependency-order failure; corrected fixture removes its devices before accounts. Current admin management disables accounts; no public hard-delete endpoint failure or extra P0 blocker is claimed. Any future physical approver deletion/retention workflow must explicitly revoke/remove dependent trust first and preserve accountability. Sources lib/db/src/schema/sessions.ts and first migrations; evidence operator attempt0fb0156d above. Keep for lifecycle review, no production schema mutation in this unit.
