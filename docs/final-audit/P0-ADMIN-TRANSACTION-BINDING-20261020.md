# P0 audit authority: transaction binding and remaining trust boundaries

## Verified baseline

Source `c5225acbeec5cfc2e0411c11cd17737ab1ae6dad`: 43/43 completed SUCCESS workflows. Schema run [39353024854](https://github.com/nora953/fawri-production-source/actions/runs/39353024854) proves committed SQL/snapshot reproducibility and disposable migration application through 0036. Isolated run [39353024803](https://github.com/nora953/fawri-production-source/actions/runs/39353024803), job 118401631953, proves audit forgery and active-window replay persist, while suspended actor reuse is denied. Admin boundary 5 PASS, production tenant RLS 30 PASS, merchant-management RLS 6 PASS. Full run inventory is in evidence/P0-0036-VALIDATION-20261020.json. This baseline evidence is not evidence for 0037.

## Bounded remediation

Migration 0037 adds `authority_transaction_id bigint`. Historical rows receive 0 and cannot authorize access. New rows default to PostgreSQL `txid_current()`, including its wraparound epoch. The SECURITY DEFINER predicate accepts an audit only in its issuing transaction, in addition to the actor/profile, lifetime and merchant checks from 0036. The transaction ID comes from PostgreSQL, not a GUC or actor argument. A known committed audit ID does not match a fresh transaction, including a new transaction on the same pooled connection. Retained logs remain readable by their separately authorized audit consumers.

`listManagedMerchantsPostgres` already inserts and consumes the audit inside one `withOperationalTransaction`; no new connection or cloud dependency is introduced. Receipt reader 0030 inserts its audit and returns bounded receipt results in the same function call; it does not consume the tenant predicate. Existing receipt/billing suites must still pass. This change intentionally ends cross-transaction authority reuse; no legitimate application consumer of such reuse was found in repository source search.

The regression test now checks issuing-transaction success, account suspension, disabled profile, password-change requirement, expiry, rollback of settings and audit row, and three concurrent replay attempts (issuer's later transaction and two separate restricted LOGINs). Each rejected replay still permits the explicitly configured own tenant. Existing audit-writer forgery characterization remains, with releaseAccepted=false; it is not converted into a passing security acceptance test. The new tenant-GUC characterization records that a shared SQL login can set a foreign tenant ID directly.

## Explicit unresolved boundaries — NO-GO

1. Audit INSERT/UPDATE privilege still permits a caller to manufacture authority, including an explicit current transaction ID; transaction binding does not authenticate the issuer. No live GRANT/REVOKE or role provisioning is performed here.
2. Admin identities/permissions remain writable under the previously inspected shared grants. Replacing direct INSERT with a SECURITY DEFINER function accepting an arbitrary actor ID would preserve this flaw. Receipt-reader EXECUTE remains operator-only in intent but is shared in the inspected hosted grant state.
3. `fawri.tenant_id` is chosen by the shared runtime SQL session. A compromised runtime login can select a foreign tenant directly without using an admin audit. Neither the existing RLS tests (which use a trusted tenant context) nor transaction binding certify isolation against arbitrary SQL using that login. This is a distinct database-role threat boundary, not a demonstrated HTTP exploit.
4. Active actor/profile changes are observed under READ COMMITTED; PostgreSQL snapshot isolation may retain an earlier view inside a long-running REPEATABLE READ transaction. Do not claim immediate revocation for all isolation levels.
5. Hosted restricted LOGIN acceptance and deployment/grants remain unverified. Production/default/staging/Neon/Railway unchanged; PR remains DRAFT; no merge/deploy.

## Required next architecture increment

Separate tenant and trusted operator authenticated roles/pools. Tenant runtime must have no audit or admin-identity DML, operator capability EXECUTE, or inherited/SET-reachable operator role. Bind operator issuance to authenticated PostgreSQL session identity with fixed grants; actor permission checks remain necessary but are not a substitute for issuer authentication. Protect the issuer's own ability to modify grants, protected tables, functions and bindings. Migrate the legitimate directory and privileged receipt reader together before changing hosted grants. For the stronger compromised-tenant-runtime threat model, also bind tenant scope to a database-verified identity (for example per-tenant authenticated roles or independently signed scope); arbitrary custom GUCs are not credentials. Prove all paths using restricted direct LOGINs and preserve authenticated admin workflows.

## Execution status

Local syntax and disposable guard/runner tests executed; actual counters are recorded in the checkpoint. Canonical generation and SQL CI results for this change must be checked by containing commit SHA before calling 0037 accepted. No local PostgreSQL/Docker is available. Existing installed Drizzle CLI can be executed directly for local generation; pnpm's attempted dependency refresh was blocked by the environment supply-chain policy for the pre-existing xlsx tarball integrity entry. No lockfile or policy is changed, no unverified dependency installed. CI uses its frozen dependency environment and the unmodified canonical generator.
