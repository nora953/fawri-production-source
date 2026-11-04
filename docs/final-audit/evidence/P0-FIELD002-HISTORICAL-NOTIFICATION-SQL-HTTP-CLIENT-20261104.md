# FAWRI P0 FIELD002 — Historical SQL → HTTP → client acceptance (2026-11-04)

## Scope and authorization

- This is **bounded, real-app mounted HTTP validation against disposable PostgreSQL**, with source-grounded hosted SQL inventory. It is **not live Railway frontend, real customer row export, staged migration, or P0 closure**.
- Owner authorized investigation and testing on a separately cloned Neon branch, with no writes to original `staging-runtime`. This test modification runs entirely in GitHub isolated CI; Neon SQL verification was **read-only**.
- Source repository `nora953/fawri-production-source`, PR #550 draft, branch `fix/p0-provider-receipt-order-discovery-20261015`; accepted test commit `e778a5c5ba8f95ef6b477ae6c11487705bcc1340`, source file `artifacts/api-server/tests/merchant-notification-privacy-http-postgres.integration.test.mjs`.

## Grounded historical SQL inventory — hosted read-only, no row payloads

- Actual Neon `Fawri-Staging` source branch `staging-runtime`: **28 stored `public.notifications` rows**, **7 types**: `inspection_session_request` **11**, `subscription_balance_purchase` **9**, `subscription_plan_event` **3**, `subscription_emergency_activated` **2**, `subscription_expired` **1**, `subscription_expiry_reminder` **1**, `support_reply_reminder` **1**.
- A read-only `jsonb_object_keys` aggregate found **40 distinct (type, variable key) pairs** over these seven types. Independently parsed `NOTIFICATION_RESPONSE_VARIABLE_FIELDS` from `artifacts/api-server/src/services/postgresMerchantNotificationAuthority.ts`; **7/7 types have a declared field allowlist** and **0 stored keys fall outside** its corresponding allowlist. Values, merchant/account IDs, ticket subjects and variable JSON were not fetched or copied into this evidence.
- **15/28** have null or incomplete `source_entity_type/source_entity_id`: **9** balance purchases, **3** plan events, **2** emergency activations, **1** expiry reminder. The other **13** have source references (including **11/11** actual inspection records). This does **not** prove original writer provenance, safe relinking, consumer compatibility across unknown clients, or policy approval.
- Historical enumerated `operation`, `plan_name`, `mode` fields were checked in read-only aggregates: plan events use supported `change` / `renew`, plan names are lower-case `silver` / `gold`, inspection modes are `independent_read_only` / `live_observation`. No personal data values included.

## New actual mounted integration evidence

- Regression added at commits `6e534042` and `4f3a0aec` and finalized at `e778a5c5`. Test fixture deliberately has **7 synthetic notification records** covering the observed **40 permitted historical variable keys** (including optional batch/previous-plan keys); injected private sentinel and forged reserved `id`, `type`, `created_at`, `read_at`. Synthetic fixture uses no hosted customer content.
- Real authenticated merchant SQL HTTP list `GET /api/auth/notifications?limit=50` must preserve seven canonical types, include **exact per-type allowed field sets**, exclude the stored-only sentinel and forged identity/timestamps, and leave SQL `variables` unmodified.
- An authenticated **different merchant** gets none of these seven rows and receives **404/NOTIFICATION_NOT_FOUND** for each foreign `PATCH /notifications/:id/read`; full seven-row SQL snapshot remains identical after the denied requests.
- The owning merchant can `PATCH` its plan event as read, with the exact accepted new `read_at`, and all seven `variables` unchanged and peer `read_at` values unchanged.
- The test imports the **real frontend `isMerchantNotificationRecord` validator** from `artifacts/fawri/src/lib/merchantNotificationsAuthority.ts`. It confirms **six** historical type records with complete contract fields are accepted by the actual frontend validator and the owning plan-event read remains valid. **Source-less synthetic inspection notification intentionally fails frontend validation** because it lacks an authoritative joined `request_status`: code must not fabricate a decision from stale stored JSON. **Source-linked** inspection events and their current statuses are already covered in `artifacts/api-server/tests/operational-notification-field-full-app-http-postgres.integration.test.mjs` and CI, but this seven-row test does not repeat that expensive setup.
- The first expanded fixture commit `4f3a0aec` failed because the test's own expected plan-field list still named only the older two fields; it did not expose a leaking field. Corrected `38ee352f` to derive expected keys from the full historical fixture; `e778a5c5` added frontend validator coverage with observed enum values. **Do not mark the superseded 4f run green**.
- Accepted focused proof for `e778a5c5`: [P0 notification privacy HTTP matrix run 41811476341](https://github.com/nora953/fawri-production-source/actions/runs/41811476341), job `126511524714`, **SUCCESS**; CI log explicitly contains `ok 7 - seven hosted-observed historical notification types retain canonical HTTP fields without leaking stored extensions`, parent notification TAP **11 passed / 0 failed**. This workflow also executes other notification and conversation privacy suites; do not conflate their totals.
- **Full PR workflow CI** for `e778a5c5` was **49 success / 10 in progress / 0 failure** at this reporting checkpoint; re-query GitHub for the final number before claiming 59/59. Earlier unrelated source commit `b3c5f02b` had **59/59 success**.

## Remaining precise blockers, no false closure

1. **FIELD002-R2** custom/external consumers, historical writer provenance and safe disposition for **15 missing source references** are unproven. Keep source values intact; no speculative backfill.
2. **FIELD002-R3** product policy on canonical online new-order notification and whether three legacy-only subscription producer types remain read-only compatibility has not been approved. Do not invent new producers.
3. Hosted **own/foreign/revoked** through true deployed app credentials and verified actual runtime DB login remain unproven. The old `fawri_staging_runtime` login was observed with `BYPASSRLS` and `CREATEROLE`; do not trust that role as tenant authority.
4. On isolated Neon clone, RLS enabled **8/8** with policies and 24/25 missing migrations applied, but final **0052 remains blocked** by non-superuser PostgreSQL role owner/membership rules. Original branch still **28** migrations, clone **52**; no original writes or deployment.
5. Parent `P0-RESIDUAL-MERCHANT-PRIVACY-001/http` and FIELD002 **OPEN**; known P0 register **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED**, full denominator unknown, commercial release **NO-GO**.

## Next independent action

Reconcile source-linked and legacy source-less notification frontend behavior against **supported product policy**, and verify actual deployed DB role/branch before any controlled hosted acceptance. Continue privacy actor/alternate-route coverage without duplicating already proven two-merchant SQL/HTTP cases. No original Neon changes or PR merge without separate explicit authorization.
