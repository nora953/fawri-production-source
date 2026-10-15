# SEQ-336–341 — full App landing/login/signup across languages and viewports

Six sequential audit stages. Application/original tests/schema unchanged. Actual Vite production main/App/providers/router/assets and guest pages, no component-only replacement. Prior18privacy/terms/fallback cases not rerun. No repair/merge/deployment/hosted database/provider mutation.

| Stage | Scope | Result |
| --- | --- | --- |
| SEQ-336 | Landing/login/signup source and current222case review | Select exact UIR-001/002/003 xAR/EN/KU x390/1280. |
| SEQ-337 | Full App native browser harness | Actual entry/router/guards/compiled assets preserved; guest storage/language setup only. |
| SEQ-338 | Syntax and bounded browser prerequisites | SyntaxPASS; CI build/nativebrowser required, no skip/emptygreen. |
| SEQ-339 | Head925abe7ca26d2d1b536a3b579d27f7fadc99036d, mergecheckout1cb7742870daab9d788697f3b0c2cd8b10bddf7d, run38491939756/job115618926761 |18distinctPASS/0FAIL, Chrome154.0.8037.97; productionbuild/captureuploadSUCCESS. |
| SEQ-340 |30screenshots and precise form/navigation results reviewed |18initial+12submit-view captures; no obvious unintended overlap/clipping in inspected regions. No new canonical appfinding. |
| SEQ-341 | Results/capture hashes/currentCSV/7ledgers/PR checkpoint |222baselinecases:36PASS_BOUNDED_FULL_APP/186NOT_RUN; prior18cases retained. NextSEQ-342. |

## Distinct case groups

| Case IDs | Route | Six cases each |
| --- | --- | --- |
| UIR-001-{ar,en,ku}-{390,1280} | / | Exacthero title, language/direction/no horizontal overflow; localizedprimaryCTA exists; actual signup link click mounts /signup with exactlocalizedtitle. |
| UIR-002-{ar,en,ku}-{390,1280} | /login | Exacttitle/direction/overflow; oneform, phoneinputtype tel, passwordinputtype password, localizedsubmit enabled onemptyform. Scrollsubmitintoview/contained viewport; signup link mounts exactsignup title. |
| UIR-003-{ar,en,ku}-{390,1280} | /signup | Exacttitle/direction/overflow; identityfields/phone/two passwordtypedfields/terms+legal controls; localizedemptyformsubmit disabled. Scrollsubmitintoview/contained viewport; loginlink mounts exactlogin title. |

18named cases, not30: extra12images are additional views of existing formcases, not newtestcoverage. No parentcounts or duplicate destination mounts credited as newcases. Normalization only whitespace/equivalentArabic/Persian/ASCII digitforms, no fuzzywording fallback. All18report0runtimeexceptions including navigation and0unexpectedAPI/mutationrequests. Mobile scrollWidth390/innerWidth390; desktoplanding/signup1265/1280 (verticalscrollbar), login1280/1280. Allsubmitcontrols afterscroll within actualwidth and844height. Emptylogin submit being enabled is current UI contract; no claim blanksubmission is authorized or successful.

## Captures and inspection

Artifact11861419337 `seq339-full-entry-route-captures`, archive digest sha256:92718ecf4ebc3cdc026b06afed0ede3f2f5163d30c2d3fc528922b98ffb2e081. Downloaded/extracted30PNGs andverified dimensions390/1280x844. Original18initialviewport+12submit-region PNGs persisted under evidence/seq339-captures with SHA256/Gitblobmanifest; no dependence on artifactexpiry2026-11-13. Inspectedall30 via fourcontact sheets: landingheader/hero/CTA, loginfields/submit/recovery/accountlinks, signupidentityfields and lowerpassword/agreement/disabledsubmit/accountlinks readable withoutobvious unintendedoverlap. Mobileverticalscroll and topcropping afterintentional scroll are expected, not horizontaloverflow.

Exacttitles/selectedlabels checked againstcurrentsource dictionaries; not independenteditorial review of everystring. Sorani countryoption shows Iraq inEnglish inthese captures; region/namefallback scope is not certified as completeSorani translation, and no newbugclaimed without separate applicable countrylabelcontract. Passwordmasking assertion checks inputtype with emptyvalues, not actualtyping/show-hide/autofill/passwordmanager behavior. Landingbelowfoldcards/pricing/dialogs/mobileappbuttons notcertified; only topviewport/primarynavigation basiccriteria. Screenshots are fallbackfont rendering becauseexternalGooglefont requests blockedbyCSP/DNS, not productionwebfont/physicalAndroid/Windows or darktheme proof.

## Isolation and remaining scope

Original Vitebuild, maincatalogsemantic initializers, I18n/Theme/Query/Tooltip providers, realWouter/lazyroutes/globalcomponents retained. No app/hook/permission replacement. Guest local/sessionstorage cleared and fawri_lang seededbeforeboot. Ownedloopbackstaticserver servesoriginaldistHTML/assets and SPAroutes. NoAPIexpected: unexpectedAPI or mutationrequests failclosed; noneobserved. Submittedlogin/signup data, ownerOTPchallenge, providerdelivery, credentialvalidation, successfulaccountcreation/approval, database/RLS/security/session proof notpartofthisUIbatch. Earlier backend evidence remainsseparate.

Browsergroup/server/profile cleanup completed; screenshotuploadSUCCESS. Same-origin syntheticstatic routing isnot hostedreverseproxy/TLS fallbackacceptance. No keyboard/focus/screenreader/contrast/pixelbaseline/fullrole/error/lifecycle acceptance. Destinationpath+exacth1 verifies actualroutermount beyond previouspublic homeURL-only evidence; previouscases notrerun merelytostrengthen this.

No newcanonicalappfinding. PUBLIC-METADATA-TEMPLATE-001 staysLOW/OPEN/sourceconfirmed; previousstaleUI/fixturemaintenance/archiveatomicity/expiryrollback/profitdisclosure and otherfindings retained. Currenttrackedtextscan/policyPASS with exactcounts inseq341-security-current.json;18previous+30newPNGsbypassedbytextscanner countedexplicitly. Historicalsynthetic reachablehistorygate remainsOPEN.

Current seq341-current-route-cases.csv retainsall222minimumroute×language×viewportcases:36boundedPASS (prior18+new18),186NOT_RUN.16.22% execution of thisbaselineonly, notwholeprojectauditcompletion.21selectionpaths remainunmapped;11domains partial. WholepercentageNOT_YET_MEASURABLE/releaseBLOCKED. Historicalseq262/335CSV unchanged.

[ActualCI](https://github.com/nora953/fawri-production-source/actions/runs/38491939756/job/115618926761). JSONresults, capturemanifest,30PNGs andcurrentcaseCSVpersisted. NextSEQ-342: OTP/pending/ownerrecovery fullAppfixture applicability and remainingauthenticatedroute/role coverage; no repeatofthe36completedbaselinecases withoutdocumentedchange. Continueauditonly; finalrepairplan aftercomprehensiveauditcompletion.
