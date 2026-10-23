## P0 release-gate evidence matrix — 2026-10-23 (GitHub-only)

| Gate | Current evidence | Decision / missing proof |
| --- | --- | --- |
| Emergency privacy 0048 source | Candidate `655b7a37` 48/48 PR workflows, 89/89 clean native suites, 700 TAP passes; synthetic merge file comparison zero delta | **SOURCE VERIFIED** only; not hosted certified |
| Latest documentation handoff CI | `3036670` 48/48 successful workflows, including isolated PostgreSQL audit and subscription service guarantee validation | **CI VERIFIED** for that commit; later documentation commits must be checked independently |
| Hosted migration parity | Historical read-only snapshot: 28/28 applied canonical hashes matched, 17 source migrations 0028–0044 absent; report `P0-SOURCE-HOSTED-RECONCILIATION-20261023.md` | **OPEN**: fresh authorized deployed-target check, migration plan/approval; do not infer current hosted state |
| Hosted identity and privilege boundary | Historical catalog shows candidate runtime role with elevated attributes; actual app connection target/login/pooler unverified | **OPEN**: authorized read-only deployment identity binding, then reviewed least-privilege correction; no live ACL changes |
| Incident response | Historical report identifies access-history review, exposure-window assessment and staged secret rotation plan | **OPEN**: incident clearance, owner sign-off and authorized follow-up; never commit secrets |
| Functional P0 completeness | Historical source coverage for cashier authorization, branch stock, offline primary cashier, reconnection, subscription grace, provider receipts | **OPEN**: reconcile each requirement to exact current test and evidence; passing CI alone does not prove full inventory |

**Release NO-GO.** Do not interpret source CI as hosted certification or compute a whole-P0 percentage without a complete accepted denominator. Continue on Draft PR #550 branch, GitHub-only; no Railway/Neon, deployment, migration, merge, main or P1/P2.

---

## CURRENT HANDOFF — 2026-10-23 (read first)

- Branch: `fix/p0-provider-receipt-order-discovery-20261015`; Draft PR #550. Source candidate `655b7a37dddb987778cda7e589fbd3a438b7fc8d` accepted for **source CI only**: 48/48 green workflows, 89/89 native invocations, 700 TAP passes, 49 disposable migrations, strict emergency privacy regression passed. Synthetic PR merge has zero changed files versus candidate.
- Documentation checkpoint `5aac594263a17707b4572f59f0b0a9e18f12869e` independently completed 48/48 green workflows. Subsequent commits update documentation only; check their own CI separately before claiming latest HEAD green.
- The older `0048 PENDING` and `emergency four tables OPEN` entries below describe earlier baselines and **must not** be mistaken for the current source remediation status. See `P0-0048-CI-VERIFICATION-20261023.md` and `P0-0048-DOC-HEAD-CI-OBSERVATION-20261023.md`.
- Release blockers still OPEN: deployed hosted schema/role/identity/pooling parity, security incident review and full P0 gate inventory. **NO-GO**. No overall P0 completion percentage without validated denominator.
- Next: inspect exact remaining P0 release requirements and any GitHub-verifiable evidence. Do not rerun passing suites or duplicate remediation. Railway and Neon are prohibited; do not deploy, migrate hosted database, merge, change main or begin P1/P2.

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

## Access proof reconciliation while settings CI executes — 2026-10-23

Current test source6fe2d4a4ab56a17dcacc134f7a6d3cca1c1f1112 remains PENDING native acceptance. Last bounded inventory44/47 workflows SUCCESS,3 executing,0 failures; native39871639878/job120147216866 progressed through priority/cashier/billing/tenant to Meta lifecycle. No rerun/retry/cancellation. Do not infer the settings diagnostic outcome from a completed step; read its actual marker/full summaries when job logs become available.

Reconciled11 bounded access-control claims against exact accepted4acf1351 native proof and added15-row [source/hosted proof inventory](evidence/P0-ACCESS-CONTROL-PROOF-INVENTORY-20261023.json). This is an access-domain subset, not the full P0 denominator;0 new runtime executions or newly accepted cases. Hosted identity/rollout and broader role/privacy reconciliation stay BLOCKED/TRIAGE. Source PASS never implies hosted acceptance. No percentage calculated.

Next: read exact6fe P0_CASHIER_DISCOUNT_SETTINGS_AUTHORITY_BASELINE, all85 native summaries and final CI status; classify before focused access-control remediation. Preserve authorized management, transaction/lock/version/invalidation/rollback invariants. Last accepted remediation remains4acf1351 (47/47+84/84). NO-GO; no hosted operations/deployment/ACL/secrets/migration/main push/merge/P1/P2. This checkpoint docs-only [skip ci].

---

## Approval access controls accepted; settings authority diagnostic prepared — 2026-10-23

Accepted executable4acf13517337a4038f46f2fb672d76fde42db77a:47/47 workflows SUCCESS; native39869692485/job120140702367 has84/84 complete clean invocations/82 files, zero failures/skips/cancellations. Actual checkout3d64dfc90f8f46eb9e9899fb8d2bb66afe2fbc70 matches source tree8e910f6ac0ded63664f9161b51fcbc25f9c80aaa.14 direct denial/195 grant-reachability cases PASS; authorized flows, replay, tenant boundaries, transaction rollback/locking and exact restoration preserved. Foundation final marker,0045 canonical schema reproduction/all46 migrations, quality and security SUCCESS. Audit120140702494/review120140702455:0 high/0 critical/2 moderate. [Acceptance](P0-CASHIER-APPROVAL-ACCESS-ACCEPTANCE-20261023.md) · [Exact counters/runs](evidence/P0-CASHIER-APPROVAL-ACCESS-ACCEPTANCE-20261023.json). No retry or rerun.

