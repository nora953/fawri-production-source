# Fawri parallel integration status

## Coordination snapshot

- Coordination base: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Integration branch: `parallel/integration-coordinator`
- Coordinator remote HEAD before this status update: `9cd91fa63910acecdfa4a457d0e22a54774fe92b`
- Validated eventual target: `hardening/postgresql-foundation`
- Direct modification/merge to `main`: **not authorized**
- Replit Agent / Production DB: **not allowed**
- Latest ordered-integration checkpoint: `2026-08-07 16:12 +03:00`
- Current release decision: **NO-GO**

## Ordered integration state

1. `parallel/auth-session-hardening` — **reviewed and merged first**
2. `parallel/channels-messaging` — **reviewed and merged second**
3. `parallel/orders-settings-finalization` — **reviewed and merged third**
4. `parallel/catalog-inventory` — **reviewed and merged fourth**
5. `parallel/knowledge-ai` — **STOP HERE: corrected Final SHA required before any merge**
6. `parallel/db-migration-cutover` — corrected Final SHA required after cross-lane schema reconciliation; do not merge old SHA
7. `parallel/quality-observability` — blocked until Knowledge then DB are closed
8. Final shared wiring/validation/migration/backup/release checks — blocked until Knowledge then DB are closed

No merge to `main` or `hardening/postgresql-foundation` has been performed by the coordinator.

## Lane status

| Lane | Branch | Status | Reviewed SHA | Integrated merge SHA | Notes |
|---|---|---|---|---|---|
| Auth/session/admin security | `parallel/auth-session-hardening` | merged first; shared auth cutover implemented; validation pending | `d4f4ce2e3bd3cb1e27deb28a30249ce87bb0d25b` | `dc57eb52a4cae97730248897ebd314317f252b75` | Cookie/session v2 authority active in coordinator tree; legacy external bearer/cookie authority cut off; not release-green until full integrated HTTP/build/DB proof |
| Channels/messaging | `parallel/channels-messaging` | merged second; safe shared surfaces wired; live Meta activation gated | `22857159593aebeea0a12e6782581da6358080b3` | `a03b6c4c6c78b5d55cd247a5999cdaf25f727e6e` | Channel/DLQ surfaces use auth v2; ServerChannelsPage active; legacy Meta connect/callback blocked and Meta worker default-off pending encrypted OAuth/send + DB/KMS |
| Orders/settings | `parallel/orders-settings-finalization` | merged third; settings router mounted; remaining queue/worker gates retained | `bde53f403f63d680fd96c1d8b8a5e264010d9b41` | `4aeae2b243d4e932f3f22e1a40eb593add3e4348` | Settings route uses auth v2; temporary PaymentStatus compatibility points to canonical OrderPaymentStatus; queue-v2 coordination and claimed-reply race remain activation blockers |
| Catalog/inventory | `parallel/catalog-inventory` | merged fourth; catalog router mounted behind secure v2 session | `ce363f7105f33e942c6c47ef8907dfb9b59658f6` | `7a3af0bc246152a5320ed86a835288d552497c73` | Server Products wrapper is present; legacy bot catalog remains separate and must be removed before live message activation |
| Knowledge/AI | `parallel/knowledge-ai` | old SHA reviewed but **not merge-eligible**; awaiting corrected Final SHA | `a09f1a3b1b72d9dd7834db8ae6a4c0e971e38744` | — | Parseable-but-structurally-invalid JSON can silently drop state; corrected fail-closed/no-overwrite/provenance proof required |
| PostgreSQL migration/cutover | `parallel/db-migration-cutover` | old SHA reviewed; **reopened for cross-lane schema reconciliation; do not merge** | final `b7f3756f907fec3ead05be6c5450c857f073a75c`; tested DB code `4dca348d33f827e3f53a26c993768f741accd525` | — | DB-owned gates passed for old schema, but final Auth/Channels/Orders/Catalog/Knowledge requests are only partially represented; corrected Final SHA required |
| Quality/observability | `parallel/quality-observability` | reviewed but blocked by explicit ordering rule | `b473fb8397814aa7bd91e0e323dc6003f6ba96f6` | — | Do not merge or run final release validation until corrected Knowledge then corrected DB are integrated |

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

### Ordered merge

- Internal integration PR: `#7`
- Reviewed lane SHA: `22857159593aebeea0a12e6782581da6358080b3`
- Merge commit: `a03b6c4c6c78b5d55cd247a5999cdaf25f727e6e`

### Coordinator shared wiring commits

- `d6283a4059ca4f317f54c1d5ca94fddc808c7986` — `channel-operations.ts` switched to `middleware/authSession.ts` authority.
- `d585fde42d318c1615aa70efb27e9316fd677327` — mounted channel router + DLQ admin router behind auth v2; method/path-sensitive permissions; legacy Meta connect/callback activation gate.
- `41fdfc2c36aa49d096dea57168eb0998088c6b5b` — `ChannelsPage.ts` activates `ServerChannelsPage`.
- `a18abb02faf27bc235c6da3f1480923e54579d81` — Meta durable worker starts only when `FAWRI_META_CUTOVER_READY=1`; default is fail-closed/off until secure dependencies are complete.

