# FAWRI V1 — backup checkpoint, 2026-11-13

Status: **SOURCE SNAPSHOT SAVED; INDEPENDENT DATA+MEDIA BACKUP AND RESTORE NOT DONE. Release NO-GO.**

## 1. Source code (completed)

- Exact source commit: `241b978b056e6f5f32f2be4dae075b0ec990fe72`.
- GitHub recovery ref: `backup/fawri-v1-prehosted-2026-11-13-241b978`.
- URL: https://github.com/nora953/fawri-production-source/tree/backup/fawri-v1-prehosted-2026-11-13-241b978
- Branch created from exactly the accepted work SHA. Original V1 working branch and draft PR #550 were not merged or deployed.
- Source-only GitHub ref is **not independent** of GitHub account/provider deletion. Operator must download a commit-pinned GitHub source ZIP and store it separately before calling source recovery independent. ZIP snapshots do not include full Git history; an externally stored `git bundle --all` is preferable where available.
- Source rollback reference is immutable by recorded SHA even if branch ref is later advanced; treat branch as freeze point, do not commit to it.

## 2. New approved first-commercial database (NOT completed)

- Explicit target only: Neon project `crimson-cherry-65705041`, branch `br-holy-waterfall-b993zglb`, database `fawri`.
- **Connection safety gate failed closed:** the currently connected Neon integration is scoped to a *different project*, so all attempted read-only target checks were rejected before touching the database. **No snapshot, pg_dump, role provisioning, DDL, SQL write or restore was performed. Never omit project_id to silently use the wrong project.**
- Reconnect/select the **exact target** Neon project, then verify project/branch/database identity read-only before any backup action.
- Make a native provider recovery snapshot if available. **A Neon snapshot by itself is not an independent off-provider backup.** Also create a versioned encrypted custom-format PostgreSQL dump (including schema, data, triggers and grants as supported), keep outside GitHub and Neon, and record its SHA-256 / date / target database / encryption-key custody without storing secrets in this repo.
- Restore only into a new isolated test database or branch, never over the approved target; prove table/schema/data/privilege inventory and service-health checks. No production payments or existing financial records may be mutated by the rehearsal.
- Source evidence says required commercial runtime LOGINs were 0/3 by the last owner-authorized SQL read; this is **not** current hosted acceptance.

## 3. Object/media and external provider material (NOT completed)

- Identify actual object storage buckets, product/media uploads and encrypted configuration, provider credential escrow (never add secrets to GitHub) before claiming full recovery.
- Export media objects and a size/count/hash manifest to encrypted storage with a retention policy independent of the active service.
- Prove recovery of representative objects and their DB links in isolated environment.
- Separate Meta/WhatsApp/payment provider secrets require safe re-provisioning, not a source ZIP; do not export or publish live credentials.

## Next permissible action

Owner should reconnect the Neon integration **specifically to `crimson-cherry-65705041`** (the current integration is bound to another project). After a successful identity check, take the least-invasive database snapshot/export possible, arrange independent encrypted storage and perform an isolated restore drill with separate owner approval for any resource creation. Until these are evidenced, `P0-HOSTED-RECOVERY` and `P0-ACCESS-HOSTED-ROLLOUT` remain BLOCKED; PR #550 stays draft and launch NO-GO.

This checkpoint is evidence of a source snapshot and a fail-closed wrong-project safeguard, **not** evidence that customer data or media is backed up.
