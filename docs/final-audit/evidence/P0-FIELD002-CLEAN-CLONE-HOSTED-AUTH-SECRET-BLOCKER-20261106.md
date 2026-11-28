# FIELD002 — authorized clean isolated Neon clone SQL + HTTP test: GitHub secret missing (2026-11-06)

## Owner authorization and actual execution

The product owner approved temporary test identities, synthetic merchants and cleanup **only on** the fresh isolated nondefault Neon clone `br-polished-mouse-b1proel7`. A **single-file** approval request committed as [`b93cba0223f0e2af4e94cdf8050e3b2e56648cb2`](https://github.com/nora953/fawri-production-source/commit/b93cba0223f0e2af4e94cdf8050e3b2e56648cb2) set the exact approved parent source, branch and `APPROVE_CLEAN_CLONE_TEST_FIXTURES` marker. The branch-local push trigger started [GitHub Actions run 42275989836](https://github.com/nora953/fawri-production-source/actions/runs/42275989836).

The workflow verified the immutable checkout, exact one-file owner authorization, and source; seven source/permission unit tests **PASS**, dependency installation **PASS**. The real hosted SQL+HTTP step **FAILED BEFORE CONNECTION** with:

```
FAWRI_FIELD002_CLONE_ADMIN_URL: <empty>
FIELD002_RUNNER_REJECTED FIELD002_CLONE_ADMIN_URL_REQUIRED
```

The current workflow explicitly reads `${{ secrets.FAWRI_FIELD002_CLEAN_CLONE_ADMIN_URL }}`, so the secret's effective value was empty for this run. This is **not** a PostgreSQL role policy failure, migration failure, SQL/HTTP regression or authorization denial. No connection was attempted, no synthetic roles/merchants/notices created, and no cleanup was necessary. Do not claim acceptance success.

## Independent post-failure hosted verification

Read-only SQL on the exact isolated branch, `neondb`, after the failed workflow found:

- Drizzle migration count **52**;
- `public.notifications` **0**;
- `public.merchants` **1**;
- `public.audit_events` **283**;
- `fawri_security.transaction_scopes` **0**;
- ephemeral roles matching `field002_[ta]_<24 hex>` **0**;
- competing active PostgreSQL client backends **0** at observation.

These match the earlier clean-clone baseline and confirm the run did not create persistent test fixtures.

## One concrete unresolved dependency

Configure the **GitHub Actions repository secret** named exactly:

`FAWRI_FIELD002_CLEAN_CLONE_ADMIN_URL`

Value: the **direct, unpooled** Neon `postgresql://` connection string for branch **`br-polished-mouse-b1proel7`**, database **`neondb`**, role **`neondb_owner`**, hostname **`ep-withered-union-b1jh284c.c-5.eu-central-1.aws.neon.tech`**. The workflow's URL parser restricts the endpoint, database, credentials, TLS parameters and user. Obtain the secret directly through the Neon console and set it in GitHub repository Settings → Secrets and variables → Actions; **never paste it into chat, repository files, logs or issue comments**.

After the secret is configured, submit a new exact-parent approval-only update to the existing `docs/final-audit/evidence/field002-clean-clone-run-request.json` to start a fresh workflow run. Do **not** merely assume a rerun of 42275989836 reads the new secret or claim any result without inspecting the new job and independent post-cleanup Neon state. There is no need to create a separate production secret.

**FIELD002 OPEN**; fresh-clone real mounted SQL+HTTP own/foreign/revoked acceptance **BLOCKED BY MISSING ACTIONS SECRET**; historical staging rollout and R2 hosted backup/import exclusion still OPEN; 0052 separately BLOCKED. Original staging/default production untouched, PR #550 draft/unmerged, launch NO-GO.
