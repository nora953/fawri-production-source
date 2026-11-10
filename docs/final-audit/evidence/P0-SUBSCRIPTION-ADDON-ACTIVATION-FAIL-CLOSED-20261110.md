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

## Addendum — active merchant opt-out must survive administrative credit (2026-11-10)

The original 6-merchant acceptance above remains valid for `pending_activation`, `suspended`, `expired` and exhausted authorized plans. **A separate source issue** remained in the same `add_replies` SQL: it set `auto_reply_enabled=TRUE` for **every** unexpired `active` subscription, even if a merchant had deliberately disabled automatic replies via `set_auto_reply(false)`. Administrative credit addition is not authority to override a merchant opt-out or send new messages.

[Source fix `72ecedfb`](https://github.com/nora953/fawri-production-source/commit/72ecedfb115b7a00a4cfe2e2db0ec00df00b1a33) preserves `auto_reply_enabled` for existing `active` subscriptions while **retaining** the existing automatic service resumption specifically for an unexpired `replies_exhausted` subscription receiving new reply credit. Future-dated pending/suspended/expired plans remain blocked from the earlier fix. No payment policy or permission to message outside Meta's 24-hour windows was changed.

[Exact improved real PostgreSQL/merchant-scoped audit **#42769440203**](https://github.com/nora953/fawri-production-source/actions/runs/42769440203) **COMPLETED SUCCESS**, [actual opt-out producer test `fc6c6ddc`](https://github.com/nora953/fawri-production-source/commit/fc6c6ddc7a098f197d7c75c02fc7f220b8ca4a69), with deterministic fixture [`662d605f`](https://github.com/nora953/fawri-production-source/commit/662d605f3b178f75dd2b143372741b1f482de1f7). The new seventh synthetic merchant started as active with replies allowed, ran the **actual production** `applySubscriptionActionPostgres({action:'set_auto_reply',enabled:false})` and confirmed persistent PostgreSQL opt-out; then an actual `add_replies` call left `status='active'`, `auto_reply_enabled=false` and actual `reserveMerchantAutoReplyPostgres` **denied** any reply/debit. Other six cases remained accepted (two legitimate auto replies, four not-authorized). Exact output:
`P0_ADDON_SUBSCRIPTION_ACTIVATION_FAIL_CLOSED_REAL_PG` with `actualPostgres:true`, `restrictedMerchantScopedSql:true`, `syntheticMerchants:7`, `activeManualOptOutPreserved:true`, `deniedAutoReplies:5`, `acceptedAutoReplies:2`, `peerRowsUnchanged:true`, `realPaymentProviderVerified:false`, `hostedAccepted:false`. Result `AUDIT_SUITE_RESULT` **passed:1 / failed:0 / skipped:0**.

The first expanded attempt [#42768665190](https://github.com/nora953/fawri-production-source/actions/runs/42768665190) failed the **preexisting** `subscriptions_time_range_check` because the fixture used logical `now=2026-11-10T06:00Z` but the current GitHub runner had already created its rows **after** that time. The migration checks `updated_at >= created_at`; when the service set `updated_at` to the logical test time, the check correctly rejected it. The test now seeds both creation and update timestamps before the fixed logical time, independent of runner wall-clock. This was a **test fixture correction, not a production schema relaxation**. The intermediate green [#42769226898](https://github.com/nora953/fawri-production-source/actions/runs/42769226898) used the originally seeded false preference; the final green #42769440203 additionally tests the actual opt-out setter.

[Final quality #42769440101](https://github.com/nora953/fawri-production-source/actions/runs/42769440101) was **queued** at addendum authoring and must be checked for 4/4 success on the accepted source SHA; docs-only commits may supersede it. This proves **one bounded source preference safeguard** and does not close any external P0 provider/Meta/hosted identity/retention gate. Source-only known register remains 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED, 64.4% of 45 known rows, **not** actual global launch percentage. PR #550 Draft, NO-GO, no hosted Neon/Railway write, merge, or deploy.

**Unresolved preference nuance:** a `replies_exhausted` state does not separately store whether automatic replies had been manually disabled *before* exhausting. This fix preserves existing exhaustion-refill semantics rather than inventing an unapproved persisted preference model. Any change to those semantics requires a separately reviewed policy/schema decision and real acceptance.
