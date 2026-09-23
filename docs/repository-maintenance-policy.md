# Fawri repository maintenance policy

## Source of truth

- `main` is the canonical integrated source of truth.
- New implementation work starts from current `main`.
- Old diverged branches are never merged only because they contain unique commits. Recover the still-required behavior onto a fresh branch from `main`.
- Database migration SQL, Drizzle snapshots, migration stages, and their history are not cleanup targets unless a dedicated migration review proves they are disposable.

## Branch lifecycle

Use short-lived branches for active work:

- `feature/<scope>`
- `fix/<scope>`
- `maintenance/<scope>`
- `qa/<scope>` only for disposable validation work

Create a `checkpoint/<milestone>` branch only for a meaningful validated milestone, not for every small task.

After a branch is merged and its milestone is represented by `main` or an intentional checkpoint, archive any required evidence and delete the obsolete working branch.

Do not merge QA-only branches or superseded historical branches.

## Translation authority

The approved translation authorities are:

- `artifacts/fawri/src/lib/translations/en.ts`
- `artifacts/fawri/src/lib/translations/ar.ts`
- `artifacts/fawri/src/lib/translations/ku.ts`
- feature translation modules under `artifacts/fawri/src/lib/translations/features/`
- `artifacts/fawri/src/lib/admin-translations.ts` for the admin surface

Do not introduce new hardcoded `ar/ku/en` dictionaries inside pages, components, or runtime libraries when the copy can live under the translation authority.

Before merging translation-related work run:

```sh
pnpm run audit:translations
pnpm run audit:translation-inventory
```

The three language dictionaries must keep key parity.

## Validation discipline

Code changes are made in GitHub branches. Replit Shell is used for local validation and preview; Replit Agent is not part of the Fawri development workflow.

Before merge:

1. Confirm the branch is based on current `main`.
2. Review the diff.
3. Run the focused tests for the changed domain.
4. Run repository typecheck/build or the applicable final gate.
5. Confirm the worktree is clean.
6. Merge only the reviewed branch head.

## Structural maintenance

- Treat executable source files at or above 1,800 lines as critical refactor targets.
- Prefer behavior-preserving extraction before adding new behavior to already-large files.
- Avoid duplicate extension aliases such as parallel `.ts` and `.tsx` wrappers for the same route unless compatibility requires them and that requirement is documented.
- Temporary scripts and generated local diagnostics must not be committed.
