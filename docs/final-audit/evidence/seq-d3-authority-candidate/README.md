# Coordinated cashier authority candidate — 2026-10-27

This review package concatenates the accepted revision2 hashed enrollment ledger and financial receipt proposals without changing their SQL bytes or function bodies. It is not installed by the canonical migration runner. Canonical source remains53 migrations/97 public tables; the isolated candidate has98 tables. Public v2 admission remains rejected and existing legacy admission is unchanged.

`contract.json` pins all106 historical migration SQL/snapshot Git blobs and SHA256 of both proposal inputs, read-only readiness inspector, fresh-cluster role recovery helper and isolated launcher. `reviewed.sql` creates the two safe NOLOGIN owners and their existing restricted functions/policies. It deliberately creates no runtime LOGIN role, credential, reviewer provenance or application EXECUTE grant. An owner collision fails; do not reuse or alter unknown roles. Apply only in one transaction in owned isolated tests.

The combined restore test now verifies these pins and installs this exact candidate SQL rather than loading the two proposals independently. Its existing positive/negative/fault checks cover actual restricted sessions, 24 readiness faults, financial/enrollment replay, independent-cluster owner/ACL restore with rotated credentials, volatile authorization-scope discard, subsequent financial operation and deletion rollback/success with selected peer preservation. This does not prove production migration adoption or an upgrade from an already-installed proposal fixture.

Local verifier regressions reject changed SQL, historical bytes, readiness, accidental0053 stage promotion and an operational-adoption flag. The manifest is reviewed repository data, not a cryptographic signature or independent provenance authority.

Next: prepare the Drizzle schema/preimage boundary and deterministic0053 reviewed_sql generation in a separate candidate checkout, then prove fresh-install/upgrade/fault rollback. No generated0053 snapshot/journal is claimed by this batch. Canonical promotion, actual reviewer issuance/grant policy and FIELD005 retention remain open; hosted roles/KMS/PITR/media recovery remain blocked. Release NO-GO.

Accepted source `fb4b1c40d669bfc1b38ce6f79b39872ed222c7d9`:57/57 workflows SUCCESS; broader826 TAP/97 invocations/94 files and separate6 candidate guard tests PASS. Fresh-cluster combined seed31/verify12 PASS, source/target fingerprint match. See the structured design evidence for exact run/job/tree and limits.

Candidate0053 preparation now includes five schema/preimage files, stage.json and policies.json, all pinned by contract inputs. `scripts/prepare-seq-d3-authority-candidate.mjs` uses a separate CI copy and verifies historical and existing table invariants; exact-source generation acceptance is pending. No canonical source files are changed by this preparation.
