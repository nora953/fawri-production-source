# P0 scoped Support privacy correction — 2026-10-23

## Bounded source change

Addresses the5 Support tables in P0-SUPPORT-PRIVACY-AUTHORITY-001. The4 emergency tables remain explicitly open. Canonical0047 enables RLS with merchant scope issued through the accepted private authority, or the existing safe trusted authentication LOGIN selected only from server configuration. A directory audit alone does not authorize these Support policies. No new roles, marker grants, secrets or public privileged entrypoint are introduced.

Child inserts/updates require matching tenant and parent ticket/message/request references. Migration preflight refuses inconsistent historical relationships with a sanitized error before policy changes. Source schema policy metadata, reviewed SQL stage, deterministic snapshot and journal are updated together; full canonical reproduction must still be verified by CI.

Global Support administration, inspection/preview validation, lifecycle sweeps, image reconciliation and authorized observability aggregates now use the existing identity-checked trusted transaction boundary. Merchant reads/writes and image access retain transaction-scoped merchant authority. Current route permission and session guards remain unchanged. Message reminder resets execute within the same message transaction. Retention media capture already uses merchant scope; deletion already uses trusted authentication.

This choice preserves the established trusted administrative/authentication data-plane boundary without conferring that capability on the primary LOGIN. No new hosted privilege plan is executed. Existing auth pool identity/owner/role checks and non-PUBLIC marker remain prerequisites; release must fail closed when unavailable.

## Validation

Local10 source contracts PASS,0 failed/skipped/cancelled; MJS syntax/whitespace PASS. Native/typecheck/canonical reproduction PENDING, not claimed locally. New support-privacy-tenant-rls-postgres.integration.test.mjs uses an owned cluster and actual restricted/trusted LOGINs; checks5 effective RLS tables/readiness, refuses missing RLS, denies foreign/unscoped reads/writes and mismatched parents, executes canonical historical preflight, preserves authorized global/merchant operations, exact rollback and atomic reminder reset behavior.

Existing Support HTTP permission revocation, matching tenant, exact-session read-only preview, termination, lifecycle and before-filesystem-write authorization assertions remain unchanged. Image fixture now supplies actual restricted/trusted LOGINs. Broader regression is warranted by source/schema/transaction changes; no manual passing-suite retry.

Baseline d4ccf125 is fully classified:48/48 workflows,85 clean native invocations plus4 focused diagnostic TAP passes. That green baseline confirms the finding and is not fix acceptance. Current correction requires exact source SHA, workflow/run/job IDs, actual counters, canonical SQL/snapshot verification and artifacts before any bounded closure.

Release NO-GO. Emergency privacy, hosted parity/identity/pooling, incident handling and fullP0 proof inventory remain open. No hosted operations, deployment, migrations, ACL/secret changes, main push, merge, P1/P2.
