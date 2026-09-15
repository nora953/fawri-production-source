# Migration source manifest and lineage contract

## Manifest

Every planner run emits a deterministic `source_files` object. Each member records the logical source key, relative file name, existence flag, byte size, and SHA-256. The canonical JSON representation of that object produces `source_manifest_sha256`.

A write rehearsal refuses to start when any manifest member is missing. The complete plan is rebuilt after source locks are acquired and again immediately before commit.

## Record lineage

Every planned application row has exactly one lineage entry containing:

- source key and source collection;
- deterministic source record identity;
- SHA-256 of the canonical source/derived record;
- target table and target record identity.

The canonical sorted lineage array produces `source_lineage_sha256`. A write is refused when the lineage count differs from the planned application-row count.

During a transaction the writer records lineage in `migration_source_records` and records table reconciliation in `migration_reconciliation_results`. These rows are committed or rolled back atomically with application data.

## Operational overlays

Operational sources are applied only after their targets exist:

1. base identities and merchants;
2. channels, products, conversations, and orders;
3. manual conversation status/messages/reply requests;
4. order-operation versions and payment decisions;
5. merchant settings;
6. migration metadata and reconciliation.

Manual replies retain their idempotency keys and content hashes. Order operations retain version and reviewed payment metadata. Merchant settings retain their optimistic-concurrency version.

## Mutation detection

`assertPlanIdentity` compares:

- tool version;
- each source descriptor and the manifest SHA;
- lineage SHA;
- table counts;
- Drizzle snapshot name and SHA.

Any difference throws before `COMMIT`; the surrounding transaction handler issues `ROLLBACK`.
