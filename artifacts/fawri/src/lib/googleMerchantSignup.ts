/**
 * SOURCE-ONLY merchant Google admission UI, opt-in at build time.
 *
 * There is no Google login/trial entitlement without the independent server
 * readiness switches, reviewed schema and approved merchant policies.
 * The Google JWT stays in memory just long enough for a same-origin POST.
 */
export type GoogleSignupProfile = Readonly<{
  owner_name: string;
  store_name: string;
  activity_type: string;
  country_code: string;
  currency_code: string;
  timezone: string;
  language: 'ar' | 'en' | 'ku';
  agree_terms: true;
  confirm_legal: true;
  requested_plan?: 'silver' | 'gold' | 'diamond';
}>;

export type GoogleSignupResult = Readonly<{
  merchant: { id: string; status: string; phone?: string };
  merchant_profile: { merchantId: string; tenantId: string; accountStatus: string };
  account: { id: string; kind: 'merchant' };
  trial_activated: false;
  created: boolean;
}>;

type GoogleCredential = { credential?: string };
type GoogleIdentityApi = {
  initialize(options: {
    client_id: string;
    nonce: string;
    ux_mode: 'popup';
    auto_select: false;
    callback: (result: GoogleCredential) => void;
  }): void;
  renderButton(element: HTMLElement, options: {
    type: 'standard';
    theme: 'outline';
    size: 'large';
    text: 'signup_with' | 'signin_with';
    width: number;
  }): void;
  cancel(): void;
};
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentityApi } };
  }
}

const CLIENT_ID_PATTERN = /^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CHALLENGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GIS_URL = 'https://accounts.google.com/gsi/client';

export function googleMerchantSignupBuildReady(): boolean {
  return import.meta.env.VITE_FAWRI_GOOGLE_MERCHANT_SIGNUP === '1' &&
    CLIENT_ID_PATTERN.test(String(import.meta.env.VITE_FAWRI_GOOGLE_OAUTH_CLIENT_ID || ''));
}

function configuredClientId(): string {
  if (!googleMerchantSignupBuildReady()) throw new Error('GOOGLE_SIGNUP_DISABLED');
  return String(import.meta.env.VITE_FAWRI_GOOGLE_OAUTH_CLIENT_ID || '');
}

let scriptPromise: Promise<GoogleIdentityApi> | null = null;

async function loadGoogleIdentity(): Promise<GoogleIdentityApi> {
  const available = window.google?.accounts?.id;
  if (available) return available;
  if (!scriptPromise) {
    scriptPromise = new Promise<GoogleIdentityApi>((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => {
        script.remove();
        reject(new Error('GOOGLE_IDENTITY_UNAVAILABLE'));
      }, 10_000);
      script.src = GIS_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.onload = () => {
        window.clearTimeout(timeout);
        const api = window.google?.accounts?.id;
        if (api) resolve(api);
        else reject(new Error('GOOGLE_IDENTITY_UNAVAILABLE'));
      };
      script.onerror = () => {
        window.clearTimeout(timeout);
        script.remove();
        reject(new Error('GOOGLE_IDENTITY_UNAVAILABLE'));
      };
      document.head.appendChild(script);
    }).catch((error: unknown) => {
      scriptPromise = null;
      throw error;
    });
  }
  return scriptPromise;
}

async function postGoogle(path: '/api/auth/google/begin' | '/api/auth/google/complete', body: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('GOOGLE_SIGNUP_UNAVAILABLE');
  return response.json().catch(() => { throw new Error('GOOGLE_SIGNUP_UNAVAILABLE'); });
}

function challengeFrom(value: unknown): { id: string; nonce: string; expiresAt: number } {
  const v = value as { ok?: unknown; challenge_id?: unknown; nonce?: unknown; expires_at?: unknown } | null;
  const id = String(v?.challenge_id || '');
  const nonce = String(v?.nonce || '');
  const expiresAt = Date.parse(String(v?.expires_at || ''));
  if (v?.ok !== true || !CHALLENGE_ID_PATTERN.test(id) ||
      !NONCE_PATTERN.test(nonce) || !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() || expiresAt > Date.now() + 5 * 60_000 + 5_000) {
    throw new Error('GOOGLE_SIGNUP_UNAVAILABLE');
  }
  return { id, nonce, expiresAt };
}

