# P0 R-OWN-5 — exact HELD 0052+0053 54-stage first-commercial rehearsal

**Date:** 2026-11-09. **This proves source/migration compatibility in disposable GitHub Actions PostgreSQL 18 ONLY. It does NOT approve hosted SQL, refund, retention, merge or release.**

## Accepted exact test provenance

- [Source commit `321dcd205f17338bd79e0644d19cad84ac9c62a2`](https://github.com/nora953/fawri-production-source/commit/321dcd205f17338bd79e0644d19cad84ac9c62a2).
- [GitHub Actions `P0 held 0052 plus 0053 non-superuser PG18 composite`, run **#42688213492**](https://github.com/nora953/fawri-production-source/actions/runs/42688213492): **COMPLETED SUCCESS**; job **129400647194**, no failed steps. Job logs print `P0_HELD_0053_TRUE_FIRST_COMMERCIAL_0052_0053_COMPOSITE_PG18_PASS`, `P0_HELD_0053_DISPOSABLE_54_LEDGER_LAST_SHA_PASS` and `P0_HELD_0053_DISPOSABLE_NOT_HOSTED_RELEASE_AUTHORIZATION`.
- [Exact held `0053` source-admission run **#42688212967**](https://github.com/nora953/fawri-production-source/actions/runs/42688212967): **COMPLETED SUCCESS**; pins the source and grant digests, ensures original 53-stage journal and held 0052 predecessor remain immutable and rejects accidental or deliberate source drift.
- [Held receipt PG18 restricted SQL + mounted HTTP **#42688212319**](https://github.com/nora953/fawri-production-source/actions/runs/42688212319): **COMPLETED SUCCESS** on the same exact commit; proves restricted role, operator HTTP, immutable case, pagination and independently authenticated second reviewer in the **separate canonical-0052-based** disposable trial. Do **not** misstate it as running HTTP over the 54-stage combined DB; the composite workflow tests schema and role capability, not mounted HTTP after 0052 variant.

## Exact source chain

The canonical `lib/db/drizzle` SQL and original `meta/_journal.json` remain untouched at **53** stages. The separately committed **held** source chain is:

1. `lib/db/first-commercial/held/0052_cashier_stream_receipt_storage_invoker.sql` — alternate reviewed 0052, **not** silently substituted into original canonical source.
2. `lib/db/first-commercial/held/meta/_journal.json` — independent 53-stage 0052-variant journal, SHA-256 `7683b1fe807a514c0662ffb216e995492712433302f8292f9b2966582ed46339`.
3. `lib/db/first-commercial/held/0053_verified_receipt_manual_cases_candidate.sql` — held immutable case, event history, independent reviewer and read-only case history SQL, SHA-256 `b9806fde1614d181a22c01ae63aef6d66cead6b5dfc27f9e372a13749a03eb41`.
4. `lib/db/first-commercial/held/meta/_journal_with_0053.json` — **54-stage candidate** with unchanged entries 0000..0052 and one new index 53, SHA-256 `65b24ee8ae1bdef9032fa0c056b4ba919a9838ae98dc5fd69bf134a054dc5a56`.
5. `lib/db/first-commercial/held/0053_receipt_manual_case_operator_grants.sql` — six statements, exact narrow schema USAGE + five case-function EXECUTEs to `fawri_operator_issuer`, SHA-256 `848b6e98da5366ac2cf7c8fa0ea033395e37b06ef30ef29ce272638c5a7772d6`.

The plan is a pure source review, `scripts/lib/p0-held-0053-source-admission-plan.mjs`. The *only* executable 54-stage rehearsal `lib/db/scripts/p0-held-0053-first-commercial-disposable-rehearsal.mjs` refuses execution unless GitHub Actions flags/repository and local `127.0.0.1:5432/fawri_ci` match exactly. It creates a separate empty test database and non-superuser owner, provisions four discrete role identities, materializes the accepted FT01 53-stage SQL bundle to a temporary directory, appends held 0053 and its **held-only** journal, calls the real Drizzle migrator twice, and verifies **54 recorded migrations**, correct last migration digest, new tables with RLS, restricted operator login/function grant and denied raw table access. It removes its temporary folder/database/roles in `finally`.

## Finite remaining actual gate, in dependency order

1. **Hosted FT-01 0052:** designated **new first-commercial target** identity, source manifest, independently approved variant journal, least privilege, supported non-superuser role/bootstrap and recoverable backup/rollback. This is still blocked; do not migrate original staging or commercial data.
2. **Hosted 0053:** explicit separate owner/admission authorization, reviewed 54-stage lineage, held SQL/grants SHA comparison on target, verified backup/recovery, execution by attested database owner, exact target ledger and restricted operator proof, plus **mounted HTTP against that same exact target**. No hosted SQL was run in this trial; `approved_to_execute=false` and `hosted_sql_http_accepted=false`.
3. **Provider evidence:** reconcile actual provider-verified payment/dispute/settlement record, enforce independently verified source event identity and protected owner association, no guessed receipt reassignment. Current reviewer records only human acknowledgment of operator-provided evidence hash; **provider reconciliation and terminal settlement are not implemented or accepted**.
4. **Operational closure:** named responsibility, case escalation/outcome manual SOP, independent financial decision and approved funds return/dispute, explicit financial record retention/deletion policy. Never assume indefinite hold or silently drop immutable evidence.

**Safe rollback boundary:** Before commercial admission, abandon the held temporary-source candidate without modifying canonical files. After a hosted adoption (not authorized here), stop case HTTP routes and revoke the specific case `EXECUTE` privileges while preserving immutable receipt/case evidence. A `DROP TABLE` or manual deletion would destroy financial/audit history and needs separate explicit data-retention/settlement authority; prefer a verified backup/recovery or approved forward-fix plan on an independently assessed target.

**State:** `P0-RECEIPT-OWNERSHIP-POLICY` and `R-OWN-5` **OPEN**; PR #550 **DRAFT**, release **NO-GO**. Original register unchanged at 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED; historical 64.4% equals 29 of 45 known source-gate rows, **NOT** overall P0 launch readiness. No hosted Neon/Railway writes, funds movement, merge or deployment.
