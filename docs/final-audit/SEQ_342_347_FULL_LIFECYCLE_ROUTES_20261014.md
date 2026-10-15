# SEQ-342–347 — full App OTP, pending review and owner recovery

Audit only. Original application/tests/schema unchanged; no repair/merge/deployment/hosted/provider mutation. Six sequential stages:342source/applicability review;343native fullApp fixture;344syntax/prerequisites;345actualCI;346capture/DOMfinding triage;347persistent evidence/currentcaseCSV/7ledgers/PR.

Headb8502d58406f66279ed9bccebb02f110173c39ee; mergecheckout0768cd0c40f8ad9aa06a18ae67a5826e2ae17afb; run38493001942/job115622347297. Chrome154.0.8037.97, actualVite main/App/providers/router/guards/lazy pages/assets.18distinct baselinecases18PASS/0FAIL; build/upload/cleanupSUCCESS, no infrastructureerror. Prior36baselinecases notrerun.

| Cases xAR/EN/KU x390/1280 | Scope | Observation |
| --- | --- | --- |
| UIR-004 /verify-otp | Synthetic sessionStorage signupchallenge,5minexpiry/no devcode |6PASS exacttitle/direction/overflow; six-digitinput enabled, emptyverifydisabled, no expirednotice. No OTP sent/verified. |
| UIR-005 /pending | Only allowed GET/api/auth/lifecycle returns syntheticowned pending_review/pending_activation snapshot |6PASS exactpendingtitle/direction/overflow; actualrefresh yields secondGET andkeepspendingtitle.12GETtotal, no otherAPI/mutations. |
| UIR-008 /owner-recovery/owned-synthetic-recovery | Initialkey1stage/syntheticrouteID; no sensitivePOST |6PASS exactvisualtitle/direction/overflow/main/keyinputLTR/emptycontinue disabled. Allsixrecord0semantic headings; finding below. |

18viewportPNGs downloaded/dimensionsverified390/1280x844 and inspected via2contact sheets: basictext/controls readable without obvious unintendedclipping/overlap. Persistedoriginals/SHA256/Gitblobmanifest underseq345-captures. Artifact11862595889, digestsha256:b1b02426667a40d84eec1cdec11aacb0e6ed668a71b0647e5c26f60118ce2168; notdependent on2026-11-13artifactexpiry. No extra capture or multiassertion coveragecounts.

## New accessibility structure finding

**A11Y-OWNER-RECOVERY-HEADING-001 — LOW / OPEN / DOM_CONFIRMED.** Actualfullroute atinitialkey1stage haszero h1/h2/h3/h4/h5/h6 elements across allsix language/viewportcases. Visible portalTitle usesCardTitle inOwnerRecoveryPage.tsx:203; sharedcard.tsx CardTitle rendersdiv. Screen-reader heading navigation has no semantic pageheading here. SourceandnativeDOMconfirmed, not comprehensive WCAG/screenreader assessment or authenticationfailure. No component/applicationrepair. Basicvisible-layout PASS remainsseparate fromaccessibilityfinding; no entirepageaccessibilityclearance.

## Limits and current coverage

Realcompiledentry/App/globalcomponents/providers preserved, no component/hook/routerguard replacement. Guest freshstorage/lang, syntheticchallenge/lifecycle response only. Noactualcookies/OTPdelivery/signin/recoverykeys/key2/phonechange/ownership/provider/SQL/RLS proof. Pendingrefresh tests stablepending state, not approval/logout/401/503/poll timer/race lifecycle. RecoveryrouteID isfixture, noinvalidID/challengerecoveryauthority accepted. ExternalGooglefonts blockedCSP/DNS, localfallbackfonts; physicaldevices/darktheme/editorialtranslation/accessibility beyondheading inventory notcertified. Browsergroup/server/profilecleanupSUCCESS. All18runtimeexceptioncounts0; exactlocalizedtitles normalize onlywhitespace/equivalentdigits. Initialscreenshots do not certify laterforms/lowerstates.

Currentseq347CSV:222minimum baselinecases,54PASS_BOUNDED_FULL_APP/168NOT_RUN (36prior+18new).24.32% execution of that baselineonly, notprojectauditpercentage. PriorCSVhistorypreserved.21selectorpaths unmapped;11domains stillpartial. WholepercentageNOT_YET_MEASURABLE;releaseBLOCKED. Metadata/staleUI/fixturemaintenance/archiveatomicity/expiryrollback/profitdisclosure andotherfindingsremainOPEN. Currenttextscan/policy results inseq347-security-current.json; historicalsyntheticreachablehistorygate remainsOPEN.

[ActualCI](https://github.com/nora953/fawri-production-source/actions/runs/38493001942/job/115622347297). NextSEQ-348: fullApp negativeOTPchallenge, pendingnetworkfailure/recovery and deniedrecoverykey states, keptoutside222defaultbaseline denominator. Continueauditwithoutrepeating54completedcases; finalrepairplan onlyaftercomprehensiveauditcompletion.
