# FT-01 — standalone empty production-preparation Neon project: owner UI creation checkpoint

**Date (Iraq):** 2026-11-08. **Status: PROVIDER CONSOLE CREATION CONFIRMED BY OWNER SCREENSHOT; hosted read-only identity / empty schema NOT YET VERIFIED.** No commercial deploy authority.

## User-confirmed provisioning facts
- Provider: Neon, independent **new project**, not a branch of old `round-fire-18493605`.
- Console name: `fawri-production-prep-20261108`.
- New nonsecret provider **project_id**: `crimson-cherry-65705041` (visible in the post-creation Neon auto-generated agent snippet; do not execute the snippet).
- Nonsecret organization ID: `org-sweet-paper-45688704` (same screenshot).
- Initial branch **name** shown in the provider's agent snippet: `production`; exact **branch_id** not yet observed. Do not infer one.
- Selected during user-guided creation: AWS Europe Central 1 (Frankfurt), PostgreSQL **18**, initial database `fawri`, PostgreSQL enabled; optional object storage, Functions, AI gateway and Realtime disabled.
- User screenshot explicitly reads **“Your new project was created in 1092 ms”**. This is evidence of successful create UI, **not** proof of database role, target emptiness, policy integrity or absence of provider-level seed schema.

## Fixed safeguards / next finite actions
1. **Never create a second project just because the Neon connector is unavailable.** The previous assistant-side `create_project` call failed pre-execution with `Tool not found`; owner successfully created this separate project through the console afterward.
2. Before modifying source pins, read the newly created project's Overview/Branches page and record **actual `branch_id`** and database/endpoint metadata (no URL passwords or credentials).
3. With separately authorized *read-only* Neon access, independently prove project/branch ID, new database identity, and absence of business schema/data before applying any schema. Do not confuse a new project with old Neon default production.
4. **Existing R2 source policy pins the old project `round-fire-18493605` and default branch `br-shiny-lab-b1vxj4wn`.** Update it in a scoped reviewed source change **only once new branch ID has been verified**, then modify source manifest and tests to target the new project. A safe-looking JSON plan alone does not grant deployment authority.
5. Subsequently provision schema-only migrations under privileged bootstrap roles (separate owner authorization and rollback), distinct least-privilege tenant/auth/operator login roles, policy/RLS proof and actual deployment-source gating. No automatic import from historical staging, archive, backup or clean clone.
6. Keep original staging `br-falling-dust-b1km4gix` and original default production untouched. No old source credentials, application deploy, merge, migration, provider activation or commercial acceptance done here.

**Current decisions:** FIELD002 OPEN, `0052` BLOCKED, PR #550 DRAFT, commercial NO-GO, P0 overall percent uncertified. Existing isolated SQL+HTTP and recovery evidence retained; do not restart testing from zero.
