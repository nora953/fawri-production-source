# FAWRI V1 — safe isolated Neon off-provider PG18 backup attempt, 2026-11-14

**Gate:** `P0-HOSTED-RECOVERY`, still **BLOCKED**, commercial release **NO-GO**. This checkpoint adds a one-child, encrypted, provider-independent export path, **but no actual hosted dump has been produced yet** because two owner-controlled GitHub Actions secrets are absent. Never conflate source CI acceptance with hosted recovery.

## Exact verified source — only authorized disposable child

- Neon project `crimson-cherry-65705041`, source branch `v1-recovery-drill-20261114` / `br-rough-boat-b947xiir`. Its direct unpooled endpoint is **`ep-steep-star-b97qa95j.c-7.eu-central-1.aws.neon.tech`**. Target database `fawri`. Parent `production` is `br-holy-waterfall-b993zglb`, different endpoint `ep-polished-poetry-b9jpvn4r.c-7.eu-central-1.aws.neon.tech`. Never send export backup credentials for production.
- Read-only SQL verified source has exactly **one** non-system app relation `fawri_recovery_drill.recovery_proof`, **3 synthetic rows**, sum **606**, order digest `3e2688f4da2e3e49f2bf3cfef1c919c8`, and no commercial runtime LOGINs. No real merchant data was found in this exact isolated source.
- Created **only in this child**, in a transactional owner-controlled scoped operation: role `fawri_v1_backup_reader` with `LOGIN=true`, `NOINHERIT`, `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEROLE`, `NOCREATEDB`, `NOREPLICATION`, connection limit 1 and a generated private password. Granted only `CONNECT` to `fawri`, `USAGE` on synthetic schema, and `SELECT` of the synthetic table. Tested authentic read as this role (**3 rows**), denied `INSERT` and `DELETE`. Read-only production check confirmed **0 occurrences** of this new role on `production`; no production schema changes.
- Neon API `get_connection_string` confirmed a credential-bearing connection URI exists for this new **isolated restricted role**; it defaults to the **pooled** hostname. GitHub backup source safety requires the **unpooled** hostname above. No connection URI/password was printed in commit, logs or public documentation.

## GitHub-only export implementation and accepted dry-run

- [`scripts/lib/v1-isolated-neon-dump-safety.mjs`](../../../scripts/lib/v1-isolated-neon-dump-safety.mjs) pins project/branch host/role/DB, rejects production host and pooler, restricts to exact GitHub working branch, checks `sslmode`, and provides tamper-detecting AES-256-GCM with password-derived scrypt key, independent random salt and nonce.
- [`lib/db/scripts/v1-export-isolated-neon-backup.mjs`](../../../lib/db/scripts/v1-export-isolated-neon-backup.mjs) fails before connection unless the isolated URL and owner-held encryption secret are present. Before export, queries the real scoped role and exact synthetic dataset/privileges. Uses PostgreSQL18 `pg_dump -Fc` with password in **process environment**, never CLI arguments, and verifies `pg_restore --list`, restores to a **different local disposable PG18** for synthetic row proof, encrypts before artifact handoff, checks decryption integrity, then deletes local plaintext. Outputs **only encrypted dump** and secret-free checksums/metadata; no Neon production credentials. The user must separately secure the passphrase outside GitHub.
- [`.github/workflows/v1-isolated-neon-encrypted-exit.yml`](../../../.github/workflows/v1-isolated-neon-encrypted-exit.yml) is constrained to the V1 GitHub work branch, with `contents:read`, encrypted artifact retention **2 days**, no deployment or release steps. Do **not** commit encryption secrets or backup URLs to the source tree.
- [`scripts/tests/v1-isolated-neon-dump-safety.test.mjs`](../../../scripts/tests/v1-isolated-neon-dump-safety.test.mjs) exercised target-scope refusal and encryption tamper protection.
- Latest exact [GitHub Actions #43629331730](https://github.com/nora953/fawri-production-source/actions/runs/43629331730), tested SHA `abf0e7634dc9a27d986a05ddcd031def97b6dce5`: **4/4 offline security tests PASS**. Actual export job failed **by design before any network/database operation** with `V1_HOSTED_BACKUP_BLOCKED_MISSING_TWO_PRIVATE_REPOSITORY_SECRETS`. Full workflow conclusion is **FAILURE / BLOCKED**, not success. No dump/encrypted artifact produced; no live backup or local PG18 recovery claim. Only production unchanged and restricted child role created.

## Exact next external dependency (ONE user action sequence)

The owner must set these two protected GitHub repository Actions secrets (not in chat, issues, code, workflow logs or a public Drive document):

1. `FAWRI_ISOLATED_NEON_DUMP_URL`: in **Neon Console > project `crimson-cherry-65705041` > Connect**, explicitly select branch **`v1-recovery-drill-20261114`**, DB `fawri`, **role `fawri_v1_backup_reader`**, and **disable connection pooling** (no `-pooler` in host). Copy exact URL into GitHub repo **Settings > Secrets and variables > Actions > New repository secret**.
2. `FAWRI_ISOLATED_BACKUP_PASSPHRASE`: a NEW strong random passphrase **at least 24 characters** saved independently under owner's control (e.g. password manager) and added as a second GitHub Actions secret. The encryption key must survive GitHub account loss separately; do not paste it into this chat.

Once both are saved, **rerun only failed job #132552336214** in run #43629331730; do not repeat successful 4/4 source security checks. On green CI, retrieve **encrypted-only** GitHub artifact, save it outside Neon/GitHub to private Google Drive, download it back, verify digest and the independently restored synthetic fixture. Do not report off-provider backup success before that read-back.

## Hard boundaries

This is **SYNTHETIC ONLY** isolated Neon child. The real first-commercial `production` database is still **0 application tables / 0 of 3 runtime logins**. No 54-stage migrations on Neon, no Meta/payment connection, no hosted merchant E2E and no production data backup/media restore. The accepted older local **two independent PG18 clusters** 54-stage restore remains separate. `P0-HOSTED-RECOVERY` remains blocked; 13 essential V1 launch blockers + 3 deferred POS historical obligations, PR #550 DRAFT, **NO-GO**.
