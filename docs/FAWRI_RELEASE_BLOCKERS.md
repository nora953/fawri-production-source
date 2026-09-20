# Fawri Release Blockers

Status: Post-main-integration release blocker register.

This file separates repository-owned blockers from external launch blockers. A blocker is not closed by intention; it is closed only when the current repository/checkpoint contains evidence.

## Blocker severity model

- `CRITICAL`: prevents a production release.
- `HIGH`: prevents declaring the affected subsystem production-ready.
- `MEDIUM`: must be resolved or explicitly accepted before general launch.
- `EXTERNAL`: depends on provider credentials, permissions, infrastructure, approval, or deployment action outside source control.

## Current repository checkpoint

- Integrated `main`: `515dc33404e517d11060fa60cb6ef20d986b09ef`
- Validated release-candidate tree: `92290d3f97e3ece81525a0b92d668d129e9df5ed`
- Safety checkpoint: `checkpoint/main-integrated-green-2026-09-20`
- Final integration PR: #256
- Release-candidate CI result: 38/38 PASS, 0 FAIL
- Merged `main` tree is identical to the validated release-candidate tree.

## Open code/release blockers

### UI/UX final polish and manual browser QA

Severity: MEDIUM

Status: OPEN

Repository CI proves the integrated code and authority contracts, but final manual release QA still must cover:

- desktop/tablet/mobile responsive behavior,
- Arabic/Kurdish/English visual parity,
- RTL/LTR presentation,
- forms, overflow, loading, empty and error states,
- accessibility/keyboard behavior,
- final performance and large-bundle review,
- full-stack staging browser smoke validation.

Existing build sourcemap/chunk advisories remain non-fatal unless final performance review shows a user-facing issue.

## External production blockers

### Production PostgreSQL deployment

Severity: EXTERNAL / CRITICAL

Status: OPEN

Repository migration generation, reproducibility, disposable PostgreSQL application, rollback, and reconciliation gates pass. Production still requires:

- actual production PostgreSQL target,
- controlled application of the committed migration chain,
- schema verification after deployment,
- deployment ownership and rollback procedure.

Do not reinterpret disposable CI migration success as proof that a production database has been migrated.

### AWS KMS production activation

Severity: EXTERNAL / CRITICAL for Meta credential-vault activation

Status: OPEN

AWS KMS is the selected production architecture and repository wiring is complete. Production still requires real external resources:

- production AWS account and region,
- one symmetric customer-managed KMS key,
- runtime workload IAM role/identity,
- KMS key policy permitting the documented decrypt operation,
- rotation/operator permissions,
- initial wrapped production DEK manifest,
- deployment secret-store configuration,
- rotation and historical-DEK retirement policy.

Production startup is fail-closed unless `FAWRI_META_CREDENTIAL_PROVIDER=aws-kms` and the required KMS configuration is present.

### Meta production OAuth / webhook / live-send activation

Severity: EXTERNAL / CRITICAL for live Meta channel release

Status: OPEN

The repository cutover and operational gates pass, but live production use still requires:

