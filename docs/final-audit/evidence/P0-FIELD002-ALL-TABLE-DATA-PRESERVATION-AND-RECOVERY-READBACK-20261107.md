# FIELD002 — full original-data preservation and refreshed recoverable branch readback (2026-11-07)

## Boundary and identity

- **GitHub source:** draft PR #550, reviewed branch `fix/p0-provider-receipt-order-discovery-20261015`, source checkpoint `ee6b54d4c65ea9be6000156e24ebe2317aefa774`.
- **Neon project/database:** `round-fire-18493605` / `neondb`; explicitly pinned, nonprimary/nondefault original `staging-runtime` / `br-falling-dust-b1km4gix`.
- **Previously migrated isolated clone:** `br-misty-feather-b1dgkwm1`, source-pinned schema migrations 0028–0051 applied, Drizzle 52, 8/8 exact critical policy digests accepted; 0052 not run.
- **Previous recovery copy:** `br-green-dawn-b137nxps`, created from original at LSN `0/4724160`. At today's subsequent comparison, 93/94 public-table row counts and full-row JSON MD5 digests matched the then-current original. The sole mismatch was the single `merchants.updated_at` column (source 2026-11-06T22:23:55.801Z UTC versus the older recovery copy's 2026-11-06T16:23:56.648Z UTC); all other 30 merchant columns matched, and the merchant row count was unchanged at one. This demonstrates why an old branch copy cannot silently be treated as a current backup. Do not assume any other application traffic was quiesced.

## Full-table original-data preservation on migrated clone

Read-only independent SQL compared **all 94 public tables that existed in the original**, not just the eight residual RLS tables, to the independently migrated `br-misty-feather-b1dgkwm1`.

- **94/94 table row counts identical**.
- **93/94 complete JSON-row aggregate digests identical**. The only discrepancy, `database_admin_access_audits` (18 rows on both branches), was traced by comparing `information_schema.columns`: migration added `authority_transaction_id bigint NOT NULL DEFAULT txid_current()` to the clone. The original seven columns remained. Excluding *only that new column* on the clone, full-row projection digests matched **18/18 rows in aggregate**; original `md5` `75f4a3acaa5e9f3a78efd5d656ddcd55` on both source and projected clone. The new column had zero NULL values. Accordingly the original-column projection matched on **94/94 tables**.
- **22** of 94 original tables were nonempty; **all nonempty original projections retained their aggregate content and counts**. This is a bounded aggregate preservation check, not per-row cryptographic proof or attested offsite recovery.
- SQL used `md5(COALESCE(string_agg(to_jsonb(row)::text,'|' ORDER BY to_jsonb(row)::text),''))` with a single SQL statement per branch and compared table names/counts/hashes outside the DB. Original row contents, private identifiers, and credentials were not output.

## Refreshed original staging recovery branch (NON-DESTRUCTIVE)

Because the older branch was stale in a timestamp field, created a **new** no-compute branch from original HEAD:
- Name: `field002-prechange-current-recovery-20261107`
- Branch ID: `br-empty-mud-b1it6mg9`
- Parent: `br-falling-dust-b1km4gix`
- Pinned parent **LSN `0/473AAE0`**, parent timestamp **`2026-11-06T23:17:31Z` UTC**
- Independently retrieved branch metadata: **READY**, `default=false`, `primary=false`.

Attached a *temporary read-only* Neon compute `ep-red-union-b1h7joxb` to the new branch solely for inspection. PostgreSQL answered from the recovery branch without using a write path. Compared against the then-current original branch:
- **94/94 table row counts match and 94/94 complete JSON-row digests match**, representing **409 aggregate rows across 22 nonempty public tables**.
- Independent source/recovery security catalog evidence also matched on all **9 checked measures**:
  1. 28 Drizzle migration entries;
  2. complete migration-ledger digest `8a7db348cb88f7be330bf4b58b2ed963`;
  3. 45 `public` RLS policies;
  4. policy-catalog digest `4c9a8a877d592340e9b13faf4dfce9ec`;
  5. Fawri role-flags digest `da93b4c31907685bb746099d82ffef0d`;
  6. Fawri role-membership digest `5a5b10bc34818735a1357015a359da30`;
  7. creator default-ACL digest `d45f390c18f45536669fb22885285d6c`;
  8. 3 existing `public` functions;
  9. public-function ownership and ACL digest `a9b084e7417256346655ced95abd39b5`.
- The earlier recovery copy was also inspected via temporary read-only compute `ep-super-flower-b1q5zdra`. **Both temporary computes were deleted after readback**; independently verified the compute lists for each recovery branch were empty. Preserve both branch copies unless an explicitly reviewed cleanup decision follows.
- **Original staging unchanged by this operation**. The default production branch was not queried or changed, no login/role/ACL or application deployment was modified, no 0052, no merge.

## What this establishes, and what it does NOT

**Accepted bounded prerequisite:** the refreshed, current-point source-derived branch is READY, independently readable and full-public-table copy-equivalent to original at observation; migrated isolated clone preserves every original public-table row in source-column projection after migrations 0028–0051. This extends earlier 6-dataset and 8-table readback evidence and removes the former unexplained `database_admin_access_audits` digest mismatch.

**NOT yet an actual restore drill:** creating and reading a Neon copy is **not** proof of a successful reset/restore of a corrupted target, of PITR, of portable `pg_dump`/`pg_restore`, of all internal PostgreSQL storage objects, or of automatic server/client reconnection. The data-bearing recovery branch is **strictly forbidden as first-commercial deployment source** under FIELD002-R2. Any actual destructive disposable reset test requires separate explicit approval and a sacrificial target with verified identity. No restored target was switched into an operational service.

**Still OPEN:** independently verified true recovery-to-target rehearsal; original 0028–0051 staged rollout and privileged-role/ACL cutover; actual target tenant SQL+HTTP positive/negative/revocation; first-commercial writer/import/promotion enforcement. `0052` separately BLOCKED; FIELD002 OPEN, PR #550 draft, commercial release NO-GO. No certified overall P0 percentage.


### Independent native Neon full-schema diff check
**Independent native Neon schema comparison:** queried `compare_database_schema` with recovery `br-empty-mud-b1it6mg9`, base original `br-falling-dust-b1km4gix`, database `neondb`. Neon returned `diff: ""` (empty SQL schema diff). This is an additional read-only cross-check of schema equality at inspection time, not an executable restore drill.
