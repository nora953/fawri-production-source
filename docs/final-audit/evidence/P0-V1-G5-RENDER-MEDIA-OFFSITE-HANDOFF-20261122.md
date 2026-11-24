# FAWRI V1 G5 — one-time Render catalog-media offsite acceptance handoff


## 2026-11-24 — independent offsite DB restore tool and recurring backup boundary (HELD)
- New source [offline restore CLI](../../../scripts/v1-postg4-offsite-restore.mjs) and focused tests/CI at [276ad6a5](https://github.com/nora953/fawri-production-source/commit/276ad6a5ecccf222827eea5842bce8e0aaaa2e1c). Takes independently downloaded manifest and encrypted archive plus independently established encrypted SHA-256 and approved passphrase; validates scope, ciphertext hash/size, authenticated decryption and plaintext hash/size. Restores only into a fresh network-disabled PG18 Docker container without host mounts, without live database URL, and checks the expected prelaunch schema/owner and empty merchant/order/trial tables. No plaintext file on host; container is disposable. Source tests pending readback; actual Drive-based decryption/restoration not yet performed. The original one-shot export/restore is already accepted and must not be repeated. This is not an ACL, production restore, or real-media acceptance.
- Recurring commercial backups: the one-shot prelaunch export hard-codes zero merchants/orders and one account, so it **cannot** be repurposed as a post-launch scheduled backup. Do not remove those checks or reuse the privileged owner connection for an unattended job. A separately reviewed least-privilege backup reader, consistent DB/media checkpoint, independent encrypted custody, monitored backup-age alert, restore verification and explicit authorization are necessary before actual sales. Proposed starting targets (not approved or implemented): daily encrypted DB+media backup, RPO <=24h, retain 30 daily copies subject to legal retention limits, monthly isolated restore drill and after schema changes, notify owner on failed/stale backups, no automatic production restore. Define recovery time target only after timed proof. Do not enable paid infrastructure or put an owner credential/passphrase in new automation without approval.
- At this checkpoint the public informational homepage alone is LIVE; the app routes remain gated. No new merchant records/images, no production connection, no restoration, no deployment, no recurring job enabled. G5 remains BLOCKED. See current PROGRESS.md.

## 2026-11-23 — Owner Shell screenshot interpreted correctly, no repeat command

- **Screenshot-derived evidence (owner provided):** Browser Render Web Shell shows a pasted check containing `&& echo G5_READY || echo G5_NOT_READY`, followed by a new shell prompt. The strings `G5_READY` and `G5_NOT_READY` appear **as command text**, and there is **no separately visible result line**. Therefore the screenshot is **inconclusive**, and must not be recorded as a verified `G5_NOT_READY` result. No user repetition requested.
- **Other independently verified facts:** Exact approved live Render source `be32d2788a229782cc3fb73f9eebd96362ccda59` includes the encrypted media CLI in the Docker runtime (`#21 COPY` DONE), `/readyz=200`, mounted `/var/data` 5GB and verified synthetic G3 canary. The mounted `/var/data/fawri/catalog-media` directory is **created lazily** by the first product-image upload (`filesystemProvider.put` calls `fs.promises.mkdir(directory, { recursive:true })`); its absence on an empty first launch would be normal, not proof of missing persistent storage. Live Neon production aggregates found **0 merchants, 0 products and 0 catalog image references**, but do not prove absence of unreferenced bytes on disk.
- **Operational decision:** No repeat Shell commands or speculative empty-media archives. `G5 production DB offsite` accepted independently; `G5 Render media offsite` remains unaccepted until real media exists and can be exported via authorized Shell/SSH, independently stored and restored. Focus next on provider-authorized G4 merchant onboarding and real G3 merchant image E2E, then run controlled G5 media offsite acceptance. No fabricated merchant data, no production SQL writes, no public file-transfer endpoint, no shell secrets in chat; maintenance stays ON, autoDeploy OFF, NO-GO.


## 2026-11-23 — Zero-reference preflight; NO further owner shell command requested now

- **Real current read-only production Neon counts:** `public.merchants=0`, `public.catalog_image_references=0`, `public.products=0`, `public.orders=0`, and `public.accounts=1` (existing primary administration). This was read from the actual commercial Neon database `fawri` on `br-holy-waterfall-b993zglb` using a single aggregate SELECT. It retrieved no personal information and changed no rows. Consequently there is **no evidenced merchant-owned catalog image data to back up at present**.
- **Decision that avoids wasting the owner's time:** **Do not ask the owner to paste another Render Shell command now**. The new media exporter intentionally refuses an empty media directory and thus could not produce a valid nonempty commercial merchant-image recovery acceptance on the current zero-merchant state. No images in *the DB ledger* does **not** prove the disk has zero orphan objects; only mounted-disk inspection can establish that separately. The baseline encrypted production **database** recovery sub-gate remains accepted independently.
- **Next action priority:** Finish legitimate G4 Google/WhatsApp provider approval and safe controlled merchant onboarding, followed by real G3 first-image and two-merchant storage/tenant validation. At the first owner-authorized real image, carry out the gated G5 **media ciphertext export → private external custody → independent isolated restore** using the present live CLI and the documented secure Shell/SSH procedure. Do not create artificial merchants, order rows or media records in production solely to make a backup acceptance green. Do not waive media recovery for commercial GO.
- The last Render deployment `be32d2788a229782cc3fb73f9eebd96362ccda59` remains LIVE with the media CLI packaged, `/readyz=200`, synthetic disk canary verified, maintenance ON, autoDeploy OFF. Read-only Render review after this deployment showed no app-level error logs or new deploy failure events. **NO-GO** continues until G3/G4 and actual offsite catalog-media proof are accepted. Only interrupt the owner for an unavoidable external authorization or new privileged-access step.

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
