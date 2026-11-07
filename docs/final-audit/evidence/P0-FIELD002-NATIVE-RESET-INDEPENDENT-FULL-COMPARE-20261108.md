# FIELD002 — independent post-native-reset data, catalog and ACL comparison (2026-11-08 Baghdad)

## Scope / boundary

Read-only SQL on Neon project `round-fire-18493605`, database `neondb`, using the explicitly pinned nonprimary branches below, following the provider-native reset recorded in [the preceding drill](P0-FIELD002-NATIVE-RESET-AFTER-QUOTA-20261107.md), source commit `b88526811663081fbe453ef3769b99c40f86a63f`.

| Scope | Branch ID | State during inventory |
|---|---|---|
| Original non-default `staging-runtime` (reference) | `br-falling-dust-b1km4gix` | READY |
| Latest frozen recovery parent | `br-royal-fog-b1v7pdmr` | READY |
| Native-reset disposable child | `br-summer-bonus-b19rgpfn` | READY; `last_reset_at=2026-11-07T21:01:06Z` |

**No SQL writes, grants, role changes, migrations, reset, backup deletion, promotion, default/production-branch query, deployment, merge or release in this follow-up.** No raw row contents, customer identities or credentials were exported.

## A. All 95 table data contents: PASS against original and parent

Enumerated **all 95 ordinary/partitioned tables** in the `public` and `drizzle` schemas. For each table, independently executed a `COUNT(*)` and a deterministic content fingerprint, sorting per-row `md5(to_jsonb(t)::text)` values before aggregating to be row-order independent. Compared **every table name, row count and per-table fingerprint**, not merely a sample. Then independently ran a combined summary fingerprint ordered by schema and table. `query_to_xml(format(...))` used quoted schema/table identifiers and returned only aggregate values.

| Branch | Tables compared | Total rows | Combined table-name/count/content MD5 |
|---|---:|---:|---|
| Original staging | 95 | 437 | `8dcad805b36a3f8f8d33fd13a567e7cd` |
| Recovery parent | 95/95 match | 437 | `8dcad805b36a3f8f8d33fd13a567e7cd` |
| Reset child | 95/95 match | 437 | `8dcad805b36a3f8f8d33fd13a567e7cd` |

**Zero per-table mismatches**, no missing fingerprints. This proves equality of the inspected table contents at query time (not future-write continuity, application consistency or an independent external backup). MD5 is used as a deterministic audit checksum, not as a cryptographic security attestation.

Reproducible aggregate SQL, run separately on all three pinned branches:

```sql
WITH rels AS (
  SELECT n.nspname sn, c.relname tn
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','drizzle') AND c.relkind IN ('r','p')
), values_per_relation AS (
  SELECT sn,tn,
    (xpath('/row/n/text()',query_to_xml(
       format('SELECT COUNT(*) AS n FROM %I.%I',sn,tn),
       false,true,'')))[1]::text::bigint n,
    (xpath('/row/h/text()',query_to_xml(
       format('SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text), '''' ORDER BY md5(to_jsonb(t)::text)), '''')) AS h FROM %I.%I t',sn,tn),
       false,true,'')))[1]::text h
  FROM rels
)
SELECT count(*)::int relations,sum(n)::int total_rows,
       md5(string_agg(sn||'.'||tn||':'||n||':'||h,E'\n' ORDER BY sn,tn)) AS combined_fingerprint
FROM values_per_relation;
```

## B. Nine catalog groups: 9/9 reset-child versus parent; 8/9 versus original

For each group, independently counted catalog items and hashed sorted canonical `to_jsonb(record)::text` values, not PostgreSQL object OIDs. The checks cover table/column definitions and RLS switches, constraints, index definitions, policies, triggers, functions, sequence definitions and `last_value`, explicit object/column/schema/function/default privileges and owners, and security role attributes/memberships.

| Catalog group | Original item count | Parent + reset-child item count | Original vs child | Parent vs child |
|---|---:|---:|---|---|
| Columns/table flags | 1,239 | 1,239 | MATCH | MATCH |
| Constraints | 1,538 | 1,538 | MATCH | MATCH |
| Indexes | 343 | 343 | MATCH | MATCH |
| RLS policies | 45 | 45 | MATCH | MATCH |
| Triggers (including internal) | 825 | 825 | MATCH | MATCH |
| Routines | 3 | 3 | MATCH | MATCH |
| Sequences | 1 | 1 | MATCH | MATCH |
| Object/default grants and owners | **105** | **106** | **DIFFERENT** | MATCH |
| `fawri_%` and `neondb_owner` role attributes/memberships | 7 | 7 | MATCH | MATCH |

Exact extra catalog record, **present in BOTH recovery parent and reset child, absent from original staging**:

```text
pg_default_acl:
kind=default_acl, schema=public, object=neondb_owner/f, owner=neondb_owner
acl:
  fawri_staging_rls_runtime=X/neondb_owner
  fawri_staging_runtime=X/neondb_owner
```

This is a creator-default `EXECUTE` privilege grant for newly created functions in `public`, not an additional existing table row or a recovered business event. **Do not silently normalize or ignore this ACL drift.** The two previously known unsafe original-staging *existing-function* grants are a separate pending issue. The extra default ACL was read-only detected, not repaired, and its origin has not been proven. The source-to-recovery security-catalog equivalence therefore **FAILS** even while reset-child-to-parent catalog equivalence passes.

Independent direct SELECT on the sole underlying sequence, `drizzle.__drizzle_migrations_id_seq`, verified `last_value=28`, `is_called=true` on all three branches; no `nextval` or sequence advance executed.

## Decision and remaining gate

- **ACCEPT as bounded PASS:** post-native-reset table-content parity **95/95** across original, parent and child; post-native-reset catalog parity **9/9** from parent to reset child; sequence current state matches.
- **OPEN security exception:** 1 extra `pg_default_acl` record on recovery parent and reset child versus original. Determine provenance, review desired least-privilege final ACL, and perform an **explicitly authorized, guarded** repair/rehearsal if appropriate. Do not mutate original staging or frozen recovery without separate exact-target authorization.
- **STILL OPEN:** portable offsite backup/restore; role credential/session reconnect isolation; controlled original-staging ACL/role cutover and guarded migrations **0028–0051** with rollback; original-staging tenant SQL/HTTP denial parity; first-commercial source/backup/import/promotion enforcement and hosted approval. Previous accepted clean-clone 7/7 hosted isolation testing need not be repeated without regression.
- Original staging is still at the **28-migration pre-rollout baseline**, and previously audited as **0/8 critical residual RLS tables** with an unsafe legacy privileged runtime login. Migration `0052` remains separately BLOCKED.
- **FIELD002 OPEN; privacy parent OPEN; PR #550 Draft / unmerged; release NO-GO.** Historical register `29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED` is not a certified overall P0 completion percentage.

This is a new, independently executed post-native-reset audit, not a retrospective reinterpretation of earlier pre-reset fingerprints.
