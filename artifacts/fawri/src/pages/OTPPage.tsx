import React, { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { toast } from 'sonner';
import { getMerchants, saveMerchants, setSession } from '@/lib/store';
import OtpResendSection from '@/components/OtpResendSection';
import {
  clearPendingSignupChallenge,
  createOtpChallengeContext,
  isOtpChallengeExpired,
  readPendingSignupChallenge,
  savePendingSignupChallenge,
} from '@/lib/authOtpChallenge';

function cacheMerchantLocally(merchant: any) {
  if (!merchant?.id) return;
  const merchants = getMerchants();
  const cleaned = merchants.filter(item => item.id !== merchant.id && item.phone !== merchant.phone);
  saveMerchants([merchant, ...cleaned]);
}

export default function OTPPage() {
  const { t, isRTL, lang } = useI18n();
  const brandName = lang === 'ar' ? 'فوري' : lang === 'ku' ? 'فورى' : 'Fawri';
  const [, setLocation] = useLocation();

  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [signupChallenge, setSignupChallenge] = useState(() => readPendingSignupChallenge());

  const invalidateChallenge = () => {
    clearPendingSignupChallenge();
    setSignupChallenge(null);
    setValue('');
    setError(t.otp_session_expired);
  };

  const getOtpErrorMessage = (serverCode?: string, serverError?: string) => {
    if (serverCode === 'OTP_INVALID') return t.otp_invalid_code;

    const message = String(serverError || '');
    if (message.includes('الحساب غير موجود')) return t.otp_account_not_found;
    if (message.includes('رمز التحقق')) return t.otp_invalid_code;

    return t.otp_invalid_code;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (value.length !== 6) return;

    if (!signupChallenge || isOtpChallengeExpired(signupChallenge)) {
      invalidateChallenge();
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: signupChallenge.phone,
          challenge_id: signupChallenge.challengeId,
          code: value,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result?.merchant) {
        setError(getOtpErrorMessage(result?.code, result?.error));
        return;
      }

      const merchant = result.merchant;
      cacheMerchantLocally(merchant);
      setSession(merchant.id);
      clearPendingSignupChallenge();

      toast.success(t.otp_verified);

      if (merchant.status === 'approved') {
        setLocation('/dashboard');
        return;
      }

      setLocation('/pending');
    } catch (error) {
      console.error('OTP verification failed:', error);
      setError(t.otp_connection_error);
    } finally {
      setLoading(false);
    }
  };

  const displayedError = error || (!signupChallenge ? t.otp_session_expired : '');

  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center bg-muted/30 p-4"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-md rounded-3xl border bg-card p-8 text-center shadow-xl">
        <Link
          href="/"
          className="mb-6 inline-block text-3xl font-extrabold leading-none tracking-tight text-primary fowri-header-brand-font"
        >
          {brandName}
        </Link>

        <h1 className="mb-2 text-2xl font-bold">{t.otp_title}</h1>
        <p className="mb-6 text-muted-foreground">{t.otp_subtitle}</p>

        <form onSubmit={handleSubmit} className="flex flex-col items-center space-y-6">
          <InputOTP
            maxLength={6}
            value={value}
            onChange={(v) => {
              setValue(v);
              setError('');
            }}
            dir="ltr"
            disabled={!signupChallenge}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>

          {signupChallenge && (
            <OtpResendSection
              phone={signupChallenge.phone}
              purpose="signup"
              initialRetryAfterSeconds={signupChallenge.retryAfterSeconds}
              storageKey="fawri_signup_otp_resend_until"
              onResent={(resentChallenge) => {
                const replacement = createOtpChallengeContext({
                  challengeId: resentChallenge.challengeId,
                  phone: signupChallenge.phone,
                  purpose: 'signup',
                  expiresAt: resentChallenge.expiresAt,
                  retryAfterSeconds: resentChallenge.retryAfterSeconds,
                });

                if (!replacement) {
                  invalidateChallenge();
                  return;
                }

                savePendingSignupChallenge(replacement);
                setSignupChallenge(replacement);
                setValue('');
                setError('');
              }}
              onChallengeUnavailable={invalidateChallenge}
            />
          )}

          {displayedError && (
            <p className="text-sm font-medium text-destructive">{displayedError}</p>
          )}

          {!signupChallenge && (
            <Link
              href="/signup"
              className="w-full rounded-xl border px-4 py-3 text-sm font-bold text-primary transition hover:bg-muted"
            >
              {t.create_account}
            </Link>
          )}

          <Button
            type="submit"
            className="h-12 w-full rounded-xl text-base font-bold"
            disabled={loading || value.length !== 6 || !signupChallenge}
            data-testid="button-verify-otp"
          >
            {loading ? '...' : t.otp_verify}
          </Button>
        </form>
      </div>
    </div>
  );
}
