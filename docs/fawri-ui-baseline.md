# Fawri UI Baseline

This document is the canonical visual and interaction baseline for new Fawri merchant-facing interfaces.

## Source of truth

The baseline is derived from the already reviewed and accepted Fawri interfaces, especially:

- SignupPage
- LoginPage
- Admin Early Warning

New merchant UI must follow these patterns before page-specific polish is added.

## Mandatory foundation

Use the shared `fawri-ui-baseline` wrapper for merchant workspaces/forms and reuse the constants exported by `src/lib/fawriUiBaseline.ts` when constructing new fields or actions.

Do not invent a separate font, control height, radius, select arrow, checkbox placement, field spacing, or paired-field grid spacing per page.

## Typography

- Inherit the application font stack. Do not define a page-specific font.
- Field labels: 14px, semibold, 20px line-height.
- Field hints/help: 12px with comfortable 20px line-height.
- Main workspace title: 30px / `text-3xl`, extra-bold.
- Modal/section title: 20px / `text-xl`, extra-bold.
- Technical identifiers, numeric values, SKU/barcode, currency codes, time and machine-formatted values may use `dir="ltr"` inside RTL pages.

## Form geometry

- Standard field/control height: 48px (`h-12`).
- Standard field radius: 12px (`rounded-xl`).
- Every primary field is a field group: header/label, then an 8px gap, then the control.
- Canonical field groups use `space-y-2`; do not use `space-y-1` for primary merchant fields.
- Paired/two-column primary field rows use 24px spacing (`gap-6`) between columns and rows, matching Signup.
- Labels must remain visually attached to their own control and must not appear to merge with a neighboring field label in RTL layouts.
- Primary form actions should be 48px tall, 12px radius, bold.
- Modal containers may use the established 32px radius (`rounded-[2rem]`).

Canonical new-field structure should mirror Signup: a field-group container, a dedicated field-header/Label row, then the shared control. Legacy label-wrapped fields inside the dashboard are normalized by the baseline CSS, but new code should use the canonical structure directly.

Compact controls are allowed only when they are intentionally dense tools rather than primary merchant form inputs.

## Select controls

Prefer the shared Radix-based Fawri `Select` component for new UI.

Legacy native `select` elements inside a `fawri-ui-baseline` wrapper receive the same visual contract automatically:

- 48px minimum height
- 12px radius
- consistent focus ring
- arrow on the left in RTL and on the right in LTR
- correct text alignment and padding

Do not rely on the browser's default select arrow in merchant-facing UI.

## Checkbox / toggle rows

Prefer the shared Fawri `Checkbox` or existing toggle component.

For RTL merchant forms, the checkbox/toggle belongs at the visual start of the label row so its relationship with the text is immediately clear. Do not leave the label at one edge and a small checkbox isolated at the opposite edge unless the pattern is specifically an on/off settings switch.

## Date and time

Do not use browser-rendered `datetime-local` as the final merchant-facing date/time experience. Browser locale and OS settings can produce inconsistent formats such as `mm/dd/yyyy` on Arabic pages.

Use deterministic Fawri date/time UI. The stored/server contract may remain an ISO-like local value such as `YYYY-MM-DDTHH:mm`, but the merchant-facing representation must be intentional, localized, and consistent with Fawri controls.

For numeric/time fragments that must remain machine-readable, keep `dir="ltr"` even on RTL pages.

## RTL rules

- Page direction comes from `useI18n()`; do not hardcode per-page direction.
- Arabic and Kurdish are RTL; English is LTR.
- Native select arrow: left in RTL, right in LTR.
- Text labels align naturally with the page direction.
- SKU, barcode, phone, technical codes, currency codes, dates/times, and purely numeric inputs may remain LTR.
- Paired fields remain separate field groups with `gap-6`; do not visually join their labels.
- Do not solve RTL problems with one-off margins if the shared baseline can solve them structurally.

## Color and focus

- Use Fawri theme tokens; do not introduce page-specific brand colors.
- Primary action/focus uses the existing Fawri orange primary token.
- Muted/help text uses `text-muted-foreground`.
- Errors use the shared destructive/error styles.
- Focus must remain visible; do not remove outlines without replacing them with the standard ring.

## Merchant modal pattern

A merchant create/edit modal should normally follow:

1. Fixed header with title and optional short context.
2. Scrollable form body.
3. Consistent field groups and 48px controls.
4. Two-column primary field rows use 24px spacing.
5. Fixed footer action area.
6. Primary save action visually dominant; cancel remains secondary.
7. Mobile safe-area padding preserved.

## New-page checklist

Before considering a generated page visually complete, verify:

- Uses the Fawri baseline wrapper or equivalent shared primitives.
- No page-specific font stack.
- Standard label size/line-height.
- Standard control height/radius.
- Every primary label has a clear 8px relationship to its own control.
- Paired field groups use 24px separation and do not visually merge in RTL.
- Select arrow is correct in RTL/LTR.
- Checkbox/toggle placement matches Fawri patterns.
- No browser-default `datetime-local` presentation.
- Technical/numeric values have intentional direction.
- Primary actions match Fawri dimensions and color.
- Desktop and mobile do not clip or overflow.
- Arabic, Kurdish, and English remain readable without one-off layout hacks.

## Current adoption

The merchant DashboardLayout carries the shared baseline, so current and future merchant dashboard pages inherit it automatically. Products & Services, Add Product, Add Service, Promotions, and Add Promotion are covered, including nested catalog editors for variants, inventory, service fields, images, status controls, and promotion fields.