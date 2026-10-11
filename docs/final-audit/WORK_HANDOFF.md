# Fawri audit — current resume point

Updated2026-10-11. DraftPR520, audit/conversation-notes-reconciliation-20261011. Tests/guards/docs only. No app fixes, main merge, hosted DB mutation or deployment.

## Last completed task

SEQ-13: verified [commit2964aba2](https://github.com/nora953/fawri-production-source/commit/2964aba2800274f704adbe5cf820e458958f0915), [run38173603888](https://github.com/nora953/fawri-production-source/actions/runs/38173603888), job114571197444.27suitefiles106NodePASS/10FAIL/0SKIP;23filesPASS. Five fresh instances each28migrationsPASS; cleanupPASS. Seven functional failures plus three parents.

## Findings and coverage

- Open confirmed:006restricted Meta routing;012same-keycheckout23505;027latepaymentafterproactiveexpiry;028paidstate rewrite;032missingSQLfailure reconciliation;018oldcycle refund erasesnewcycle debit. No realpayments/data or duplicateentitlement proven.
- Meta54Nodepasses (53subtests+parent), standaloneknowledgecycle1pass, injectedproviders/owner-role only.017officialsender rejects suspendedsubscription duplicate before fakeprovider call.52historicalMeta harness errors corrected; keep failure history.
- Cashier8files/9passes and7policytests passed in38173288724; typechecks passed.019stationrollback and022/023noJSONjourney passed. Restore3rows/2objects and21safetytests passed38172886344; fullschema/storage/PITR recovery remains open.

## Latest completed review and exact next task

SEQ-14 [source43e60b16](https://github.com/nora953/fawri-production-source/commit/43e60b164282beec5feba9546625b4c16faca21f), [run38173870161](https://github.com/nora953/fawri-production-source/actions/runs/38173870161), job114571997037:28files106PASS/11FAIL/0SKIP;23filesPASS; five28migration chains/cleanupPASS. One extra failure: nested cleanup child inherited NODE_TEST_CONTEXT and skipped itsfile (exit0), so cleanup assertions not reached. Local reproduction confirmed warning; child environment now strips that context, pendingrerun.

Next read new isolated job for this checkpoint. It has29unique files/30invocations:28existing plus fullschema restoreseed/verify on sixth offlinecluster. Verify AUDIT_EXPECTED_FAILURE_CLEANUP has expectedChildExit1/zeroaccountmerchantcounts/redaction; then AUDIT_FULL_SCHEMA_DUMP_RESTORE_PASS and phase seed/verify fingerprint equality/restrictedtenantreads. Verify eachmigrationcount/cleanup and exact results. Do not infer fullrestore success from shellsyntax or phasepresence.

Restore compares publictables/ACL/RLSflags,policies/functions,constraints/indexes,journal andsyntheticchannels. Roles remainpreexisting in samecluster; no fullcluster/PITR/mediarecovery claim. Syntax/YAML/shellchecksPASS.

Then remainingmatrix: cashierretention/proration/failurecases, directentrypointguards, extendedrefunds/sensitivegrants/dependencyartifactreachability, semantic/visual/deployment proof. Draftreport remainsinterim.

## Blockers and permissions

No localDocker/psql; isolated Actions available. Work balance not visible. Business routing/accounting fixes, hosted mutations, main merge and deploy need explicit approval; safe audits can continue. Externalprovider/storage and finalvisual proof need identified approved environments/procedures.

## Time

Next CI triage15–30minutes.14task planning matrix3.5–7hours excluding failures/queue/fixes/externalproof; update as rows close. Full release date not reliable until externalproof and businessfix decisions resolved.
