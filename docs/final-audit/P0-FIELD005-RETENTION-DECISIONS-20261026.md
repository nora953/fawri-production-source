# FIELD005 — bounded retention decisions and recovery acceptance

Reviewed source: `6e94a8e`; reused accepted executable: `acf6c8d`. No application, schema, grant, retention-duration or hosted change. No new runtime or CI claim. FIELD005 remains OPEN; release NO-GO.

The accepted owner/password/deletion, pre-existing emergency ledger guard and canonical creation/deletion serialization proofs are reused within their original scope. The literal purge inventory has 58 SQL statements touching 57 distinct tables in one function; it excludes delegated provider retirement, caller statements, triggers, other entrypoints and external copies. These counts are not a complete P0 or privacy denominator.

| Remaining item | Decision needed | Current boundary |
|---|---|---|
| F005-R1 | Purpose, readers, trigger/duration and disposition for requesting-admin identity snapshots/reviewer links | Merchant snapshots are redacted; admin snapshot retention is unapproved |
| F005-R2 | Record/field schedule, holds, expiry and privileged access for financial/receipt/audit anchors | Existing scrubbing is not approval of indefinite retention or anonymity |
| F005-R3 | Versioned privacy/integrity contract for emergency payloads and duplicated incident/admin identity | Audited-merchant deletion stays409; no exception or hash rewrite |
| F005-R4 | Authorized historical damage inventory and trusted-payload recovery | No hosted incident or repair proven; unrecoverable content stays explicitly unverifiable |
| F005-R5 | Copy inventory, backups/media/exports and restore behavior | Local/source proofs do not establish hosted erasure |

For each policy decision, record the responsible approver, exact fields/purpose, authorized readers, retention trigger and duration, hold rules, final disposition and measurable negative/positive/expiry tests. This is a decision template, not an adopted schedule. No duration is selected here.

Historical recovery must preserve original evidence. A hash cannot reconstruct erased payloads. Only byte-exact original content from independently trusted backup/export can be checked against the original hashes and the whole chain. If unavailable, preserve an explicit unverifiable state. Never fabricate payloads, silently rehash peers, reset genesis or bypass the verifier. Any hosted inspection/write requires separately authorized scope; rehearsal and review precede writes.

Full item-level acceptance criteria, literal SQL/field inventory and original evidence references are in [the machine-readable checklist](evidence/P0-FIELD005-RETENTION-FIELDS-20261025.json). Three bounded runtime items are reused; one source-only inventory item is reconciled. None closes FIELD005 or approves hosted/complete field coverage.

Next executable gate: inspect the existing CASHIER-SYNC-SEQUENCE-001 remainder and live admission/drain path before selecting new work. Retention policy/design and hosted recovery remain explicit dependencies rather than reasons to repeat accepted deletion tests.
