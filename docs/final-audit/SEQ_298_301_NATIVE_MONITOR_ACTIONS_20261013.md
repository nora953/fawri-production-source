# SEQ-298–301 — actual mounted WorkMonitor security actions

Continue baseline1ca436f911c3ec247b7ea4f9d226fc3784559507. Audit only: new independent browser workflow/fixture/evidence; application/original tests/schema unchanged. Earlier7language/refresh/race cases not rerun.

| Stage | Evidence | Outcome |
| --- | --- | --- |
| SEQ-298 | ActualWorkMonitor/Dialog/PasswordInput action source, priorcallback-only findings | Six new native action cases target pending state, current target binding and positive controls. |
| SEQ-299 | New loopbackGET/revokePOSTfixture, nativepointer/textinput/CSS harness | SyntaxPASS; no realpassword/backend/SQL/provider writes. Unknown routes failclosed; synthetic mismatched target/session rejected. |
| SEQ-300 | Run38439068416/job115440607861, head8382a73faeb95ba284db70f05468a93c3430f26c, merge071f16b2c190f46fa8e94f89f47cd8b8068ceb2a | Chrome154.0.8037.97:6completecases4PASS/2FAIL, no infrastructureError. Install/frontendbuildSUCCESS; jobFAIL reflects two UIacceptance failures. |
| SEQ-301 | Backend scope source review and canonical synchronization | Existing WORK-MONITOR-STALE-001 strengthened with nativependingaction evidence; no duplicate/new authorization bypass. |

## Six new actual native cases

| Case | Result | Measured behavior |
| --- | --- | --- |
| Cancel pending session termination | PASS | Realbuttonclick closesdialog,0POST. |
| Successful synthetic termination | PASS | OnePOSTtargetA/sessionA; dialogcloses, actual componentGETreloads and session disappears from display. |
| Incorrect ownerpassword response | PASS | Synthetic401/OWNER_PASSWORD_INCORRECT displays actualwrongpasswordtext; dialog/session remain, no syntheticrevoke accepted. |
| Doubleconfirm while responsepending | PASS | Realconfirmclick thenclick ondisabledprocessingbutton; only1POST. Held200released, dialogcloses. |
| Pending termination after actual15s silent403 | FAIL | Dialog staysopen/confirmenabled. Clicking confirm sends1POSTtargetA/sessionA despite precedingGET403. SyntheticPOST403 rejected; actualgeneric actionError displayed, dialogremains. |
| PendingA session after actualadminIdpropchange toB | FAIL | Bmonitor visible; priorpendingdialog staysopen/enabled. Confirm sendsPOSTtargetB/sessionA. Syntheticfixture returns404, actionError displayed; no accepted termination. |

## Existing WORK-MONITOR-STALE-001 — OPEN / NATIVE_ACTION_CONFIRMED

This extends the already documented UIlifetime/race finding. Source/callback tests previously observed pendingactions after403. Here actualReact state, useEffect15secondtimer, RadixDialog, controlledPasswordInput and realDOMbuttondisabled behavior run in nativeChrome with trustedmouse/textinput. The auditroot switches monitoredadmin prop; HTTPboundary returns explicit synthetic responses. No action callback or permission function replaced.

The two failures are related pending-action lifecycle gaps, not two new canonical defects. A stale pending action survives monitor denial and target change; after target switch, executeAction uses currentadminId but oldaction.session.id. User-visible confirmation has genericsecuritycopy and retains pending state. This batch proves attemptedsyntheticrequests and resultingactualUIerrors; it does not prove realaccountrevocation, accounttakeover, crossadminSQLmutation or missingbackendownerpassword enforcement.

The doubleconfirmcontrol proves one syntheticPOST for that bounded pending-response sequence only; it is not distributed idempotency/concurrencyproof. Cancel/success/incorrectpassword cases prove actualcomponent handling of fixture responses, not servercredentialchecking. Only booleanpasswordProvided logged; enteredfixturetext is synthetic and no realcredential used.

## Backend source boundary

Current auth-admin-postgres-routes sessionrevoke uses requireSecureAdminSession, ownerContext requiringowner_admin, assistantTarget requiringassistant_admin and requireOwnerPassword against authoritative ownerpasswordhash. It invokes authPostgresSessionAuthority.revokeSessionForAccount(accountId=routeadminId,accountKind=admin,sessionId=routeSessionId), sending404SESSION_NOT_FOUND iffalse. ActualPostgres helper locks SELECT account_sessions WHERE id=$1 AND account_id=$2 AND kind=$3 before UPDATE. This sourcequalifiedbinding explains why wrongtarget/session is not automatically a backendbypass.

Those real routes/database were not invoked by this nativefixture. Its403/404responses are deliberately modeled failure boundaries, not independent proof of productionrole/SQLprotection. Full App router may unmount on navigation; prop-reuse case is componentcontractproof, not proof of exacthostedrouteflow. Silent401/visible403pending state/nativedevice-trust/revoke-all/fullownerrole matrix remain outside this batch. No repair/guard relaxation.

## Provenance, isolation and remaining scope

Actualjob https://github.com/nora953/fawri-production-source/actions/runs/38439068416/job/115440607861 . PRhead8382a73faeb95ba284db70f05468a93c3430f26c, reportedmergeGITHUB_SHA071f16b2c190f46fa8e94f89f47cd8b8068ceb2a. Unchangedactualcomponentblob3614394eae39457ec894655d2ef77c1fe535e784. Pinnedactions/frozendependencyinstall withoutlifecycles, actualfrontendCSSbuild. FreshownedChromeprofile/debugloopback/externalDNSblocked; HTTPserverallows monitorGETand exactsyntheticrevokePOSTonly, rejects otherrequests. No unexpectedrequests; browsergroup/server/sockets/profilecleanup finished without infrastructureError. Selectedresult/jobsteps inseq300JSON, no raw private logs/bodypassword values.

Currentrepositoryscan1779trackedfiles/0findingsPASS; policy73workflows/0violationsPASS. Historicalsyntheticreachable-historygate remainsOPEN; no fullsecurityclearance.21repositoryselector paths remainunmapped;222minimumfull-routevisualcases allNOT_RUN unchanged. Sixactioncomponentcases are notfullroute/role/backend/SQL/accessibilityclearance. WholeauditpercentageNOT_YET_MEASURABLE;releaseBLOCKED.

NextSEQ-302: modernE164/currentAuthv2merchant-management/retention lifecycle fixtures and actualowner/assistantHTTPsession-action boundaries; remainingfullroutes/provider/hostedoperational gates. No applicationrepair/finalremediationplan/merge/deployment.