Next group: new settings-authority actual-LOGIN diagnostic prepared/registered, covering two-merchant boundary, configuration authority/business validation consistency, authorized versioned management/pending invalidation/rollback and exact snapshots. Local syntax/diff PASS; native/CI PENDING. No production/schema modification in this next group. Read containing executable's P0_CASHIER_DISCOUNT_SETTINGS_AUTHORITY_BASELINE and all complete native summaries before classification/remediation. Diagnostic success is not security acceptance. Current approval source acceptance must not be confused with the containing new test executable.

NO-GO; P0 percentage UNMEASURED; full requirement/proof inventory and other critical gates OPEN. No hosted operations/deploy/migration/ACL/secret/main push/merge/P1/P2. Source46 vs hosted last28; actual deployed DB identity/pooler unresolved. User-facing security updates stay high-level.

---

## Remediation published; exact CI continuation — 2026-10-23

Remote executable4acf13517337a4038f46f2fb672d76fde42db77a, tree8e910f6ac0ded63664f9161b51fcbc25f9c80aaa, all22 uploaded blobs/tree verified.47 workflows started; native39869692485/job120140702367 install/build PASS, priority native execution IN_PROGRESS at last observation. Schema39869692394, Foundation39869692042, quality39869692369, security39869692207. Native acceptance PENDING. Inspect P0_CASHIER_APPROVAL_PROVENANCE_REMEDIATION and all84 complete summaries; require actual canonical/schema/quality/Foundation/security results. No repeat status polling or passing-suite rerun. Preserve any failed attempt before correction. Last accepted remediationbcebf0e remains47/47+83/83; diagnostic1716 green47/47+84/84 proves bypass, not fix acceptance.

Independent next source trace saved: [merchant discount-kind authority](P0-CASHIER-DISCOUNT-KIND-AUTHORITY-TRACE-20261023.md), five exact blobs. Kind settings still primary-writable while actual validator chooses amount/percentage ceiling. Actual bypass/invalidation impact NOT_PROVEN. After current result, use actual LOGIN/validator and exact two-merchant restoration before any next fix; preserve authenticated kind management/version/advisory/pending invalidation. No additional executable launched during current CI.

NO-GO; source candidate46/hosted last28 migrations, historical28 canonical hashes match. Hosted role/actual deployed DB target/login/pooler/full P0 inventory gates remain open. No hosted change/deploy/main push/merge/P1/P2. This checkpoint documentation only [skip ci].

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


## Branch publication recovered; remaining P0 gaps reconciled — 2026-10-22

Acceptance docs/evidence are on branch at `accf522b0d70e9ccf7b8a73176b387b54880c2f8`; tree matches prepared d990ee89 exactly. **Do not fast-forward to the orphan commit.** Contents create/update works with fully qualified branch `refs/heads/fix/p0-provider-receipt-order-discovery-20261015`; update_ref prefix handling remains unsuitable.

Bounded reconciliation saved at `2d1e464be5c4a87e0a58380c9f8e1788281e2117`: [report](P0-GITHUB-ONLY-GAP-RECONCILIATION-20261022.md), [machine records](evidence/P0-GITHUB-ONLY-GAP-RECONCILIATION-20261022.json). Five existing gaps mapped: auth sensitive SELECT, cashier credential/session role gates, primary offline/grace, missing-sequence recovery and complete P0 inventory. UI import independently parsed222 unique/allP1 (84TRIAGE/138NOT_RUN); not a P0 denominator. **New runtime cases executed0; newly accepted P0 cases0; no application changes.**

Next bounded engineering task: trace legitimate primary-role authentication-table reads and sensitive columns, then design/run actual-LOGIN read-negative/readiness grant tests on disposable GitHub Actions infrastructure without breaking real signup/session/management behavior. Existing executable43065bda stays accepted46/46 workflows and75/75 invocations; do not rerun for docs-only edits. Hosted tasks remain BLOCKED_BY_RAILWAY or outside GitHub-only scope. Release **NO-GO**; whole-P0 percentage unmeasured.

---

## GitHub-only recovery: 0041 full source acceptance — 2026-10-22

**Accepted executable: `43065bda4b032244016d0fc78823f5579b01deca`. All46/46 GitHub Actions workflows SUCCESS, none pending.** Native run39713145055/job119608939313 independently re-read:75/75 invocations exit0/fail0/skip0/cancel0/summaryComplete; counters exactly match saved evidence. Source/actual checkout share tree b5f8bfa86d716ce62098d057bd8207a02dc0016d. Previous baseline c60914b8 independently verified46/46 and75/75; that older source still trusted raw tenant GUCs and is superseded for this fix.

Migration0041 public predicate uses private allows_merchant; all six transitional production tenant GUC writes are absent and trusted issuance remains. Manual SQL matches migration and journal index41. Existing native canonical RLS/positive tenant/auth/admin/receipt rollback/expiry/replay/restore proofs are preserved. No new issuer grants or application changes in this recovery batch.

Recovered HEAD `8659289c1ae2d683e8d8bda571f070195fca6e0f` contained stale39/46 infrastructure status. Live attempt3 was40/46. One bounded retry of the six remaining failed jobs recovered all46 workflows; failed attempts remain preserved. Both dependency audit and review now report actual counts:0 high,0 critical,2 moderate (total2). Exact runs/jobs/counters and limits: [GitHub-only full acceptance](evidence/P0-GITHUB-ONLY-FULL-ACCEPTANCE-20261022.json). Containing commit is documentation/evidence only [skip ci], not a new executable test result.

**Release NO-GO; whole-P0 percent unmeasured.** Raw-GUC remediation is verified in isolated source tests, not hosted acceptance. Hosted deployment/runtime identity: **BLOCKED_BY_RAILWAY**. Hosted database schema/roles/owner/ACL/pooler checks: NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. Historical hosted observations remain dated2026-10-21 and must not be described as fresh. Remaining auth/privacy/cashier/offline stock/sync/retention/provider/storage and full P0 requirement/proof inventory gates stay open. No Railway/Neon connector, hosted write/deploy, main push/merge, credential rotation or P1/P2 work.

