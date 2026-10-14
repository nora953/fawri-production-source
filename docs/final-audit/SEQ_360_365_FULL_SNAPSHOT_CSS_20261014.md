# SEQ-360–365 — full App support/emergency snapshots and Sorani CSS isolation

Audit only. Application/original tests/schema unchanged; no repair/merge/deployment/hosted/provider changes. Six sequential stages:360 source/applicability review,361 fullApp fixture,362 syntax/prerequisites,363 baseline CI,364 visual review and controlled CSS isolation,365 persistent evidence/currentCSV/7ledgers/PR.

Baseline headc311d48e16baf1c361775a9fb0ab1e1e5683fb49, merge33ddb076cd9657fa9a8db45b8f8b9c7def27eae1, run38498401910/job115639330331.12new defaultbaseline cases12PASS/0FAIL, Chrome154.0.8037.97, build/upload/cleanupSUCCESS. Original Vite main/App/providers/router/global validators/launcher/lazy pages retained. Earlier component cases and unrelated completed states were not rerun as baseline.

| IDs ×AR/EN/KU ×390/1280 | Scope | Actual observation |
| --- | --- | --- |
| UIR-010 | /admin/support-preview/owned-preview-session, syntheticassistant withsupport/inspection permissions andmatchingactive snapshot |6PASS exacttitle/direction/nohorizontaloverflow/storemarker/basiccontrols;3allowedGET percase (identity+2snapshot calls frompage/launcher). |
| UIR-011 | /admin/emergency-access/owned-emergency-request/snapshot, syntheticowner andmatchingactive incident |6PASS exacttitle/direction/nohorizontaloverflow/store+incident/basiccontrols;4allowedGET percase (identity2/tickets/snapshot). |

42GETtotal with actualbrowserdeviceheader;0unexpectedAPI/POST/runtimeexceptions. Two 1hour-active synthetic views, no backendcookies/realgrants/SQL authority certified.12initialviewport captures downloaded/dimensionsverified andinspected; persisted originals/hashmanifest underseq363-captures. Artifact11864578032 digestsha256:1dc452108fa977549064e56224e1ffeb6c990dce5ed73ce05efe5242e4c8ec21. Basicbaseline PASS is not wholevisual/read-onlysecurity clearance.

## New CSS spillover finding and causal diagnostic

**UI-KU-CATALOG-CSS-SPILLOVER-001 — LOW / OPEN / NATIVE_CAUSE_CONFIRMED.** Original index loads public/catalog-kurdish-layout-fix.css. Its640–1399px Sorani selector matches div[dir=rtl].min-h-screen > header > div:first-child > div:first-child, applying flex:1 1 28rem. On bothsnapshot pages this firstchild is40px securitybadge, notcatalog title. Native1280 screenshots show stretched greenbadge andcompressed/wrapped title.

A documented technical reason justified2additional attribution cases, not a rerun of12completed baseline cases: realfullApp/Sorani1280 opens eachaffectedroute, recordscomputedwidth/flex, then disablesonlythat loadedstylesheet withinownedbrowser tab andrecordsaftergeometry/screenshots. No source/appcode edited. Diagnostic headbbb419bd3e4a094f2afcdbbda7780e810ac801a3, merge3761b6aad070bf14e655e18839b719d49f9ae03e, run38498978000/job115641143612.2diagnosticPASS/0FAIL, build/upload/cleanupSUCCESS.

| Diagnostic / measured element | Original CSS enabled | Test-only CSS disabled |
| --- | --- | --- |
| UID-010-CSS-ku-1280 support badge |702.6875px; flex1 1 448px |40px; flex0 1 auto |
| support title width |254.6875px |917.375px |
| UID-011-CSS-ku-1280 emergency badge |547.921875px; flex1 1 448px |40px; flex0 1 auto |
| emergency title width |99.921875px |607.84375px |

ScrollWidth remains1280 inallbefore/after measurements.4before/after PNGs inspected/persisted underseq364-captures. Artifact11865385760 digestsha256:9da09c766d75bcd0d4a04c11dd2b38eb6ac9ea9ac74cc214ede70a755a8232f5. This proves file-level causal contribution at1280, not everymedia width/CSSrule or a shippedrepair. SeverityLOW because presentation damaged whileprimarycontrols/routes remainusable; no credential/data/write bypass claimed. Mobile390support header is also cramped inthese captures; media rule doesnotapply at390, so mobiletitle layout is not attributed tothisCSS or certified bythisdiagnostic. Separatepost-layout/title-wrap acceptance remainspending.

## Existing localization evidence extended

I18N-MONITOR-SORANI-DATE-001 remainsOPEN, now additionallyobserved onemergency snapshot generated_at inbothSorani baseline captures: EnglishOct/AM amonglocalizeddigits/text. AdminEmergencySnapshotPage uses ckb-IQ Intl/date formatting; resolvedOptions notmeasured. Sameadmin datepresentationfamily, no duplicatecanonicalissue. No allplatform/timezone/financialfailure claim. Existing heading/metadata/staleUI/fixture/archive/expiry/profit findings retained.

## Applicability, counts and continuation

Syntheticassistant/owner API identity/data responses only, no Reacthook/permission/guard replacement. ActualfullApp bootstrap reaches currentroutes anddeviceheaders, notauthcookie/realgrant/callerbinding/RLS/provider/backendprivilege certification. UI banners claimserverenforcement; thisbatch doesnot prove thatclaim. Noend/back/navigationactions, timers/expiry/failure/races, nestedtabs/privacyfilter/XSS/largecontent, fullkeyboard/focus/accessibility/physicaldevice/darktheme/productionfont/hostedrouting proof. ExternalGooglefonts blockedCSP/DNS; fallbackfonts. Browsergroup/server/profilecleanup completed.16newimages are12baseline+4diagnostic, not16tests.

Currentseq365CSV222defaultbaselinecases:78PASS_BOUNDED_FULL_APP/144NOT_RUN (prior66+12new).35.14% execution of thatbaselineonly, notwholeauditpercentage.18extraUINnegativecases and2UIDattribution cases remainoutside222; diagnosticCSV baseline_credit0.21selectors unresolved/11domains partial. WholepercentageNOT_YET_MEASURABLE/releaseBLOCKED. Currenttextscan/policyPASS exactcounts inseq365-security-current.json; historicalsyntheticreachablegateOPEN. Originalapps/tests/schemaunchanged.

[BaselineCI](https://github.com/nora953/fawri-production-source/actions/runs/38498401910/job/115639330331); [CSSdiagnosticCI](https://github.com/nora953/fawri-production-source/actions/runs/38498978000/job/115641143612).16originalPNG/results/hashmanifests/currentCSV/diagnosticCSV and7ledgers persisted, notdependent on30dayartifactexpiry. NextSEQ-366: remainingfullAppadmin/emergencyworkspace/merchant route androlefixture coverage. No repeatcredit orrepairplan beforecomprehensiveauditcompletion.
