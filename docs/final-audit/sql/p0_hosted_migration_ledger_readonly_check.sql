-- P0 hosted Drizzle migration ledger inspection — READ ONLY.
-- Execute on the exact target database using an approved read-only session.
-- Compare ordered IDs, hashes and timestamps to the repository's committed
-- migration journal AND its expected Drizzle migration hashes offline.
-- Never assume ledger ID N directly equals migration filename 00NN.
-- This probe does not reveal customer records or connection secrets.
WITH ledger AS (
  SELECT id, hash, created_at,
         pg_catalog.row_number() OVER (ORDER BY id) AS sequence_number,
         pg_catalog.lag(id) OVER (ORDER BY id) AS prior_id
  FROM drizzle.__drizzle_migrations
), stats AS (
  SELECT count(*) AS applied_count,
         min(id) AS earliest_id, max(id) AS latest_id,
         count(DISTINCT id) AS distinct_ids,
         count(DISTINCT hash) AS distinct_hashes,
         COALESCE(pg_catalog.bool_and(prior_id IS NULL OR id>prior_id),true) AS increasing_ids
  FROM ledger
)
SELECT pg_catalog.jsonb_build_object(
  'database',current_database(),
  'connected_role',current_user,
  'ledger',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'sequence',sequence_number,'id',id,'hash',hash,'created_at',created_at)
    ORDER BY sequence_number) FROM ledger),'[]'::jsonb),
  'summary',(SELECT pg_catalog.to_jsonb(stats) FROM stats)
) AS p0_migration_ledger_evidence;
