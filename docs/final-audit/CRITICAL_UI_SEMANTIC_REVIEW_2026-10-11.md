# Critical UI semantics and accessibility — bounded source review

Source05456ea9c5bfdf9c007159aae0226f8c949db1e6,2026-10-11. Scope: subscription/billing/cashier retention/session-security copy and component bindings in AR/Sorani/EN. **Source inspection only; no browser, screenshot, screen reader, linguistic certification or app fix.** Existing translation structure CI is reused, not rerun. This task does not cover all pages.

## Findings

| Existing / new issue | Source evidence | Classification / acceptance |
| --- | --- | --- |
| CASHIER-SEAT-RELEASE-016 (existing) | CashierSubscriptionPanel.tsx load lines179–183, scheduleDowngrade lines265–270 and rendered activeAssigned lines317–320/471–486 all retain only assignment_status active. Backend cashierEntitlementAuthority.ts lines429–447 accepts active AND release_scheduled; service switch already executedPASS. | SOURCE_CONFIRMED_UI_SELECTION_GAP, servicePASS, browserpending. After scheduling2->1, released station is absent from checkbox choices and cannot be selected to replace current keeper through this component. No service failure and no authorization bypass. Keep both eligible states in UI under approved app fix; browser test switch/stale response/reload in three languages. |
| FAWRI-UI-006 (new) | CashierSubscriptionPanel.tsx lines508–509 renders order.operation and order.status directly; jsonApi lines110–113 captures raw payload.error and quote/checkout/downgrade catches lines227–290 show it. Backend cashier-subscription-operations.ts sendError lines31–44 emits service English error.message; sample validation lines104–118 English seats/operation messages. | SOURCE_CONFIRMED_LOCALIZATION_GAP. Arabic/Sorani users can receive pending/applied/paid_reconciliation_required/activate/add_seats and English server errors rather than localized descriptions. Not evidence of data leak or payment-state fabrication. Map stable codes/known enums in all languages with safe unknown fallback; preserve stored/API codes and server evidence. Actual error-state UI/browser proof pending. |

Do not create a new retention issue:016 remains the canonical ID. Earlier016 servicePASS does not close this component selection gap. FAWRI-UI-003 concerns raw admin log actions;006 is a separate billing presentation path.

## Reviewed copy and bindings

| Surface | Source review outcome | Remaining proof |
| --- | --- | --- |
| saasBilling.ts AR/EN/KU | Distinguishes billing unavailable from provider disabled; checkout-created does not claim subscription paid; reconciliation needs review; explicit sandbox notice. No clear semantic contradiction found in this bounded review. | Live provider mode matches displayed notice; native Sorani editorial review |
| subscriptionStateMessages copy + SubscriptionPage | Unavailable is distinct from absent subscription; pending/expired/exhausted/suspended messages differentiated. SubscriptionPage unavailable has role=alert and retry; success toast follows awaited emergency request. | Screen-reader announcement and all failed-server states; raw error pass-through still outside localized guarantee |
| CashierSubscriptionPanel copy | AR/EN/KU distinguish grace, restricted, suspended, independent bot/cashier seats and server-derived payment amount. Labels for numeric/checkbox fields wrap controls; numbersdir=ltr, locale ar-IQ/ckb-IQ/en-US. | Keyboard/focus/contrast/mobile/RTL overflow; loading/failure paragraphs have no local role/status/live region, outer announcement unknown |
| MerchantAccountSecurityPanel copy | Password success/revoke-all describe all sessions invalidated and reauthentication; selected-session revoke says that device signs in again. Actual password-recovery/session revocationPASS is a different route, not full account-security UI proof. | Authenticated two-merchant HTTP session ownership and UI confirmations; clarify raw-session-token storage wording if it is intended to describe UI rather than HttpOnly cookie persistence |
| I18nProvider | Sets HTMLlang to ar/ku/en and HTML/bodydir rtl excepten. Copy for KU is Sorani; numberlocaleckb-IQ. | Browser assistive pronunciation/fonts/digit mutation behavior; consider specificckb language tag with linguistic review, not a proven standards defect |

Potential editorial candidates (not confirmed defects): technical authority wording in failure messages; Sorani seats terminology consistency; universal test-order hint when no redirect rather than explicit provider.test_only. Current sandbox-only reachable provider flow has not demonstrated a wrong real-payment hint. Preserve these as review candidates without inventing runtime failures.

## Task exit evidence

Relevant source paths read and linked to existing service/CI evidence; new source-confirmed localization006 and existing retention016 updated. No tests executed specifically for linguistic/browser behavior. Source structure success (777core/299admin key parity) is not semantic/visual success. Application/UI edits remain outside current test-only authorization.
