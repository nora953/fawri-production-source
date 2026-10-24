# P0 isolated Neon SQL checkpoint — 2026-10-18

Read-only SQL executed against explicitly selected isolated branch br-snowy-voice-b1bovtwi, database neondb. The Drizzle migration journal has 28 entries; last entry id=28, created_at=1791244800000, hash=87a2a16f4278430b770f6e60a4da497ae8cc24cab11aeec6780febe119bd9b3f. This agrees with the previously audited source hash for migration 0027. No journal entries for 0028 through 0033 were observed.

Catalog lookup returned no public functions matching the tested provider admission and confirmed-order resolver names. PostgreSQL roles: fawri_staging_rls_runtime cannot LOGIN and cannot BYPASSRLS; fawri_staging_runtime can LOGIN and has BYPASSRLS; neondb_owner can LOGIN and has BYPASSRLS. This does not establish which role Railway uses.

No SQL writes, grants, migrations or deployments were executed. Next: verify the deployed runtime identity, plan isolated migration acceptance and test restricted permissions. P0 NO-GO.
