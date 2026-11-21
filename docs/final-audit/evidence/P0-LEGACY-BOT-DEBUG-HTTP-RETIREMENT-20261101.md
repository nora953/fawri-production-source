# P0 — Legacy bot debug HTTP retirement (2026-11-01)

- Scope: GitHub-only PostgreSQL-required runtime. No hosted verification, deploy, policy approval, or release sign-off.
- Source: `artifacts/api-server/src/routes/indexModulePart3.ts`; `/bot/debug` returns HTTP 410 with `LEGACY_BOT_DEBUG_DISABLED`, `Cache-Control: no-store`, before reading legacy `orderDraftsByConversation` or projecting debug fields when `operationalPostgresAuthorityRequired()` is true.
- Code commits: `ee8b2ad510ead4eee5d21e35bbd6fc5063a3af7d` (initial guard), `5b109b44bdbef8b34c45d6dda70d9502987bac5c` (align established error contract and no-store header).
- Existing regression: `artifacts/api-server/tests/consumer-full-app-privacy-http-postgres.integration.test.mjs` checks the actual app's `/api/bot/debug` and mixed-case alias, rejects draft/page/catalog/filesystem projections, requires 410 and `LEGACY_BOT_DEBUG_DISABLED`, and verifies rejected actors and unchanged SQL state.
- GitHub Actions acceptance for **exact code commit** `5b109b44bdbef8b34c45d6dda70d9502987bac5c`: **59/59 completed SUCCESS**, zero failures/cancellations, including isolated PostgreSQL engineering audit and final security/supply-chain checks. This is source/CI acceptance only.
- This does **not** establish complete eight-table HTTP actor coverage, hosted identity acceptance, data retention approval, or overall P0 closure. Release remains **NO-GO**.
