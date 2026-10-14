# Historical synthetic entrypoint fixture gate — 2026-10-14

Parent: recovery PR534 / code da4d0c05; recovery evidence commit5802c38571ae40bd5919b00cd63688fa219d2414. Separate security branch `fix/p0-history-synthetic-entrypoint-fixture-20261014`.

Security run38517736598/job115700229937 failed only full-reachable-history scan; current tracked source scan, dependency review/audit and lockfile checks passed. One finding: credential-url at immutable blob202a9fc041cb2cde0e8169683a6eb9eb7478e130, path docs/final-audit/evidence/seq241-entrypoint-fences.test.mjs, index641/length64.

Read-only blob inspection confirms synthetic credential identities at a reserved.invalid hostname, passed only to a child-process pre-import rejection test. Test asserts the disposable attestation rejection and no application DB import. No real connection or credential was present. Current fixture already constructs that rejection URL without a credential-shaped source literal.

Correction follows existing immutable historical fixture policy: one exact blob/path/rule/index/length predicate. Changed blob/file/index/length or any other secret rule is not suppressed. No broad hostname/path allowlist, no history rewriting, no rule disabled. Tests cover positive immutable case and all these negative mutations.

Local validation: 20PASS/0FAIL for security-final-audit.test.mjs, ci-run-redacted.test.mjs and http-security-contract.test.mjs. Tracked repository scan PASS1916files/0findings; policy PASS87workflows/0violations. Local checkout is shallow, so no complete-history PASS claimed locally. Full GitHub history gate awaits this security PR CI. This changes scanner false-positive classification, not application RLS or billing source. Payment SQL evidence remains da4d0c05 unchanged.
