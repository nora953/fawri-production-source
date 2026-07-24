import React, { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { toast } from 'sonner';
import { getMerchants, saveMerchants, setSession } from '@/lib/store';
import OtpResendSection from '@/components/OtpResendSection';function cacheMerchantLocally(merchant: any) {
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
  const signupPhone = localStorage.getItem('fawri_signup_phone') || '';

  const getOtpErrorMessage = (serverError?: string) => {
    const message = String(serverError || '');

    if (message.includes('الحساب غير موجود')) return t.otp_account_not_found;
    if (message.includes('رقم الهاتف')) return t.otp_phone_required;
    if (message.includes('رمز التحقق مطلوب')) return t.otp_code_required;
    if (message.includes('رمز التحقق')) return t.otp_invalid_code;

    return t.otp_invalid_code;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (value.length !== 6) return;

    const phone = signupPhone;

    if (!phone) {
      setError(t.otp_session_expired);
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: value }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result?.merchant) {
        setError(getOtpErrorMessage(result?.error));
        return;
      }

      const merchant = result.merchant;
      cacheMerchantLocally(merchant);
      setSession(merchant.id);
      localStorage.removeItem('fawri_signup_phone');
      localStorage.removeItem('fawri_signup_merchant_id');
      localStorage.removeItem('fawri_signup_otp_resend_until');

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

          <OtpResendSection
            phone={signupPhone}
            purpose="signup"
            storageKey="fawri_signup_otp_resend_until"
            onResent={() => {
              setValue('');
              setError('');
            }}
          />

          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}

          <Button
            type="submit"
            className="h-12 w-full rounded-xl text-base font-bold"
            disabled={loading || value.length !== 6}
            data-testid="button-verify-otp"
          >
            {loading ? '...' : t.otp_verify}
          </Button>
        </form>
      </div>
    </div>
  );
}
