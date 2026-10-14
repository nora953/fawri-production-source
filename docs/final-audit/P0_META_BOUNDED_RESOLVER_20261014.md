# P0 Meta bounded resolver — prepared 2026-10-14

Canonical finding FA-I-006 / GitHub issue535. Separate branch `fix/p0-meta-bounded-rls-resolver-20261014`, stacked on security PR536. Payment recovery unchanged and verified at da4d0c05; security fixture corrected at a1e7751f pending full-history CI.

## Change and privilege boundary
Migration0028 adds `public.fawri_resolve_meta_page_merchants(text[])`, SECURITY DEFINER with fixed pg_catalog search_path, schema-qualified static SQL, row_security=off (fail closed if definer cannot read), maximum100requested page IDs/180characters each. Only connected messenger page_id/merchant_id rows matching supplied IDs are returned. No token/credential fields, dynamic SQL, table RLS policy changes or runtime BYPASSRLS.

PUBLIC EXECUTE is revoked. Migration/schema owner retains execution; intended runtime role must receive an explicit reviewed EXECUTE grant before a future deployment, e.g. a schema owner grants EXECUTE on this one function to the authorized ingress role. No hosted grant or migration has been executed. Do not grant general role membership, table ownership, elevated role flags or forged administrator audit context to make this work. A forced-RLS definer without sufficient read privilege fails closed rather than silently weakening the table policy.

Application directory accepts requested page IDs, not an all-pages enumeration. Merchant access, manual-conversation filter and queue ingress extract IDs from the actual request and request only those mappings. Legacy cutover-disabled lookup is similarly filtered. Existing page unique index stays authoritative.

## Prepared regression and acceptance limits
Restricted-role test retains the original two-tenant mapping/known-approved-page acceptance and tenant isolation/reset/unknown generic503 tests. It now proves function execution denied before explicit grant, returns only the requested page after grant, excludes disconnected pages, rejects101page SQL request, and ordinary table reads remain empty without tenant context. Existing runtime-authorities suite supplies its two explicit page IDs rather than requesting all pages.

Local API typecheck/build, edited MJS syntax and whitespace checks PASS. New SQL migration and restricted-role runtime suite NOT RUN pending CI; migration snapshot/journal added without changing existing table schema. Full signed HTTP webhook pipeline under this restricted role remains a distinct acceptance requirement; isolated middleware success alone does not close535. Live deployment/grant readiness remains BLOCKED until reviewed setup, not automatic production change.


## First isolated proof and canonical-history correction
Source30a165dc, PR537, isolated38518960581/job115704014302 SUCCESS:173PASS/0FAIL/0SKIP,43invocations/41unique. Restricted Meta resolver7PASS/0FAIL (explicit denial before grant; bounded two-tenant mappings; disconnected/oversized rejection; ordinary tenant read isolation; unknown generic503; known approved-page routing). Seven disposable29migration chains and cleanup PASS. These are actual SQL/middleware proofs; full signed restricted-role HTTP and hosted grant acceptance remain NOT RUN.

Schema gate38518960424/job115704013331 FAILED before migration SQL due canonical generator supported history2..28: stage0028 metadata/manual source was missing. Corrected by adding migration-stages/0028/{stage.json,manual.sql}, preserving exact migration SQL, and generating deterministic snapshot ID using existing canonical algorithm. Local full canonical generator PASS and all59 SQL/snapshot/journal artifacts byte-equal generated output. Table schema unchanged. Original schema failure retained; corrected schema CI pending.

Security PR536 corrected a1e7751f full-history38518815440 SUCCESS, repository-security115703564292 plus dependency/lockfile jobs PASS. First length64 attempt failed; corrected detector54span proven through actual scanner regression, no broad allowance.


## Corrected canonical checkpoint and signed HTTP preparation
Source2123c0c9: schema38519473541/job115705632551 SUCCESS, isolated38519473493/job115705631802 SUCCESS173/0, security38519473453 SUCCESS (repository115705632421 and dependencies/lockfile/review PASS). Local deterministic two-run generator regression1PASS/0FAIL,59artifact comparison PASS. This supersedes the missing-stage failure only after preserving its earlier evidence.

Prepared additional restricted-role actual loopback Express HTTP test: actual JSON raw-body capture, enforceMetaWebhookSecurity then enforceMerchantWebhookOperationalAccess; invalid signature401 before routing boundary, signed known pages200 with generic acceptance, unknown page503/no tenant leak, revoked EXECUTE503/no leak, ordinary table reads remain isolated. Actual middleware and DB role, generated synthetic secret only. Final success handler is controlled; manual-conversation/queue/subscription/router/worker stages are NOT exercised by this bounded test. SyntaxPASS; new HTTP runtime NOT RUN until nextCI. No claim of full-app/full-pipeline clearance.
