# SEQ-330–335 — full App public routes, three languages and two viewports

Six sequential audit stages; application/original tests/schema unchanged. Actual production Vite main.tsx, App/router/providers/lazy pages and assets served on owned loopback, not independently mounted page components. No application repair/merge/deployment/provider/hosted database changes.

| Stage | Scope | Result |
| --- | --- | --- |
| SEQ-330 | App/main/route and existing222case inventory review | Select exact UIR-006,UIR-007,FALLBACK xAR/EN/KU x390/1280 guest cases. |
| SEQ-331 | Full production build/static SPA/native browser harness | Original entry/assets/providers/guards/router retained; guest language/storage setup only. |
| SEQ-332 | Syntax/isolation/runtime prerequisites | SyntaxPASS; local browser unavailable, actualbuild/browser required inCI; no skippedgreen. |
| SEQ-333 | Head56138e8a6d10d9aff5094222d3139aa799852d97, mergecheckout76306173e6f045c8d28cb93a0730852c39991158, run38489837137/job115612162119 |18distinct cases18PASS/0FAIL; Chrome154.0.8037.97; actualbuildSUCCESS and screenshots uploaded. |
| SEQ-334 |18first-view screenshots inspected; public metadata source review | No obvious viewport clipping/overlap. NewLOW PUBLIC-METADATA-TEMPLATE-001 / SOURCE_CONFIRMED / OPEN. |
| SEQ-335 | Current caseCSV/captures/results/7ledgers/PR checkpoint |222declared cases:18boundedPASS,204NOT_RUN. Historicalseq262CSV unchanged. NextSEQ-336. |

## Executed case groups

| Case IDs | Full route | Cases / observation |
| --- | --- | --- |
| UIR-006-{ar,en,ku}-{390,1280} | /privacy |6PASS; exact localized title, all9policy items vs current source dictionaries, language/direction, no horizontaloverflow, primary login/home links, native home link click. |
| UIR-007-{ar,en,ku}-{390,1280} | /terms |6PASS; exact localized title/all9terms items, direction/overflow/controls/home link click. |
| UIR-FALLBACK-{ar,en,ku}-{390,1280} | /__audit_unmatched_route__ |6PASS; translated404title including actual localizeddigits, primaryhome link and route navigation. |

Each case844high, deviceScaleFactor1. Mobile scrollWidth390/innerWidth390. Desktopprivacy/terms scrollWidth1265/innerWidth1280 (verticalscrollbar), fallback1280/1280. Exact comparison normalizes only whitespace and equivalent Arabic/Persian/ASCII digit forms; no fuzzy wording/fallback-language acceptance. All18report zero uncaught runtime exceptions at audited route snapshot; zero unexpected API or mutationrequests. No parentcase inflation. Links exercised through actualWouter click and observed home URL with h1; this is not complete landing page content/functionality acceptance.

## Captures and visual bounds

Artifact11860564565 `seq333-full-public-route-captures`, digest sha256:255b9fd52511a6f65608838c5aaf424e6b2ffb0e48c3368d8bd6673e0106775c; archive downloaded/extracted and18PNGdimensions verified. All18original viewport PNGs additionally persisted under evidence/seq333-captures with SHA256/Gitblob manifest; no reliance on artifact expiry2026-11-13. Inspected first-view captures via two contact sheets: headings/policy card text/primarylinks readable, AR/KU right direction and English left direction, no obvious first-view cropping/overlap. Policy pages intentionally scroll; below-fold nineitem text presence was checked inDOM, not visual review of every lower item.

No app/component replacements, no auth hook/provider/router mocks. Before boot: fresh local/session storage and fawri_lang; default guest account. Real production bundle served, loopbackserver uses SPAindex for audited route paths; this is not hosted reverse-proxy fallback validation. CSP/DNS deny external Googlefonts and outbound connectivity; current local/fallback fonts only. NativeChrome inCI, not physicalAndroid/Win10 rendering. No backend/OTP/provider, lawfulness/adequacy of policies, linguistic editorial certification, keyboard/focus/screenreader, productionSecurecookies, pixel baselines, darktheme, deep role/lifecycle/error or request-load proof. Build/harness/capturecleanup completed withoutinfraerror; browsergroup/server/profile stopped/removed. Images are synthetic public content only.

## New source finding

**PUBLIC-METADATA-TEMPLATE-001 — LOW / OPEN / SOURCE_CONFIRMED.** artifacts/fawri/index.html lines7,10,13 contain the same English template description including built on Replit and the instruction Update this description to reflect the app. The actual fullApp source used for these cases retains those description, og:description and twitter:description placeholders. Sourceverified, not an assertion of currently deployed search/social behavior. Public previews can show unfinished template wording; no credential exposure or functional authorization failure claimed. Page title stays genericFawri; whether distinct perroute metadata is needed remains separate design/SEO acceptance. No repair duringaudit.

This finding is additional source evidence, not an extra nineteenth browsercase or a functional failure of the18bounded criteria. Previous WORK-MONITOR-STALE-001, fixturemaintenance, archiveatomicity, expirymarkerrollback, profitdisclosure and other openfindings retained.

## Current coverage and handoff

New seq335-current-route-cases.csv is complete222case inventory with only18namedcases PASS_BOUNDED_FULL_APP,204NOT_RUN. Expected basic fullroute criteria for those18 exercised; no claim every visual/legal/accessibility condition cleared. This is8.11% execution of this minimum route×language×viewport baseline, not8.11% of project audit.21selector paths remain unmapped;11domains stillpartial. Whole audit percentage NOT_YET_MEASURABLE; releaseBLOCKED. Historical all222NOT_RUN statements remain inoldrecords only; current counts supersede them.

Currenttracked scan/policyPASS with exactcounts inseq335-security-current.json; historicalsynthetic reachablehistorygate remainsOPEN. Seven canonical ledgers updated. [ActualCI](https://github.com/nora953/fawri-production-source/actions/runs/38489837137/job/115612162119). Result JSON, capturemanifest,18originalPNGs and currentcaseCSV persist inGitHub.

NextSEQ-336: remaining public fullApp route cases (landing/login/signup and explicit OTP/pending fixture applicability), then authenticated route/role/state coverage. Do not rerun the18completed cases without documentedchange; continueauditonly, finalrepairplan after comprehensiveauditcompletion.
