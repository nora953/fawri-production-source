# FIELD002 — Original staging encrypted offsite backup and global-role recovery contract

**Status:** SOURCE-READY PLAN ONLY / HOSTED BACKUP NOT EXECUTED / FIELD002 OPEN (2026-11-08).
**Gate:** `P0-ACCESS-HOSTED-ROLLOUT` (BLOCKED), dependent residual merchant privacy SQL/HTTP OPEN.
**Exact intended source:** Neon project `round-fire-18493605`; nondefault `staging-runtime` branch `br-falling-dust-b1km4gix`; database `neondb`; direct host `ep-plain-leaf-b1wtzjr3.c-5.eu-central-1.aws.neon.tech`; SQL identity `neondb_owner`. Default production and pooler are excluded.
**No new live authorization:** GitHub source-only preparation, without any Neon/Railway connection, offsite cloud upload, secret read, original database mutation or commercial release.

## Reused evidence / no repeat

- [Exact original source read-only portable restoration proof](P0-FIELD002-ORIGINAL-STAGING-PORTABLE-RESTORE-BOUNDED-PASS-20261108.md): request `ed75c5313bfc7bb2cd8c55abd7c876275dae3096`, green job and every critical verification stage, **95 tables / 437 rows** at pinned baseline, owners/ACL/policies and cleanup accepted in a disposable PostgreSQL 18 instance.
- [Source original recovery-branch readback](P0-FIELD002-ORIGINAL-STAGING-RECOVERY-READBACK-20261107.md) is a verified Neon branch copy, **not** offsite backup.
- The general `scripts/backup-postgresql.mjs` and `scripts/restore-postgresql.mjs` are **loopback/disposable drill tools only**; `docs/backup-restore-runbook.md` explicitly forbids using them on hosted or real credentials. Do not repurpose them for this gate.
- Existing isolated SQL/HTTP 7/7, clean-clone restore, and previous 49/49 safeguards are accepted and **not re-run** solely to inflate test totals.

## Mandatory independent backup acceptance

The previous ephemeral proof does **not** meet durable custody. All of the following are required before any original staging 0028–0051 or role/ACL migration:

1. **Approved external custody destination.** Owner selects a storage provider/account **independent of Neon and this GitHub Actions runner**, names an isolated private bucket/container, grants only the minimum needed upload + restricted independent readback, and approves the object-retention/immutability policy. No external provider or retention duration has been selected by this source-only checkpoint. GitHub Actions artifacts and Neon child branches alone are explicitly NOT compliant substitutes.
2. **Client-side encryption before network upload.** The backup leaves the runner *only as ciphertext*, using owner-controlled encryption recipients/key material not available as plaintext in the repository, workflow output, PR, chat or uploaded artifacts. Approve recipient public-key fingerprint and an independent offline private-key recovery procedure before execution. Server-side encryption may supplement but does not replace this.
3. **Exact source identity and immutable preflight.** The upload workflow must reject any host/db/login/branch mismatch, pooled/production/default target or dangerous libpq URL option. Before export compare the current migration ledger, notifications, 95-table/437-row source data digest, the five owner/ACL/policy catalog digests and new global-role metadata digest against independently reviewed pinned values. Any drift = fail closed and NO upload.
4. **Full recoverable material, not data-only.** Produce the owner/ACL-retaining PostgreSQL custom-format database archive plus a separately encrypted, version-pinned and independently reviewable **global role attribute/membership mapping** (including expected role LOGIN/BYPASSRLS/CREATEDB/CREATEROLE/INHERIT and memberships). `pg_dump` does not contain PostgreSQL cluster globals. `pg_dumpall --globals-only` can expose sensitive role password hashes and platform-managed state; do not run it as a casual log or upload it unencrypted. Neon platform roles cannot be blindly replayed with privileged flags on local PostgreSQL; record explicit safe role mapping, exceptions, and effective-grant parity.
5. **Custody integrity and recovery.** Keep immutable encrypted object identifiers/version IDs, ciphertext SHA-256, manifest SHA-256, source commit and branch pin, export timestamp, verified isolation/ACL controls, upload/readback checksum equality, independent readback after runner cleanup, and a **fresh independent decrypt+restore exercise**, checking all table rows, owners, effective ACLs/RLS/policies, approved global role flags/memberships and application access policy. A copy in the same ephemeral runner is insufficient.
6. **Failure and rollback.** Prove missing/invalid encryption key, remote store, unauthorized access, checksum mismatch, truncated backup, missing role metadata, cross-branch credentials, source drift and failed restoration all produce a terminal NOT_ACCEPTED, with no original DB write. Enforce credential rotation/reconnect fencing before later staged schema/role cutover; the currently idle Railway metadata alone does not guarantee future consumers cannot reconnect.

### SOURCE ONLY global-role inventory prepared

[`sql/P0-FIELD002-ORIGINAL-STAGING-GLOBAL-ROLE-METADATA-READONLY-20261108.sql`](sql/P0-FIELD002-ORIGINAL-STAGING-GLOBAL-ROLE-METADATA-READONLY-20261108.sql) selects **only** role properties, membership option metadata and database grant fingerprints; excludes password hashes, data rows, credentials and commands that mutate the DB. SQL cannot itself prove Neon branch ID, and **the query has not yet been executed**. It is a review/preflight input; acceptance needs actual source/independent recovery output, not the existence of SQL.

## Finite operational sequence after custody configuration is authorized

1. Owner confirms independent remote destination, retention and access policy and controls the encryption/private recovery key; no secret value in chat or GitHub source.
2. Implement a strict one-file, SHA/parent-pinned GitHub Actions request workflow and review it *before* any sensitive push; secrets only as narrowly scoped GitHub Actions secrets or short-lived OIDC. No workflow is authorized by this document to upload.
3. Source read-only fingerprint + encrypted archive and role material → external immutable object → independent readback/decrypt/restore, with sanitized manifest/status only in GitHub. Compare role semantics separately from object ACL parity.
4. Obtain safe maintenance/reconnect fence and prepared tested rollback; only then separately approve and execute original staging 0028–0051 and permanent 3-login least-privilege conversion; verify mounted original SQL/HTTP positive/negative, then resolve FIELD002-R1/R2/R3.
5. Leave `0052 BLOCKED`, draft PR #550 unmerged and **commercial NO-GO** until all other gates are satisfied.

## Current accepted delta

**Newly prepared:** source-only role-global metadata inventory and explicit non-substitutable offsite recovery acceptance contract; no new runtime/hosted gate closed.
**Blocked on owner/external capability:** storage account/destination and immutable retention/backup policy, encryption recipient and independently recoverable key, and explicitly authorized outbound upload / independent recovery. These cannot be inferred from `واصل`, the previously provided Neon SQL secret, or a green temporary restore.
**No claim of a certified overall P0 percentage.**
