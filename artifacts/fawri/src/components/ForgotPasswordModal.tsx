import React, { useState } from 'react';
import { ShieldCheck, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import OtpResendSection from '@/components/OtpResendSection';
import {
  requestPasswordReset,
  verifyPasswordResetOtp,
  confirmPasswordReset,
  type PasswordResetResult,
} from '@/lib/passwordReset';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import InternationalPhoneField from '@/components/InternationalPhoneField';
import {
  normalizeInternationalPhoneInput,
  validateInternationalPhone,
} from '@/lib/internationalPhone';
import { MERCHANT_REGION_BY_COUNTRY } from '@/lib/merchantRegions';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

type ForgotPasswordModalProps = {
  open: boolean;
  onClose: () => void;
};

type Step = 'phone' | 'verify' | 'password';

type RecoveryChallenge = {
  challengeId: string;
  expiresAt: string;
  retryAfterSeconds: number;
};

const initialState = {
  phone: '',
  code: '',
  newPassword: '',
  confirmPassword: '',
};

function challengeFromResult(result: PasswordResetResult): RecoveryChallenge | null {
  const challengeId = String(result.challenge_id || '').trim();
  if (!challengeId) return null;

  const retryAfterSeconds = Number(result.retry_after_seconds || 0);
  return {
    challengeId,
    expiresAt: String(result.expires_at || '').trim(),
    retryAfterSeconds: Number.isFinite(retryAfterSeconds)
      ? Math.max(0, Math.floor(retryAfterSeconds))
      : 0,
  };
}

function recoveryChallengeExpired(challenge: RecoveryChallenge): boolean {
  if (!challenge.expiresAt) return false;
  const expiresAt = Date.parse(challenge.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

export default function ForgotPasswordModal({
  open,
  onClose,
}: ForgotPasswordModalProps) {
  const { t, isRTL, lang } = useI18n();
  const [countryCode, setCountryCode] = useState('IQ');
  const [step, setStep] = useState<Step>('phone');
  const [form, setForm] = useState(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const [recoveryChallenge, setRecoveryChallenge] = useState<RecoveryChallenge | null>(null);
  const selectedRegion = MERCHANT_REGION_BY_COUNTRY.get(countryCode)
    || MERCHANT_REGION_BY_COUNTRY.get('IQ');

  const updateField = (field: keyof typeof initialState, value: string) => {
    setForm(current => ({
      ...current,
      [field]: value,
    }));
  };

  const resetAndClose = () => {
    if (isLoading) return;

    onClose();

    setTimeout(() => {
      setStep('phone');
      setCountryCode('IQ');
      setForm(initialState);
      setIsLoading(false);
      setRetryAfterSeconds(0);
      setRecoveryChallenge(null);
    }, 250);
  };

  const getForgotPasswordErrorMessage = (error?: string, code?: string) => {
    const message = error || '';

    if (code === 'RECOVERY_CONFIRMATION_INVALID' || code === 'RECOVERY_CHALLENGE_MISSING') {
      return t.forgot_error_invalid_code;
    }
    if (message.includes('لا يوجد حساب بهذا الرقم')) return t.forgot_error_no_account;
    if (message.includes('تعذر تنفيذ العملية')) return t.forgot_error_generic;
    if (message.includes('تعذر الاتصال بالسيرفر')) return t.forgot_error_connection;
    if (message.includes('اكتب رقم الهاتف')) return t.forgot_error_phone_required;
    if (message.includes('اكتب رمز التحقق')) return t.forgot_error_code_required;
    if (message.includes('كلمة المرور يجب')) return t.forgot_error_password_rules;
    if (message.includes('كلمتا المرور غير متطابقتين')) return t.forgot_error_password_mismatch;
    if (message.includes('رمز التحقق') && (message.includes('غير صحيح') || message.includes('منتهي'))) {
      return t.forgot_error_invalid_code;
    }

    return t.forgot_error_generic;
  };

  const restartRecovery = () => {
    setStep('phone');
    setRecoveryChallenge(null);
    setRetryAfterSeconds(0);
    updateField('code', '');
  };

  const handleRequestCode = async () => {
    if (isLoading) return;

    const cleanPhoneInput = form.phone.trim();

    if (!cleanPhoneInput) {
      toast.error(t.forgot_error_phone_required);
      return;
    }

    if (!validateInternationalPhone(cleanPhoneInput, selectedRegion?.callingCode)) {
      toast.error(t.phone_error);
      return;
    }

    const cleanPhone = normalizeInternationalPhoneInput(
      cleanPhoneInput,
      selectedRegion?.callingCode,
    );

    setIsLoading(true);
    setRecoveryChallenge(null);

    try {
      const result = await requestPasswordReset(cleanPhone);

      if (!result.ok) {
        toast.error(getForgotPasswordErrorMessage(result.error, result.code));
        return;
      }

      const challenge = challengeFromResult(result);
      if (!challenge) {
        toast.error(t.forgot_error_generic);
        return;
      }

      toast.success(t.forgot_code_sent);
      setForm(current => ({ ...current, phone: cleanPhone }));
      setRecoveryChallenge(challenge);
      setRetryAfterSeconds(challenge.retryAfterSeconds);
      setStep('verify');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (isLoading) return;

    if (!recoveryChallenge || recoveryChallengeExpired(recoveryChallenge)) {
      toast.error(t.forgot_error_invalid_code);
      restartRecovery();
      return;
    }

    setIsLoading(true);

    try {
      const result = await verifyPasswordResetOtp(
        recoveryChallenge.challengeId,
        form.phone,
        form.code
      );

      if (!result.ok) {
        toast.error(getForgotPasswordErrorMessage(result.error, result.code));
        return;
      }

      setRetryAfterSeconds(0);
      setStep('password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (isLoading) return;

    setIsLoading(true);

    try {
      const result = await confirmPasswordReset(
        form.newPassword,
        form.confirmPassword
      );

      if (!result.ok) {
        toast.error(getForgotPasswordErrorMessage(result.error, result.code));
        return;
      }

      toast.success(t.forgot_password_changed);
      resetAndClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePhone = () => {
    restartRecovery();
  };

  return (
    <Dialog open={open} onOpenChange={nextOpen => {
      if (!nextOpen) resetAndClose();
    }}>
      <DialogContent
        dir={isRTL ? 'rtl' : 'ltr'}
        className="w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-[2rem] p-0 shadow-2xl"
        closeButtonClassName={isRTL ? 'left-4 right-auto top-4' : 'right-4 top-4'}
        onEscapeKeyDown={event => {
          if (isLoading) event.preventDefault();
        }}
        onPointerDownOutside={event => {
          if (isLoading) event.preventDefault();
        }}
      >
        <div className={`flex items-start justify-between gap-4 border-b px-5 ${step !== 'phone' ? 'py-3' : 'py-5'}`}>
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
              {step === 'phone' ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <RotateCcw className="h-5 w-5" />
              )}
            </div>

            <div className="pe-12">
              <DialogTitle className="text-xl font-extrabold text-foreground">
                {t.forgot_reset_title}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm leading-6 text-muted-foreground">
                {step === 'phone'
                  ? t.forgot_phone_subtitle
                  : step === 'verify'
                    ? t.forgot_verify_subtitle
                    : t.forgot_password_subtitle}
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className={`px-5 ${step !== 'phone' ? 'space-y-3 py-3' : 'space-y-5 py-5'}`}>
          {step === 'phone' ? (
            <>
              <div className="space-y-2">
                <InternationalPhoneField
                  lang={lang}
                  countryCode={countryCode}
                  phoneInput={form.phone}
                  countryLabel={t.country}
                  phoneLabel={t.phone}
                  phonePlaceholder={t.phone_placeholder}
                  onCountryChange={(nextCountry) => {
                    setCountryCode(nextCountry);
                    updateField('phone', '');
                  }}
                  onPhoneInputChange={value => updateField('phone', value)}
                  countryTestId="reset-country"
                  phoneTestId="reset-phone"
                />

                <p className="text-xs leading-5 text-muted-foreground">
                  {t.forgot_phone_help}
                </p>
              </div>

              <Button
                type="button"
                onClick={handleRequestCode}
                disabled={isLoading}
                className="h-12 w-full rounded-2xl bg-orange-500 text-base font-extrabold text-white hover:bg-orange-600 disabled:opacity-60"
              >
                {isLoading ? t.forgot_sending : t.forgot_send_code}
              </Button>
            </>
          ) : step === 'verify' ? (
            <>
              <div className="rounded-2xl border bg-muted/30 px-4 py-2 text-sm leading-6 text-muted-foreground">
                {t.forgot_code_requested_for}
                <span
                  dir="ltr"
                  data-fawri-preserve-digits="true"
                  className="mx-1 inline-block font-bold tabular-nums text-foreground"
                >
                  {form.phone}
                </span>
              </div>

              <div className="space-y-2">
                <label htmlFor="reset-code" className="block text-sm font-bold">
                  {t.forgot_verification_code}
                </label>

                <Input
                  id="reset-code"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  data-fawri-preserve-digits="true"
                  value={form.code}
                  onChange={event =>
                    updateField(
                      'code',
                      event.target.value.replace(/\D/g, '').slice(0, 6)
                    )
                  }
                  className="h-12 rounded-2xl text-base tracking-widest"
                  autoComplete="one-time-code"
                />

                <OtpResendSection
                  phone={form.phone}
                  purpose="password_reset"
                  initialRetryAfterSeconds={retryAfterSeconds}
                  onResent={(resentChallenge) => {
                    setRecoveryChallenge({
                      challengeId: resentChallenge.challengeId,
                      expiresAt: resentChallenge.expiresAt,
                      retryAfterSeconds: resentChallenge.retryAfterSeconds,
                    });
                    setRetryAfterSeconds(resentChallenge.retryAfterSeconds);
                    updateField('code', '');
                  }}
                  onChallengeUnavailable={restartRecovery}
                />
              </div>

              <Button
                type="button"
                onClick={handleVerifyCode}
                disabled={isLoading || form.code.length !== 6}
                className="h-12 w-full rounded-2xl bg-orange-500 text-base font-extrabold text-white hover:bg-orange-600 disabled:opacity-60"
              >
                {isLoading ? t.forgot_verifying : t.forgot_verify_code}
              </Button>

              <button
                type="button"
                onClick={handleChangePhone}
                className="w-full rounded-xl py-1 text-center text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                {t.forgot_change_phone}
              </button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor="new-password" className="block text-sm font-bold">
                  {t.forgot_new_password}
                </label>

                <PasswordInput
                  id="new-password"
                  value={form.newPassword}
                  onChange={event => updateField('newPassword', event.target.value)}
                  className="h-12 rounded-2xl text-base"
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="confirm-password" className="block text-sm font-bold">
                  {t.confirm_password}
                </label>

                <PasswordInput
                  id="confirm-password"
                  value={form.confirmPassword}
                  onChange={event => updateField('confirmPassword', event.target.value)}
                  className="h-12 rounded-2xl text-base"
                  autoComplete="new-password"
                />
              </div>

              <Button
                type="button"
                onClick={handleResetPassword}
                disabled={isLoading}
                className="h-12 w-full rounded-2xl bg-orange-500 text-base font-extrabold text-white hover:bg-orange-600 disabled:opacity-60"
              >
                {isLoading ? t.forgot_changing : t.forgot_change_password}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
