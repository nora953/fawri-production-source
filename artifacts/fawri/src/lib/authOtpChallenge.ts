export type OtpChallengePurpose = 'signup' | 'password_reset';

export type OtpChallengeContext = {
  challengeId: string;
  phone: string;
  purpose: OtpChallengePurpose;
  expiresAt: string;
  retryAfterSeconds: number;
};

const SIGNUP_CHALLENGE_STORAGE_KEY = 'fawri_signup_otp_challenge_v2';

function clampSeconds(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

export function createOtpChallengeContext(input: {
  challengeId: unknown;
  phone: unknown;
  purpose: OtpChallengePurpose;
  expiresAt?: unknown;
  retryAfterSeconds?: unknown;
}): OtpChallengeContext | null {
  const challengeId = String(input.challengeId || '').trim();
  const phone = String(input.phone || '').trim();
  const expiresAt = String(input.expiresAt || '').trim();

  if (!challengeId || !phone) return null;

  return {
    challengeId,
    phone,
    purpose: input.purpose,
    expiresAt,
    retryAfterSeconds: clampSeconds(input.retryAfterSeconds),
  };
}

export function isOtpChallengeExpired(
  challenge: OtpChallengeContext,
  now = Date.now(),
): boolean {
  if (!challenge.expiresAt) return false;
  const expiresAt = Date.parse(challenge.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

export function savePendingSignupChallenge(
  challenge: OtpChallengeContext,
): void {
  if (challenge.purpose !== 'signup') return;
  window.sessionStorage.setItem(
    SIGNUP_CHALLENGE_STORAGE_KEY,
    JSON.stringify(challenge),
  );
}

export function readPendingSignupChallenge(): OtpChallengeContext | null {
  const raw = window.sessionStorage.getItem(SIGNUP_CHALLENGE_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<OtpChallengeContext>;
    const challenge = createOtpChallengeContext({
      challengeId: parsed.challengeId,
      phone: parsed.phone,
      purpose: 'signup',
      expiresAt: parsed.expiresAt,
      retryAfterSeconds: parsed.retryAfterSeconds,
    });

    if (!challenge || isOtpChallengeExpired(challenge)) {
      clearPendingSignupChallenge();
      return null;
    }

    return challenge;
  } catch {
    clearPendingSignupChallenge();
    return null;
  }
}

export function clearPendingSignupChallenge(): void {
  window.sessionStorage.removeItem(SIGNUP_CHALLENGE_STORAGE_KEY);
}
