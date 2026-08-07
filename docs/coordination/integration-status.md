# Fawri parallel integration status

## Coordination snapshot

- Coordination base: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Integration branch: `parallel/integration-coordinator`
- Coordinator remote HEAD before this status update: `1cfac94c3953a98ba5e911e70f282770c6d18f54`
- Validated eventual target: `hardening/postgresql-foundation`
- Direct modification/merge to `main`: **not authorized**
- Replit Agent / Production DB: **not allowed**
- Latest ordered-integration checkpoint: `2026-08-07 16:36 +03:00`
- Current release decision: **NO-GO**

## Ordered integration state

1. `parallel/auth-session-hardening` — **reviewed and merged first**
2. `parallel/channels-messaging` — **reviewed and merged second**
3. `parallel/orders-settings-finalization` — **reviewed and merged third**
4. `parallel/catalog-inventory` — **reviewed and merged fourth**
5. `parallel/knowledge-ai` — **corrected SHA reviewed and merged fifth; shared Knowledge cutover applied**
6. `parallel/db-migration-cutover` — **OPEN POSITION: corrected Final SHA required; old SHA must not be merged**
7. `parallel/quality-observability` — blocked until corrected DB is reviewed/integrated
8. Final shared wiring/validation/migration/backup/release checks — blocked until corrected DB then Quality are closed

No merge to `main` or `hardening/postgresql-foundation` has been performed by the coordinator.

## Lane status

| Lane | Branch | Status | Reviewed SHA | Integrated merge SHA | Notes |
|---|---|---|---|---|---|
| Auth/session/admin security | `parallel/auth-session-hardening` | merged first; shared auth cutover implemented; validation pending | `d4f4ce2e3bd3cb1e27deb28a30249ce87bb0d25b` | `dc57eb52a4cae97730248897ebd314317f252b75` | Cookie/session v2 authority active in coordinator tree; legacy external bearer/cookie authority cut off; not release-green until full integrated HTTP/build/DB proof |
| Channels/messaging | `parallel/channels-messaging` | merged second; safe shared surfaces wired; live Meta activation gated | `22857159593aebeea0a12e6782581da6358080b3` | `a03b6c4c6c78b5d55cd247a5999cdaf25f727e6e` | Channel/DLQ surfaces use auth v2; ServerChannelsPage active; legacy Meta connect/callback blocked and Meta worker default-off pending encrypted OAuth/send + DB/KMS |
| Orders/settings | `parallel/orders-settings-finalization` | merged third; settings router mounted; remaining queue/worker gates retained | `bde53f403f63d680fd96c1d8b8a5e264010d9b41` | `4aeae2b243d4e932f3f22e1a40eb593add3e4348` | Settings route uses auth v2; temporary PaymentStatus compatibility points to canonical OrderPaymentStatus; queue-v2 coordination and claimed-reply race remain activation blockers |
| Catalog/inventory | `parallel/catalog-inventory` | merged fourth; catalog router mounted behind secure v2 session | `ce363f7105f33e942c6c47ef8907dfb9b59658f6` | `7a3af0bc246152a5320ed86a835288d552497c73` | Server Products wrapper is present; legacy bot catalog must be replaced before live message activation |
| Knowledge/AI | `parallel/knowledge-ai` | **corrected blocker closed; reviewed and merged fifth; server pages/router active** | `6cf84ca9b187ba40776330a72b01e82aa93d0b8b` | `44d4cb50579a11d5c89cb8938fdbda841670aa3f` | Corrected runtime fails closed on structural corruption; legacy knowledge API blocked; Meta/AI live send remains disabled until DB/vector/fact/policy integration |
| PostgreSQL migration/cutover | `parallel/db-migration-cutover` | old SHA reviewed; **reopened for cross-lane schema reconciliation; corrected Final SHA required** | old final `b7f3756f907fec3ead05be6c5450c857f073a75c`; tested DB code `4dca348d33f827e3f53a26c993768f741accd525` | — | Old DB-owned gates passed for the schema they covered, but final Auth/Channels/Orders/Catalog/Knowledge requests were incomplete; do not merge old SHA |
| Quality/observability | `parallel/quality-observability` | reviewed but blocked by explicit ordering rule | `b473fb8397814aa7bd91e0e323dc6003f6ba96f6` | — | Do not merge or run final release validation until corrected DB is integrated |

# Ordered merge history and shared wiring

## 1. Auth/session — merged first

