# P0 — Reply credit addition cannot silently activate an unpaid or suspended subscription

**Checkpoint:** 2026-11-10 (Baghdad). **Bounded result:** real restricted PostgreSQL source-flow PASS. **Gate:** no original P0 row closed; P0 hosted payment/provider and retention roles/policy remain OPEN/BLOCKED. PR #550 DRAFT; launch NO-GO.

## Genuine P0 source defect and correction

The production merchant subscription source [`postgresSubscriptionEntitlement.ts`](../../../artifacts/api-server/src/services/postgresSubscriptionEntitlement.ts) allowed the `add_replies` action to run:

```sql
status = CASE WHEN expires_at > $now THEN 'active' ELSE status END,
auto_reply_enabled = CASE WHEN expires_at > $now THEN TRUE ELSE auto_reply_enabled END
```

That treats a future expiry as **activation evidence**. A `pending_activation`, `suspended` or `expired` subscription with a future expiry could therefore be silently converted into `active` and re-enable auto-replies merely after an add-on credit mutation; no authorized subscription-plan activation/provider settlement was required by this SQL condition. Furthermore, `refreshLockedSubscription` could independently re-activate a stored `expired` subscription with future expiry when it derived status solely from expiry and balance.

[Production code fix `e0241ff2`](https://github.com/nora953/fawri-production-source/commit/e0241ff2a4e6455886930d03b76322de3b244831) makes both paths fail closed:
- Source refresh **preserves `pending_activation`, `suspended` AND `expired`** instead of treating a future date as implicit reactivation. Explicit reviewed plan-cycle activation/renewal sets `active` independently and remains the valid grant path.
- `add_replies` may restore `active` only for an **already activated, unexpired** `active` or `replies_exhausted` plan, retaining the previously established add-on/auto-reply behavior for legitimate subscriptions. It does not activate pending, suspended, expired or expired-date subscriptions.
- This does **not** invent a prohibition on administrative credit provision to pending subscriptions, nor treat add-on credit as proof of commercial provider payment. Those operations still require separately governed business/payment approval.

## Exact real PostgreSQL acceptance

[GitHub Actions **#42764461914**](https://github.com/nora953/fawri-production-source/actions/runs/42764461914) **COMPLETED SUCCESS** on test/workflow SHA [`795d4738`](https://github.com/nora953/fawri-production-source/commit/795d4738760a701f2ba4a3bbc991bd04121cb419). It executed `artifacts/api-server/tests/subscription-addon-activation-fail-closed-postgres.integration.test.mjs` using the **actual production subscription service** in fresh network-isolated Docker PostgreSQL 16, with real independently authenticated non-superuser merchant-scoped SQL and six distinct synthetic merchants. The fixture was destroyed after the run; no hosted or original Neon/Railway credentials were used.

Tests performed actual `applySubscriptionActionPostgres({action:'add_replies'})` followed by actual `reserveMerchantAutoReplyPostgres` and `getCurrentSubscriptionPostgres`:
- `pending_activation`, `suspended`, `expired` **with future expiry**, and `expired` **with past expiry** all retained their unapproved subscription status, **auto_reply_enabled=false**, and denied reply reservations without any debit ledger row.
- An already `active` subscription remained active, and a previously `replies_exhausted` legitimate future term recovered to active after an add-on credit. Those two correctly reserved one reply each.
- Each transaction changed **only** its own merchant/subscription; peer merchant SQL rows stayed unchanged.
- Exact log marker: `P0_ADDON_SUBSCRIPTION_ACTIVATION_FAIL_CLOSED_REAL_PG` with `"actualPostgres":true`, `"restrictedMerchantScopedSql":true`, `"syntheticMerchants":6`, `"pendingAndSuspendedStayBlocked":true`, `"expiredFutureCannotReactivate":true`, `"activeAndExhaustedStayFunctional":true`, `"deniedAutoReplies":4`, `"acceptedAutoReplies":2`, `"peerRowsUnchanged":true`, `"realPaymentProviderVerified":false`, `"hostedAccepted":false`.
- Audit result: `{"suite":"subscription-addon-activation-fail-closed-postgres.integration.test.mjs","auditBatch":"subscription-addon-activation","exit":0,"passed":1,"failed":0,"skipped":0,"summaryComplete":true}`.
- New [dedicated isolated workflow](../../../.github/workflows/p0-subscription-addon-activation.yml) uses a narrow `subscription-addon-activation` audit selector, rather than explicitly replaying the previously accepted broad P0 battery.
- [Full quality gates **#42764461910**](https://github.com/nora953/fawri-production-source/actions/runs/42764461910) **pending** at initial evidence checkpoint. Verify exact 4/4 job conclusions separately.

## What remains open

This is **source/runtime entitlement isolation**, not a hosted PG18 first-commercial migration, independently approved actual provider payment/refund/receipt, commercial subscription webhook verification, legal data-retention policy, or full administrative HTTP role matrix. It neither posts payment nor activates a real merchant subscription. Source audit ledger P0 remains at historical **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED among 45 known bounded rows**, 29/45 = 64.4% known source coverage **not overall launch readiness**, inventory explicitly incomplete. Parent P0 hosted provider payment/retention roles stay blocked or open; PR #550 remains DRAFT, launch NO-GO, no merge or deploy.
