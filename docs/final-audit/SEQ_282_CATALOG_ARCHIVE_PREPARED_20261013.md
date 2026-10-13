# SEQ-282 — owned PostgreSQL catalog archival assertions

Audit continuation from remote e8032523c67e34e1537028aaf68c29f86161b08f (local equivalent tree at 4ca020de). Audit only; no application/schema/original-test repair.

Original removal-history test expected 409, but current wrapper deliberately retains zero-stock archived shadows and only blocks specific dependencies. Missing expected rejection alone is not proof of inventory-history loss.

Two new audit-only SQL cases: successful archive must preserve complete immutable inventory mutation rows and hide retained variant through a later rebuild; injected marker-update failure must reject and roll back rename/version/variant state. The latter tests a source concern: core update commits before a separate archive-marker transaction. Runtime status NOT_RUN until exact Actions job logs are read; no confirmed new defect at preparation.

New workflow uses pinned checkout/setup-node, frozen dependencies without lifecycle scripts, fixed one-file allowlist, fresh network-none PostgreSQL16, no published ports, owned attestation and committed migrations. Readonly repository mount, no hosted database/provider credentials, teardown trap and always cleanup retained from previously executed provisioner. Existing workflows and original tests untouched. No original thirteen suites rerun.

Syntax checks PASS. SQL/business assertions NOT_RUN locally because no PostgreSQL/Docker/project dependencies. Overall audit percentage NOT_YET_MEASURABLE; release BLOCKED. Next verify exact workflow results and reconcile ledgers.

First runtime attempt source8249bb57529dcee7fb4ced93cac2e8aaf8a0b8f5, run38431552219/job115414742362: owned identity/migrations28 PASS; harness import TransformError before both business cases (root package CJS/top-level-await). TAP file-level0P/1F is infrastructure, not business failure. Owned cleanup SUCCESS. Audit fixture moved to explicit ESM .mts with direct existing db entrypoint import; application/original tests unchanged. Corrected execution pending.