- Internal integration PR: `#6`
- Reviewed lane SHA: `d4f4ce2e3bd3cb1e27deb28a30249ce87bb0d25b`
- Merge commit: `dc57eb52a4cae97730248897ebd314317f252b75`
- Auth v2 cookie/session authority is mounted centrally before protected domain routes.
- Client legacy admin Bearer is rejected and client legacy merchant cookie is discarded at the cutover boundary.
- Admin frontend uses cookies plus stable non-secret `X-Fawri-Device-Id`; forced password change revokes sessions and requires reauthentication.
- Work Monitor uses v2 session/device state.
- Auth remains **not release-green** until repository-native build/typecheck, mounted HTTP abuse/tenant/role tests, browser-storage cleanup and PostgreSQL transaction/concurrency tests pass on an integrated SHA.

## 2. Channels/messaging — merged second

- Internal integration PR: `#7`
- Reviewed lane SHA: `22857159593aebeea0a12e6782581da6358080b3`
- Merge commit: `a03b6c4c6c78b5d55cd247a5999cdaf25f727e6e`

Coordinator shared wiring:

- `d6283a4059ca4f317f54c1d5ca94fddc808c7986` — channel operations switched to auth v2.
- `d585fde42d318c1615aa70efb27e9316fd677327` — channel router + DLQ admin router mounted with method/path-sensitive v2 permissions; legacy Meta connection gate added.
- `41fdfc2c36aa49d096dea57168eb0998088c6b5b` — `ChannelsPage.ts` activates `ServerChannelsPage`.
- `a18abb02faf27bc235c6da3f1480923e54579d81` — Meta durable worker starts only when `FAWRI_META_CUTOVER_READY=1`; default is fail-closed/off.

Still required before Meta activation:

- replace legacy OAuth token persistence with encrypted `connectMetaChannel(...)` storage;
- replace legacy send-path plaintext reads/environment fallback with `readMetaChannelCredential(...)`;
- remove unsafe response-body/customer/provider logging;
- use approved production KMS/HSM-style key management and rotation;
- integrate corrected PostgreSQL channel/job/reservation/refund/outbound-delivery contracts;
- pass fake-transport integration tests before setting `FAWRI_META_CUTOVER_READY=1`.

## 3. Orders/settings — merged third

- Internal integration PR: `#8`
- Reviewed lane SHA: `bde53f403f63d680fd96c1d8b8a5e264010d9b41`
- Merge commit: `4aeae2b243d4e932f3f22e1a40eb593add3e4348`

Coordinator shared wiring:

- `3601b889977d7e0897cbac735f038aacc7b9f54f` — settings route switched to auth v2.
- `8446bef47ee5ea3055c52b960faf7fd747d53716` — mounted `merchantSettingsRouter`.
- `848ab11f8d0502b1f57e5ba3d078dc890b1b363e` — temporary compatibility alias maps `PaymentStatus` to canonical `OrderPaymentStatus`.

Still required before worker activation/final validation:

- replace direct queue-file coordination in settings with queue-v2 central APIs or corrected PostgreSQL transactional replacement;
- a claimed `meta.webhook.reply` job must re-read settings/version before credit reservation and again before external Meta delivery, suppressing/rolling back on disable;
- remove remaining base-era auth helper dependence where present;
- remove temporary PaymentStatus alias after consumers use `OrderPaymentStatus` directly and full frontend build passes.

## 4. Catalog/inventory — merged fourth

- Internal integration PR: `#9`
- Reviewed lane SHA: `ce363f7105f33e942c6c47ef8907dfb9b59658f6`
- Merge commit: `7a3af0bc246152a5320ed86a835288d552497c73`
- `9cd91fa63910acecdfa4a457d0e22a54774fe92b` mounted catalog router with auth-v2 guard.

Still required before live message activation:

- replace legacy bot `productsByMerchant` authority with tenant-safe server catalog adapter;
- exclude `allow_fawri_reply === false`, `draft`, and `hidden_from_fawri`;
- remove dual catalog authority before live message/AI worker activation;
- integrate corrected PostgreSQL catalog schema/idempotency/inventory contracts.

## 5. Knowledge/AI — corrected, reviewed and merged fifth

### Corrected SHA review

Previous reviewed SHA:
`a09f1a3b1b72d9dd7834db8ae6a4c0e971e38744`

Corrected reviewed Final SHA:
`6cf84ca9b187ba40776330a72b01e82aa93d0b8b`

Direct previous-to-corrected comparison:

- 3 commits ahead / 0 behind;
- exactly 3 changed files:
  - `artifacts/api-server/src/services/knowledge/knowledgeStateStore.ts`
  - `artifacts/api-server/tests/knowledge-ai-runtime.test.ts`
  - `docs/coordination/handoffs/knowledge-ai.md`
