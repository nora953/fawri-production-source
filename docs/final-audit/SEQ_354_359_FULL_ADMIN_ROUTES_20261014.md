# SEQ-354–359 — full App owner recovery setup and work monitor

Audit only. Actual production Vite main/App/providers/router/global AdminSessionRevalidator/SupportPreviewLauncher/assets retained. No application/original test/schema edits, repair, merge, deployment or hosted/provider changes. Six sequential stages:354 contracts and case applicability,355 fullApp fixture,356 syntax/prerequisites,357 native CI,358 capture/localization review,359 durable evidence/currentCSV/7ledgers/PR.

Head9f9fe04a278a366b7235bd5731a3cb0efd9645f2; merge03fd41d1a3b23cb25ed56816342811de6e79e620; run38494339483/job115626569603. Chrome154.0.8037.97, build/upload/cleanup SUCCESS.12new baseline cases PASS/0FAIL, no infrastructure error. Prior54 baseline and18 extra negative states not rerun.

| IDs ×AR/EN/KU ×390/1280 | Full route | Observation |
| --- | --- | --- |
| UIR-014 | /admin/owner-recovery-setup |6PASS exact title/direction/overflow, synthetic disabled recovery status, actual password-typed input enabled after load, empty generation button disabled, no generic error. |
| UIR-015 | /admin/work-monitor/owned-assistant-target |6PASS exact title/direction/overflow, expected synthetic assistant data, no load error, back control present. Empty sessions/devices/logs fixture. |

Each case makes4allowlisted GETs: two admin/me (global revalidator+preview launcher), one admin/support/tickets, one page status/monitor request.48GETtotal; actualbrowserdeviceheader present on everyrequest;0unexpected API/mutations,0runtimeexceptions. No generated keys, no revoked sessions or actual bearer/cookie identity. Synthetic owner/data HTTP responses stand at backend boundary, not replaced React auth hooks/guards.

12original viewport PNGs downloaded/dimensionsverified390/1280×844 and inspected in2contact sheets. Basic text/control layout readable without obvious unintended first-view overlap/clipping; pages may legitimately scroll. Persisted originals/SHA256/Gitblob manifest underseq357-captures. Artifact11862652624 digestsha256:9f32f4b5ca4a5774d611035622cad9682d5df1ddddd7d4880a4a722ea331a3af; evidence does not depend on artifact expiry2026-11-13.

## New bounded localization finding

**I18N-MONITOR-SORANI-DATE-001 — LOW / OPEN / NATIVE_VISUAL_CONFIRMED.** In both Sorani work-monitor viewport captures, Last activity renders English month/day-period tokens Oct and AM among otherwise localized text/digits. Fixture timestamp2026-10-14T00:00:00Z. AdminWorkMonitorPage.tsx formatDate invokes Intl.DateTimeFormat('ckb-IQ',{dateStyle:'medium',timeStyle:'short'}); a platform locale fallback is a plausible explanation, but resolvedOptions was not captured, so cause is an inference rather than a verified Intl locale result. Native mixed-language display is directly visible in UIR-015-ku-390.png/1280.png. Not a timezone/financial/security defect, no claim every browser/timezone or every date fails. Distinct from earlier date-picker component month work and billing-status localization. No repair.

Basic route criteria PASS does not certify complete date/editorial localization. This is an additional visual review finding, not an extra13th test or retrospective failure of title/direction/geometry assertions. Existing heading, metadata, stale UI, fixture, archive, expiry and profit findings remain OPEN.

## Scope and continuation

Freshgueststorage/language with current synthetic owner response and disabled/empty page data. App actually requests identity and device headers; no realcookie/device trust/session validation/SQL/RLS/backend-role proof. Prior actualHTTP/SQL results remain separate. No generation/reauthentication/key display/copy/revoke/control actions, negative adminidentity or permission refresh, monitor populated rows/15sec polling/action races, support launcher nonempty tickets, keyboard/focus/accessibility/darktheme/provider/production fonts/physicaldevice/hosted routing certificate. ExternalGooglefonts blockedCSP/DNS; fallbackfont scope. Selected primary controls have nonzero rendered dimensions; capture inspection, not full below-fold/navigation/write acceptance. Browsergroup/server/profilecleanup completed.

Currentseq359CSV222defaultbaselinecases:66PASS_BOUNDED_FULL_APP/156NOT_RUN (54prior+12new). Extra18negative UINstates remainoutside denominator, no repeatcredit.29.73% execution of thisbaselineonly, not wholeauditpercentage.21selectors unresolved/11domains partial. WholepercentageNOT_YET_MEASURABLE; releaseBLOCKED. Currenttextscan/policyPASS exactcounts inseq359-security-current.json; historicalsyntheticreachablehistorygateOPEN.

[ActualCI](https://github.com/nora953/fawri-production-source/actions/runs/38494339483/job/115626569603). Results/capturemanifest/12PNGs/currentCSV and7ledgers persisted. NextSEQ-360: remainingfullApp admin/support/emergency snapshots and exactfixture/role applicability. Continueaudit without rerunning completedcases; finalrepairplan followscomprehensiveauditcompletion.
