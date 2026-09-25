# Fawri staging deployment contract

## Purpose

This contract defines a safe staging deployment for manual web QA before production launch activation. It intentionally keeps external production integrations disabled while exercising the server-authoritative PostgreSQL, Auth v2, merchant/admin, catalog, conversations, orders, settings, support, retention, and observability paths.

## Deployment shape

Run the built Fawri frontend and the Express API on the same HTTPS origin.

The API server already supports this shape through `FAWRI_WEB_DIST_DIR`: when the variable points to the built frontend directory, Express serves the static application while reserving `/api/*`, `/ops/*`, and `/healthz` for server routes.

Staging traffic shape:

```text
Browser
  -> HTTPS staging origin
      -> static Fawri frontend
      -> /api/* Express API
      -> /ops/* readiness/metrics boundary
      -> PostgreSQL staging database
```

Do not deploy the browser UI and API on unrelated origins for this staging contract. Auth v2 browser transport and HttpOnly session cookies are designed around same-origin `/api/*` requests.

## Build and start

From repository root, use the pinned workspace package manager and build the repository before deployment.

Expected frontend output:

```text
artifacts/fawri/dist/public
```

Expected API output:

```text
artifacts/api-server/dist/index.mjs
```

The runtime command is equivalent to the API package `start` script and requires a valid `PORT` supplied by the hosting environment.

Set:

```text
FAWRI_WEB_DIST_DIR=<absolute path to artifacts/fawri/dist/public>
```

before starting the API so the same process serves both the frontend and API.

## Required staging runtime authority

Staging manual QA must exercise PostgreSQL-backed operational/auth authority rather than legacy JSON fallback.

Required staging configuration:

```text
NODE_ENV=production
FAWRI_DEPLOYMENT_MODE=staging
DATABASE_URL=<staging PostgreSQL connection string>
FAWRI_OPERATIONAL_POSTGRES_AUTHORITY=required
FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY=required
FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY=required
FAWRI_AUTH_SECURITY_SECRET=<strong staging secret, at least 32 characters>
FAWRI_ALLOWED_ORIGINS=<exact staging HTTPS origin>
FAWRI_DISABLE_JOB_WORKERS=1
FAWRI_META_CUTOVER_READY=0
FAWRI_META_REPLY_TRANSPORT=disabled
FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER=disabled
FAWRI_SERVICE_VERSION=<safe staging version>
```

Set `FAWRI_DEPLOYMENT_MODE=staging` explicitly. Do **not** rely on omitting a production safety variable: `NODE_ENV=production` is used for the built application, while the explicit staging deployment mode is what prevents production-only provider requirements from activating. Do **not** set `FAWRI_PRODUCTION_RELEASE_GATE=required` in this QA staging environment.

Do not provide real Meta, OpenAI, billing, or production KMS credentials to this staging contract.

## Owner administrator bootstrap

The PostgreSQL staging database must contain exactly one usable `owner_admin` before production-gated startup can ever be enabled.

Use the repository-owned provisioning command instead of editing database rows or JSON files manually:

```text
pnpm --filter @workspace/api-server run provision:owner-admin -- --phone <owner phone> --display-name <owner display name> --language ar
```

The owner password must be supplied through stdin as required by the script. Never pass it as a command-line argument, commit it, print it in CI logs, or store it in shell history.

Do not create duplicate owner accounts. The provisioning authority fails closed if an owner already exists.

## Database preparation boundary

The staging database must be created before application startup and must receive the committed PostgreSQL schema/migration chain.

The existing migration/cutover runbook explicitly does not authorize a real production legacy-data cutover. Therefore this staging contract must not reinterpret the protected production migration writer as a general-purpose production migration command.

For staging bootstrap, use only the committed schema/migration tooling that is explicitly safe for the target environment and verify the resulting schema before inserting the owner account.

## Disabled external surfaces

Keep all of the following inactive during this staging phase:

- Meta OAuth activation and live reply transport;
- Meta durable send workers;
- production AWS KMS credential activation;
- OpenAI knowledge embedding provider;
- production SaaS billing provider;
- any real customer webhook or external send path.

The purpose of this phase is web/manual QA of Fawri's server-authoritative application behavior, not external-provider launch certification.

## Repository staging-image contract

The repository validates the staging container definition separately from any real hosted staging environment.

The `Staging container contract` GitHub Actions workflow:

- checks that `.env.staging.example`, `Dockerfile.staging`, and this document keep the same fail-closed staging authority contract;
- builds `Dockerfile.staging` from the current repository tree;
- verifies the image contains the built API entry point and frontend static output;
- verifies the image defaults keep job workers, Meta live send, and Knowledge embeddings disabled;
- verifies the production release gate and provider credentials are not baked into the image.

This workflow proves repository/container packaging only. It does **not** prove a real staging PostgreSQL instance, hosted HTTPS origin, owner-admin bootstrap, external persistence, or production provider readiness.

## Staging health gates

Before opening the staging URL for manual QA, verify:

1. `GET /healthz` returns HTTP 200 and the Fawri health payload.
2. PostgreSQL authority is reachable from the runtime.
3. `/ops/readiness` does not report a PostgreSQL authority failure.
4. `/api/auth/admin/login` and `/api/auth/login` are served by the API process rather than by the frontend SPA fallback.
5. Browser requests to `/api/*` remain same-origin.
6. No Meta worker starts while `FAWRI_DISABLE_JOB_WORKERS=1`.
7. No real external credentials appear in logs or browser-visible configuration.

## Amplify role during staging

The existing AWS Amplify deployment may remain available as a frontend-only preview, but it is not the authoritative full-stack manual-QA environment because it currently has no same-origin API/backend attached.

The full-stack staging URL produced from this contract becomes the manual-QA target once PostgreSQL and the API runtime are deployed and the health gates above pass.

## Promotion boundary

Do not treat staging success as production launch readiness.

Production promotion still requires the repository's production-release sequence, including real PostgreSQL production preparation, deployment secrets, AWS KMS/IAM, Meta production configuration, OpenAI configuration, backup/restore proof, SaaS billing-provider readiness, and finally `FAWRI_PRODUCTION_RELEASE_GATE=required` with successful readiness before customer traffic.