- no DB/shared/Meta/auth/orders/catalog/package/workflow changes;
- DB schema contract unchanged.

Blocker closure verified:

- authoritative runtime root/schema/collections/records are strictly validated;
- structurally invalid parseable JSON fails closed as a whole;
- no invalid record is filtered, dropped, repaired or normalized while loading authoritative runtime;
- `mutate()` validates disk state before running the operation;
- `writeState()` validates the complete in-memory state before any temporary write;
- refused runtime remains byte-for-byte unchanged;
- ambiguous legacy provenance remains untrusted;
- `openai_generated` cannot become approved/safe or `merchant_approved` implicitly;
- structural errors use stable safe codes/messages without customer text.

Documented corrected-lane evidence:

- Knowledge/AI focused: **19 passed / 0 failed**;
- Audit executable: **3 passed / 0 failed**;
- static tenant/browser authority checks: PASS;
- targeted TypeScript services/state: PASS;
- targeted TypeScript routes: PASS;
- targeted frontend TypeScript: PASS;
- GitHub Actions runs on corrected Final SHA: none;
- combined statuses on corrected Final SHA: none;
- therefore no CI-green claim.

### Ordered merge

- Internal integration PR: `#10`
- Exact corrected head: `6cf84ca9b187ba40776330a72b01e82aa93d0b8b`
- Merge commit: `44d4cb50579a11d5c89cb8938fdbda841670aa3f`
- Target: `parallel/integration-coordinator` only.

### Coordinator shared Knowledge cutover

- `19541832644a6c3dbe8c67d727bad1297b2caead` — `knowledge-operations.ts` switched to auth v2.
- `eb2e4afaa41faca2d7c9ab4387b0b6a35be39942` — saved-answer operations switched to auth v2.
- `2757c4ccc894ed2b4a3da5fa247825d7c6e0a897` — training operations switched to auth v2.
- `694bcde4353d3278bf13c90a98c0cc44218b1d53` — mounted `/api/knowledge` and blocked legacy `/api/saved-answers` and `/api/bot-training` before the legacy router with `LEGACY_KNOWLEDGE_AUTHORITY_DISABLED`.
- `1cfac94c3953a98ba5e911e70f282770c6d18f54` — dashboard imports explicitly activate `SavedAnswersPage.ts` and `TrainingPage.ts`, which resolve to `ServerSavedAnswersPage` and `ServerTrainingPage`.

Current Knowledge boundary:

- `/api/knowledge/**` is the sole merchant-facing knowledge/training authority and uses auth v2.
- Legacy saved-answer/training API paths are unreachable before the legacy shared router.
- Server-backed Saved Answers and Training pages are active.
- The single decision engine remains `fawri_knowledge_decision_engine_v1`.
- Browser policy remains ignored; generated auto-reply policy remains false.
- **Meta/AI live send is not activated.**
- `knowledge-runtime.json` remains transitional and must be replaced by corrected PostgreSQL transactional storage before production.
- Production semantic retrieval must use tenant-filtered pgvector/equivalent approved/safe knowledge only.
- A server-only `KnowledgeFactResolver` and `MerchantPolicyContext` must be injected from catalog/inventory, merchant settings and order facts/policy before live message activation.

# Position 6 — PostgreSQL corrected Final SHA required

Old DB final SHA:
`b7f3756f907fec3ead05be6c5450c857f073a75c`

Tested old DB code SHA:
`4dca348d33f827e3f53a26c993768f741accd525`

PR #5 remains Draft/Open/Unmerged. The old DB SHA must **not** be merged.

A new corrected DB Final SHA must reconcile all final domain contracts, including the corrected Knowledge contract (which did not change the DB request itself).

Required corrected DB reconciliation:

### Auth/session

- OTP challenge persistence with single-use/supersession/expiry/attempt/cooldown semantics.
- Complete idle/absolute session expiry, rotation-successor/revoke-all/security-version transaction semantics.
- Trusted-device transactional cap/revoke semantics.
- Bounded/privacy-safe login-abuse records.
- Sanitized auth audit storage.
- DB-enforced merchant/admin profile mutual exclusion.
- Duplicate phone/ambiguous-role migration abort; do not migrate weak legacy sessions.

### Channels/messaging

- Versioned encrypted channel connection lifecycle.
- Database-time leases and `FOR UPDATE SKIP LOCKED` durable claims.
- Inbound event dedupe + enqueue transaction.
- Reply reservation/debit, one-time refund and outbound `pending/sent/confirmed_failed/uncertain` delivery contracts.
- Settings-version observation and privileged/payload-safe job inspection.

### Orders/settings

