# FIELD002 — proposed native Neon rollback-to-pinned-parent drill (DISPOSABLE ONLY)

**Status: PLAN, NOT EXECUTED. This file does not authorize restoration or any SQL mutation.**

## Source and proof already accepted

- Neon project `round-fire-18493605`, database `neondb`.
- Original `staging-runtime` / `br-falling-dust-b1km4gix` is a live nondefault staging branch. **Never reset/restore/migrate/change original under this drill.**
- Independently read-back **frozen current-point recovery parent** `field002-prechange-current-recovery-20261107` / `br-empty-mud-b1it6mg9`, parent LSN `0/473AAE0`. This branch is READY without computes and must be preserved unchanged.
- Its 94 public tables and 409 aggregate rows matched the original's row counts and full-row digests at observation. Complete catalog security measures matched (28 ledger records, 45 public RLS policies, Fawri roles/memberships, default ACL, public function ownership/ACL).
- Native `compare_database_schema` with `branch_id=br-empty-mud-b1it6mg9`, `base_branch_id=br-falling-dust-b1km4gix`, `database_name=neondb` returned exact empty schema diff `""`.
- Evidence: `P0-FIELD002-ALL-TABLE-DATA-PRESERVATION-AND-RECOVERY-READBACK-20261107.md`. The separate previously migrated clone `br-misty-feather-b1dgkwm1` remains untouched.

## Explicit approval required before performing ANY of the following mutation steps

The next test includes a **destructive native Neon branch reset**. It MUST NOT be started merely because FIELD002 remains open. Obtain authorization specifically for creating a sacrificial child of `br-empty-mud-b1it6mg9`, adding a controlled **probe-only** schema marker there, and invoking `reset_from_parent` on that **exact newly created sacrificial child's branch ID ONLY**. No permission to reset any other branch is implied.

## Proposed execution / fail-closed gates

1. Re-read branch metadata: frozen recovery parent `br-empty-mud-b1it6mg9` must be READY and nonprimary/nondefault, current original and historical recovery copies must still be present. Confirm no app endpoints use the proposed new child.
2. Create an explicitly named disposable child from **frozen recovery** (not from original), with a compute for the test. Record the API-provided new branch ID; independently verify `parent_id=br-empty-mud-b1it6mg9`, `default=false`, `primary=false`, `current_state=ready` before any mutation.
3. Obtain and independently record child baseline: 28 Drizzle ledger entries, 94 public tables, expected row fingerprints, role flags and ACLs. Use no real merchant IDs or credentials in test reports.
4. In an isolated transaction on **child only**, create a single clearly marked disposable schema/row probe wholly outside existing `public` tables. Check probe exists and parent is unchanged. No real merchant data changes or runtime grants.
5. Reverify target branch ID and parent ID immediately before the destructive reset. Invoke `reset_from_parent` on that **child ID only** under the explicit approval; DO NOT pass original, backup parent, migrated clone, default production or an archived branch ID. If metadata mismatch/client activity/safety check fails, STOP; do not issue reset.
6. Independently assert the probe no longer exists; child schema is again identical to frozen parent, 94 public-table row counts/full-row digests match, Drizzle/roles/memberships/default ACL/policy/security catalogs match. Record exact pass/fail. If any verification fails, **do not call restore or finalize on any original/backup branch**.
7. Retain frozen recovery parent. After owner-approved cleanup, delete only sacrificial test resources. Keep separate portable backup/PITR, original rollout, live role cutover and SQL+HTTP checks OPEN.

## Explicit limitations

Even if this test later succeeds, a Neon `reset_from_parent` rehearsal on a disposable child **does not establish** a validated portable `pg_dump/pg_restore`, point-in-time restore of a live original, application reconnection, or commercially safe source promotion. Data-bearing Neon recovery copies cannot be first-commercial seeded sources (FIELD002-R2). This test would close **only a bounded native branch reset-to-frozen-parent rehearsal subcondition**.

**FIELD002 OPEN, original release NO-GO, 0052 BLOCKED, PR #550 draft.**
