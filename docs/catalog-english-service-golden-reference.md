# English service editor — Golden Reference

Status: LOCKED

The English merchant service editor is approved and frozen after visual comparison with the locked Arabic service reference.

## Change policy

Do not change English service wording, ordering, spacing, LTR direction, service-detail geometry, service-location behavior, booking placement, SKU fitting, availability wording, description direction behavior, image controls, or footer action layout while matching Sorani Kurdish.

Any English service change requires an explicit user-approved English defect/fix first. After such a fix, update the regression contract before continuing parity work.

## Approved structure

- Item type appears first.
- Name / Category / Price appear immediately after item type.
- Service details follow the basic fields.
- SKU follows service details.
- Availability follows SKU.
- Description and Images follow availability.
- Save / Cancel remain the approved LTR mirror of the Arabic footer.

## Approved service semantics

- Service header subtitle: `Add the service information once; Fawri uses it in the cashier, replies, and to assist customers.`
- Basic service price label is `Price`; starts-from pricing uses `Price starts from`.
- Service detail labels retain Service duration, Buffer after service, Price display, and Service location.
- Multi-location mode is `Multiple service locations` and exposes concrete merchant/customer/online choices.
- Booking remains `Booking required` with the approved service-specific hint.
- Availability is `Available for request` with `Set whether this service is currently available to customers.`.
- Saved Arabic merchant text inside free-text fields may remain RTL through content-sensitive direction; this is expected and not an English parity defect.

## Parity rule

Sorani Kurdish parity work must not mutate either the locked Arabic catalog reference or this locked English service reference. Regression tests run before the normal Replit preview/build path.
