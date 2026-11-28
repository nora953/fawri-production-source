import React from 'react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import InternationalPhoneField from '@/components/InternationalPhoneField';
import { GOOGLE_PHONE_VERIFICATION_COPY } from '@/lib/translations/features/pages/GooglePhoneVerification';
import { MERCHANT_REGION_BY_COUNTRY } from '@/lib/merchantRegions';
import { normalizeInternationalPhoneInput, validateInternationalPhone } from '@/lib/internationalPhone';

type Challenge = { id: string; phone: string; expiresAt: number; retryAt: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function googlePhoneLinkBuildReady(): boolean {
  return import.meta.env.VITE_FAWRI_GOOGLE_MERCHANT_SIGNUP === '1' &&
    import.meta.env.VITE_FAWRI_GOOGLE_PHONE_CLAIM === '1';
}

async function postProof(path: '/api/auth/google/phone/begin' | '/api/auth/google/phone/verify', body: unknown) {
  const response = await fetch(path, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true) throw new Error('GOOGLE_PHONE_OTP_FAILED');
  return data as Record<string, unknown>;
}

/**
 * Pending merchant only; never trusts account ID, verification or phone from
 * local storage. Only session-backed /api/auth/me reveals link eligibility.
 * OTP challenges stay in component memory and are never persisted or logged.
 */
export default function GoogleMerchantPhoneVerification() {
  const { lang } = useI18n();
  const copy = GOOGLE_PHONE_VERIFICATION_COPY[lang];
  const [eligible, setEligible] = React.useState(false);
  const [country, setCountry] = React.useState('IQ');
  const [phone, setPhone] = React.useState('');
  const [challenge, setChallenge] = React.useState<Challenge | null>(null);
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [complete, setComplete] = React.useState(false);
  const [error, setError] = React.useState('');
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    if (!googlePhoneLinkBuildReady()) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        const account = await response.json().catch(() => null);
        if (!controller.signal.aborted && response.ok && account?.ok === true &&
            account?.account?.kind === 'merchant' &&
            !account.account.phone && account.account.otp_verified === false &&
            account.merchant_profile?.accountStatus === 'pending_review') {
          setEligible(true);
          const profileCountry = String(account.merchant_profile.countryCode || '');
          if (MERCHANT_REGION_BY_COUNTRY.has(profileCountry)) setCountry(profileCountry);
        }
      } catch { /* Not authenticated/eligible: never expose phone claim UI. */ }
    })();
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    if (!challenge) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [challenge]);

  if (!googlePhoneLinkBuildReady() || !eligible) return null;

  const region = MERCHANT_REGION_BY_COUNTRY.get(country);
  const normalized = normalizeInternationalPhoneInput(phone, region?.callingCode);
  const validPhone = validateInternationalPhone(phone, region?.callingCode);
  const expired = challenge !== null && now >= challenge.expiresAt;
  const retryReady = !challenge || now >= challenge.retryAt;

  const begin = async () => {
    if (!validPhone || busy || !retryReady) return;
    setBusy(true); setError(''); setCode('');
    try {
      const data = await postProof('/api/auth/google/phone/begin', { phone: normalized });
      const id = String(data.challenge_id || '');
      const expiry = Date.parse(String(data.expires_at || ''));
      const retry = Number(data.retry_after_seconds);
      if (!UUID.test(id) || !Number.isFinite(expiry) || expiry <= Date.now() ||
          expiry > Date.now() + 11 * 60_000 ||
          !Number.isFinite(retry) || retry < 0 || retry > 3600) {
        throw new Error('GOOGLE_PHONE_CHALLENGE_INVALID');
      }
      setChallenge({ id, phone: normalized, expiresAt: expiry,
        retryAt: Date.now() + retry * 1000 });
      setNow(Date.now());
    } catch { setError(copy.error); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    if (!challenge || expired || busy || !/^\d{6}$/.test(code)) return;
    setBusy(true); setError('');
    try {
      const data = await postProof('/api/auth/google/phone/verify', {
        phone: challenge.phone, challenge_id: challenge.id, code,
      });
      if (data.trial_activated !== false || (data.account as { otp_verified?: boolean } | null)?.otp_verified !== true ||
          (data.account as { phone?: string } | null)?.phone !== challenge.phone) {
        throw new Error('GOOGLE_PHONE_PROOF_INCONSISTENT');
      }
      setComplete(true); setChallenge(null); setCode('');
    } catch { setError(copy.error); }
    finally { setBusy(false); }
  };

  return (
    <section className="mt-6 w-full space-y-3 border-t pt-5 text-start" data-testid="google-whatsapp-phone-claim">
      <h2 className="text-lg font-semibold">{copy.title}</h2>
      <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
      {complete ? (
        <p role="status" className="text-sm font-semibold">{copy.success}</p>
      ) : (
        <>
          <InternationalPhoneField lang={lang} countryCode={country}
            countryLabel={copy.country} phoneLabel={copy.phone}
            phonePlaceholder={copy.placeholder} phoneInput={phone}
            countryTestId="google-claim-country" phoneTestId="google-claim-phone"
            onCountryChange={v => { setCountry(v); setPhone(''); setChallenge(null); setCode(''); setError(''); }}
            onPhoneInputChange={v => { setPhone(v); setChallenge(null); setCode(''); setError(''); }}
          />
          {challenge && !expired && (
            <>
              <label className="block text-sm font-medium">{copy.code}</label>
              <InputOTP maxLength={6} value={code} onChange={setCode} dir="ltr">
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map(index => <InputOTPSlot key={index} index={index} />)}
                </InputOTPGroup>
              </InputOTP>
            </>
          )}
          <Button type="button" className="w-full" disabled={busy || !validPhone || !retryReady}
            onClick={() => void begin()} data-testid="google-claim-send">
            {challenge ? copy.retry : copy.send}
          </Button>
          {challenge && !expired && (
            <Button type="button" className="w-full" disabled={busy || code.length !== 6}
              onClick={() => void verify()} data-testid="google-claim-verify">
              {copy.verify}
            </Button>
          )}
          {expired && <p role="alert" className="text-sm text-destructive">{copy.expired}</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">{copy.note}</p>
        </>
      )}
    </section>
  );
}
