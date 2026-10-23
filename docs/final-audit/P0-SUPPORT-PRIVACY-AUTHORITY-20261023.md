# P0 Support/emergency privacy authority — 2026-10-23

## Preserved evidence

Accepted source00c56c26 native39873207354/job120152397388 includes support-postgres-cutover.integration.test.ts:5 TAP passes,0 failed/skipped/cancelled. Existing cases exercise matching-tenant HTTP authorization, current manage_support revocation despite a stale session, exact-session read-only preview and termination denial. Do not repeat them merely for timestamps. Admin audit boundary on the same source passed9 TAP tests. This does not cover every Support/emergency actor or grant.

Historical consent expiry/lifecycle evidence: SEQ_286_289_SUPPORT_EXPIRY_POSTGRES_20261013.md, source23efe18cb9089507909b3d390fea790272e22cd7/run38433417141/job115421169603. Preserve the original limits and findings; do not call it current-source acceptance.

## Missing bounded proof

Source postgresRuntimeRlsSecurity.ts does not list Support/emergency tables in PRODUCTION_TENANT_RLS_TABLES. Canonical SQL must be evaluated as executed, rather than treating declarative snapshot flags as effective RLS facts. The existing disposable knowledge fixture creates an actual restricted LOGIN and admits it through production readiness, with separate trusted authentication. This is suitable for a bounded effective-authority diagnostic.

New fixture p0-support-privacy-authority.test.mjs records catalog RLS/FORCE RLS/policy counts and effective SELECT/UPDATE permissions for9 Support/emergency tables; checks actual nonprivileged LOGIN identity; creates only two synthetic merchant/ticket records; verifies legitimate scoped reads and exact restoration; classifies isolated read visibility without printing data. A green diagnostic is successful measurement, not vulnerability remediation or security acceptance. No HTTP attack, hosted connection, real credentials or customer data involved.

Dedicated workflow audit-support-privacy-authority.yml uses the existing owned offline Docker pattern, a fresh disposable PostgreSQL16 instance, attestation, frozen dependencies without lifecycle scripts, read-only source mount, no published ports/network route/hosted secrets and mandatory cleanup. Executor rejects failed, partial, skipped and cancelled TAP summaries. No existing tests or production source were weakened.

## Authorized operation map requiring preservation

| Actor/path | Source boundary | Acceptance limit |
|---|---|---|
| Merchant ticket/message/attachment reads and writes | postgresSupportAuthority merchant transactions and matching identifiers | Current HTTP cutover proof retained; full SQL actor matrix pending |
| Support administrator directory and assignment operations | postgresSupportAuthority global operational pool; router current permissions | Requires legitimate global view; blanket tenant RLS must not break it |
| Approved inspection and preview | postgresSupportInspectionAuthority; scoped snapshot services | Consent/session/expiry/read-only contract must remain intact |
| Background Support lifecycle/image authorization | postgresSupportLifecycleAuthority, postgresSupportImageAuthority | Global cleanup/reminders and before-write authorization must remain intact |
| Emergency owner/authorized assistant operations | postgresEmergencyReadAccessAuthority; scoped postgresEmergencySnapshot | Actor authorization, expiry and audit chain must remain intact |

Runtime result PENDING. Next inspect exact source/run/checkout, complete counters and diagnostic marker, classify finding without inferring HTTP exploitability, then add missing defensive proof and focused remediation. No release closure, fullP0 denominator or percentage. NO-GO; no hosted operation/change/deployment, migration, ACL/secret change, main push, merge, P1/P2.
