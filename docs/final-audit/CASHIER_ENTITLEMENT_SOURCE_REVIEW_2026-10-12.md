# Cashier entitlement source review — SEQ-41/42

Source reviewed: `artifacts/api-server/src/services/cashierEntitlementAuthority.ts`.

SEQ-41: Lines 10 and 118-130 establish default seven-day grace and validate an optional positive integer grace override. Lines 197-240 compute server-side active, grace, restricted, suspended and cancelled entitlement states. This does not verify offline device enforcement or clock-tamper resistance; those launch checks remain open.

SEQ-42: Lines 132-151 advance one UTC calendar month and clamp to the last valid day. Lines 153-195 calculate seat proration by remaining milliseconds, use BigInt arithmetic and half-up rounding to whole IQD, and reject invalid or ended periods. Review boundary tests for end-of-month, leap year, exact expiry, and rounding. These are source findings, not executed tests or confirmation of commercial policy.

No application source modifications. Release remains blocked pending broader evidence.