- `order_payment_decisions` with tenant-composite FK, immutable actor provenance, expected/result version and `legacy_import` support.
- Terminal order linkage to decision provenance.
- Atomic order update + payment decision transaction.
- Transactional settings-version reply suppression.
- Requested RLS/tenant context and bounded settings checks.

### Catalog/inventory

- Product/variant positive versions, external ref, compare-at/stock constraints.
- Variant options/signature uniqueness.
- One merchant-scoped normalized SKU/barcode registry spanning products and variants.
- Image-reference table, durable idempotency keys and inventory mutation ledger.
- Variant/product aggregate-stock invariant.

### Knowledge/AI

- Replace stale knowledge schema that stores raw customer text.
- Redacted preview + digest only for training/audit authority.
- Explicit provenance/approval/version contracts and tenant-composite training FK.
- `safe_to_auto_reply=true` only for approved `merchant_approved` knowledge.
- pgvector/equivalent embeddings with tenant filter before scoring and no persisted raw customer query.
- deterministic fail-closed migration of ambiguous legacy provenance.

A new DB Final SHA plus rerun DB evidence is required before position 6 can be integrated.

# Quality / final validation — explicitly blocked

Quality reviewed SHA:
`b473fb8397814aa7bd91e0e323dc6003f6ba96f6`

Do not merge Quality yet and do not execute final shared validation while corrected DB remains open.

Previously recorded evidence remains contextual only:

- Quality Gates `31137063434`: **FAILURE**
- Security/supply-chain `31137063654`: **FAILURE**
- Backup/restore `31137063594`: **SUCCESS**
- Dependency audit reported 22 vulnerabilities including 14 high; do not weaken `pnpm audit --audit-level=high`.

Final repository-wide typecheck/build, broad PostgreSQL validation, fake Meta worker integration, browser operational-storage audit, dependency/security matrices and release-candidate backup/restore are intentionally deferred until corrected DB then Quality are integrated.

# Validation ledger at this checkpoint

- Auth lane: documented 15/15 focused tests + targeted TypeScript pass before merge; integrated full proof pending.
- Channels lane: documented 13 targeted tests before merge; shared activation remains gated and no post-integration full-green claim is made.
- Orders/settings lane: documented 5 runtime + 4 static + 1 audit tests before merge; queue/worker pre-activation blockers remain.
- Catalog lane: documented 16 tests before merge; dual bot-product authority cleanup remains.
- Corrected Knowledge lane: documented 19 focused + 3 audit executable tests, targeted TS/static checks passed; no Actions/statuses on corrected SHA; merged and shared cutover applied; no final repository-wide Green claim.
- DB old lane: PostgreSQL-owned migration safety passed on disposable DB, but old schema is not merge-eligible after cross-lane reconciliation.
- No final repository-wide validation was run at this checkpoint by explicit sequencing instruction.

# Final go/no-go checklist

- [x] Auth reviewed and merged first.
- [x] Channels reviewed and merged second.
- [x] Orders/Settings reviewed and merged third.
- [x] Catalog reviewed and merged fourth.
- [x] Corrected Knowledge Final SHA reviewed and integrated fifth.
- [x] Knowledge structural fail-closed/no-overwrite/provenance blocker closed.
- [x] Knowledge router/pages use auth v2/server authority and legacy knowledge API is blocked.
- [x] Safe activation gates prevent legacy Meta connection/worker from being treated as production-ready.
- [ ] Channels encrypted OAuth/send + DB/KMS/fake-transport activation proof complete.
- [ ] Orders queue-v2/PostgreSQL coordination and claimed-reply disable race closed.
- [ ] Direct base-era auth helper imports removed/proved non-authoritative from remaining integrated domain routes.
- [ ] Catalog legacy bot product authority replaced; dual authority removed.
- [ ] Knowledge PostgreSQL/vector/fact/policy integration complete before live Meta/AI send.
- [ ] Corrected DB Final SHA supplied, reviewed after Knowledge and integrated sixth.
- [ ] Quality integrated only after corrected DB.
- [ ] Full server/frontend/database/security/contract matrices pass on exact final integrated SHA.
- [ ] Dependency vulnerabilities remediated/risk-reviewed without weakening gates.
- [ ] Backup/restore/rollback evidence passes on release candidate.
- [ ] Logs/artifacts checked for secrets/PII/payloads.
- [ ] Production key management/observability/legal/privacy/support prerequisites recorded.
- [ ] Owner explicitly approves any future merge to `main`.

**Current release decision: NO-GO.**

**Current ordered integration position: 6 — waiting only for a new Corrected PostgreSQL Final SHA.**
