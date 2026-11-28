# FIELD002 — approved disposable native reset test: marker placed; reset refused by Neon quota (2026-11-07)

## Explicit owner scope
Owner explicitly approved (a) deleting only the older outdated recovery branch `br-green-dawn-b137nxps` to free a branch slot, and (b) performing the prior approved disposable marker + `reset_from_parent` drill **solely on a new sacrificial branch** created from newer frozen backup `br-empty-mud-b1it6mg9`. No approval for any other existing branch deletion, staging or production mutation, deployment, role cutover, or migration 0052.

Project: `round-fire-18493605` / `neondb`; original nonprimary staging `br-falling-dust-b1km4gix`. Frozen verified backup `br-empty-mud-b1it6mg9` at parent LSN `0/473AAE0`, 94 public tables and 409 records previously matched original. Existing separately migrated rehearsal `br-misty-feather-b1dgkwm1` has 52/53 migrations and remains intact.

## Exact hosted operations performed
1. `list_branches(include_deleted=true)`: exactly 10 occupied branch entries; older duplicate `br-green-dawn-b137nxps` READY, nonprimary/nondefault, parent original, **no children and no compute endpoints**. Newer frozen `br-empty-mud-b1it6mg9` READY, nonprimary/nondefault. PR #550 draft, starting HEAD `c3e8e5b5fee5f3e292596e33120a996403be6a3f`.
2. After explicit approval, called `delete_branch` on **only** `br-green-dawn-b137nxps`. Neon returned success; subsequent branch inventory did not include this ID. Neither original nor newer frozen backup was deleted or modified.
3. Created `field002-disposable-native-reset-drill-20261107` / **`br-nameless-base-b1vt822z`** from newer frozen backup `br-empty-mud-b1it6mg9`; Neon returned parent LSN `0/473AAE0`. Independent `get_branch`: READY, parent exactly frozen backup, default=false, primary=false.
4. Sacrificial branch SELECT baseline: database `neondb`, owner `neondb_owner`, **28** Drizzle entries, **94** public base tables, **0** notifications, **1** merchant, **45** RLS policies, **0** other client sessions; test schema did not exist.
5. In one guarded atomic transaction on sacrificial branch **only**:
   - validated pinned last migration source hash `87a2a16f4278430b770f6e60a4da497ae8cc24cab11aeec6780febe119bd9b3f`, roles, counts and absence of clients;
   - created `field002_native_reset_probe_20261107` schema and its `reset_marker` table;
   - inserted one synthetic `id=1, expected_marker=field002_sacrificial_reset_marker_20261107` row;
   - postcondition passed. **No original public row updated or deleted**.
6. Independent post-mutation child SELECT confirmed exactly one marker and 94 original public tables unchanged. Native Neon `compare_database_schema` with sacrificial child versus frozen backup returned a diff containing **only synthetic schema, table and primary-key additions**, proving test mutation was isolated. Parent and child were rechecked READY with correct relationship.
7. Attempted `reset_from_parent(project_id=round-fire-18493605, branch_id=br-nameless-base-b1vt822z)` **once**, as expressly authorized. Neon returned **HTTP 422 `branches limit exceeded`**. No reset success was reported. Posterror `list_branches` still showed 10 branches, including the sacrificial child and newer frozen backup; `get_branch` showed child READY/parent unchanged; SQL SELECT showed **marker still present** and original branch still at **28 migrations, zero notifications, 283 audit events, and test schema absent**. Hence reset operation did **not** take effect.
8. Neon official API description of restore endpoint notes that restoring creates a new branch from historical state; the provider did not expose which internal quota accounting caused the rejection. Do not claim a reset completed or rely on an assumed extra slot until verified.

## Current live state and safe next decision
- Sacrificial child `br-nameless-base-b1vt822z` remains READY **with the marker present**; it is not a validated restored target. It is disposable by design but its deletion/replacement was *not* the authorized native reset method.
- Newer current recovery `br-empty-mud-b1it6mg9` remains READY and unchanged. Original staging `br-falling-dust-b1km4gix` remains untouched; 0028–0051 were never executed there.
- Another slot appears needed for the native reset API request even with the child already existing. Do **not** autonomously delete any additional branch or alter billing plan. A potential candidate for **separately authorized deletion** is isolated migration-only clone `br-misty-feather-b1dgkwm1`; it has committed evidence of 24/24 verified migrations and no unique production merchants, but deleting it would lose that hosted test environment. The older `br-young-hill-b1x9vhlz`, newer clean clone `br-polished-mouse-b1proel7` and three archived branches are explicitly pinned by the current FIELD002-R2 source lineage policy and must not casually be removed.
- Even a subsequent reset success would prove **only a bounded native reset-to-frozen-parent drill**, not offsite dump restore/PITR, production cutover, or HTTP reconnection.

**Outcome: test setup PASS; native reset FAILED-CLOSED due to account branch quota; no recovery acceptance. FIELD002 OPEN / 0052 BLOCKED / release NO-GO / PR #550 draft.**