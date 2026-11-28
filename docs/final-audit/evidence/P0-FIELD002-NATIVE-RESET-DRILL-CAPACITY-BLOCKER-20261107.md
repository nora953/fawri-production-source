# FIELD002 — native Neon disposable branch reset drill blocked by branch quota (2026-11-07)

## Authorization and deliberately limited scope

The owner approved **only** the previously reviewed disposable child + synthetic marker + `reset_from_parent` experiment documented at `P0-FIELD002-DISPOSABLE-ROLLBACK-DRILL-RUNBOOK-20261107.md`. No approval to delete an existing Neon branch, reset an already used clone, mutate original staging, change login roles or run 0052 was implied.

Project `round-fire-18493605` (`Fawri-Staging`), database `neondb`. Original `staging-runtime` is `br-falling-dust-b1km4gix`. Preserved newer, 94-table independently verified frozen parent is `field002-prechange-current-recovery-20261107` / `br-empty-mud-b1it6mg9`, parent original at LSN `0/473AAE0`. Existing earlier copy is `field002-staging-runtime-recovery-20261107` / `br-green-dawn-b137nxps`, parent LSN `0/4724160`.

## Attempt and hard-stop evidence

1. Independent Neon `get_branch` confirmed source original and frozen recovery ready, nondefault, nonprimary; the newer recovery had **zero compute endpoints**.
2. Attempted only the **non-destructive branch-creation** step:
   - `create_branch(project_id=round-fire-18493605,parent_id=br-empty-mud-b1it6mg9,name=field002-disposable-native-reset-drill-20261107)`
   - Neon returned **HTTP 422 / `branches limit exceeded`**.
   - **No sacrificial branch was created**. No marker schema/rows were created, no reset was called, and no existing branch/data/security permission was changed.
3. Neon `describe_project` independently reported account **`branches_limit=10`** (`subscription_type=free_v3`). `list_branches(include_deleted=true)` returned **10 existing branches** (7 READY plus 3 ARCHIVED). Archived branches still occupied entries in the listing; do not assume archive operations free branch quota.
4. Rechecked old recovery `br-green-dawn-b137nxps` and newer verified recovery `br-empty-mud-b1it6mg9`: both READY, nonprimary/nondefault, each with **zero attached compute endpoints**. The listed branch graph has **no children of the older recovery**.

## Bounded next authorization decision

The quota cannot be bypassed safely under the existing approval. **No autonomous deletion, archive reset, or repurposing of an existing branch is authorized.**

Possible carefully reviewed option **only if owner expressly agrees**: delete the **older, stale duplicate recovery branch `br-green-dawn-b137nxps`** (not the newer `br-empty-mud-b1it6mg9`) to free one branch slot, then create the strictly disposable child of the newer frozen backup and execute the requested marker-and-reset drill. The newer recovery had previously matched original in 94/94 public-table counts and digests, its role/ACL/policy fingerprints, and an empty native schema diff; whereas the older copy was proven stale on `merchants.updated_at`. This makes the older copy a plausible candidate, **not an automatic deletion instruction**. Preserve both until user approves deletion. Any alternative requires an explicit plan and revised quota.

**FIELD002 OPEN, 0052 BLOCKED, draft PR #550 unmerged, commercial release NO-GO.** Native reset-to-parent proof **NOT EXECUTED / NOT ACCEPTED**. The separate successful atomic SQL rollback probe and non-destructive recovery readbacks remain valid only within their bounded scopes.
