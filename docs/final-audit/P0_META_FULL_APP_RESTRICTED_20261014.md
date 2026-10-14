# Signed full-app Meta restricted-role acceptance — 2026-10-14

Prepared test; actual PostgreSQL acceptance pending CI. Draft stacked on #546. #535 remains OPEN.

The original app.ts Express application runs in a fresh child process with required operational/subscription PostgreSQL authorities under a non-owner/non-superuser/non-BYPASSRLS role. Real signed loopback HTTP traverses original signature verification, operational mapping, manual-conversation filter and durable encrypted tenant queue. The original live worker is driven through its production runOnce to claim/decrypt/prepare/reserve/send/complete. Only the external Graph transport is an owned local synthetic HTTP provider; embedding is a synthetic configured provider. No real Meta/AI traffic.

Eight bounded cases cover invalid signatures; unknown/disconnected pages; revoked resolver grant; two-tenant ingress/duplicate queue before debit; original live worker once-only debit/send/completion; manual inbound persistence with no automatic reply; expired subscription suppression; tenant read isolation and pool context reset. Original middleware, route, queue and worker are not replaced. The deployment index/bootstrap/automatic scheduler and full production role grant rollout remain separate.

Only guard-attested offline disposable PostgreSQL in existing CI. No hosted database/migrations/grants, external provider traffic, main merge or deploy. Syntax and diff checks passed locally. Existing earlier bounded Meta and lifecycle suites remain intact and their totals overlap this runner.