Next: preserve this exact-source acceptance; do not rerun75 suites for docs-only changes. Continue independent GitHub P0 review/inventory. Keep hosted steps blocked under this session restriction. Older entries below are historical and their pending0041/39-of46 instructions are superseded here.

---

## 0041 native validation complete; CI infrastructure blocked — 2026-10-22

Executable `43065bda4b032244016d0fc78823f5579b01deca`: **75/75 isolated invocations clean, zero fail/skip/cancel, complete summaries**. [Run39713145055](https://github.com/nora953/fawri-production-source/actions/runs/39713145055),job119608939313 SUCCESS. Actual checkout b19291f158a231ad87ddfd9c468c3e4d14c97263 has identical tree b5f8bfa86d716ce62098d057bd8207a02dc0016d. All42 migrations, canonical generation/schema validation, native GUC-forgery denial/positive own-tenant authority, scope16/admin9/central6/receipt executor15, full dump/restore identical fingerprint and Node22 PASS.

**Overall exact-source workflows:39 SUCCESS,7 FAILURE.** Six failed fetching pnpm with HTTP503 before code execution even after one retry (cashier subscription, deletion PII, dashboard, catalog signature, routing, regional). Security dependency jobs failed closed without vulnerability counts on both attempts. Repository-security and lockfile-integrity jobs passed, but no current advisory counts or full46-workflow acceptance are claimed. End bounded retry loop; keep failed evidence. Last previous full acceptance remains c60914b8 and does not cover0041.

[Exact native proof and all workflow/retry states](evidence/P0-PRIVATE-PREDICATE-NATIVE-VALIDATION-20261022.json). [Current implementation/release/next-batch report](P0-PRIVATE-PREDICATE-STATUS-20261022.md). Containing checkpoint is documentation/evidence only [skip ci]; never claim its SHA ran new executable checks. Source now removes all six legacy tenant GUC writes and public RLS uses private transaction authority. This closes the former raw-GUC path in isolated source tests; hosted isolation and full P0 remain uncertified.

Next precise action: fetch live audit HEAD, check remaining43065bda jobs and retry ONLY failed infrastructure when npm is available, require actual advisory counts before full acceptance. Preserve75 clean invocations unless source changes warrant rerun. Then refresh read-only Neon/Railway identity/schema/roles/owner-ACL/pooler evidence without secrets and reconcile auth/privacy/cashier/offline/stock/sync/retention/provider/storage/full-P0 inventory gates. Whole-P0 percent unmeasured;85% unverified. **NO-GO.** No hosted writes/deploy/main push/merge. Every code and failed-run review was durably checkpointed.

---

## 74/75 native invocations; deferred fault selector correction — 2026-10-22

Executable9cbfb3b0:43/46 workflows SUCCESS,3 FAILURE; isolated39712368980/job119606438648 has75 invocations,74 clean. Scope protocol16, admin9, central6, knowledge/public RLS, all42 migrations, dump/restore fingerprint and Node22 PASS. Only receipt executor remains12PASS/3FAIL (two COMMIT fault cases plus parent): its deferred invoker trigger calls the private predicate without private-schema access, aborting before durable receipt admission. Containing test-only correction uses the canonical public predicate for fault selection; this executor has no auth/directory capability, so only its issued transaction scope matches. No new grants or product/migration changes; original failure-phase/no-application/durable-event/once-only assertions retained. See evidence/P0-PRIVATE-PREDICATE-SECOND-ATTEMPT-20261022.json.

Other failed workflows are infrastructure: schema setup HTTP503 fetching pnpm on attempts1/2; security dependency review HTTP503, and dependency audit failed closed without vulnerability counts. Observability's503 recovered on same-source retry. No security advisory conclusion is inferred from unavailable output. Next inspect containing exact-source CI, verify receipt15 and every75 summary, require all46 workflows including actual dependency counts before full acceptance. Release NO-GO; no hosted write/deploy/main/merge; whole P0 percentage unmeasured.

---

## Native 0041 attempt reviewed / fixture corrections — 2026-10-22

Executable `365e7473a428391bcf2cea599d4fdb2c117204f8`:41/46 workflows SUCCESS,5 FAILURE. Isolated39711627110/job119604061266:75 invocations,73 clean,2 not clean (scope protocol14PASS/2FAIL; receipt execution10PASS/5FAIL including parents). Native GUC-forgery denial, central public subscription RLS, canonical knowledge RLS, admin boundary, all42 migrations, full dump/restore with identical fingerprint and Node22 journey PASS. Full build/types PASS. Exact links/counters/causes: [P0-PRIVATE-PREDICATE-ATTEMPT-20261022.json](evidence/P0-PRIVATE-PREDICATE-ATTEMPT-20261022.json). This is NOT full-source acceptance.

Containing correction updates obsolete operational source contracts to awaited private issuance, converts legacy cross-lane edge positive to actual tenant/auth LOGINs with raw-GUC negative, and changes receipt deferred fault trigger selection from the removed tenant GUC to actual private scope. Original admission/COMMIT rejection, rollback/durable event and exactly-once retry assertions remain. Deliberate private-function owner corruption now makes the public SQL readiness probe fail BEFORE scope admission; only that assertion expects exact PRODUCTION_DATABASE_RLS_READINESS_CHECK_FAILED, while direct scope owner rejection remains exact OPERATIONAL_TENANT_SCOPE_ROLE_UNSAFE. No source/migration/grant changes. Promotions install failed HTTP503 fetching pnpm, no execution; preserve it as failed evidence. Local new operational contract9PASS, syntax/whitespace PASS.

Next: inspect containing exact-source CI and all75 summaries; repair actual failures without bypass/skips, require all workflows and full migration/restore proofs before acceptance. Last full acceptance remains c60914b8 (46/46;75 clean), not365e7473 or this correction. New GUC denial is proven in isolated native tests but hosted rollout/certification and other P0 gates remain open. Full-P0 percentage unmeasured. NO-GO; no hosted writes/deploy/main/merge. Keep bounded batches and persist evidence/handoff after each completed run.

---

## Private public-predicate cutover candidate — 2026-10-22

Recovered live HEAD `5f7af109363fe3c7ca8383afb47a8187f8ac2d63` into a fresh clean checkout; no prior dirty worktree touched. Containing executable introduces canonical migration0041 `private_tenant_predicate_cutover` (SQL==manual stage, journal index41, deterministic snapshot parent0040). Public RLS predicate now delegates tenant authority to the existing private LOGIN/backend/full-XID scope, retaining authentication and audited operator branches verbatim. Removes all six transitional production tenant GUC writes. No issuer grants or hosted changes.

Positive admin-boundary CRUD/replay and full-restore tenant checks use separate actual trusted issuer LOGINs instead of raw GUC authority. Central wrapper proof now checks actual subscription RLS rows before/after GUC forgery. Knowledge fixture no longer replaces canonical public policies with private fixture policies. Canonical scope protocol exercises the public predicate too; expiry/replay/rollback/concurrency assertions retained. Legacy production-readiness GUC positives become explicit forgery denials; corresponding legitimate CRUD/issuance positives remain in actual-LOGIN central/admin/restore suites. The obsolete removed-GUC query-failure unit case is removed; real issuer-failure rollback cases remain.

Local results: disposable guard15 PASS; actual subscription/operational wrapper control flow9 PASS (same test, only TypeScript import resolved to downloaded verified package because install incomplete); PostgreSQL wire proxy5 PASS; syntax/whitespace and exact stage/snapshot checks PASS. **Native SQL, build/types, generator reproduction and full exact-source CI are PENDING.** Local frozen install and both generator tests blocked by existing xlsx0.20.3 missing tarball integrity under local pnpm11 policy. No lockfile/policy relaxation. Local PostgreSQL/Docker unavailable. Last full accepted executable remains `c60914b8d954cb1d82e9a3706adfd0b669d9144d` (46/46 workflows;75 invocations), NOT this candidate.

Next precise action: inspect containing executable CI and every isolated summary (expect prior75 invocations, changed unit count9), fix actual failures without skip/bypass, verify42 migrations and full dump/restore, then record exact acceptance. In particular inspect public predicate owner's USAGE/EXECUTE of private predicate under restricted ownership and positive tenant/auth/admin journeys. Do not call the GUC vulnerability closed before native evidence passes. Hosted migration/owner/ACL/deployed-login/pooler, privacy/cashier/offline/retention/provider/storage/full inventory gates remain open. Full P0 percentage not measurable, historical85% unverified. **NO-GO.** No hosted writes, deployment, main push or merge.

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

# FAWRI P0 continuation checkpoint

## Accepted runtime and subscription operator increment — 2026-10-21T04:02:27.987Z

Branch fix/p0-provider-receipt-order-discovery-20261015; Draft PR550 actual base test/p0-integrated-billing-meta-20261015. **Accepted executable e5b4400fb1d31a3c383c24c6aa384d0c2fc89ce9:46/46 workflows completed SUCCESS;72 isolated invocations all exit0/fail0/skip0/cancel0.** Isolated run39541012749/job119028504576. Checkout 0da06384776a19f31673945d71e2593c900ad56a and audit HEAD have identical tree95900a4c2b2aa3b0bd496bc8998407c5f2168f4a. Full workflow links/counters and dedicated proofs: evidence/P0-SUBSCRIPTION-DIRECTORY-ACCEPTANCE-20261021.json. Containing commit changes documentation/evidence only; source acceptance is for the exact executable above. **Release NO-GO.**

Verified direct merchant billing context3, SaaS authority4/paid guarantee, subscription entitlement2, admin auth1, addon refund3/cross-cycle1, cashier replay6, receipt process15, customer payment11, scope16/auth10/admin9/runtime81, receipt executor15/HTTP20/wire17 and every other isolated invocation PASS. Dedicated subscription2+HTTP1 proves actual operator LOGIN, primary issuer denial, directory-only actor denied by exact subscription permission, rejected audit rollback, positive transaction-bound audit and pooled session reset. Dedicated cashier retains all4 original files/5 TAP cases; routing11 PASS. Migration candidate/schema/canonical41 migrations PASS, including unchanged0036.

Implemented: direct billing requires explicit trusted merchant context, with exact uniqueness conflicts mapped to existing409 without foreign-row disclosure. Manual plan cycles/default guarantee reads use merchant transactions. Admin subscription HTTP and every SSE snapshot pass session actor to a separate actual directory LOGIN, canonical audit issuer and exact owner/manage_subscriptions check; primary issuer remains denied. Operator fixtures receive reviewed SELECT columns and issuer EXEC, no audit CRUD/auth mutation. Actual tenant/auth fixtures preserve cashier, billing, signup/merchant/admin HTTP and refund/crash/wire functionality. Earlier failed attempts and guarantee typecheck correction remain recorded below and in evidence artifacts.

Next precise action: wire canonical private issuance in withMerchantOperationalTransaction (operationalPostgresAuthority.ts) and withMerchantSubscriptionTransaction (postgresSubscriptionEntitlement.ts), after BEGIN and BEFORE merchant/FK locks. Delay operational scope-module import to avoid cycles; generic/auth transaction paths must not mint. Review remaining affected legacy consumers first: support-postgres-cutover (merchant/admin support scopes), subscription-reminder-rls (actual LOGIN/auth issuer), meta-restore-wire-recovery plus child (spy actual runtime, preserve chronology/wire faults), verified-receipt-replay-review-http (checkout and distinct actual review/auth roles). Receipt read/review pool fixtures use native seed SQL; inspect actual callsites rather than assume bootstrap inspection needs minting. No primary issuer grants or bootstrap skip flags. Then implement canonical public predicate cutover with stage/journal/snapshot reproduction and real regressions.

**Public fawri_tenant_or_audited_admin STILL TRUSTS raw fawri.tenant_id.** Successful P0_TENANT_GUC_TRUST_PROOF is an OPEN exploit. Tested admin audit forgery/active-window replay denials do not close that alternate branch. Hosted owners/grants/default ACL/pooler, sensitive auth SELECT/privacy, cashier credential/session integrity and prior provider/storage/retention release gates remain uncertified. Preserve separate smart reply/offline cashier logic and offline essentials. No completion percentage.

No production/staging/Neon write, Railway deploy, main push or merge. Only attested owned Docker network-none PG16; no local PostgreSQL claim. Full install/types/build verified in CI; local focused64 PASS. Worktree fawri-central-issuance remains at60bc422c with newer connector-published working files; never reset dirty worktrees. Fetch live GitHub HEAD before resuming. **P0 NO-GO.**

## Subscription operator directory and restore caller correction — 2026-10-21T03:52:19.143688+00:00

Branch fix/p0-provider-receipt-order-discovery-20261015; Draft PR550 actual base test/p0-integrated-billing-meta-20261015. Inspected live71f5cfe1e160d71b9f83084dd6bdf238c3635116:43/46 workflows SUCCESS,3 FAILURE;72 isolated invocations68 clean,4 not clean (admin auth exit7/incomplete TAP included). Exact counters/links: evidence/P0-SUBSCRIPTION-DIRECTORY-SCOPE-ATTEMPT-20261021.json. Actual direct billing context3 PASS including bounded foreign payment409/no event/no grant, SaaS authority4 PASS including paid guarantee, cashier negative6 PASS, receipt process recovery15/customer payment11 PASS, actual signup/global merchant/HTTP journeys PASS. Migration/schema/private scope16/auth10/admin9/runtime81 and prior receipt executor15/HTTP20/wire17 PASS. Last ALL-workflow acceptance remains129effec4cb9bcdc21435304842567ad32f929e8 (45/45;72 clean), not newer source.

Containing source correction: listSubscriptionsPostgres now REQUIRES authenticated actor ID from all3 admin HTTP/SSE calls. Enumeration uses the separately configured actual operator LOGIN, canonical fawri_issue_admin_directory_audit bound to its transaction, plus exact owner/manage_subscriptions check before reading IDs. Existing issuer locks/rechecks account/profile/permissions; each snapshot reissues. Tenant refreshes remain independent merchant transactions. No tenant runtime issuer grant, custom-GUC comparison or new SECURITY DEFINER added. Exact permission check prevents directory-only actor from obtaining subscription snapshots.

Two owned operator fixture variants provide issuer EXEC, SELECT subscriptions, only needed profile/permission/account columns and merchants for merchant-directory variant. Neither has audit-table CRUD, auth mutations, private scope issuer or owner membership. Subscription HTTP asserts primary issuer denied, directory-only actor403/audit rollback, positive full-XID audit and actual operator identity/GUC reset. Admin-auth HTTP uses merchant-directory operator rather than primary credential fallback. Cleanup closes operator first and removes only owned audit/identity rows.

Restore tests now pass their already-known owning merchant through the EXISTING expectedMerchantId argument. Keep original exactly-once, cross-cycle, expired addon, FK and release/refund expectations; do not add global lookup or weaken RLS. Missing-context fallback behavior is not broadened.

Actually executed locally: transaction/lifecycle/operator/contract/guard/security64 PASS, source/helper syntax and whitespace PASS. New SQL/operator/fixture regression remains PENDING exact-source CI; no local PostgreSQL. Local full typecheck unavailable with matching complete frozen dependencies; prior actual71f5cfe1 API typechecks succeeded after correcting overbroad guarantee edit. Next: inspect containing HEAD/PR/CI and all72 counters plus dedicated subscription/operational/routing jobs; fix failures and save acceptance evidence. Then central operational/subscription private issuance BEFORE locks and canonical public predicate cutover remain REQUIRED. Raw fawri.tenant_id trust is STILL an open P0 exploit; hosted/grants/privacy and prior critical gates remain open. No production/staging/Neon write, deployment, main push or merge. **NO-GO.**

## Guarantee executor type-check correction — 2026-10-21T03:38:13.637665+00:00

Latest inspected source bf3c2bf03dd3afcbd3bc5d58ce193e8c9c14bd56 is blocked by actual API type-check errors TS2304 at subscriptionServiceGuarantee.ts899/907 (undefined merchantId/pool). Representative run39539488626/job119023707087, evidence/P0-GUARANTEE-EXECUTOR-TYPECHECK-ATTEMPT-20261021.json. Do NOT call its46 workflows green or its PostgreSQL changes accepted. An overbroad edit also changed the general DefaultSubscriptionGuaranteeSqlClient; containing correction restores that ENTIRE general client to the prior implementation and limits the new merchant transaction to the subscription snapshot read class. Original general query/audit/transaction behavior retained.

Actually executed after correction: guarantee/knowledge24 PASS; source syntax and reviewed diff PASS. Full API type-check and72 isolated invocations require NEW exact-source CI. Last full acceptance remains129effec4cb9bcdc21435304842567ad32f929e8 (45/45;72 clean). Branch fix/p0-provider-receipt-order-discovery-20261015; Draft PR550 actual base test/p0-integrated-billing-meta-20261015. Next precise action: inspect containing HEAD/PR/CI, resolve actual failures and save counters/links, then resume remaining central private issuance/public predicate work listed below. No source authorization bypass or relaxed tests. Raw tenant GUC and hosted/privacy gates remain open. No production/staging/Neon write, deployment, main push or merge. **NO-GO.**

## Manual plan and guarantee scope correction — 2026-10-21T03:35:48.178298+00:00

Branch fix/p0-provider-receipt-order-discovery-20261015; Draft PR550 base test/p0-integrated-billing-meta-20261015. Inspected live HEAD60bc422cfe450b08a8288a5f4d5d80de24b3f5e6:42/46 workflows SUCCESS,4 FAILURE. Isolated72 invocations67 clean; exact run/job/counters in evidence/P0-BILLING-RUNTIME-SCOPE-ATTEMPT-20261021.json. All13 actual cashier fixtures PASS, concurrent payment replay6 PASS (original409/no-double-grant assertions), receipt process/crash recovery15 PASS, customer payment11 PASS, scope16/admin9/receipt executor15/HTTP20/wire17 and migration/schema PASS. Last fully accepted executable remains129effec4cb9bcdc21435304842567ad32f929e8:45/45 and72 clean. Never transfer that acceptance to newer source.

Containing source corrections: manual plan cycle applySubscriptionPlanCyclePostgres had an unscoped, independently managed transaction; use withMerchantOperationalTransaction before the unchanged mutation callback, inheriting strict transaction discard behavior. Default PostgresSubscriptionGuaranteeSubscriptionAuthority read now uses validated merchant transaction rather than raw pool query; preserve injected SQL adapter, immutable application join and returned merchant/subscription identity checks. Private central issuance/public RLS cutover are STILL PENDING.

Correct new foreign payment event chronology: second event is stamped after second checkout creation, retaining production request/period CHECK constraints and exact409/no event/no second grant assertions. Legacy global-subscription and location-routing CI had un-attested host databases; both now use canonical owned network-none runner for ALL original PostgreSQL contracts (2 subscription files,1 routing file), preserving other type/unit gates and adding always teardown. Six additional signup/global merchant/admin auth/password/subscription HTTP fixtures install actual tenant/auth LOGINs before application imports, root inspector only for fixture SQL. No security grant, test skip, role bypass or business logic relaxation added.

Actually executed locally: focused guarantee/knowledge/lifecycle34 PASS, SaaS source5 PASS; source syntax and shell/YAML/whitespace checks PASS. Full actual PostgreSQL execution of containing corrections and six fixture changes is PENDING CI. No local PostgreSQL available. Next precise action: fetch containing HEAD/PR/CI, repair actual failures, record full exact-source workflow and invocation evidence. Once these legitimate flows pass, finish remaining root/SET ROLE fixture separation where central merchant wrappers are consumed, then issue private scopes in central operational/subscription wrappers BEFORE locks and perform canonical public predicate cutover. Public tenant GUC remains exploitable; hosted/grants/privacy and other prior critical gates remain open. Preserve separate smart reply/offline cashier behavior. No production/staging/Neon writes, deployment, merge or main push. **NO-GO.**

## Restricted billing collision repair and runtime continuation — 2026-10-21T03:27:00.102849+00:00

Branch fix/p0-provider-receipt-order-discovery-20261015; Draft PR550 base test/p0-integrated-billing-meta-20261015. Latest inspected live HEAD2d56104ee7117b184dab65d50acb516518db3150:42/45 workflows SUCCESS,3 FAILURE. Isolated run39537969091/job119018927633,72 invocations71 clean; cashier negative suite4 PASS/2 FAIL (one subtest plus parent). See evidence/P0-CASHIER-RUNTIME-SPLIT-ATTEMPT-20261021.json for authoritative exact IDs/links. Other12 converted cashier fixtures passed, original successful at-most-one-grant assertion remained true. Last fully accepted executable129effec4cb9bcdc21435304842567ad32f929e8:45/45;72 clean, evidence/P0-DIRECT-BILLING-CONTEXT-ACCEPTANCE-20261021.json.

Confirmed root cause: under real tenant RLS, foreign payment identity lookup returns no row. The global unique index correctly refuses reuse, but raw23505 escaped instead of existing domain409. Containing fix translates ONLY23505 with exact saas/cashier_billing_orders_provider_payment_unique constraint after transaction wrapper rollback to the existing collision code. Other SQL errors retain original handling. No foreign row read/grant relaxation. Original concurrent cross-merchant replay tests remain unchanged; restricted context PG regression now additionally asserts409/no event/no second entitlement for both authorities.

Legacy Cashier operational cutoff workflow failed strict owned-environment attestation. It now runs ALL four original PostgreSQL contracts through the canonical network-none owned runner and41 migrations, retaining UI/unit/type checks and adding always teardown. It no longer uses host service/push-force for these tests. New cashier-operational suite preserves the original credential suspension/compensation/PIN/history cases.

Further actual runtime conversion covers SaaS billing/recovery, subscription/reply refunds, merchant customer payments and crash recovery; direct application modules import only after restricted URL installation, root alias is setup/inspection/cleanup. Receipt child reattests bootstrap first, verifies actual runtime identity/startup before fault arming, discards startup connection so existing driver/wire commit boundaries attach to application connections, keeps auth issuer direct, and closes auth pool. No product behavior or offline/cloud dependency changed.

Actually executed locally: context unit4 PASS, strict guard/security34 PASS,27 syntax checks, shell syntax/whitespace PASS. These source/error/runner/fixture changes are PENDING exact-source CI; no database success claimed. Next: inspect containing commit CI, fix actual failures without bypass/skips, save full counters/links. Then central operational/subscription wrappers still require private issuance BEFORE locks, followed by canonical public RLS cutover. Public fawri.tenant_id trust remains an OPEN P0 exploit; hosted/privacy and prior critical gates remain uncertified. No production/staging/Neon writes, deployment, main push or merge. **NO-GO.**

## Cashier actual LOGIN fixture continuation — 2026-10-21T03:16:33.293330+00:00

Containing test increment converts13 owned cashier billing/licensing/history/sync/profit/compensation fixtures to separate actual restricted tenant and authentication LOGINs via the already-reviewed disposable runtime helper. Root pool alias is used for original setup, fault/barrier injection, inspection and cleanup only; application modules import after runtime URL installation. Teardown closes both application pools and removes owned role grants. Existing product assertions, timestamps, fault injection, concurrency and subsystem independence remain unchanged; no source authorization/grants/CI thresholds changed.

Actually executed locally:13 fixture syntax checks PASS; disposable guard/security34 PASS; whitespace PASS. Full owned PostgreSQL regression for these13 fixture conversions is PENDING CI. Direct billing context source is129effec4cb9bcdc21435304842567ad32f929e8; 45/45 workflows completed SUCCESS,72 invocations exit0/fail0/skip0/cancel0; isolated run39537251448/job119016641150. Checkout f5ace76da1f5ef519cecb2e121f2e74a8188ec66 has the identical source tree bcd03e8a7e699e78e5ec874918a98771da5f8e5b. Context unit4/database3 PASS; receipt executor15/HTTP20/wire17, migration/schema and all prior invocations PASS. Exact evidence: evidence/P0-DIRECT-BILLING-CONTEXT-ACCEPTANCE-20261021.json. These results do not cover this containing13-fixture increment.

Next after CI: complete remaining billing/subscription/receipt fixture runtime separation, then wire central operational/subscription private issuance BEFORE merchant/FK locks. Public raw tenant-GUC predicate cutover and hosted certification remain pending. Release NO-GO; no production/staging/Neon write, deployment, merge or main push.

## Direct merchant billing context continuation — 2026-10-21T03:11:00.028334+00:00

Branch: fix/p0-provider-receipt-order-discovery-20261015. Open Draft PR550, actual base test/p0-integrated-billing-meta-20261015. Latest inspected live commit c73a9a34a0efa3511c1d3bd10f79e057cdd72c7e is the exact accepted executable:45/45 completed SUCCESS;70 isolated invocations exit0/fail0/skip0/cancel0. Isolated run39536357291/job119013802418, checkout d1539fed0fae4ddcf5991b524821f7178471c514 has identical tree bc99a0f6286b38b8e7660cd37edf097f2e8bcc3f. Provider discovery19, inbox18, receipt executor15/HTTP20/wire17 PASS. Migration candidate/schema/isolated41 migrations PASS. Evidence: evidence/P0-PROVIDER-SCOPE-CALLER-ACCEPTANCE-20261021.json. Earlier8bc failure and correction remain recorded.

Containing increment removes unscoped global order-owner SELECTs from direct SaaS/cashier payment calls. Direct trusted server callers must provide merchantId; confirmed-provider/operator replay scopes continue to derive their own identity. SaaS direct processing now runs under withMerchantOperationalTransaction, as cashier already did. Test-fake event constructors carry explicit owning merchant. No public provider-body identity trust introduced; no provider signature/receipt/replay checks removed.

Actually executed locally: billing-merchant-context-unit4 PASS, missing/blank/oversized context denied before DB and invalid signature/currency denied; syntax and git diff whitespace checks PASS. New owned PostgreSQL regression tests actual restricted LOGINs, missing-context zero pool calls, foreign order denial/no event write, concurrent own apply once and session reset. This new database test and full regressions are PENDING CI; not yet passed. Runner adds2 invocations (expected72, actual count must be observed). No local PostgreSQL available.

Next: inspect exact containing source CI; fix failures without skip/bypass, record actual72 counters and links. Then wire canonical private issuance before locks in central operational/subscription merchant wrappers, modernize affected bootstrap fixtures to actual tenant/auth LOGINs, and finally migrate the public predicate. Public fawri_tenant_or_audited_admin STILL TRUSTS raw fawri.tenant_id; successful P0_TENANT_GUC_TRUST_PROOF remains an OPEN vulnerability. Hosted grants/pooler, sensitive auth/privacy and other recorded critical gates remain open. No production/staging/Neon changes, Railway deploy, main push or PR merge. **Release decision: NO-GO.**

Historical checkpoints below; pending statements in them are superseded only by the exact-source evidence above.

## Provider overlap barrier correction — 2026-10-21T06:02:09.059431+03:00

8bc89fdb6d1f3669a400f06a6901b89f34299894:44/45 workflows SUCCESS;70 invocations,69 clean. Provider inbox scope/issuer revocation/recovery assertions PASS, receipt execution15/HTTP20/wire17 remain PASS. Only discovery fixture failed:8 PASS/3 FAIL (2 post-discovery barriers plus parent). Its FOR UPDATE merchant barrier blocked the scope issuer's FK KEY SHARE before the primary could reach the intended row lock. Full evidence: `evidence/P0-PROVIDER-SCOPE-CALLER-ATTEMPT-20261021.json`.

Correction changes the owned barrier to FOR NO KEY UPDATE, allowing issuer KEY SHARE while still blocking the real application's FOR UPDATE. It adds committed private-binding observation for the actual waiting runtime backend/in-progress full XID, then retains overlapping mapping mutation and all rejection/receipt/no-grant/session assertions. No source authorization/grants/CI thresholds changed. This correction is pending CI. Last fully accepted executable remains e63e5b8dc5e4bfe86f1ef4d8d97e3fde8c0db0fd (45/45;70 clean). **NO-GO.**

Verified 2026-10-21T05:50:58.183248+03:00 (Asia/Baghdad). **Release decision: NO-GO.**

Repository nora953/fawri-production-source; branch `fix/p0-provider-receipt-order-discovery-20261015`; open Draft [PR550](https://github.com/nora953/fawri-production-source/pull/550), actual base `test/p0-integrated-billing-meta-20261015`. No main push or merge.

## Exact accepted executable

`e63e5b8dc5e4bfe86f1ef4d8d97e3fde8c0db0fd`: **45/45 workflows completed SUCCESS;70 isolated invocations all exit0/fail0/skip0/cancel0.** [Isolated39515218237](https://github.com/nora953/fawri-production-source/actions/runs/39515218237), job118945629380. Actual checkout merge0d908389a9658b58c20439a707590937fb6d4844 and audit HEAD have identical treeb1231bfbb834023b56d82c78b2c9606ee88a843f. Do not transfer results to newer source without verification.

[Receipt scope acceptance](evidence/P0-RECEIPT-SCOPE-CALLER-ACCEPTANCE-20261021.json) contains all45 exact-source workflow links,70 counters and proof markers. Receipt executor15 PASS, real replay HTTP20 PASS, wire recovery17 PASS. All other relevant migration/scope16/auth10/admin9/runtime-privilege81/provider/cashier/Meta/knowledge/restore/Node22 invocations PASS. [Attempt896c1cd3](evidence/P0-RECEIPT-SCOPE-CALLER-ATTEMPT-20261020.json) preserves44/45 and the HTTP owner helper's2 failed subtests plus parent; correction asserts native ACL42501 if SELECT is absent, or zero RLS rows if granted, with exact positive definer result/audits and all owner/FORCE/snapshot/rollback assertions intact. No new grants or skipped cases.

## Implemented and verified

- Knowledge transactions and receipt execution billing transactions issue canonical private scopes on separate actual trusted auth LOGIN, before merchant/FK locks; retain same primary/operator lease through completion. Private scope rows are LOGIN/backend/full-XID/merchant bound, immutable and expiring; tested forgery/cross-session/cross-transaction replay/expiry/concurrency denied. Receipt actor/session/device/permission reauthorization and provider I/O outside transactions retained.
- Real receipt HTTP/wire fixtures now authenticate as LOGINs. Executor gets only reviewed billing DML/execution capability, no auth/audit/inbox CRUD or scope-table privileges. Actual executor test proves private scope/audit transaction binding and issuer revocation/recovery, with zero bootstrap pool calls. Existing exactly-once/fault/owner/privacy checks retained.
- Knowledge/learning/lifecycle/Meta actual primary/auth fixtures, strict Dashboard owned runner and production primary admission retained. Private knowledge policy proof changes only disposable fixture policies and restores them; production policy unchanged.
- Subscription, SaaS and SuperQi transactions share withOperationalTransaction discard behavior after uncertain BEGIN/COMMIT/ROLLBACK. Subscription actual-function VM7 and lifecycle10 PASS in priority CI. This control-flow proof is not database authorization certification.
- Migration0036 SQL==canonical stage, snapshot parent0035 and journal0..40 consistent; canonical reproduction/schema/candidate and41-migration isolated execution PASS.0037-0040 admin transaction/actual issuer/auth/private scope work retained. No SQL migration changed in this continuation. Canonical restricted non-LOGIN owner/stats/merchant SELECT revocation proof retained. Prior [transaction acceptance384c9667](evidence/P0-TRANSACTION-LIFECYCLE-ACCEPTANCE-20261020.json) and [knowledge251b8329](evidence/P0-KNOWLEDGE-SCOPE-CALLER-20261020.json) retain exact evidence. Dependency baseline High0/Critical0/Low0/Moderate2 from384c9667, not zero vulnerabilities; fetch newer security job before restating counts.

## Pending provider continuation in containing commit

SuperQi payment-reference attachment and confirmed SaaS receipt/entitlement phases now require private issuance before protected locks. Replay already issues on its operator lease, so confirmed phases mint only for confirmed callbacks. Existing initial durable receipt admission remains before ownership resolution. Transitional GUCs stay for unchanged public RLS.

Restricted primary testing exposed merchant-facing SaaS checkout reservation/attachment, order list/expiry and paid-reference reads that previously ran without a merchant transaction. These now use withMerchantOperationalTransaction, retaining two durable checkout phases around external provider I/O. Attachment UPDATE also checks merchant_id explicitly. This wrapper still has legacy GUC authority until the next central migration; do not call it secure production tenant RLS.

Disposable provider fixtures separate primary/auth LOGINs from root inspection/DDL; only two existing provider admission/resolver capabilities added. Inbox acknowledgment-loss child authenticates as actual runtime, validates identity/startup before arming proxy, and keeps auth issuer on direct connection. Discovery child gets separate auth URL. Added actual binding, issuer revoke/recovery, immutable receipt/single grant/session reset assertions in owned provider cases. These new DB assertions are PENDING CI. Local focused runtime/lifecycle/operator43, subscription+provider source8, guard/security34 PASS; syntax/policy/whitespace PASS. No local PostgreSQL run claimed.

## Remaining P0 / next precise action

Inspect containing commit's exact HEAD/PR/CI, repair real failures without skipped tests or bootstrap bypasses and record evidence. After provider continuation passes, remaining central issuers are operationalPostgresAuthority and postgresSubscriptionEntitlement; all6 legacy GUC writes still require removal at public predicate cutover. SaaS legacy unconfirmed/test-only event owner discovery remains unscoped and needs explicit trusted caller/tenant treatment before broad runtime certification.

**public.fawri_tenant_or_audited_admin still trusts raw fawri.tenant_id.** The retained successful P0_TENANT_GUC_TRUST_PROOF is an open vulnerability. Existing restricted-role admin audit forgery/active-window replay denials do not close this alternate tenant branch. Do not mark P0 complete. Hosted owner/grants/default ACLs/pooler, sensitive auth SELECT/privacy, cashier credential/session integrity, and prior provider/storage/retention/release gates remain uncertified. Keep smart replies and offline cashier separate, preserving offline essentials.

## Durable recovery and safety

No production/staging/Neon writes, Railway deploy, main push or PR merge. Only owned Docker network-none PostgreSQL fixtures. Verify Neon disposable identity before hosted use. All ref updates use expected-SHA non-force leases. Worktree fawri-runtime-scope was created at57da9fc9 and its HEAD stays there; working files contain connector-published newer changes. Fetch live HEAD/use a fresh checkout; never reset older dirty worktrees. GitHub is durable truth. **NO-GO.**

## Functional evidence triage (2026-10-23)

The existing issue ledger records scoped receipt and subscription tests, but does not establish complete P0 acceptance for offline primary cashier, seven-day subscription grace, per-branch stock, reconnection sync, retention, or storage. These remain OPEN until each requirement is mapped to an exact passing assertion and its execution evidence. No new test or hosted verification was performed. Release NO-GO.