### Current Channels boundary

- `/api/channels` and channel disconnect are behind auth v2.
- Administrative durable-job GET requires `view_logs` or `manage_channels`; requeue requires `manage_channels`.
- Default admin surface remains payload-free.
- New legacy plaintext Meta connections are blocked at `/api/meta/login` and `/api/meta/callback` with `META_CHANNEL_CONNECTION_CUTOVER_PENDING`.
- Meta worker is not live by default, so the base-era internal replay/send path is not treated as active production authority.

### Still required before Meta activation

- Replace legacy OAuth token persistence with encrypted `connectMetaChannel(...)` storage.
- Replace legacy send-path plaintext token reads/environment fallback with `readMetaChannelCredential(...)`.
- Remove unsafe Meta response-body/customer/provider logging.
- Production key provider must use approved KMS/HSM-style key management and rotation.
- Corrected PostgreSQL channel/job/reservation/refund/outbound-delivery contracts must be integrated.
- Fake-transport integration tests must pass before setting `FAWRI_META_CUTOVER_READY=1`.

## 3. Orders/settings — merged third

### Ordered merge

- Internal integration PR: `#8`
- Reviewed lane SHA: `bde53f403f63d680fd96c1d8b8a5e264010d9b41`
- Merge commit: `4aeae2b243d4e932f3f22e1a40eb593add3e4348`

### Coordinator shared wiring commits

- `3601b889977d7e0897cbac735f038aacc7b9f54f` — merchant-settings route switched to auth v2 session authority.
- `8446bef47ee5ea3055c52b960faf7fd747d53716` — mounted `merchantSettingsRouter` beside the order router.
- `848ab11f8d0502b1f57e5ba3d078dc890b1b363e` — temporary coordinator compatibility alias maps `PaymentStatus` to canonical `OrderPaymentStatus`; canonical type remains `OrderPaymentStatus`.

### Current Orders/Settings boundary

- Server-authoritative Orders/Settings lane code is now present in ordered integration.
- `/api/settings` is mounted and requires secure merchant session authority.
- Active Orders and Settings wrappers supplied by the lane resolve to the server-backed pages.
- No production/full-green claim is made.

### Still required before live Meta/final release validation

- `merchantSettingsRuntime.ts` still directly coordinates the queue file with base-era queue-v1 assumptions while integrated `durableJobQueue.ts` is store v2. Before worker activation, central queue APIs such as `suppressMerchantJobs(...)` / `deleteMerchantJobs(...)` or a PostgreSQL transactional replacement must remove this direct ownership.
- A claimed `meta.webhook.reply` job must re-read settings/version before credit reservation and again before external Meta delivery; if disabled/version-invalidated, suppress with no new credit and roll back a same-attempt reservation.
- This race cannot become a live production send path while the Meta worker remains activation-gated; it is nevertheless a mandatory pre-activation blocker.
- `order-operations.ts` still contains a base-era `./auth` internal import. External authority is constrained by the central auth-v2 operational chain, but the direct import must be cleaned during later shared hardening so no legacy helper remains security-relevant.
- The temporary `PaymentStatus` alias should be removed after consumers use canonical `OrderPaymentStatus` directly and the full frontend build proves the contract.

## 4. Catalog/inventory — merged fourth

### Ordered merge

- Internal integration PR: `#9`
- Reviewed lane SHA: `ce363f7105f33e942c6c47ef8907dfb9b59658f6`
- Merge commit: `7a3af0bc246152a5320ed86a835288d552497c73`

### Coordinator shared wiring

- `9cd91fa63910acecdfa4a457d0e22a54774fe92b` — mounted `catalogOperationsRouter` and added an auth-v2 secure-session guard for `/api/catalog/**` and `/api/inventory/**` before the router.
- Lane-provided `ProductsPage.ts` now resolves extensionless dashboard imports to `ServerProductsPage`.

### Current Catalog boundary

- Dashboard/server catalog operations are integrated behind secure merchant session authority.
- `catalog-operations.ts` still contains a base-era `./auth` internal helper import; central v2 guard executes first, so it is not accepted as external authority. Direct legacy helper dependence must still be removed before release.
- Legacy bot product authority in the generic router is still separate from the new catalog runtime. Because Meta reply workers are activation-gated, this duality is not accepted as a live production state.

### Still required before live message activation

- Replace legacy bot `productsByMerchant` reads with a tenant-safe adapter over `listCatalogProducts(merchantId)`.
- Exclude `allow_fawri_reply === false`, `draft`, and `hidden_from_fawri` products.
- Preserve tenant isolation, variants/identifiers and reference-only images.
- Remove dual catalog authority before setting live message/AI worker activation gates.
- Corrected PostgreSQL catalog schema/idempotency/inventory contracts must be integrated first.

