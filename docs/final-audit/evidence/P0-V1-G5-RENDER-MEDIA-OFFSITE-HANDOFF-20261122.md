# FAWRI V1 G5 — one-time Render catalog-media offsite acceptance handoff
**Date:** 2026-11-22 · **Decision:** SOURCE READY / HOSTED MEDIA RECOVERY **NOT ACCEPTED** · **Commercial:** NO-GO

## Why this is the next actual gate
- Canonical production media directory: `/var/data/fawri/catalog-media`, physically on Render persistent disk `dsk-dbv0kvm8bjmc73av6g30` (mount `/var/data`), service `srv-dbv0kvm8bjmc73av6fm0`.
- Encrypted POST-G4 **Neon DATABASE** backup and detached PG18 restore, independent private Drive ciphertext copy/hash readback: **ACCEPTED**, [workflow #44970141332](https://github.com/nora953/fawri-production-source/actions/runs/44970141332). **Do not repeat** or conflate with Render media recovery.
- Approved encrypted media CLI source: `/app/scripts/v1-production-media-g5-archive.mjs` in built candidate image (actual Docker build [#45063540813](https://github.com/nora953/fawri-production-source/actions/runs/45063540813)). Source protection now includes prior-backup `EEXIST` preservation and dangling-restoration-symlink denial, focused [#45067429812](https://github.com/nora953/fawri-production-source/actions/runs/45067429812), **3/3 PASS**.
- **As of this handoff, the live Render deploy is STILL `9eed007943e1d93d960f360723b8ce7becc8f93a`, which predates the media CLI.** Merely having a newer GitHub commit or CI Docker build does **not** mean the live service Shell contains the CLI.

> **2026-11-22 latest read-only provider-attested instance connectivity:** Render `get_service` itself reports this service's configured SSH address as `srv-dbv0kvm8bjmc73av6fm0@ssh.frankfurt.render.com`, dashboard URL `https://dashboard.render.com/web/srv-dbv0kvm8bjmc73av6fm0`, region `frankfurt`, Starter plan, Docker runtime and persistent `/var/data` disk. These are service metadata, **not** an authenticated session and **not** evidence of actual disk access. The existing Render connector has no Shell/SSH command execution. Do not expose SSH private keys or put merchant images in chat. The fastest safe next owner action is Render dashboard → this service → **Shell**, run the following read-only command and report ONLY its short result (no filenames/PII):
>
> ```sh
> if test -f /app/scripts/v1-production-media-g5-archive.mjs && test -d /var/data/fawri; then
>   if test -d /var/data/fawri/catalog-media; then
>     echo 'G5_SHELL_CLI_AND_MEDIA_DIRECTORY_PRESENT'
>   else
>     echo 'G5_SHELL_CLI_PRESENT_MEDIA_DIRECTORY_ABSENT'
>   fi
> else
>   echo 'G5_SHELL_PREREQUISITE_MISSING'
> fi
> ```
>
> No export, plaintext media read, privilege elevation or environment variable inspection occurs in this preflight. Production encrypted media export still requires separate scoped owner authorization.

## Mandatory gates before touching a real disk
1. Obtain separately scoped owner approval for a **controlled, maintenance-ON service deploy** of the accepted candidate. Verify maintenance=ON, autoDeploy=no, pinned source SHA, successful `/readyz`, and that the mounted disk survived redeploy. A deploy is not approved by this packet.
2. Obtain separately scoped owner approval to read/export `/var/data/fawri/catalog-media` **read-only** and to transfer *encrypted ciphertext only* to the already owner-controlled **private Google Drive backup folder** (or approved independent vault). Owner must create/retain an unrelated strong media-archive passphrase outside Render/GitHub/Drive ciphertext folder. **Never place passphrase in GitHub secrets, code, issue comments, logs or shell history.**
3. Connect to the **running production web service** through Render Dashboard → service → **Shell**, or authorized SSH attached to the running instance. **Do not use a build step, pre-deploy, one-off job, separate Render service or ephemeral shell instance:** those do not have access to the existing persistent disk. Render official references: https://render.com/docs/disks and https://render.com/docs/ssh.
4. Preconditions in the running service Shell, without printing secrets:
   ```sh
   test -f /app/scripts/v1-production-media-g5-archive.mjs || { echo 'STOP: CLI_NOT_IN_LIVE_IMAGE'; exit 1; }
   test -d /var/data/fawri/catalog-media || { echo 'STOP: NO_REAL_MEDIA_DIR'; exit 1; }
   node --check /app/scripts/v1-production-media-g5-archive.mjs
   ```
   **Stop** on either failed `test`. If there are **zero real catalog objects**, the CLI intentionally refuses to claim a successful real media backup. Do not invent merchant data to make a gate green.
5. After approvals and successful checks, use a secure *interactive* shell with command history/trace disabled. Prompt for the passphrase interactively (never paste it as a command argument). One-shot example for a Shell running `bash`:
   ```bash
   set +x
   umask 077
   read -r -s -p 'Media backup passphrase (not echoed): ' FAWRI_V1_MEDIA_ARCHIVE_PASSPHRASE
   printf '\n'
   export FAWRI_V1_MEDIA_ARCHIVE_PASSPHRASE
   BACKUP=/tmp/fawri-v1-catalog-media-$(date -u +%Y%m%dT%H%M%SZ).fwmedia
   FAWRI_V1_MEDIA_EXPORT_APPROVED=1 node /app/scripts/v1-production-media-g5-archive.mjs export /var/data/fawri/catalog-media "$BACKUP"
   sha256sum "$BACKUP"
   ```
   The script returns `ENCRYPTED_EXPORT_CREATED_LOCAL_ONLY` and `offsite:false` until a separate, independently confirmed transfer. It must **not** write output inside `/var/data`, publish it through public HTTP, or auto-start on boot. The `/tmp` file is EPHEMERAL; transfer immediately or lose it on restart.
6. Copy the **encrypted** `*.fwmedia` from the running instance via **SCP/SFTP** over a separately configured Render SSH connection or approved Magic-Wormhole, per Render documentation. Take the exact host/user/region from the Render **Connect → SSH** UI; never guess it or disable host verification. Place ciphertext in the private offsite destination, not a public link. Verify after independent download: **byte-for-byte SHA-256 match**, private sharing, expected size, preservation of the passphrase in an independent owner-controlled secret vault.
7. On an **isolated /tmp-owned scratch machine**, run the same source-pinned CLI with the owner-provided passphrase using `restore <ciphertext.fwmedia> <new-unique-disposable-target>` and `FAWRI_V1_MEDIA_DISPOSABLE_ROOT=<real-existing-temp-root>`. Accept only `ISOLATED_MEDIA_RESTORE_VERIFIED`; reconcile restored image count/sha256 with the decrypted manifest and **real DB catalog references**, and record isolated test date/ID without exposing merchant identifiers. Never restore into production, never use a Render disk snapshot restore as a substitute, and never use a current merchant's images as an unauthorised test fixture.
8. After *successful* independently verified custody and recovery, remove only the ephemeral local ciphertext from the Render runtime as an explicit owner-controlled cleanup; retain the verified private offsite copy and secret, record retention schedule and recovery ownership. **Do not delete the mounted disk, databases, image objects or historical backup artifacts.**

## Render automatic snapshots are supplemental, not independent offsite recovery
Render documents that disk snapshots are taken roughly once every 24 hours and available for **7 days**; restoring one overwrites the current **whole disk** and loses later writes. This is a short-horizon in-provider safety net, not an independent export or a per-merchant/catalog restore. Never click restore to satisfy G5: https://render.com/docs/disks

## Acceptance result to record
`P0-HOSTED-RECOVERY` remains BLOCKED until **real** mounted catalog bytes are exported, independently offsite, decrypted/restored to isolated storage and verified with tenant/DB references; separately G3 hosted merchant A/B photo access/deletion durability and G4 Google/WhatsApp A/B sign-in, manual order and subscription remain **NO-GO**. Owner signoff is mandatory. This packet is **not** permission for deployment, secrets, third-party onboarding or public service opening.
