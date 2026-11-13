# FAWRI V1 — backup checkpoint, 2026-11-13

## 2026-11-13 — isolated Neon restore drill owner-approved; CONNECTOR WRITE TOOL BLOCKED

- Owner **approved** a temporary isolated clone experiment within the exact independent Neon project `crimson-cherry-65705041`, testing schema setup and backup/restore without modifying `production` branch `br-holy-waterfall-b993zglb` or using real merchant data.
- Fresh read-only `list_branches` returned exactly **one** ready/default/primary branch (`production`), so no experimental branch existed to reuse.
- A single narrowly scoped `create_branch(project_id='crimson-cherry-65705041',parent_id='br-holy-waterfall-b993zglb',name='v1-recovery-drill-20261113',min_cu=0.25,max_cu=0.25)` call was **rejected before execution** with `Tool create_branch not found`, consistent with the previously authorized **Read only** connector capabilities. **Zero new branches, zero SQL writes, zero snapshots, zero production changes.**
- **Exact next owner-dependent action:** In ChatGPT plugin Neon connection settings use Reconnect, select **One project** = `crimson-cherry-65705041`, **Read and write**, only necessary categories **Branches, Snapshots, Querying, Schema, Projects/Endpoints** as available; inspect and authorize the provider OAuth scope consciously. This broadens technical capability in the one project, including production: actual instructions remain **ISOLATED branch only, NO production writes, no financial/live data, no merge/deploy**. After connection verified, create only the named isolated clone and record its returned branch ID before issuing ANY SQL. No separate production permission is implied.
- Scope of approved isolated drill: bounded synthetic database schema/read/backup, isolated recoverable snapshot or logical dump and restore to a **different** disposable branch, post-restore integrity/owner-role checks and no changes to original `production`. If additional snapshot storage fees/quota/role permissions are demanded, stop and ask owner instead of proceeding.
- This is a **permission blocker** only, not an infrastructure failure or failure of existing accepted CI. `P0-HOSTED-RECOVERY` remains BLOCKED, PR #550 DRAFT, commercial NO-GO.


## 2026-11-13 — OFFSITE SOURCE RECOVERY READ-BACK ACCEPTED (current authoritative checkpoint)

**Sub-gate: independent SOURCE backup and restore ACCEPTED. Broader `P0-HOSTED-RECOVERY` remains BLOCKED** because hosted Postgres/media recovery is not proved.

- User uploaded the GitHub Actions export archive to privately owned Google Drive folder [FAWRI - Private Backup 2026-11-13](https://drive.google.com/drive/folders/17Mb7uofA3A04MzRastzpICj2Ng-4cDAN). Exact file: [FAWRI-source-backup-2026-11-13 (2).zip](https://drive.google.com/file/d/1kE_lk0usxI-IVhbGAVllc30Y3Tr9OetA/view), Drive ID `1kE_lk0usxI-IVhbGAVllc30Y3Tr9OetA`, reported bytes **18,544,799**, shared=false / not_shared. No wider sharing was enabled.
- **Independently downloaded the stored Drive ZIP** through the authenticated Drive connector and verified the actual bytes (not just filename/size). Outer ZIP SHA-256 = `8e636c5950d9ddd2ab7992c92b3a638517b34e719f913ad67aa534c7fea4d3f4`, EXACTLY the GitHub Actions artifact digest; three entries `SHA256SUMS.txt`, `fawri-source-20261113-241b978.zip`, `manifest.json`. ZIP CRC integrity PASS.
- The nested `git archive` is 18,543,800 bytes with SHA-256 `43ca2c5ffca037058e0a2dc54318e51653abfd863c742656c52855499ae02fb4` matching both the outer manifest and SHA256SUMS. Its **3,179 ZIP entries** pass CRC validation with no path escape.
- **Recovery rehearsal** extracted the NESTED archive from the verified Drive copy to an isolated throwaway folder (not a production checkout), confirmed required files existed, independently recomputed Git blob SHA-1 for `AGENTS.md`, `LAUNCH_PLAN.md`, `LAUNCH_SCOPE_MATRIX.md`, `PROGRESS.md`, `package.json`, `scripts/backup-postgresql.mjs`, `scripts/restore-postgresql.mjs`, `lib/db/drizzle/meta/_journal.json`, `artifacts/api-server/src/services/postgresSubscriptionEntitlement.ts`. All **9/9 Git blob digests MATCH the immutable source commit `241b978b056e6f5f32f2be4dae075b0ec990fe72`**, separately fetched from GitHub, without executing recovered code.
- Original GitHub frozen SHA and PR #550 not modified by recovery rehearsal. The full Git history, production database, uploaded media and secrets are intentionally **not** included. For public repository source, Google Drive copy is independent of GitHub account loss; Google account and sharing remain the user's responsibility.
- **Next necessary live recovery acceptance is not a repeat of this source test**: after scoped authorization to provision the currently empty Neon production-prep DB, take encrypted custom-format Postgres logical backup **outside Neon/GitHub**, reproduce it on an isolated database, verify 54-stage schema, application rows/role ACL + non-empty media restore before any merchant data or GO. Current connected Neon is **read-only**; 0 application tables, 0/3 runtime LOGINs, 0 object buckets, no snapshots. No live DB write or hosted promotion authorized.
- Historic sections below predate Drive upload and are retained as dated evidence, **superseded only for source-offsite verification**. P0 known register remains 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED, 13 essential V1 plus 3 deferred POS obligations, first-commercial **NO-GO**.

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
