# Fawri Staging UI Findings — 2026-10-09

Status: Open — pending implementation and verification.

## FAWRI-UI-001 — Duplicate close controls
- Location: Admin merchant details dialog.
- Finding: Both the top X and bottom Close button dismiss the same dialog.
- Decision: Keep the top X and remove the redundant bottom Close button.
- Safety: Preserve protection against dismissing unsaved changes.
- Verify: Arabic, Kurdish, English; desktop and mobile.

## FAWRI-UI-002 — RTL action button ordering
- Location: Assistant administrator permissions dialog.
- Finding: Save Permissions appears left of Cancel in Arabic.
- Decision: Place the primary Save action on the right and Cancel on its left for RTL. Preserve appropriate LTR ordering for English.
- Verify: Arabic, Kurdish, English; desktop and mobile.

## FAWRI-UI-003 — Raw technical audit event labels
- Location: Admin audit log.
- Finding: Internal event codes and reason codes are displayed to administrators.
- Examples: emergency_duration_expiry_time_reconciled, early_warning_incident_opened, MERCHANT_NO_CONNECTED_CHANNEL.
- Decision: Render understandable localized labels and reasons in Arabic, Kurdish and English.
- Safety: Preserve original event codes and audit records unchanged.
- Verify: Historical and new events; unknown-code fallback; all three languages.

## Constraints
- Do not change production/staging database data, migrations, RLS or external integrations.
- Do not modify .replit.
- Implement fixes in a dedicated branch after identifying the relevant components.
- Run focused tests and build before merging or deploying.
