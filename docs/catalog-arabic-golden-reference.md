# Arabic catalog editor — Golden Reference

Status: LOCKED

The Arabic merchant catalog editor is the approved reference for all language-parity work.
Both Arabic editor modes are locked:

- Product editor
- Service editor

## Change policy

Do not change Arabic catalog wording, geometry, ordering, spacing, direction, identifier fitting, variant-table behavior, service-location behavior, availability wording, or switch alignment while matching English or Sorani Kurdish.

Any Arabic change requires an explicit user-approved Arabic defect/fix first. After such a fix, update the regression contract before continuing parity work.

## Approved product invariants

- RTL merchant layout remains the reference geometry.
- Merchant-facing terminology uses `النوع / الأنواع` rather than implementation wording.
- Compact single-option table uses `النوع` as the first column and `حذف` for the delete-only action column.
- The single-option table remains compact with no inner horizontal scrollbar.
- Long SKU/barcode identifiers remain fully visible inside fixed-width fields; Latin identifier metrics are allowed inside the Arabic UI.
- Product options, product types, shipping/physical measurements, images, product data, and footer actions retain their approved Arabic order and spacing.

## Approved service invariants

- Basic fields appear before service details: item type → name/category/price → service details → remaining fields.
- Service header copy does not mention inventory.
- Service price label is `السعر`, or `السعر يبدأ من` for starts-from pricing.
- Buffer label is `وقت فاصل بعد الخدمة (بالدقائق)`.
- Booking title is `تحتاج إلى حجز`.
- Multi-location mode is `أكثر من مكان لتقديم الخدمة` and exposes concrete locations.
- Availability is `متاح للطلب` with `حدد ما إذا كانت هذه الخدمة متاحة حاليًا للعملاء.`.
- Availability and booking switches keep the approved left-side alignment and matching dimensions.
- The service location select stays horizontally aligned with the other three service-detail controls.

## Language parity rule

English and Sorani Kurdish may receive language-specific wording/direction fixes, but those layers must not mutate or target the Arabic golden reference. The permanent regression test and GitHub Actions gate are the enforcement mechanism for this contract.
