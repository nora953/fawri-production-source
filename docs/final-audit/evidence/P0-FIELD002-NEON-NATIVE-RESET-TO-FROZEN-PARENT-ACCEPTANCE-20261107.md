# FIELD002 — approved Neon native reset-to-frozen-parent drill: ACCEPTED (2026-11-07)

## Explicit owner scope, immutable identities

The owner specifically authorized deletion of the old **isolated migration rehearsal branch only**, `br-misty-feather-b1dgkwm1` (`field002-fresh-original-0028-0051-rehearsal-20261107`), in order to unblock the **previously approved** native `reset_from_parent` of the existing sacrificial child `br-nameless-base-b1vt822z`. No user approval was sought or inferred for deleting original staging, the frozen backup, production, archived branches or any other test environment. The committed prior 24/24 0028–0051 source/hash/schema/data evidence remains in GitHub, but its isolated hosted rehearsal branch has now been removed.

- Neon project: `round-fire-18493605`, database: `neondb`.
- Original nonprimary staging: `br-falling-dust-b1km4gix` (`staging-runtime`).
- **Preserved frozen recovery source:** `br-empty-mud-b1it6mg9` (`field002-prechange-current-recovery-20261107`), parent original, pinned LSN `0/473AAE0`, no original data mutation.
- **Destructive test target ONLY:** sacrificial branch `br-nameless-base-b1vt822z` (`field002-disposable-native-reset-drill-20261107`), parent exactly the frozen recovery. Never use these instructions on original, default production, frozen backup, or the clean clone.
- GitHub PR #550 remained draft; starting evidence `P0-FIELD002-NATIVE-RESET-DRILL-ATTEMPT-20261107.md` documented the originally rejected quota attempt and unique synthetic test marker.

## Actually executed and independently verified

1. Live `list_branches`, `get_branch`, `list_branch_computes` checks showed **10** occupied branches, the deletion target `br-misty-feather-b1dgkwm1` READY, nonprimary/nondefault, no children, named as expected, and one read-write compute. The sacrificial child was READY with exact frozen-parent relationship. The frozen recovery was READY, no production branch targeted.
2. Called `delete_branch` on **only** `br-misty-feather-b1dgkwm1` pursuant to explicit owner consent. Neon returned success. Independent branch inventory became **9** and verified that branch ID absent. The original staging, the frozen parent, and other branches remained.
3. Rechecked sacrificial target `br-nameless-base-b1vt822z`: READY, nonprimary/nondefault, parent `br-empty-mud-b1it6mg9`, no children, `neondb`, `neondb_owner`, exactly **one synthetic marker row** in `field002_native_reset_probe_20261107.reset_marker`, 28 Drizzle entries, zero notifications and **zero other client backends**.
4. Invoked **only** `reset_from_parent(project_id='round-fire-18493605',branch_id='br-nameless-base-b1vt822z')` with no `preserve_under_name`. This time Neon accepted it; returned `current_state='resetting'` and `last_reset_at='2026-11-06T23:36:16Z'` UTC, parent LSN `0/473AAE0`.
5. Independently called `get_branch` again: child reached **READY**, last-reset timestamp unchanged, exact frozen parent and nondefault/nonprimary status. A separate **SELECT** on the child confirmed the test schema was **absent**, Drizzle **28**, public tables **94**, historical notices **0**, merchants **1**, audit events **283**, public policies **45**, DB `neondb`. Native Neon `compare_database_schema(child, frozen parent)` returned `diff: ""` (empty SQL schema difference).
6. A temporary **read-only** Neon endpoint `ep-steep-waterfall-b108wc47` was created on the frozen parent solely to perform independent source-target equality queries. Compared every one of the frozen parent's **94 public tables** to the **restored child** using aggregate row counts and deterministic full-row JSON MD5 comparisons. Results: **94/94 equal row counts, 94/94 equal full-row digests; 409 public rows across 22 nonempty public tables**, zero differences. No private row data/credentials exported.
7. Independently compared **nine** security/migration catalog measures plus the test-marker absence: **all matched frozen parent**, including
   - migration count **28**;
   - entire Drizzle ledger digest `8a7db348cb88f7be330bf4b58b2ed963`;
   - public policy count **45** and full policy digest `4c9a8a877d592340e9b13faf4dfce9ec`;
   - Fawri role-flags digest `da93b4c31907685bb746099d82ffef0d`;
   - Fawri role-membership digest `5a5b10bc34818735a1357015a359da30`;
   - creator-default-ACL digest `d45f390c18f45536669fb22885285d6c`;
   - public function count **3**, ownership/function-ACL digest `a9b084e7417256346655ced95abd39b5`;
   - synthetic schema **absent on both**.
8. Deleted temporary parent read-only endpoint `ep-steep-waterfall-b108wc47`, verified the parent's compute list returned **0**. Final branch inventory **9**, confirms authorized deletion target absent and sacrificial branch READY. Final independent original-staging SQL: **28** Drizzle migrations, **0** notices, **283** audits, **0/8** outstanding residual privacy RLS, and synthetic marker absent. No original staging mutation, no production/default SQL, no role-login/ACL alteration there, no 0052, no deploy or merge.

## Acceptance boundary

**Newly accepted FIELD002 subcondition:** a genuine native Neon `reset_from_parent` of a **previously modified sacrificial branch** to a **preserved frozen source** was actually executed and independently proved to reverse the synthetic local change, with all original public-table rows and scoped migration/security catalog measures returning exactly to the source state. This removes the previously blocked **disposable native reset-to-frozen-parent rehearsal** requirement.

**Not proven, therefore still OPEN:** a portable/off-platform PostgreSQL backup/restore or point-in-time restoration of the actual original staging branch, full source branch failover and deployed client reconnection, original staging controlled migrations 0028–0051 and ACL/role authority cutover, original mounted SQL+HTTP own/foreign/revoked-session parity, complete R2 source-promotion/import/backup policy wired to all actual commercial deployment routes, and independent 0052 migration trusted-owner prerequisites. A data-bearing Neon backup is disallowed as a first-commercial launch seed. Do not conflate this disposable reset rehearsal with a completed commercial recovery/cutover.

**Release decision remains FIELD002 OPEN / 0052 BLOCKED / privacy parent OPEN / PR #550 DRAFT and unmerged / commercial NO-GO.** No percentage of total P0 can be certified from this subcondition alone.
