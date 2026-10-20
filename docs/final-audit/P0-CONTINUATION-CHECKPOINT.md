# FAWRI P0 continuation checkpoint

Verified 2026-10-20T16:18:29.745Z. Release decision: **NO-GO**.

## Live identity and accepted increment

Repository nora953/fawri-production-source; branch `fix/p0-provider-receipt-order-discovery-20261015`; open Draft [PR#550](https://github.com/nora953/fawri-production-source/pull/550); actual base `test/p0-integrated-billing-meta-20261015`, not main.

Accepted executable source: `b04b9c1c152751a7abe51a4dc55b226e860db10d`. All **44/44 workflows completed SUCCESS** on that exact SHA, independently fetched after completion. This count includes Auth PostgreSQL concurrency proof; do not carry forward the previous43-workflow count. The containing documentation commit adds evidence only; its own CI is separate and must be inspected live. Parent executable HEAD before checkpoint publication is the accepted SHA above; locate this checkpoint's exact commit in GitHub history.

Candidate `70176b0cc112261816a168e33cc1090cafc87aa7`, repair `22e2c2ac80cce916536bb1d35c3fdc78e30c7825`, accepted dispatch completion `b04b9c1c152751a7abe51a4dc55b226e860db10d`. Prior accepted executable `64981e847dbb2f496034050670d431760c1691bf` remains historical evidence, not current source.

## Implemented and verified

Migration0039 creates a non-PUBLIC, SECURITY INVOKER, parameterless authentication marker. Existing RLS predicate admits the separately granted actual restricted authentication LOGIN through session_user, never by a supplied actor/GUC. Bootstrap superuser/NOLOGIN simulations do not gain this branch. Existing0036 active-account/profile/password checks,0037 audit transaction binding and0038 actual-LOGIN operator issuer boundary remain intact. No hosted roles/grants were provisioned.

Dedicated `FAWRI_AUTH_DATABASE_URL` uses bounded restricted-role validation and identity-checked transactions; production cannot fall back to operator or primary runtime credentials. Auth sessions/devices, OTP/login security, owner break-glass, admin accounts/security/passwords, merchant signup/management/retention and provisioning now use this authority. Mixed account/merchant changes retain one transaction. Existing Meta channel and cashier staff/close flows needing account row locks use authentication transactions, preserving business logic and offline fallbacks. Page-to-merchant routing retains its separately granted operational resolver capability.

Production readiness rejects primary roles with authentication marker/operator capabilities, direct/inherited/SET-reachable core authentication mutation privileges (including column grants, TRUNCATE/TRIGGER/REFERENCES), or any administrative authority audit-table access. Core guarded tables: accounts,admin_profiles,admin_permissions,account_sessions,trusted_devices,auth_otp_challenges,login_attempts,auth_audit_events. Audit table: database_admin_access_audits. Missing0039 or auth URL fails closed. These are startup admission checks; migrations do not silently certify or alter hosted grants.

0039 committed SQL equals canonical stage/manual.sql. Journal order and snapshot chain validated; canonical snapshot ID `397d6475-189f-427b-8c36-bc3547fbd126`, SHA256 `0d76f3e0a15b5d93a8d92ff708ec6ff88e87728bd38c5fdaba82dbb5b9b3db13`. Complete historical and committed generation reproducible; schema migration application and transactional smoke/rollback/reconciliation passed in disposable PostgreSQL16. This revalidates the full chain including0036; no production migration applied.

## Actual execution evidence

Machine-readable evidence: [P0-AUTHENTICATION-ROLE-BOUNDARY-20261020.json](evidence/P0-AUTHENTICATION-ROLE-BOUNDARY-20261020.json), containing all44 run IDs/links/conclusions and all64 isolated invocation counters.

- [Migration candidate39455135104](https://github.com/nora953/fawri-production-source/actions/runs/39455135104): SUCCESS.
- [Schema validation39455135133](https://github.com/nora953/fawri-production-source/actions/runs/39455135133): SUCCESS; full reproducibility, database types and apply/smoke checks.
- [Isolated engineering39455135258](https://github.com/nora953/fawri-production-source/actions/runs/39455135258), job118740598532: SUCCESS;64 complete invocation summaries, each exit0/fail0/skip0/cancel0.
- [Foundation39455135024](https://github.com/nora953/fawri-production-source/actions/runs/39455135024), [Meta pipeline39455135143](https://github.com/nora953/fawri-production-source/actions/runs/39455135143), [Auth concurrency39455135117](https://github.com/nora953/fawri-production-source/actions/runs/39455135117): SUCCESS.
- Direct authentication LOGIN fixture9 PASS, primary pool query/lease calls0: signup/lookup, OTP one-use, session issue/validate/rotate/revoke, assistant permissions/password/profile/state, forged actor/role and credential/audit mutation denial, mixed rollback, revoked marker/missing or wrong auth URL fail closed.
- Admin boundary9 PASS: audit forgery denied even with intentional CRUD precondition; issuer requires actual authorized LOGIN; issuing-transaction live actor/profile checks; committed/other-session/same-backend-later-transaction replay denied; four concurrent replay sessions denied. **The existing tenant-GUC exploit proof also succeeds as a finding; green TAP does not close it.**
- Runtime privilege matrix81 PASS. Direct receipt read5/review11/execution14, HTTP receipt read11/review20/execution20, restricted Meta application13 and live Meta54 PASS. All cashier, billing, tenant/knowledge/retention, restore and Node22 HTTP invocations passed; smart replies and offline cashier remain separate.
- Local focused auth/readiness/lifecycle35 PASS; guard/summary19 and migration-static2 PASS. Repair execution21 PASS, targeted strict TypeScript closures PASS, MJS/shell syntax and git diff check PASS. No unrelated reruns claimed.

Previous receipt [execution](evidence/P0-RECEIPT-EXECUTION-OPERATOR-POOL-20261020.json), [review](evidence/P0-RECEIPT-REVIEW-OPERATOR-POOL-20261020.json), [read](evidence/P0-RECEIPT-OPERATOR-POOL-20261020.json) and [0038 issuer](evidence/P0-0038-ROLE-BOUND-ISSUER-20261020.json) evidence remains applicable within its stated credential/test scope.

## Failures preserved and repaired

Candidate70176 had migration/schema mismatch from a random snapshot UUID. Corrected with the generator's deterministic UUID algorithm; final canonical generation passed. Foundation direct knowledge invocation lacked the full offline ownership attestation now required by its grant helper. Added a focused knowledge-rls suite through both JS and shell dispatch; guard unchanged. Intermediate22e2 Foundation failed because shell allowlist had not yet included the suite; b04b9c1 completed it.

Candidate Meta signed ingress returned503 because the page resolver had moved to auth pool without resolver EXECUTE. Returned only resolver routing to operational transaction; no grants expanded. Candidate isolated run had63 successful invocations and1 failed Meta application invocation (5pass/8fail). Latest Meta and isolated runs pass. Failed/cancelled superseded runs are historical, never counted as latest success. Exact failed run IDs are retained in evidence.

## Remaining P0 blockers and next precise action

1. **Confirmed tenant impersonation through raw SQL remains open:** a shared tenant LOGIN can set a known foreign `fawri.tenant_id`. Core auth/audit integrity guards do not authenticate that tenant selector.
2. Auth SELECT/privacy is not fully closed: primary roles must ultimately lose sensitive credential/session/OTP reads without breaking support/emergency/media reads. Literal service scan found read dependencies in postgresSupportAuthority/Snapshot/Lifecycle/Inspection, postgresEmergencySnapshot/ReadAccessAuthority and merchantPhysicalMediaCleanup; do not revoke all account/profile SELECT blindly. This scan is not exhaustive certification.
3. Cashier-specific credential/session/PIN tables are not yet part of the core mutation gate. Review merchant_cashier_staff, cashier_station_credentials and cashier_operator_sessions writers, including discount override/role hardening, runtime expiry reconciliation, historical commerce and central activity/report paths. Preserve offline essentials and separate smart-replies logic.
4. Hosted LOGINs, exact least-privilege grants/configuration and previous provider/storage/retention/owner/rollout release gates remain uncertified. Isolated fixture blanket grants are not a hosted grant plan.

NEXT: inspect live HEAD/PR/CI, then design and prove a database-authenticated tenant scope that raw tenant SQL cannot mint or replay. Evaluate an auth-LOGIN-only issuer binding merchant to the actual primary LOGIN/backend/transaction with restricted storage and short validity, or justified separate tenant LOGINs. This is a design candidate, **not implemented or verified**. Do not substitute a comparison of user-controlled GUCs or a publicly callable definer accepting forged actors. Prove forged GUC, cross-merchant reuse within a transaction, cross-session/transaction replay, rollback, pool reuse and concurrency denial before migrating callers. Inventory all scope writers: operationalPostgresAuthority, knowledge/postgresKnowledgeRuntime, postgresSubscriptionEntitlement, superQiSandboxWebhook, verifiedReceiptReplayExecution, saasBillingAuthority, postgresCashierStaffAuthority and authenticationPostgresAuthority. Retain trusted operator receipt workflows and atomic authentication flows.

## Environment and recovery

SQL ran only in fresh owned offline Docker namespaces, fake providers and disposable PostgreSQL16. No Neon production/staging/default-branch data or role changes, no Railway deployment, PR merge or main push. Reverify project round-fire-18493605 / branch br-billowing-leaf-b14yamgu / neondb as explicitly disposable before any hosted use. No local PostgreSQL/Docker; retained dependencies support targeted local checks; full frozen install/build/types ran in CI.

Local worktree `/workspace/scratch/f32f0a256dd0/fawri-auth` is detached at older checkpoint b95f7158e87dda055091d5fe325d1e2775e4b5a3; its source appears uncommitted because commits were published through GitHub connector. Do not reset it or overwrite newer branch work. Use live expected-SHA fast-forward updates. **Release remains NO-GO.**
