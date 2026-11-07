# P0 next emergency authority proof — 2026-10-23

This continues the4-table open scope after bounded Support acceptance94bc0546. No new production source, migration or hosted privilege change in this proof batch.

| Data family | Boundary to establish | Positive path to preserve |
|---|---|---|
| emergency_authorizations | Trusted owner authorization; no tenant key | Owner grant/revoke and assistant eligibility |
| emergency_access_requests | Internal owner/authorized-assistant request data | Pending approval, critical activation, snapshot/expiry |
| emergency_owner_alerts | Owner-only operational alerts; no tenant key | Owner overview and audit trail |
| emergency_merchant_notices | Matching merchant notice and read marker | Own notice list/read status, no foreign notice |

New emergency-privacy-authority-postgres.integration.test.mjs measures actual effective catalog/read authority with a restricted LOGIN, two synthetic merchants, scoped/unscoped classification, and exact restoration. Metadata UPDATE grants are not an executed mutation proof. A green diagnostic is measurement success, not security acceptance; no HTTP exploitation or hosted conclusion.

The existing emergency-read-access-postgres.integration.test.ts keeps its actual owner, trusted/untrusted assistant and merchant HTTP assertions. Its bootstrap moves to the existing owned tenant/auth LOGIN fixture, enforces attestation before DB import, scopes audit cleanup and makes cleanup errors visible while still closing server/pools/data. No assertions weakened. Both files join the existing owned priority audit; no new provisioning workflow or privileged pool.

Local syntax/whitespace PASS only; current runtime PENDING. Target88 native invocations is planned, not an actual result. Next inspect exact source/run/checkout, diagnostic marker, all88 summaries, original HTTP permission/expiry/revocation/audit cases and cleanup. Classify actual failures before remediation. Keep existing5-table Support acceptance bound to94bc0546. Release NO-GO; no hosted changes/P1/P2 or overall percentage.
