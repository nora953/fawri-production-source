# FAWRI V1 — G3 Render hosted checkpoint, 2026-11-21 (Asia/Baghdad)

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
