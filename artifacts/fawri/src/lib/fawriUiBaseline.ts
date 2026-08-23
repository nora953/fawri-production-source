export const FAWRI_UI_BASELINE_CLASS = 'fawri-ui-baseline';

/**
 * Canonical merchant-facing Fawri UI baseline.
 * Keep these values aligned with docs/fawri-ui-baseline.md and the approved
 * Signup/Login/Early Warning interfaces.
 */
export const FAWRI_UI = Object.freeze({
  fieldGroup: 'space-y-2',
  fieldGrid: 'grid gap-6 md:grid-cols-2',
  fieldHeader: 'flex min-h-5 items-center justify-between gap-3',
  fieldLabel: 'leading-5',
  fieldControl: 'h-12 rounded-xl',
  fieldHint: 'text-xs leading-5 text-muted-foreground',
  primaryAction: 'h-12 rounded-xl text-base font-bold',
  modalRadius: 'rounded-[2rem]',
  panelRadius: 'rounded-2xl',
  pageTitle: 'text-3xl font-extrabold tracking-tight',
  sectionTitle: 'text-xl font-extrabold',
} as const);