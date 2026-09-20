# Fawri V1 production release readiness

## Purpose

This document separates **code/runtime readiness** from **real production launch readiness**. A green repository validation does not by itself prove that external production providers, credentials, backups, or cloud permissions exist.

## Current integrated code status

The validated release-candidate tree `92290d3f97e3ece81525a0b92d668d129e9df5ed` completed 38/38 final integration checks with 0 failures and was merged to `main` through PR #256.

Current integrated `main` SHA:

`515dc33404e517d11060fa60cb6ef20d986b09ef`

The merge commit tree is identical to the validated release-candidate tree. Repository-owned build, typecheck, migration/schema, security, routing, online-order, cashier, merchant/admin/subscription journey, settings, Meta cutover, Knowledge readiness, and related integration gates are therefore considered code-ready at this checkpoint.

This does **not** mean the live production environment is ready. The remaining work is dominated by deployment-time infrastructure, provider credentials/approvals, production backup/restore proof, supported SaaS billing onboarding, and final manual staging/UI validation.

## Explicit production release gate

Production should set:

```text
NODE_ENV=production
FAWRI_PRODUCTION_RELEASE_GATE=required
```

When the gate is required, API startup fails before application traffic if the required runtime configuration is incomplete. The gate is intentionally opt-in until the production environment is populated so development and isolated validation remain usable.

Required runtime selections include:

- PostgreSQL operational authority: `FAWRI_OPERATIONAL_POSTGRES_AUTHORITY=required`
- PostgreSQL subscription authority: `FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY=required`
- PostgreSQL merchant Auth sessions: `FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY=required`
- strong `FAWRI_AUTH_SECURITY_SECRET`
- Meta cutover: `FAWRI_META_CUTOVER_READY=1`
- Meta live replies: `FAWRI_META_REPLY_TRANSPORT=live`
- job workers enabled
- Meta credential provider: `FAWRI_META_CREDENTIAL_PROVIDER=aws-kms`
- complete AWS KMS region/key/wrapped-DEK configuration
- explicit Meta app/config/webhook values and HTTPS `META_REDIRECT_URI`
- Knowledge embedding provider: `FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER=openai`
- `OPENAI_API_KEY`
- `FAWRI_SERVICE_VERSION`
- strong `FAWRI_OBSERVABILITY_BEARER_TOKEN`

The release gate reports only safe error codes. Secret values must never be returned in readiness responses or startup logs.

## Meta production activation

Meta OAuth is fail-closed by default. `/api/meta/login` and `/api/meta/callback` become reachable only when the PostgreSQL/KMS/live-send activation contract is explicitly configured. The repository contains no Replit callback fallback.

Production requirements outside source control remain:

- Meta application approved/configured for the intended production use;
- real `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `META_VERIFY_TOKEN`;
- production HTTPS callback registered with Meta and exactly matching `META_REDIRECT_URI`;
- webhook subscription/configuration for the production app/pages;
- AWS workload identity/IAM and KMS key policy permitting the documented decrypt operation;
- wrapped production DEK manifest generated and stored through the deployment secret system.

Do not validate these by committing credentials or sending test traffic from CI.

## Knowledge production activation

The OpenAI embedding provider is startup-wired. Production requires `FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER=openai` and a deployment secret for `OPENAI_API_KEY`. Repository tests use non-real/injected values only.

## SaaS subscription billing blocker

Fawri's SaaS billing authority is server-authoritative, but the currently implemented checkout providers are not a production payment path:

- `superqi_sandbox` is test-only and production-forbidden;
- `fastpay` remains `merchant_setup_required` until Fawri receives the official merchant onboarding/credentials and supported integration contract.

Therefore **automated production SaaS subscription purchase/renewal is an external launch blocker**. Do not invent provider endpoints, signatures, settlement behavior, or success callbacks.

Merchant-customer payments are a separate domain. Fawri does not custody merchant-customer funds; manual merchant confirmation is supported and future provider evidence is provider-neutral.

## Production backup/restore blocker

The repository's current backup/restore scripts and runbook intentionally support disposable validation targets only. They are not production backup infrastructure.

Before launch, the owner/infrastructure environment must provide and prove:

- the actual production PostgreSQL backup mechanism;
- backup encryption/access controls and retention policy;
- the actual production object/media backup mechanism if object storage is used;
- restore to an isolated recovery target;
- a documented restore drill with integrity verification;
- RPO/RTO ownership and alerting.

A disposable local drill is useful regression evidence but does not satisfy this production requirement.

## Release sequence

1. Merge only code that passes repository typecheck/build, migrations, PostgreSQL runtime integration, Meta live-transport regressions, and release-gate tests.
2. Prepare production PostgreSQL and apply the committed migration chain through the latest version using the deployment process.
3. Configure production secrets through the deployment secret store, never source control.
4. Configure AWS KMS/IAM and validate bootstrap/readiness from the production workload.
5. Configure the Meta production application/callback/webhook and verify OAuth against a controlled test merchant/page.
6. Configure OpenAI credentials and confirm Knowledge readiness.
7. Establish and prove production backup/restore.
8. Complete a production SaaS billing-provider integration only from official provider documentation/credentials.
9. Set `FAWRI_PRODUCTION_RELEASE_GATE=required` and require `/ops/readiness` to be ready before routing traffic.
10. Run controlled end-to-end smoke tests and observe queues/DLQ/alerts before general launch.

## Current readiness interpretation

At `main` SHA `515dc33404e517d11060fa60cb6ef20d986b09ef`, repository validation establishes **production-release code readiness** for the integrated tree.

It must not claim **production launch readiness** while any of the following remain unresolved:

- `SAAS_BILLING_PRODUCTION_PROVIDER_UNAVAILABLE`
- `PRODUCTION_BACKUP_RESTORE_EXTERNAL_PROOF_REQUIRED`
- production PostgreSQL deployment/migration proof,
- production AWS KMS/IAM/wrapped-DEK readiness,
- production Meta application/OAuth/webhook/live-send readiness,
- production OpenAI credential/readiness,
- final full-stack staging and manual UI/UX validation,
- production release-gate and controlled smoke-test evidence.

Actual credentials, cloud permissions, provider approvals, production backups, and live-provider behavior are deployment-time evidence and must never be represented by repository test fixtures.
