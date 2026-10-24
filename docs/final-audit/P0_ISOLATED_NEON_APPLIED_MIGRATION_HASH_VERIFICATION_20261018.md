# P0 isolated Neon applied migration hash verification — 2026-10-18

## Scope and identity
- GitHub repository: `nora953/fawri-production-source`.
- Audit branch: `fix/p0-provider-receipt-order-discovery-20261015`.
- Neon project: `round-fire-18493605`.
- Isolated Neon branch: `br-snowy-voice-b1bovtwi` (`audit-p0-resolver-isolated-20261017`).
- Database: `neondb`.
- **Read-only SELECT queries only.** No migrations were applied or database objects modified.

## Method
For each of the 28 applied rows in `drizzle.__drizzle_migrations`, compare `hash` against the PostgreSQL `sha256` of the corresponding committed `lib/db/drizzle/<tag>.sql` source, after applying the repository's `stabilizeMigrationDependencyOrder` transformation. SQL content was supplied as literal text or UTF-8 hex for the SELECT-only hash calculation. This is a comparison against the isolated Neon branch, **not** proof of production state.

## Result
- Applied migration IDs: 1 through 28, contiguous.
- Committed journal order/timestamps: 28/28 previously verified.
- Applied SQL SHA-256 hashes: **28/28 matched**.
- `0001_military_proteus` and `0002_cross_lane_stage` require dependency-order stabilization to match; raw-file hashes differ by design.
- The `0007`, `0016`, and `0020` checks initially could not execute as literal SQL; hex-encoded UTF-8 source was subsequently verified successfully.
- No mismatches remain among the 28 applied migrations.
- Pending migrations (not applied): `0028_meta_ingress_bounded_page_resolver`, `0029_verified_provider_payment_receipts`, `0030_audited_verified_receipt_reads`, `0031_audited_receipt_replay_reviews`, `0032_authorized_receipt_replay_execution`, `0033_confirmed_provider_order_resolution`.

## CI
Commit `1df3a31da9d6aaf9bb8662fbdd6487b1ee413c08`: 41/41 workflow runs completed successfully, including isolated Neon static preflight and isolated PostgreSQL engineering audit. These are CI results and do not establish hosted acceptance.

## Gate
**P0 remains NO-GO.** Outstanding: controlled application/verification of pending migrations on explicitly approved isolated hosted environment, restricted runtime/RLS authorization acceptance, and end-to-end hosted integration acceptance. Do not merge or deploy based solely on this hash verification.