function accountFrom(value: unknown): GoogleSignupResult {
  const v = value as (GoogleSignupResult & { ok?: unknown }) | null;
  if (!v || v.ok !== true || v.created !== true && v.created !== false ||
      v.trial_activated !== false || v.account?.kind !== 'merchant' ||
      !v.account.id || !v.merchant?.id || !v.merchant_profile?.tenantId ||
      v.merchant_profile.tenantId !== v.account.id ||
      v.merchant_profile.merchantId !== v.account.id ||
      v.merchant.id !== v.account.id) {
    throw new Error('GOOGLE_SIGNUP_UNAVAILABLE');
  }
  return v;
}

/**
 * Explicit user click begins a single server-issued nonce+CSRF challenge.
 * Calling renderButton never automatically grants a trial or opens a session.
 * Returns a disposer to prevent late callbacks from changing a departed page.
 */
async function prepareGoogleMerchantIdentity(
  container: HTMLElement,
  profile: GoogleSignupProfile | undefined,
  buttonText: 'signup_with' | 'signin_with',
  onSuccess: (account: GoogleSignupResult) => void,
  onFailure: () => void,
): Promise<() => void> {
  const clientId = configuredClientId();
  const api = await loadGoogleIdentity();
  // Intent distinguishes a new merchant registration from a returning
  // Google-linked login; only the former requires current published legal
  // policy version pins. An unlinked login can never create a merchant.
  const intent = profile ? 'signup' : 'login';
  const challenge = challengeFrom(await postGoogle('/api/auth/google/begin', { intent }));
  let active = true;
  let used = false;

  api.initialize({
    client_id: clientId,
    nonce: challenge.nonce,
    ux_mode: 'popup',
    auto_select: false,
    callback: (credential) => {
      if (!active || used) return;
      used = true;
      void (async () => {
        try {
          const token = credential?.credential;
          if (typeof token !== 'string' || token.length > 8192 ||
              !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ||
              Date.now() >= challenge.expiresAt) {
            throw new Error('GOOGLE_SIGNUP_UNAVAILABLE');
          }
          const result = await postGoogle('/api/auth/google/complete', {
            challenge_id: challenge.id,
            nonce: challenge.nonce,
            id_token: token,
            intent,
            ...profile,
          });
          const account = accountFrom(result);
          // A login-only request must NEVER create a merchant without a
          // completed registration profile, even if a future backend regresses.
          if (!profile && account.created) throw new Error('GOOGLE_LOGIN_NOT_LINKED');
          if (active) onSuccess(account);
        } catch {
          if (active) onFailure();
        }
      })();
    },
  });
  container.replaceChildren();
  api.renderButton(container, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: buttonText,
    width: Math.min(300, Math.max(200, container.clientWidth || 300)),
  });
  return () => {
    active = false;
    container.replaceChildren();
    api.cancel();
  };
}

/** New account: a complete profile and explicit legal consent are required in UI. */
export function prepareGoogleMerchantSignup(
  container: HTMLElement,
  profile: GoogleSignupProfile,
  onSuccess: (account: GoogleSignupResult) => void,
  onFailure: () => void,
): Promise<() => void> {
  return prepareGoogleMerchantIdentity(container, profile, 'signup_with', onSuccess, onFailure);
}

/** Returning account only. Missing Google subjects must not create merchants. */
export function prepareGoogleMerchantLogin(
  container: HTMLElement,
  onSuccess: (account: GoogleSignupResult) => void,
  onFailure: () => void,
): Promise<() => void> {
  return prepareGoogleMerchantIdentity(container, undefined, 'signin_with', onSuccess, onFailure);
}
