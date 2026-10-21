# FAWRI P0 continuation checkpoint

Verified 2026-10-21T05:50:58.183248+03:00 (Asia/Baghdad). **Release decision: NO-GO.**

Repository nora953/fawri-production-source; branch `fix/p0-provider-receipt-order-discovery-20261015`; open Draft [PR550](https://github.com/nora953/fawri-production-source/pull/550), actual base `test/p0-integrated-billing-meta-20261015`. No main push or merge.

## Exact accepted executable

`e63e5b8dc5e4bfe86f1ef4d8d97e3fde8c0db0fd`: **45/45 workflows completed SUCCESS;70 isolated invocations all exit0/fail0/skip0/cancel0.** [Isolated39515218237](https://github.com/nora953/fawri-production-source/actions/runs/39515218237), job118945629380. Actual checkout merge0d908389a9658b58c20439a707590937fb6d4844 and audit HEAD have identical treeb1231bfbb834023b56d82c78b2c9606ee88a843f. Do not transfer results to newer source without verification.

[Receipt scope acceptance](evidence/P0-RECEIPT-SCOPE-CALLER-ACCEPTANCE-20261021.json) contains all45 exact-source workflow links,70 counters and proof markers. Receipt executor15 PASS, real replay HTTP20 PASS, wire recovery17 PASS. All other relevant migration/scope16/auth10/admin9/runtime-privilege81/provider/cashier/Meta/knowledge/restore/Node22 invocations PASS. [Attempt896c1cd3](evidence/P0-RECEIPT-SCOPE-CALLER-ATTEMPT-20261020.json) preserves44/45 and the HTTP owner helper's2 failed subtests plus parent; correction asserts native ACL42501 if SELECT is absent, or zero RLS rows if granted, with exact positive definer result/audits and all owner/FORCE/snapshot/rollback assertions intact. No new grants or skipped cases.

## Implemented and verified

- Knowledge transactions and receipt execution billing transactions issue canonical private scopes on separate actual trusted auth LOGIN, before merchant/FK locks; retain same primary/operator lease through completion. Private scope rows are LOGIN/backend/full-XID/merchant bound, immutable and expiring; tested forgery/cross-session/cross-transaction replay/expiry/concurrency denied. Receipt actor/session/device/permission reauthorization and provider I/O outside transactions retained.
- Real receipt HTTP/wire fixtures now authenticate as LOGINs. Executor gets only reviewed billing DML/execution capability, no auth/audit/inbox CRUD or scope-table privileges. Actual executor test proves private scope/audit transaction binding and issuer revocation/recovery, with zero bootstrap pool calls. Existing exactly-once/fault/owner/privacy checks retained.
- Knowledge/learning/lifecycle/Meta actual primary/auth fixtures, strict Dashboard owned runner and production primary admission retained. Private knowledge policy proof changes only disposable fixture policies and restores them; production policy unchanged.
- Subscription, SaaS and SuperQi transactions share withOperationalTransaction discard behavior after uncertain BEGIN/COMMIT/ROLLBACK. Subscription actual-function VM7 and lifecycle10 PASS in priority CI. This control-flow proof is not database authorization certification.
- Migration0036 SQL==canonical stage, snapshot parent0035 and journal0..40 consistent; canonical reproduction/schema/candidate and41-migration isolated execution PASS.0037-0040 admin transaction/actual issuer/auth/private scope work retained. No SQL migration changed in this continuation. Canonical restricted non-LOGIN owner/stats/merchant SELECT revocation proof retained. Prior [transaction acceptance384c9667](evidence/P0-TRANSACTION-LIFECYCLE-ACCEPTANCE-20261020.json) and [knowledge251b8329](evidence/P0-KNOWLEDGE-SCOPE-CALLER-20261020.json) retain exact evidence. Dependency baseline High0/Critical0/Low0/Moderate2 from384c9667, not zero vulnerabilities; fetch newer security job before restating counts.

## Pending provider continuation in containing commit

SuperQi payment-reference attachment and confirmed SaaS receipt/entitlement phases now require private issuance before protected locks. Replay already issues on its operator lease, so confirmed phases mint only for confirmed callbacks. Existing initial durable receipt admission remains before ownership resolution. Transitional GUCs stay for unchanged public RLS.

Restricted primary testing exposed merchant-facing SaaS checkout reservation/attachment, order list/expiry and paid-reference reads that previously ran without a merchant transaction. These now use withMerchantOperationalTransaction, retaining two durable checkout phases around external provider I/O. Attachment UPDATE also checks merchant_id explicitly. This wrapper still has legacy GUC authority until the next central migration; do not call it secure production tenant RLS.

Disposable provider fixtures separate primary/auth LOGINs from root inspection/DDL; only two existing provider admission/resolver capabilities added. Inbox acknowledgment-loss child authenticates as actual runtime, validates identity/startup before arming proxy, and keeps auth issuer on direct connection. Discovery child gets separate auth URL. Added actual binding, issuer revoke/recovery, immutable receipt/single grant/session reset assertions in owned provider cases. These new DB assertions are PENDING CI. Local focused runtime/lifecycle/operator43, subscription+provider source8, guard/security34 PASS; syntax/policy/whitespace PASS. No local PostgreSQL run claimed.

## Remaining P0 / next precise action

Inspect containing commit's exact HEAD/PR/CI, repair real failures without skipped tests or bootstrap bypasses and record evidence. After provider continuation passes, remaining central issuers are operationalPostgresAuthority and postgresSubscriptionEntitlement; all6 legacy GUC writes still require removal at public predicate cutover. SaaS legacy unconfirmed/test-only event owner discovery remains unscoped and needs explicit trusted caller/tenant treatment before broad runtime certification.

**public.fawri_tenant_or_audited_admin still trusts raw fawri.tenant_id.** The retained successful P0_TENANT_GUC_TRUST_PROOF is an open vulnerability. Existing restricted-role admin audit forgery/active-window replay denials do not close this alternate tenant branch. Do not mark P0 complete. Hosted owner/grants/default ACLs/pooler, sensitive auth SELECT/privacy, cashier credential/session integrity, and prior provider/storage/retention/release gates remain uncertified. Keep smart replies and offline cashier separate, preserving offline essentials.

## Durable recovery and safety

No production/staging/Neon writes, Railway deploy, main push or PR merge. Only owned Docker network-none PostgreSQL fixtures. Verify Neon disposable identity before hosted use. All ref updates use expected-SHA non-force leases. Worktree fawri-runtime-scope was created at57da9fc9 and its HEAD stays there; working files contain connector-published newer changes. Fetch live HEAD/use a fresh checkout; never reset older dirty worktrees. GitHub is durable truth. **NO-GO.**