- approved/configured Meta application,
- real `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, and `META_VERIFY_TOKEN`,
- exact production HTTPS `META_REDIRECT_URI`,
- production webhook/page subscription configuration,
- controlled OAuth validation against a test merchant/page,
- KMS credential-provider readiness,
- explicit live reply transport activation.

Do not commit credentials or enable uncontrolled live sends from CI.

### Knowledge embedding production activation

Severity: EXTERNAL

Status: OPEN

The OpenAI embedding provider is wired and repository readiness gates pass. Production still requires:

- `FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER=openai`,
- deployment-secret `OPENAI_API_KEY`,
- production readiness verification from the deployed workload.

### SaaS subscription billing provider

Severity: EXTERNAL / CRITICAL for automated paid subscription purchase/renewal

Status: OPEN

Current implemented checkout providers do not provide a supported automated production SaaS billing path:

- `superqi_sandbox` is test-only and production-forbidden,
- `fastpay` remains `merchant_setup_required` until official onboarding, credentials, and supported integration documentation are available.

Do not invent provider endpoints, signatures, callbacks, or settlement behavior.

### Production backup / restore

Severity: EXTERNAL / CRITICAL

Status: OPEN

Disposable backup/restore drills pass in repository CI, but production backup infrastructure is not established by source control.

Before launch, production must prove:

- PostgreSQL backup mechanism,
- encryption/access control and retention,
- object/media backup where applicable,
- isolated restore target,
- successful integrity-checked restore drill,
- RPO/RTO ownership and alerting.

### Production secrets and release gate

Severity: EXTERNAL / CRITICAL

Status: OPEN

The production deployment environment still must provide all required secrets and explicitly enable the release gate only after provider readiness is proven.

Required launch-time evidence includes:

- strong Auth security secret,
- strong observability bearer token,
- required PostgreSQL authority selections,
- Meta/KMS/OpenAI configuration,
- job worker policy,
- `FAWRI_SERVICE_VERSION`,
- `FAWRI_PRODUCTION_RELEASE_GATE=required`,
- successful `/ops/readiness` before routing customer traffic.

## Closed repository-owned blockers

The following previously open HIGH blockers are closed by the integrated release-candidate evidence on PR #256.

### Merchant Dashboard Global Hardening

Severity: HIGH

Status: CLOSED

Closure evidence includes the global merchant journey, merchant journey, settings authority, dashboard/channel coherence, PostgreSQL authority, build/typecheck, and final integration gates.

### Catalog / Variants / Inventory Finalization

Severity: HIGH

Status: CLOSED for repository release-candidate scope

Closure evidence includes Catalog UI cutover, physical-media lifecycle, Catalog validation, location inventory authority, product/variant continuity, and full repository build/typecheck.

### Auth / Admin / Subscription Final Hardening

Severity: HIGH

Status: CLOSED

Closure evidence includes merchant, admin, subscription and global merchant journey gates plus session/authority cutover validation.

### Remaining Operational Authority Hardening

Severity: HIGH

Status: CLOSED

Orders, Settings, Channels, Conversations, Knowledge, Cashier, routing, and related PostgreSQL authority paths are included in the integrated checkpoint and final validation suite.

### Final Database / Security / Operations Validation

Severity: HIGH

Status: CLOSED for repository-owned validation

Closure evidence includes:

- canonical Drizzle generation,
- committed migration reproducibility,
- disposable PostgreSQL migration application,
- rollback/reconciliation,
- storage audit,
- repository security,
- dependency audit/review,
- lockfile integrity,
- readiness/observability gates.

Production backup infrastructure and production database deployment remain external blockers above.

### Global Merchant Journey / End-to-End Gate

Severity: HIGH

Status: CLOSED

Final integration validated merchant/global merchant/admin/subscription journeys along with cashier, online-order, routing, settings, and authority cutoffs.

### Multi-location routing and online fulfillment

Severity: HIGH

Status: CLOSED

Validated repository behavior includes service-area resolution, canonical location routing, online-order PostgreSQL authority, atomic commit, cancellation compensation, multi-location bot stock routing, and stale-inventory fail-closed behavior.

### AWS KMS repository activation hardening

Severity: HIGH

Status: CLOSED for code-owned wiring

Validated repository behavior includes explicit production provider selection, KMS ARN/region validation, sanitized AWS/network failures, KMS preflight tests, and readiness/build validation.

Real KMS resources and IAM remain external blockers.

### POS Global Hardening

Severity: HIGH

Status: CLOSED

Historical POS closure remains preserved, including pairing, staff permissions, PIN/session behavior, offline inventory authority, outbox/ACK/reconciliation, sale/return/void lifecycle, report permissions, and connectivity authority.

## Release rule

Fawri may be described as **repository production-release code ready** at the integrated checkpoint.

It must not be described as **production launch ready** until:

1. all EXTERNAL / CRITICAL blockers above are completed,
2. final manual UI/UX and full-stack staging QA pass,
3. production PostgreSQL migration/verification completes,
4. production provider/secrets readiness is proven,
5. production backup/restore proof exists,
6. `FAWRI_PRODUCTION_RELEASE_GATE=required` starts successfully,
7. `/ops/readiness` is ready before traffic,
8. controlled production smoke tests and queue/DLQ/alert observation pass.
