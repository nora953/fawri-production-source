# FAWRI V1 — G3 Render hosted checkpoint, 2026-11-21 (Asia/Baghdad)

## G3 hosted persistence canary VERIFIED across actual replacement — 2026-11-21

- **Previous real container:** live [`4f80ca4c`](https://github.com/nora953/fawri-production-source/commit/4f80ca4c64bd2536e41ff62bcf5b8557b605079c), recorded `canaryStatus=seeded` at **2026-11-21 12:11:42 UTC** on persistent `/var/data/fawri`.
- **New owner-continued bounded G3 redeploy:** Render deployment `dep-dc0qv2142hec73c8rlb0` from [`816c98abb4ff889baaeb96293bafc53d5453ae13`](https://github.com/nora953/fawri-production-source/commit/816c98abb4ff889baaeb96293bafc53d5453ae13), status **live**, completed **2026-11-21T14:51:43.448382Z**. Comparison of source SHAs confirms only the prior `PROGRESS.md` and this G3 evidence markdown changed; no runtime code changes.
- **Critical new-container logs:** distinct hostname `srv-dbv0kvm8bjmc73av6fm0-5c49fd876-4wbfn`, `canaryStatus="verified"` at **2026-11-21T14:51:39.163314Z**; subsequent `Server listening` port 8080 and `dataDir=/var/data/fawri`; new `GET /readyz` **HTTP 200** twice at **14:51:42.515Z** and **14:51:42.554Z**. Renderer service readback: maintenance **enabled**, auto deploy **no**, `healthCheckPath=/readyz`, attached persistent disk **5GB** on `/var/data`.
- **Meaning of PASS:** server-side `assertCatalogMediaCanaryAcrossStarts` verified the preexisting mode-restricted synthetic JSON marker and checksum after **actual host container replacement**; it cannot be reclassified as a fresh seed. This accepts only the **synthetic cross-redeploy mounted-disk persistence subcondition**.
- **Mandatory separate acceptance still missing:** real merchant product image bytes and tenant authorization across restart/redeploy, physical deletion retry correctness, independent postmigration PostgreSQL + media export/restore, test two merchants via hosted Google/WhatsApp OTP and COD/manual subscription end to end, operational resilience/load checks and final signoff. No merchant orders or live customer records created, no Neon DDL/DML, environment/secret changes, maintenance-off or PR merge. **G3 PARTIAL, G4/G5 OPEN, NO-GO.**

---
## Owner-authorized G3 controlled deploy — 2026-11-21 12:11 UTC

**Authorization and boundary.** Project owner approved deploying a reviewed revision to existing Render V1 while keeping maintenance ON. Connector performed only `trigger_deploy` for the already-selected existing service with auto deploy OFF, `clearCache=false`; no PR merge, Neon SQL, environment-secret edit, maintenance-off or public commercial launch.

**Verified exact production build:** Render deploy [`dep-dc0ok16k1f9s739q66a0`](https://dashboard.render.com/web/srv-dbv0kvm8bjmc73av6fm0) finished **live** at **2026-11-21T12:11:45.850497Z** from [`4f80ca4c64bd2536e41ff62bcf5b8557b605079c`](https://github.com/nora953/fawri-production-source/commit/4f80ca4c64bd2536e41ff62bcf5b8557b605079c) on the approved Draft PR #550 branch. The three commits after code-tested `6faf47f7` modify **only** `LAUNCH_PLAN.md`, `PROGRESS.md`, and this evidence file (no app/runtime code delta); exact deployed commit independently completed **84/84 GitHub Actions workflows SUCCESS**. CI outcomes are source evidence and do not replace hosted proof.

**New-instance runtime logs:** hostname ending `-xnxnz` at 2026-11-21T12:11:42Z reported `G3 synthetic catalog media persistence canary` with `canaryStatus=seeded`, `Server listening` on port 8080 and `dataDir=/var/data/fawri`; `Merchant physical media cleanup reconciler started` while Meta webhook worker remained activation-gated. **New-instance** GET `/readyz` returned **HTTP 200** at 12:11:44 and again at 12:11:45 UTC. This is hosted G3 startup/readiness evidence, stronger than old-instance 200. Subsequent Render service read returned `healthCheckPath=/readyz`, `maintenanceMode.enabled=true`, autoDeploy=`no`, 5GB persistent disk `/var/data`, current service update time aligned with deploy. No credential values fetched or recorded.

**Do not over-close:** `canaryStatus=seeded` means the synthetic file's initial placement succeeded; **not** proof it survives a further restart/redeploy, nor proof of actual merchant product image storage/authorization/deletion, or off-provider backup restoration. It is **not** G3 full acceptance. No tested real two-merchant HTTP+SQL isolation, Google/WhatsApp Authentication OTP, approved template or policy rollout, production merchant order/stock E2E, independent postmigration DB+catalog-media restore, or load testing. **Next controlled acceptance:** observe `canaryStatus=verified/persisted` across a separately authorized restart/redeploy and perform merchant-photo actual stored checksum/ACL checks with approved synthetic accounts, then G4/G5 under maintenance. Until then, **G3 PARTIAL (HOST STARTUP/READINESS PASS), G4/G5 OPEN, NO-GO, PR #550 DRAFT**.

---

## Update 2026-11-21 — actual Render redeploy and exact PR CI

**Read-only evidence verified 2026-11-21:** The previous observation of a 2026-11-19 last live deploy is **historical**, no longer the current Render state. The existing service `srv-dbv0kvm8bjmc73av6fm0` (`fawri-v1-commercial-gated-k9yj`) now reports `healthCheckPath=/readyz`, maintenance **ON**, auto deploy **OFF**, attached `/var/data` 5GB disk, one Frankfurt Starter instance. Render deployment `dep-dc0dno2vcj2c7387l9lg` succeeded `2026-11-20T23:47:30Z` and reports `live` at source commit [`729f27a6`](https://github.com/nora953/fawri-production-source/commit/729f27a6c9aeccab104395d9ad78fc9d20fd98b4), not at the PR HEAD. Previous deploys on the same SHA were superseded; their earlier failure/status is not evidence of current acceptance.

**Newer PR HEAD source:** [`6faf47f7`](https://github.com/nora953/fawri-production-source/commit/6faf47f74f651792402f65594f5b771132170369) changed only `scripts/fawri-native-indexeddb-audit.mjs`, increasing native Chrome startup contention allowance and preserving assertions. GitHub Actions API for that exact source SHA shows **84/84 completed workflows with conclusion SUCCESS**, including [cashier native IndexedDB audit #44898195467](https://github.com/nora953/fawri-production-source/actions/runs/44898195467), [Final quality #44898197583](https://github.com/nora953/fawri-production-source/actions/runs/44898197583), and [production-image smoke NO DEPLOY #44898197444](https://github.com/nora953/fawri-production-source/actions/runs/44898197444). The commit's check-runs list had **93 successes plus 7 skipped owner-opt-in live jobs**; skipped jobs are *not* live production acceptance. Earlier 82/84 browser failures at `8a855be` are historical and fixed in newer source CI.

**Bounded conclusion:** The actual service configuration and a successful deployment at `729f27a6` are independently confirmed. The PR HEAD `6faf47f7` is **NOT the deployed revision**, and there is no independently observed live `/readyz` 200 from the new source, two-merchant hosted SQL+HTTP isolation, Google/WhatsApp OTP receipt/redeem, product-photo checksum across restart+redeploy, or independently restored DB **and** catalog-media backup. Read-only Render logs could not be inspected in this pass because the connector required a selected workspace; no secrets, host configuration or runtime state were modified. The next gated step remains an **owner-authorized deployment of a specifically reviewed revision while maintenance remains ON**, then hosted G3→G4/G5 acceptance. Draft PR #550 and **NO-GO** are unchanged; historical P0 **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED** (not commercial readiness). Do not trigger a new deploy or promote these checks to hosted PASS without authorization.

---


**Gate:** G3 partial deployed evidence only; **NOT HOSTED-ACCEPTED / NO-GO**.
**Scope:** read-only Render inspection and exact committed GitHub CI; no provider modifications.
**PR:** [#550](https://github.com/nora953/fawri-production-source/pull/550) remains Draft and unmerged.

## Verified Render service — read-only connector

| Item | Observed value | Meaning |
| --- | --- | --- |
| Service ID | `srv-dbv0kvm8bjmc73av6fm0` | Existing Render web service, no need to create a duplicate |
| Service | `fawri-v1-commercial-gated-k9yj` | Frankfurt, Starter, Docker, one instance |
| URL | `https://fawri-v1-commercial-gated-k9yj.onrender.com` | **NOT** commercial authorization or evidence that the public app is usable |
| Last deployed source | `b1e5393ea755864bbc3ace11c8e19885f474db7e` (2026-11-19) | Older than G3 disk/readiness and Google + WhatsApp code |
| Last deploy ID | `dep-dbvf98p5efls73dlgv6g` | Deploy status `live` as recorded 2026-11-19 13:09 UTC |
| Maintenance | `enabled: true` | Remain ON; do not enable public traffic |
| Auto deploy | `off` | GitHub pushes do **not** update the hosted service |
| Mounted disk | `dsk-dbv0kvm8bjmc73av6g30` | `/var/data`, `5GB`, confirmed Render service configuration |
| Actual deployed health path | `/healthz` | Only checks that the HTTP listener responds; **NOT G3 dependency readiness** |

Read-only app logs at 2026-11-19 13:09 UTC show (1) `Server listening`, port 8080, dataDir `/var/data/fawri`, (2) early-warning monitor started, and (3) `Background job workers are disabled by configuration`. These are **runtime observations** from the old live build, not proof of persistent media writes across restarts, user flows, privilege isolation or fresh backup.

## G3 source corrections, currently NOT deployed

- [`8a855be`](https://github.com/nora953/fawri-production-source/commit/8a855beee8dbacc155d63df5ba19e2f04d8d19e1): G3 Render proposal selects `/readyz`, checking tenant PostgreSQL/RLS, separately authenticated auth/operator SQL, production configuration, and actual persistent media mount. Production starts fail-closed when expected mount is missing, read-only, ephemeral, symlink-redirected or unusable. The extended `/ops/readiness` still requires G4 WhatsApp provider configuration independently; `/healthz` remains liveness.
- `render.yaml` now proposes `FAWRI_PERSISTENT_MEDIA_MOUNT_PATH=/var/data`, data directory `/var/data/fawri`, and `FAWRI_DISABLE_JOB_WORKERS=0` to preserve merchant physical-media deletion reconciliation. Meta remains separately gated OFF, manual V1 Support scans excluded, POS/payment/Meta non-offered.
- [Offline Render G3 preflight #44802497013](https://github.com/nora953/fawri-production-source/actions/runs/44802497013) **SUCCESS** on exact code SHA `8a855be`, including synthetic disk positive/negative, source-policy preflight and API TypeScript typecheck. [Mounted observability #44802494449](https://github.com/nora953/fawri-production-source/actions/runs/44802494449) **SUCCESS**, [Final quality #44802496754](https://github.com/nora953/fawri-production-source/actions/runs/44802496754) and [Final security #44802494256](https://github.com/nora953/fawri-production-source/actions/runs/44802494256) **SUCCESS**.
- Exact code SHA `8a855be` CI finished **82 SUCCESS / 84 workflows**, the remaining two being [Cashier native IndexedDB #44802496766](https://github.com/nora953/fawri-production-source/actions/runs/44802496766) and [Admin parent permission browser #44802497784](https://github.com/nora953/fawri-production-source/actions/runs/44802497784). Both failed on **browser prerequisite timeouts** before evidence of successful application-level cases. Cashier/POS and in-app Support are not sold in manual V1; do not convert out-of-scope browser failures into an invented G3 hosted acceptance, and do not simply ignore all release risk.

## Exact missing G3 hosted acceptance

1. Preserve maintenance ON and automatic deploy OFF until owner approval and a safe release window. Review hosted Render environment **without exposing secret values**. The old deployed service may still run with workers disabled and old `/healthz`; the GitHub Blueprint does not modify an existing service automatically.
2. Before an approved deployment, ensure the reviewed source revision, actual Render `healthCheckPath=/readyz`, actual `FAWRI_PERSISTENT_MEDIA_MOUNT_PATH`, `FAWRI_DATA_DIR`, and worker toggles agree. Keep separate database LOGIN credentials as existing secrets; never copy values into GitHub or chat. The earlier owner bootstrap password salt must be retained.
3. With explicit owner authorization only, deploy the reviewed image **in maintenance mode**. Observe actual `/readyz` HTTP 200, auth/operator/tenant role checks and persistent-disk mount readiness. Do not interpret older successful `/healthz` probes as equivalent.
4. On the same deployed environment, create a synthetic test merchant/product photo using an approved safe path; confirm content hash and merchant authorization before/after restart and redeploy. Validate deletion cleanup retries and the deferred Meta/payment/POS/Support HTTP denials.
5. Complete independent database **and catalog-media** off-provider backup/restore evidence, merchant separation and real Google/WhatsApp flow as G4/G5. Obtain owner GO before maintenance OFF, domain and commercial sales.

**Decision:** **NO-GO**; physical Render disk exists and a live old build is recorded; **actual application durability and latest-code hosted acceptance are still unproven**. No user action needed for GitHub-only evidence recording. No service/env modification, deploy, Neon SQL, or release occurred in this inspection.
