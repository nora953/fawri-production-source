# FIELD002 — current original ACL=0 recovery clone and independent data/catalog parity (2026-11-08, Baghdad)

## Exact targets / permissions
- GitHub PR #550 source branch `fix/p0-provider-receipt-order-discovery-20261015`, inspected commit `2e22dc22b6c84c7b01438af435065e4e107aaded` before this checkpoint.
- Neon project `round-fire-18493605`, database `neondb`; original NONDEFAULT, NONPRIMARY `staging-runtime`: `br-falling-dust-b1km4gix`.
- **New recovery** `br-lingering-surf-b19gxt4e`, name `field002-current-acl0-prechange-recovery-20261108`, explicit parent `br-falling-dust-b1km4gix`, parent LSN `0/4B771F8`, creation time `2026-11-07T22:51:04Z` UTC. Neon returned state READY and nondefault/nonprimary.
- New clone was created with its own read-write compute by the Neon provider; every SQL statement during verification was SELECT-only. No SQL writes, migrations, roles/grants/ACL changes or delete/reset were executed on **either** original or new recovery. No query or write targeted the default/production branch, no runtime secrets or deployed services changed, and no merge/release.
- Old frozen recovery `br-royal-fog-b1v7pdmr` and its reset child were **retained**, not overwritten.

## Independent full data comparison — PASS, bounded
- Executed exact same dynamic `query_to_xml(format(... %I ...))` SELECT-only audit on pinned original and new recovery, enumerating **95/95** ordinary/partitioned tables in schemas `public` and `drizzle`. Each relation was checked independently for `COUNT(*)` and ordered `md5(to_jsonb(row)::text)` content fingerprint. Comparison by exact table name produced **zero missing tables, zero row-count mismatches, and zero per-table digest mismatches**.
- Source and recovered copy each contain **437 total rows**. Combined table/content fingerprint on both: `8dcad805b36a3f8f8d33fd13a567e7cd`, consistent with the previously documented original sample. The hash is an audit checksum, not a cryptographic tamper certificate.
- Ledger on BOTH: `drizzle.__drizzle_migrations` **28** entries; last hash `87a2a16f4278430b770f6e60a4da497ae8cc24cab11aeec6780febe119bd9b3f`; sequence `drizzle.__drizzle_migrations_id_seq` has `last_value=28, is_called=true`.
- Independent business counts on both: `notifications=0`, `audit_events=283`, `merchants=1`. No actual business rows or secrets exported.

## Nine catalog/security groups — PASS 9/9 parity with CURRENT original
Used separate catalog-only SQL SELECT on original and new recovery, normalizing schema/table names, role names and DDL definitions rather than comparing transient internal object OIDs. Aggregated sorted canonical JSON per group. Counts and digests were **identical on both**:

| Group | Items | MD5 audit fingerprint |
|---|---:|---|
| Columns, table RLS flags and owner | 1,239 | `846d64b304fc27bfbda4e1ee87146789` |
| Constraints | 1,538 | `e8f8d3f7dd07fc7b3d8f0bcd850c2fc0` |
| Indexes | 343 | `cadc7a674827a1661eb71c67f0a41a57` |
| RLS policies | 45 | `340b969aff1b615b0105985598695069` |
| Triggers (internal included) | 825 | `7b4acf8b862cb9722bbac24415df1934` |
| SQL routines | 3 | `c25e80e720a574dd52336aa28e0f6e7f` |
| Sequence definitions | 1 | `e0afc3a1904c33eeec8020d6917cefc5` |
| Catalog object/schema/default grants and owners | 100 | `bfdbc5b9f61cf654a59cd513897bf245` |
| `fawri_%` and owner role flags/memberships | 6 | `c24aa027ff0e496126e66e1156935ac9` |

These are **newly executed** 2026-11-08 catalog summaries using the stated definition; their counts (notably grants and role grouping) differ from an older audit's grouping methodology, so compare group fingerprints **within this run only**. Do not present them as externally attested hashes or a successful restoration.

## Exact outstanding security findings — unchanged, DO NOT promote copy
- Original and new recovery have **zero** `neondb_owner/public` default FUNCTION ACL rows and **zero** historical `fawri_staging_runtime` / `fawri_staging_rls_runtime` explicit function-default EXECUTE grants. Older recovery `br-royal-fog-b1v7pdmr` still has **two** historical grants. Thus the *current-source* ACL discrepancy is now captured by the new recovery; **why/when/who changed the original ACL remains unproven**.
- Both original and copy have **0/8 protected critical residual RLS tables**, 45 unrelated existing public RLS policies, and the legacy `public.fawri_tenant_or_audited_admin(text)` body digest `246383256a2e6a525a5fbd4cc98b3920` (uses a caller-writable `fawri.tenant_id` setting). Migration 0041's private-scope predicate is NOT applied to these branches.
- `fawri_staging_runtime` still has LOGIN+BYPASSRLS+CREATEROLE+CREATEDB; `fawri_staging_rls_runtime` is NOLOGIN. Existing function `PUBLIC EXECUTE` and effective legacy table grants are **not made safe merely by having zero function *default* grants**.
- Neon reported **no native snapshots** for the project and **no snapshot schedule** for staging in a read-only provider inventory. The new recovery is a data-bearing in-project branch copy, **not** independent/portable/offsite backup, native restore test, or a verified app/worker rollback. Project branch inventory was 9 immediately before creation; creation consumes its remaining slot (verify quota independently before future operations).
- Do **not** use any data-bearing staging/recovery branch as the first-commercial database. R2 precommercial fresh-schema/no-data policy and actual deployment enforcement remain OPEN.

## Narrow acceptance and next exact actions
**ACCEPTED ONLY:** independently verified **current original-to-recovery data 95/95** and security/catalog **9/9** parity, including newly observed zero creator-default ACL grants. This resolves the earlier *absence of a CURRENT ACL-matching in-project recovery copy*, **not the unexplained historical ACL event, offsite backup, independent restore, or original production-safe cutover**.

**NO-GO BEFORE ORIGINAL WRITES:** separately accepted portable restore/reconnect and tenant-consumer isolation; exclusive maintenance with no reconnect; owner-reviewed canonical original ACL0 prechange baseline and trusted-function effective permissions; three permanent least-privilege distinct LOGINs; guarded source-pinned 0028–0051 original rollout with atomic rollback; independent original restricted SQL and mounted HTTP own/foreign/revoked acceptance; commercial R2 import/restore/promotion enforcement. **Migration 0052 remains BLOCKED. PR #550 DRAFT; FIELD002 OPEN; release NO-GO; certified overall P0 percentage unavailable.**
