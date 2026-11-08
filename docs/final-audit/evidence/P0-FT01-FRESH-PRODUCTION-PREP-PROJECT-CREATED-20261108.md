# FT-01 — standalone empty production-preparation Neon project: owner UI creation checkpoint

**Date (Iraq):** 2026-11-08. **Status: PROVIDER CONSOLE CREATION CONFIRMED BY OWNER SCREENSHOT; hosted read-only identity / empty schema NOT YET VERIFIED.** No commercial deploy authority.

## User-confirmed provisioning facts
- Provider: Neon, independent **new project**, not a branch of old `round-fire-18493605`.
- Console name: `fawri-production-prep-20261108`.
- New nonsecret provider **project_id**: `crimson-cherry-65705041` (visible in the post-creation Neon auto-generated agent snippet; do not execute the snippet).
- Nonsecret organization ID: `org-sweet-paper-45688704` (same screenshot).
- Initial/default branch **name**: `production`; its real **branch_id** `br-holy-waterfall-b993zglb` was visually read from owner screenshot of Neon Branch overview on 2026-11-08.
- Neon project overview explicitly displays **Free plan**, 1 project branch, 1 PostgreSQL database, 1 compute, PostgreSQL **18**, region Frankfurt. History retention displayed **6 hours**, IP restrictions **None set**. This is an early-stage preparation environment and does not yet meet verified commercial recovery/access readiness.
- Selected during user-guided creation: AWS Europe Central 1 (Frankfurt), PostgreSQL **18**, initial database `fawri`, PostgreSQL enabled; optional object storage, Functions, AI gateway and Realtime disabled.
- User screenshot explicitly reads **“Your new project was created in 1092 ms”**. This is evidence of successful create UI, **not** proof of database role, target emptiness, policy integrity or absence of provider-level seed schema.

## Fixed safeguards / next finite actions
1. **Never create a second project just because the Neon connector is unavailable.** The previous assistant-side `create_project` call failed pre-execution with `Tool not found`; owner successfully created this separate project through the console afterward.
2. **COMPLETED (owner screenshot):** branch ID is `br-holy-waterfall-b993zglb`. **STILL OPEN:** direct PostgreSQL compute host/connection role identity (no URL passwords or credentials); verify only through the new project.
3. With separately authorized *read-only* Neon access, independently prove project/branch ID, new database identity, and absence of business schema/data before applying any schema. Do not confuse a new project with old Neon default production.
4. **SOURCE CODE UPDATED/PENDING CI:** R2 first-commercial target now pins independent project `crimson-cherry-65705041` / branch `br-holy-waterfall-b993zglb`, while preserving historical default `br-shiny-lab-b1vxj4wn` only for the old project's lineage inspector. The production prelistener source manifest and target tests must pass exact-SHA CI; manifest alone does not prove provider runtime or allow release.
5. Subsequently provision schema-only migrations under privileged bootstrap roles (separate owner authorization and rollback), distinct least-privilege tenant/auth/operator login roles, policy/RLS proof and actual deployment-source gating. No automatic import from historical staging, archive, backup or clean clone.
6. Keep original staging `br-falling-dust-b1km4gix` and original default production untouched. No old source credentials, application deploy, merge, migration, provider activation or commercial acceptance done here.

**Current decisions:** FIELD002 OPEN, `0052` BLOCKED, PR #550 DRAFT, commercial NO-GO, P0 overall percent uncertified. Existing isolated SQL+HTTP and recovery evidence retained; do not restart testing from zero.

## Connector scope — exact independent blocker (2026-11-08)

The installed Neon connector was tested with **read-only** `describe_project(project_id='crimson-cherry-65705041')`. Neon returned an explicit safe refusal: `project_id "crimson-cherry-65705041" does not match this connection's project "round-fire-18493605"; reconnect with access to it`. **Do not omit project_id**, because that would target the old project. The previous project creation API attempts were unavailable; the owner created the new project using its web console and the screen proves completion. **No read-only SQL has been executed on the new target**, no host or role credentials were requested, and no hosted write, seed, migration, merchant data or deployment occurred.

To continue hosted verification, reconnect the Neon app with access to **only the new project**, or run the strict [SELECT-only empty-schema preflight](sql/P0-FT01-NEW-PRODUCTION-EMPTY-SCHEMA-READONLY-20261108.sql) via the **new project's** Neon SQL Editor. Do not paste URLs, passwords or sensitive outputs into GitHub/chat. This preflight cannot prove branch ID from SQL; combine its output with the UI/provider branch ID above. A schema-only fresh DB still requires migration-bootstrap authorization, restricted roles, hosted RLS/HTTP and recovery acceptance. **Free plan's 6-hour history is not sufficient standalone long-term disaster recovery proof.**
