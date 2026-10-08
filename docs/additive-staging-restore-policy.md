# Additive staging restore policy

This is an **offline, read-only proposal**, not a staging writer. It implements
the owner/history transformation after the existing cross-lane reconciliation.
It never connects to a database. A successful policy report means its source
transformation passed, not that a staging target was inspected or is ready.

The existing owner is `admin-c668ed66-2415-4a98-a80e-ce6fe6b8076a`.
The excluded legacy owner is `admin-local-bbf1565a-f04f-4db3-a65e-c2f5ad024b1c`.
Neither owner account nor either owner's profile is inserted by a successful
proposal. An unexpected source owner, or a source containing the current owner,
blocks the proposal. Exactly one current owner must already exist in staging;
that remains an unverified target precondition.

## Transformation and history

| Source | Proposed handling | Historical evidence |
| --- | --- | --- |
| Legacy owner account/profile/permissions | Exclude | IDs, reason and original row hash; no password copied into history |
| Authorization belonging to legacy owner | Exclude | Original authorization archived |
| Assistant authorization granted by legacy owner | Remap required grantor FK to current owner | Original grantor and original row hash in separate history; existing flags/timestamps retained, **no new owner consent inferred** |
| Ended/expired/rejected request made by legacy owner | Exclude from operational tables | Original normalized request archived; never relabel requester |
| Alerts/notices belonging to that request | Exclude with their parent | Original normalized dependent rows archived |
| Assistant's historical request reviewed by legacy owner | Keep requester, null reviewer FK | Original reviewer retained in history; review dates unchanged |
| Audit event authored by legacy owner | Null actor FK | Keep actor kind, metadata, entity ID, original hash and previous hash unchanged; original actor retained separately |
| Deletion request reviewed by legacy owner | Null reviewer FK | Preserve assistant requester, snapshots, dates and original reviewer history |
| Deletion requester/channel override updater equal to legacy owner | Null nullable FK | Preserve requester snapshots and original FK in history |
| Notice for a retained request accessed by legacy owner | Null nullable actor FK | Original actor recorded separately |

The schema requires a non-null grantor on authorizations and a non-null requester
on emergency requests. They cannot share a generic null/remap rule. Requests have
no history metadata column; dependent alerts/notices have required request FKs.
Archival avoids both dangling FKs and attribution of legacy actions to the new
owner. Any live emergency request blocks the entire proposal. Any other legacy
owner FK not explicitly covered above also blocks it for individual review.

Audit hashes are source-chain evidence, not hashes of transformed database rows.
Do not recompute them to pretend the changed actor FK was part of the original
event. The source manifest, source lineage, original field values, target row
hashes and policy history hash bind the transformation. Source JSON must remain
available as the original evidence.

The full in-memory result (`includeRows: true`) contains `restore_history` and
the planned rows. Preserve that history securely with the source manifest before
any future write: operational exclusions are **not permission to discard history**.
Full rows can contain sensitive data. The CLI omits rows, lineage and historical
payloads, printing only counts, hashes, decisions/preconditions and errors.

## Local verification

From the repository root, against an existing local source directory:

```sh
node scripts/run-postgresql-migration-plan-complete.mjs artifacts/api-server/data --require-write-ready
node scripts/plan-staging-restore.mjs artifacts/api-server/data
node --test --test-concurrency=1 scripts/tests/complete-migration-operational-gates.test.mjs scripts/tests/staging-restore-policy.test.mjs
```

The first command validates the original complete plan. The second computes the
separate staging proposal and must always report `write_readiness.ok: false`,
with `ADDITIVE_STAGING_WRITER_NOT_IMPLEMENTED`. It has no `--write` option.
Its `ok` flag describes policy validation only. The existing writer rejects this
report and retains its localhost-only / `fawri_ci` restrictions; Neon and
production remain forbidden. No writer guards were relaxed.

The tests cover immutable input, source proof, deterministic proposal hashes,
stable composite override identities, final counters with/without rows, archived
request dependencies, assistant preservation, owner exclusion, live-request and
unknown-reference rejection, CLI read-only behavior and the Neon writer guard.

## Remaining gate before any real restore

1. Run both commands on the **current Replit source data**. GitHub carries code,
   not that untracked dataset; fixture success cannot establish the previous
   real-data total of 116 or the six historical request statuses.
2. Review the exact exclusions and grant remaps against that source. Confirm
   preservation of the separate archive, including the legacy reviewer history.
3. With separately authorized read access, inspect staging's complete account,
   profile and affected-key inventory. Require exactly the designated owner and
   absence of the legacy owner. Evaluate all primary/unique conflicts; never
   overwrite target accounts, roles, credentials or existing business records.
4. A future transactional additive writer needs target-state revalidation,
   conflict reconciliation, source/policy hash binding and disposable PostgreSQL
   rehearsal before requesting approval for any external write. This change does
   not implement or authorize that writer.

## Legacy history coverage (planner version 8)

The supplied real-data version 7 dry run passed on October 8, 2026: 116 complete
rows and 108 staging-proposal rows, with matching summary and lineage counts.
The eight exclusions were the old owner account/profile, three historical
requests and three dependent merchant notices. All 38 audit events remained;
15 actor references were detached. No database was contacted. This is source
validation evidence, not target-state verification or a persisted archive.

The subsequent source inventory reported 27 `merchant_notifications`, 182
`admin_logs`, no OTPs, and an `admin_notes` object whose entry count was not
reported. Version 8 adds these history collections to the offline planner:

- Notifications retain IDs, type, read status, creation time and scalar display
  variables. Legacy `expires_at` belongs to subscription/batch content, so it
  remains in variables; the target notification TTL is null. This matches the
  canonical reader and avoids hiding historical notices. Unknown types/fields,
  malformed timestamps and missing merchants block instead of silently dropping.
- Admin logs retain IDs, actions, details, reasons, timestamps and nested meta.
  Actor snapshots use the existing reader's `source_admin_*` metadata fields.
  Known actors keep their original FK until the staging policy detaches the
  legacy owner; missing actors/merchants have null FKs and retained snapshots.
  No record is assigned to the importer/current owner. No audit hash is invented.
  Conflicting IDs, including collisions with emergency audits, fail closed.
- Admin notes retain their complete string (up to the schema's 5000-character
  limit). No updater is invented. Legacy notes have no timestamps; target required
  timestamps use the merchant timestamp, with that fallback declared in the
  coverage report. Missing merchants and malformed/oversized notes block.
- `legacy_auth_history` reports source collection counts and explicitly excludes
  OTPs by count/reason without copying their values. Source manifest hashes bind
  all collections. Existing cross-lane security exclusions remain unchanged;
  sessions, devices, login attempts and OTP target rows remain forbidden by the
  staging policy.

Version 8 still requires a real-source dry run; the version 7 counts above are
not an assertion about the expanded plan. No writer guards or runtime import
routes were changed, and no real restore is authorized by this coverage.