# STOP gate — Knowledge/AI position 5

The coordinator is now intentionally stopped at lane 5.

Old reviewed Knowledge SHA:
`a09f1a3b1b72d9dd7834db8ae6a4c0e971e38744`

It must **not** be merged. A new Corrected Final SHA must be supplied and reviewed first.

Required correction remains:

1. structurally invalid runtime roots/schema/records must fail closed instead of being filtered/dropped;
2. no mutation may overwrite a parseable-but-invalid runtime;
3. focused tests must prove the original file remains unchanged on refusal;
4. ambiguous legacy suggestion provenance must remain untrusted.

After a corrected SHA is supplied, review it from scratch against the previous reviewed SHA, handoff, allowlist and tests. Only then may ordered integration position 5 proceed.

No Knowledge router/page/Meta decision-engine activation is performed at this checkpoint.

# PostgreSQL lane — blocked pending corrected Final SHA

Old DB final SHA:
`b7f3756f907fec3ead05be6c5450c857f073a75c`

Tested DB code SHA:
`4dca348d33f827e3f53a26c993768f741accd525`

PR #5 remains Draft/Open/Unmerged. The old DB SHA must **not** be merged.

The old DB tree proved strong PostgreSQL-owned migration safety for the schema it contained, but cross-lane reconciliation found final contracts missing or only partial.

## Required corrected DB reconciliation

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
- Reconcile again against the corrected Knowledge Final SHA once that SHA exists.

A new DB Final SHA plus rerun DB evidence is required before position 6 can be integrated.

# Quality / final validation — explicitly blocked

Quality reviewed SHA:
`b473fb8397814aa7bd91e0e323dc6003f6ba96f6`

Do not merge Quality yet and do not execute final shared validation while Knowledge or DB remains open.

Previously recorded evidence remains contextual only:

- Quality Gates `31137063434`: **FAILURE**
- Security/supply-chain `31137063654`: **FAILURE**
- Backup/restore `31137063594`: **SUCCESS**
- Dependency audit reported 22 vulnerabilities including 14 high; do not weaken `pnpm audit --audit-level=high`.

Final repository-wide typecheck/build, broad PostgreSQL validation, fake Meta worker integration, browser operational-storage audit, dependency/security matrices and release-candidate backup/restore are intentionally deferred until corrected Knowledge then corrected DB are integrated.

# Validation ledger at this checkpoint

- Auth lane: documented 15/15 focused tests + targeted TypeScript pass before merge; integrated full proof pending.
- Channels lane: documented 13 targeted tests before merge; shared activation remains gated and no post-integration full-green claim is made.
- Orders/settings lane: documented 5 runtime + 4 static + 1 audit tests before merge; queue/worker pre-activation blockers remain.
- Catalog lane: documented 16 tests before merge; dual bot-product authority cleanup remains.
- Knowledge old lane: documented 13 runtime + 5 audit/static tests, but structural invalid-runtime correction is mandatory and old SHA is not merge-eligible.
- DB old lane: PostgreSQL-owned migration safety passed on disposable DB, but old schema is not merge-eligible after cross-lane reconciliation.
- No final repository-wide validation was run at this checkpoint by explicit sequencing instruction.

# Final go/no-go checklist

- [x] Auth reviewed and merged first.
- [x] Channels reviewed and merged second.
- [x] Orders/Settings reviewed and merged third.
- [x] Catalog reviewed and merged fourth.
- [x] Safe activation gates prevent legacy Meta connection/worker from being treated as production-ready.
- [ ] Channels encrypted OAuth/send + DB/KMS/fake-transport activation proof complete.
- [ ] Orders queue-v2/PostgreSQL coordination and claimed-reply disable race closed.
- [ ] Direct base-era auth helper imports removed/proved non-authoritative from integrated domain routes.
- [ ] Catalog legacy bot product authority replaced; dual authority removed.
- [ ] Corrected Knowledge Final SHA supplied, reviewed and integrated fifth.
- [ ] Corrected DB Final SHA supplied, reviewed after Knowledge and integrated sixth.
- [ ] Quality integrated only after Knowledge + DB.
- [ ] Full server/frontend/database/security/contract matrices pass on exact final integrated SHA.
- [ ] Dependency vulnerabilities remediated/risk-reviewed without weakening gates.
- [ ] Backup/restore/rollback evidence passes on release candidate.
- [ ] Logs/artifacts checked for secrets/PII/payloads.
- [ ] Production key management/observability/legal/privacy/support prerequisites recorded.
- [ ] Owner explicitly approves any future merge to `main`.

**Current release decision: NO-GO.**

**Current ordered integration position: STOP at Knowledge/AI pending a new Corrected Final SHA.**
