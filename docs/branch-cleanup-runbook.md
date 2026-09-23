# Branch cleanup runbook

This runbook prunes only historical working branches whose tips are already ancestors of the current `origin/main`.

It intentionally preserves:

- `main`
- every `checkpoint/*` branch
- every diverged branch with commits not contained by `main`
- any future-work branch that is not merged

The script is dry-run by default. It first:

1. fetches and prunes local remote-tracking refs;
2. calculates working branches fully contained by `origin/main`;
3. writes the exact branch list to `branch-archives/`;
4. creates and verifies a Git bundle containing every eligible ref;
5. writes a reproducible deletion script;
6. performs no remote deletion unless `RUN_DELETE=1` is explicitly supplied.

Run the audit/archive pass:

```sh
bash scripts/archive-and-prune-merged-branches.sh
```

Review the printed list and verify that the bundle reports successfully. Only then run:

```sh
RUN_DELETE=1 bash scripts/archive-and-prune-merged-branches.sh
```

The deletion pass recomputes the eligible set from the current `origin/main`, so a branch that is no longer provably merged is not included.

Diverged branches are reviewed separately. They are never auto-merged or auto-deleted by this script.
