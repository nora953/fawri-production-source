# SEQ-348–353 — full App negative lifecycle states

Audit only. Application, original tests and schema unchanged; no repairs, merge, deployment, provider or hosted database changes. Six sequential stages:348 contract/state review,349 fullApp fixture,350 syntax/prerequisites,351 actual CI,352 capture/behavior triage,353 durable evidence/ledgers/PR.

Head b47b937c5927f7a62787fdceb82a3be80d9adef4; merge checkout9e0f0933d0ca1bd68060c5fa921ebfb791d94aa1. Run38493530475/job115624007088, Chrome154.0.8037.97. Actual Vite production main/App/providers/router/assets and pages.18 new negative UI cases PASS/0FAIL, build/upload/cleanup SUCCESS, no infrastructure error. Prior54 baseline cases not rerun.

| Extra IDs ×AR/EN/KU ×390/1280 | Result | Actual observation |
| --- | --- | --- |
| UIN-OTP-MISSING |6PASS | No challenge in sessionStorage: six-digit input/verify disabled, exact localized expired-session notice, signup link mounts signup title. No verification/resend request. |
| UIN-PENDING-503 |6PASS | Synthetic lifecycle503 renders exact unavailable title; actual manual refresh makes second GET200 and renders pending-review title. Status sequences503,200. |
| UIN-RECOVERY-REJECT |6PASS | Real React input update with explicitly invalid synthetic key, actual form submission to owned synthetic start endpoint returns401; localized genericError shown, server private-error sentinel absent, key1 stage retained. |

18 allowed synthetic HTTP calls:12 lifecycle GETs (6fail+6recovery) and6 recovery/start POSTs. No unexpected API/mutations, no runtime exceptions. Recovery's existing zero-heading DOM finding remains observed; no duplicate canonical finding. No new canonical app defect. Basic negative behavior success does not close A11Y-OWNER-RECOVERY-HEADING-001 or other existing findings.

30PNG captures (18 initial+12 after-state; not30 cases) downloaded and dimensions verified390/1280×844, visually inspected in4contact sheets. Localized notices, recovery error and stable pending-review recovery readable without obvious unintended overlap/clipping in inspected views. Original images saved under seq351-captures with SHA256/Gitblob manifest. Artifact11862571740 digest sha256:559c905a75ee930c7ce5043049089226ab5faa9ac3b67717999f9e55bc2facfc; persisted copies do not depend on artifact expiry2026-11-13.

## Scope and limits

No replacement app components, hooks, guards or router. Guest fresh storage, actual missing challenge; pending and denied-key backend responses are synthetic allowlisted loopback fixtures. Invalid key is an obvious non-secret fixture string, no real keys/credentials/OTP entered or delivered. This proves frontend handling of supplied503/200/401 responses, not actual backend key rejection, rate limits, cookie ownership, session authority, SQL or provider behavior. Six languages/viewports per state remain6cases; multiple requests/assertions/images are not counted separately.

Primary route title/direction/overflow checked initially; post-response screenshot review covers named state changes, not a full post-state geometry/accessibility/pixel assertion suite. Guest storage is not authenticated production state. No pending approval/suspension/logout/401 redirect/timer or concurrent stale response proof. No OTP expired-at-runtime/tampering/resend quota/actual typing/verification matrix or full owner recovery key2/phone/password flow. Fallback fonts only; external Google fonts blocked by CSP/DNS. No physical-device/dark-theme/hosted routing or full semantic/editorial accessibility certification. Browser group/server/profile cleanup completed; no infrastructure error.

## Counts and continuation

These18 UIN cases are extra negative states outside the222 default route×language×viewport baseline. New seq353-negative-ui-cases.csv records baseline_credit0. Current baseline stays54 PASS_BOUNDED_FULL_APP/168NOT_RUN in seq347-current-route-cases.csv; never subtract18extra states from168.21 selectors remain unmapped,11 domains partial. Whole audit percentage NOT_YET_MEASURABLE; release BLOCKED. All open findings retained, no repairs.

Current tracked text scan and workflow policy PASS; exact counts in seq353-security-current.json,96PNG captures excluded by text scanner. Historical synthetic reachable-history gate remains OPEN. Seven ledgers reconciled. [CI evidence](https://github.com/nora953/fawri-production-source/actions/runs/38493530475/job/115624007088).

NextSEQ-354: authenticated full App admin work-monitor/owner recovery setup baseline fixtures and role applicability. Continue without rerunning completed baseline/negative cases; final repair plan follows comprehensive audit completion.
