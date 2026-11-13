# FAWRI V1 — backup checkpoint, 2026-11-13

Status: **SOURCE SNAPSHOT SAVED; INDEPENDENT DATA+MEDIA BACKUP AND RESTORE NOT DONE. Release NO-GO.**

## 2026-11-13 — source archive verified, offsite transfer NOT YET VERIFIED

- Exact frozen source SHA: `241b978b056e6f5f32f2be4dae075b0ec990fe72`. A separate non-production exporter branch `backup/export-v1-source-20261113` was created from this freeze, without moving original PR #550, main or the frozen backup branch.
- Export-only GitHub Actions workflow [run #43445548915](https://github.com/nora953/fawri-production-source/actions/runs/43445548915) **COMPLETED SUCCESS**; ZIP artifact `fawri-v1-source-export-20261113-241b978` (artifact id `14046439246`, GitHub artifact retention 7 days). Exporter creates `git archive` from the exact pinned SHA, checks ZIP integrity and writes SHA256SUMS.txt and manifest.json. No credentials, Neon or production DB data used.
- Downloaded and **independently verified** artifact ZIP: nested source `fawri-source-20261113-241b978.zip` is **18,543,800 bytes**, contains **3,179 ZIP entries** with no corrupt entries; nested archive SHA-256 = `43ca2c5ffca037058e0a2dc54318e51653abfd863c742656c52855499ae02fb4`, equal to manifest. Outer GitHub Actions artifact digest `sha256:8e636c5950d9ddd2ab7992c92b3a638517b34e719f913ad67aa534c7fea4d3f4` (outer packaging) is different by design.
- User-visible downloadable nested archive + manifest artifact was created inside chat; **no Google Drive ZIP upload has succeeded yet**. A distinct Drive folder `FAWRI - Private Backup 2026-11-13` was created: https://drive.google.com/drive/folders/17Mb7uofA3A04MzRastzpICj2Ng-4cDAN. The connector rejects cross-app GitHub artifact `file_uri` upload due to type/interop mismatch. **Do not report successful offsite backup**. User needs to manually download the full artifact and upload it to this Drive folder, then verify Drive file size, download and SHA-256; maintain private sharing.
- No database content: target Neon new project `crimson-cherry-65705041`, branch `br-holy-waterfall-b993zglb`, PG18 DB `fawri` previously verified **0 app tables, 0/3 roles, 0 buckets, no snapshots**. No hosted SQL, snapshot creation, migration, privileges, storage change or deployment attempted. No replacement for future independent PostgreSQL/media backups and isolated restore; source ZIP has no Git history.
- Gate remains `P0-HOSTED-RECOVERY` **BLOCKED** until independent source storage read-back plus future real DB/media export and restore acceptance. Other V1 blockers, PR #550 draft and commercial NO-GO unchanged.

## 2026-11-13 — CONNECTOR READ-ONLY TARGET VERIFIED (not a backup or hosted acceptance)

On the dedicated Neon connection, read-only checks were completed with **explicit target project and branch IDs**; the connection no longer pointed at the old project:

- Project: `crimson-cherry-65705041`, name `fawri-production-prep-20261108`, Free plan, PostgreSQL 18, EU Central (Frankfurt).
- Branch: `br-holy-waterfall-b993zglb` / `production`, default and ready. Database: `fawri`, owner: `fawri_owner`.
- Public application schema: **0 base tables / 0 views** reported by schema discovery. A scoped single SELECT independently confirmed `current_database()='fawri'`, PostgreSQL major 18, **0 public base tables**, **0/3 commercial runtime LOGINs** (`fawri_restricted_runtime`, `fawri_auth_issuer`, `fawri_operator_issuer`). Neon branch role listing found only `fawri_owner`.
- Neon object storage: enabled, **0 buckets**, hence no current Neon storage objects in this target.
- Neon provider `list_snapshots`: **[]**. `get_snapshot_schedule`: **[]**. PITR/history retention **21600 seconds = 6 hours**.
- **No hosted CREATE snapshot, DB dump, media export, schema migration, SQL write, restore drill, secrets read, or financial data operation occurred.** Connector was intentionally authorized for one project and **Read only**. Snapshot creation cannot be done through that permission without a separately approved change in authorization; do not impersonate READ ONLY as backup completion.
- Because this *new* hosted target is **empty**, there are presently no hosted merchant rows, order tables or current Neon media objects to preserve. The crucial nonempty recovery requirement remains ahead of hosting migrations and onboarding real merchants; this is **not** proof that other environments or external media contain no data.
- Code source backup branch `backup/fawri-v1-prehosted-2026-11-13-241b978` is verified as created from exact commit `241b978b056e6f5f32f2be4dae075b0ec990fe72`. This remains **inside GitHub**. To fulfill **independent source recovery**, user must separately download commit-pinned ZIP (https://github.com/nora953/fawri-production-source/archive/241b978b056e6f5f32f2be4dae075b0ec990fe72.zip) and retain in independently controlled secure storage; no off-GitHub copy has been verified by this run.
- Priority before the first-hosted rollout: independently archived source ZIP and checksum, approved schema migration, a **tested independent encrypted PostgreSQL pg_dump custom-format export off Neon** plus isolated `pg_restore`, media backup/restore once buckets are populated, tenant-scoped roles and real merchant HTTP+Meta/provider validation. Neon-native snapshots are an additional convenience, **not an independent provider exit backup**.
- Decision: `P0-HOSTED-RECOVERY` **BLOCKED**, `P0-ACCESS-HOSTED-ROLLOUT` **BLOCKED**, 13 essential V1 gates remain, PR #550 DRAFT, first commercial **NO-GO**. Do not use original Neon/Railway projects.

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
