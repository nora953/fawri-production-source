# Notification legacy provenance and compatibility — 2026-10-25

Scope: RESIDUAL-FIELD-002, exact source7be0c3ff. Source reconciliation plus local execution of the actual frontend validator/client on synthetic source-derived records. No SQL/application HTTP/provider/hosted runtime was executed in this batch. FIELD002 remains OPEN; release NO-GO.

| Shape | Source/storage | Observed compatibility and boundary |
| --- | --- | --- |
| Balance purchase, plan event, emergency activation | authRuntimePart3 AuthDb append helpers, called by legacy subscription handlers | Three synthetic source-derived shapes pass frontend structure checks. They are not canonical SQL producer acceptance. Earlier canonical subscription routes and final legacy gate separate required-mode HTTP paths. |
| Older SQL inspection | postgresSupportAuthority.createInspectionRequestPostgres: ticket_id/request_id/action_url | Synthetic projected shape fails current frontend contract. Only declaration found in807-file literal runtime scan; current tested route uses separate canonical producer. Renaming one key does not supply missing fields or trusted ownership. |
| Raw JSON inspection | authRuntimePart3.appendMerchantInspectionNotification | Current template key names without request_status. Raw template alone needs lifecycle enrichment; JSON records are not silently converted to canonical SQL. |
| Current canonical SQL inspection | postgresSupportInspectionAuthority plus scoped notification read-time projection | Prior actual SQL/HTTP/frontend proofs retained for pending/approved/rejected/expired/ended states. This batch does not repeat those proofs or repair unlinked historical rows. |

`node --test --test-reporter=tap docs/final-audit/evidence/p0-notification-legacy-shapes.test.mjs`:4PASS/0FAIL/0SKIP/0CANCEL onNode24.22.1. Actual client rejects a mixed response containing one incompatible historical-style record rather than accepting a partial list. The fetch adapter is in-process; no network request. First local attempt3PASS/1FAIL used invalid synthetic previous_plan_name bronze; corrected to allowed gold, preserving assertions and production code. It was a fixture error, not a product finding.

The807tracked runtime file scan reads UTF-8 including embedded NUL.18matching files have input digests; exact reference lines and overall manifest digest are in [machine evidence](evidence/P0-NOTIFICATION-LEGACY-COMPATIBILITY-20261025.json). Literal identifier/mount/guard review is not a formal call graph or proof about deployed data. No current hosted/historical SQL or JSON contents were inspected. Do not infer row existence, safe migration, privacy acceptance of extra keys, or a cleanup/retention policy.

No application/schema/ACL/frontend behavior change; no migration/import/relink/deletion. No new CI run claimed. Last fully accepted executable6182678d and its56/56CI,72notificationTAP,721broaderTAP are unchanged. [Local TAP](evidence/p0-notification-legacy-shapes.tap).

Next: concurrent actual authenticated list refreshes for one merchant and its peer, eligible subscription/add-on sources, exact deduplication/marker/tenant guarantees. Historical/extra-reserved-key policy and hosted inspection remain unaccepted.
