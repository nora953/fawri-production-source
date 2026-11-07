# P0 cashier discount policy mutation authority — 2026-10-22

## Actual baseline finding

Executable d051f0c32e29e66ddda60787f6f873c6948a841f:47/47 workflows SUCCESS;83/83 isolated invocations clean,81 unique files. Native39826479484/job119990994336. Source/checkout5013e81e6373d7cb727f66ca7571be6af719c7f5 share tree338d5d9067d65aec29f530827469c39690233131. [Exact baseline proof and invocations](evidence/P0-CASHIER-DISCOUNT-POLICY-BASELINE-20261022.json).

Two actual LOGINs/two merchants: both actual sale validators initially required manager approval for discount250 on total1000 with amount policy100. Scoped primary changed its own cashier max_amount_minor to300. Readiness ACCEPTED the role and the same real validator ACCEPTED the unchanged250 request without an approval. Trusted-auth finally restored the exact original policy, including microsecond timestamps/version; validator required approval again. Other merchant and staff/permission/PIN/session/approval state remained unchanged.

This proves a same-tenant SQL policy-mutation/validator-authority gap in the isolated fixture. No HTTP/full sale, hosted exposure or PIN hash/manager role modification is claimed. Baseline green reports the gap; it is not security acceptance. No CI failure or retry observed.

## Prepared remediation, native result pending

The only production change adds merchant_cashier_staff_discount_policies to AUTHENTICATION_INTEGRITY_TABLES. Existing production admission now rejects reachable table INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES and column INSERT/UPDATE/REFERENCES through direct/PUBLIC/inherited/SET roles. The disposable helper already derives privilege restriction from this inventory, so actual tenant LOGIN receives policy reads without mutation; trusted auth retains writes. No service/policy thresholds/schema/migrations/SQL grants/credentials/hosted changes.

Readiness refuses unsafe ACLs; it does not revoke or provision a hosted grant. Current fixture denial proof must not be represented as completed hosted hardening.

The native regression requires denied42501 for the original primary increase and the unchanged validator's missing-approval rejection. Trusted auth upsert300 must still enable the same within-limit validator decision; exact restoration must restore rejection. Nine column UPDATE plus INSERT/DELETE/TRUNCATE denials planned; scoped reads remain isolated for both merchants. Six table privilege forms plus every column UPDATE/INSERT/REFERENCES through five reachability modes give165 grant/revoke cases, including original session privileges behind SET ROLE. Safe unreachable grant is accepted; revocation recovers readiness.

Older business-RLS suite now requires policy primary mutation denial, auth upsert with rollback, cross-merchant42501 and unchanged attribution ordinary business write rollback. Other settings/approval isolation, manager issue/consume locks/replay/rollback/version/kind assertions remain. Unit inventory assertion added. Existing complete isolated HTTP policy PUT/permission/session/role/atomic rollback and manager PIN suites are retained.

Local native node --check PASS. Full corrected-source unit/type/build/native/CI PENDING; no local DB/dependency execution claimed. Prior baseline does not certify this remediation. Last accepted remediation remains645b534aea0d32848b4467b5bbebf8fd671deddb (47/47+82/82), with [non-row acceptance](evidence/P0-CASHIER-NONROW-PRIVILEGE-ACCEPTANCE-20261022.json).

## Exact continuation

Read final new source P0_CASHIER_DISCOUNT_POLICY_INTEGRITY_REMEDIATION marker, complete clean native invocation summaries, Foundation/quality/schema/security once available. Preserve exact source/tree/checkout/run/job/failures. If pending, continue independent source review without status loops; no passing-test rerun for docs alone.

After acceptance, proceed to approval provenance proof documented in [approval mutation source review](P0-CASHIER-APPROVAL-MUTATION-TRACE-20261022.md). That candidate forged approval/consumed-marker question is not yet runtime proven; retain manager issuance, replay and settings->approval->staff lock/kind-change atomicity.

Release NO-GO; P0 percentage UNMEASURED. Full remaining same-tenant/alternate-path/auth/privacy/offline/grace/sync/retention/provider/storage/P0 inventory OPEN. GitHub/Actions only; no external connector/hosted change/deploy/main push/merge/credential rotation/P1/P2.
