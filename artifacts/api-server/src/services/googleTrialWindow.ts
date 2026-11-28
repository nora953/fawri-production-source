/**
 * V1 Google trial window calculation (source-only; no entitlement writer).
 * Inputs must be dates from the trusted account creation record and server
 * clock. Never use browser time, approval date, channel-link time, or last login.
 * A window is not proof of eligibility, approval, or permission to send.
 */
export const GOOGLE_TRIAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type GoogleTrialWindow = Readonly<{
  startsAt: string;
  expiresAt: string;
  remainingMs: number;
  expired: boolean;
}>;

export function calculateGoogleTrialWindow(
  accountCreatedAt: Date,
  serverNow: Date,
): GoogleTrialWindow {
  const start = accountCreatedAt instanceof Date ? accountCreatedAt.getTime() : NaN;
  const now = serverNow instanceof Date ? serverNow.getTime() : NaN;
  const end = start + GOOGLE_TRIAL_WINDOW_MS;
  if (!Number.isFinite(start) || !Number.isFinite(now) || now < start ||
      !Number.isFinite(new Date(end).getTime())) {
    throw new Error("GOOGLE_TRIAL_CLOCK_INVALID");
  }
  return Object.freeze({
    startsAt: new Date(start).toISOString(),
    expiresAt: new Date(end).toISOString(),
    remainingMs: Math.max(0, end - now),
    expired: now >= end,
  });
}
