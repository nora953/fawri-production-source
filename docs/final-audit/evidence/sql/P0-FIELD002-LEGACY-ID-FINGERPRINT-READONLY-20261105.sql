-- FIELD002-R2: SELECT-only aggregated historical ID format and time correlation.
-- Approved isolated clone only. Do not return raw IDs, merchant IDs, or payloads.
-- A format match is NOT proof of a particular historical writer or import.
WITH candidate AS (
 SELECT type, created_at, source_entity_type, source_entity_id,
  substring(id from '^merchant-notification-([0-9]{13})-[a-z0-9]{6}$') AS legacy_epoch_millis,
  (id ~ '^notification-[0-9a-f]{64}$') AS canonical_sha256_id
 FROM public.notifications
), checked AS (
 SELECT *, CASE WHEN legacy_epoch_millis IS NOT NULL
  THEN abs(extract(epoch from created_at)-(legacy_epoch_millis::numeric/1000))
  ELSE NULL END AS seconds_from_embedded_timestamp
 FROM candidate
)
SELECT type, count(*)::int AS rows,
 count(legacy_epoch_millis)::int AS legacy_makeid_shape,
 count(*) FILTER (WHERE canonical_sha256_id)::int AS canonical_sha256_shape,
 count(*) FILTER (WHERE legacy_epoch_millis IS NOT NULL
  AND seconds_from_embedded_timestamp <= 5)::int AS matches_within_five_seconds,
 count(*) FILTER (WHERE source_entity_type IS NULL AND source_entity_id IS NULL)::int AS both_source_refs_missing,
 count(*) FILTER (WHERE (source_entity_type IS NULL) <> (source_entity_id IS NULL))::int AS partial_source_pairs
FROM checked GROUP BY type ORDER BY type;
