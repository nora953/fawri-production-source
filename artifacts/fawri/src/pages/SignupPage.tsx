import React, { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Link, useLocation } from 'wouter';
import { getMerchants, saveMerchants } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { normalizePhoneNumber, validatePhone, validatePassword } from '@/lib/validators';
import {
  clearPendingSignupChallenge,
  createOtpChallengeContext,
  savePendingSignupChallenge,
} from '@/lib/authOtpChallenge';
import { toast } from 'sonner';
import { PolicyModal, type PolicyTab } from '@/components/PolicyModal';

type RequestedPlan = 'silver' | 'gold' | 'diamond';

function getRequestedPlanFromSearch(search: string): RequestedPlan | null {
  const plan = new URLSearchParams(search).get('plan');
  return plan === 'silver' || plan === 'gold' || plan === 'diamond' ? plan : null;
}

function cacheMerchantLocally(merchant: any) {
  if (!merchant?.id) return;
  const merchants = getMerchants();
  const cleaned = merchants.filter(item => item.id !== merchant.id && item.phone !== merchant.phone);
  saveMerchants([merchant, ...cleaned]);
}

export default function SignupPage() {
  const { t, isRTL, lang } = useI18n();
  
  const brandName = lang === 'ar' ? 'فوري' : lang === 'ku' ? 'فورى' : 'Fawri';
  const fieldLabelClass = "leading-5";
  const fieldHeaderClass = "flex min-h-5 items-center justify-between gap-3";
  const fieldInputClass = "h-12 rounded-xl";
  const fieldInvalidInputClass = "border-red-500 focus-visible:ring-red-500";
  const [, setLocation] = useLocation();
  const requestedPlan = getRequestedPlanFromSearch(
    typeof window === 'undefined' ? '' : window.location.search,
  );
  const requestedPlanLabel = requestedPlan
    ? { silver: t.plan_silver, gold: t.plan_gold, diamond: t.plan_diamond }[requestedPlan]
    : null;
  const requestedPlanPrefix =
    lang === 'ar' ? 'الخطة المطلوبة' : lang === 'ku' ? 'پلانی داواکراو' : 'Requested plan';
  const [loading, setLoading] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyTab, setPolicyTab] = useState<PolicyTab>('privacy');

  const [formData, setFormData] = useState({
    owner_name: '',
    store_name: '',
    phone: '',
    password: '',
    confirm_password: '',
    activity_type: '',
    custom_activity: '',
    agree_terms: false,
    confirm_legal: false,
  });

  const [phoneInlineError, setPhoneInlineError] = useState("");
  const [passwordInlineError, setPasswordInlineError] = useState("");
  const [confirmPasswordInlineError, setConfirmPasswordInlineError] = useState("");

  const isOther = formData.activity_type === 'أخرى';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    if (name === "phone") {
      const normalizedPhone = normalizePhoneNumber(value);
      if (!normalizedPhone) {
        setPhoneInlineError("");
      } else if (normalizedPhone.length >= 11) {
        setPhoneInlineError(validatePhone(value) ? "" : t.phone_error);
      } else {
        setPhoneInlineError("");
      }
    }

    if (name === "password") {
      setPasswordInlineError(getPasswordError(value));
      setConfirmPasswordInlineError(formData.confirm_password ? getConfirmPasswordError(value, formData.confirm_password) : "");
    }

    if (name === "confirm_password") {
      setConfirmPasswordInlineError(getConfirmPasswordError(formData.password, value));
    }
  };

  const handlePhoneBlur = () => {
    if (formData.phone.trim() && !validatePhone(formData.phone)) {
      setPhoneInlineError(t.phone_error);
      return;
    }
    setPhoneInlineError("");
  };

  const handlePasswordBlur = () => {
    setPasswordInlineError(getPasswordError(formData.password));
  };

  const handleConfirmPasswordBlur = () => {
    setConfirmPasswordInlineError(getConfirmPasswordError(formData.password, formData.confirm_password));
  };

  const handleCheckedChange = (name: string, checked: boolean) => {
    setFormData(prev => ({ ...prev, [name]: checked }));
  };

  const customActivityLabel = t.signup_custom_activity_label;
  const customActivityPlaceholder = t.signup_custom_activity_placeholder;
  const readTermsLabel = t.signup_read_terms_label;

  const getPasswordError = (password: string) => {
    if (!password) return "";
    if (password.length < 8) return t.signup_password_min;
    if (/[\u0600-\u06FF]/.test(password)) return t.signup_password_english_only;
    if (/[^A-Za-z0-9@#$%&!_-]/.test(password)) return t.signup_password_allowed_symbols;
    if (!/[A-Z]/.test(password)) return t.signup_password_uppercase;
    if (!/[0-9]/.test(password)) return t.signup_password_number;
    return "";
  };

  const getConfirmPasswordError = (password: string, confirmPassword: string) => {
    if (!confirmPassword) return t.signup_confirm_password_required;
    return password === confirmPassword ? "" : t.signup_confirm_password_mismatch;
  };

  const getSignupServerErrorMessage = (serverError?: string) => {
    const message = String(serverError || "");
    if (message.includes("مسجل") || message.toLowerCase().includes("already")) {
      return t.signup_error_phone_exists;
    }
    return t.signup_create_error;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.owner_name.trim()) {
      toast.error(t.signup_owner_required);
      return;
    }

    if (!formData.store_name.trim()) {
      toast.error(t.signup_store_required);
      return;
    }

    if (!validatePhone(formData.phone)) {
      toast.error(t.phone_error);
      return;
    }

    if (!validatePassword(formData.password)) {
      const passwordError = getPasswordError(formData.password) || t.password_error;
      setPasswordInlineError(passwordError);
      toast.error(passwordError);
      return;
    }

    if (formData.password !== formData.confirm_password) {
      const confirmError = getConfirmPasswordError(formData.password, formData.confirm_password);
      setConfirmPasswordInlineError(confirmError);
      toast.error(confirmError);
      return;
    }

    if (!formData.activity_type) {
      toast.error(t.signup_activity_required);
      return;
    }

    if (isOther && !formData.custom_activity.trim()) {
      toast.error(t.signup_custom_activity_required);
      return;
    }

    if (!formData.agree_terms || !formData.confirm_legal) {
      toast.error(t.signup_terms_required);
      return;
    }

    setLoading(true);
    clearPendingSignupChallenge();

    try {
      const finalActivity = isOther ? formData.custom_activity.trim() : formData.activity_type;

      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_name: formData.owner_name.trim(),
          store_name: formData.store_name.trim(),
          phone: normalizePhoneNumber(formData.phone),
          password: formData.password.trim(),
          activity_type: finalActivity,
          language: lang,
          ...(requestedPlan ? { requested_plan: requestedPlan } : {}),
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result?.merchant) {
        toast.error(getSignupServerErrorMessage(result?.error));
        return;
      }

      const challenge = createOtpChallengeContext({
        challengeId: result.challenge_id,
        phone: result.merchant.phone,
        purpose: 'signup',
        expiresAt: result.expires_at,
        retryAfterSeconds: result.retry_after_seconds,
      });

      if (!challenge) {
        toast.error(t.signup_create_error);
        return;
      }

      cacheMerchantLocally(result.merchant);
      savePendingSignupChallenge(challenge);
      setLocation('/verify-otp');
    } catch (error) {
      console.error('Signup request failed:', error);
      toast.error(t.signup_connection_error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-[100dvh] flex items-center justify-center bg-muted/30 p-4 py-12"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-2xl bg-card p-8 rounded-3xl shadow-xl border">
        <div className="text-center mb-8">
          <Link
            href="/"
            className="inline-block text-3xl font-extrabold leading-none tracking-tight text-primary mb-4 fowri-header-brand-font"
          >
            {brandName}
          </Link>
          <h1 className="text-2xl font-bold">{t.signup_title}</h1>
          {requestedPlanLabel ? (
            <p
              className="mx-auto mt-3 w-fit rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-semibold text-foreground"
              data-testid="requested-plan"
            >
              {requestedPlanPrefix}: <span className="font-extrabold">{requestedPlanLabel}</span>
            </p>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* Basic info */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className={fieldHeaderClass}>
                <Label htmlFor="owner_name" className={fieldLabelClass}>{t.owner_name}</Label>
              </div>
              <Input id="owner_name" name="owner_name" required value={formData.owner_name} onChange={handleChange} className={fieldInputClass} data-testid="input-owner-name" />
            </div>
            <div className="space-y-2">
              <div className={fieldHeaderClass}>
                <Label htmlFor="store_name" className={fieldLabelClass}>{t.store_name}</Label>
              </div>
              <Input id="store_name" name="store_name" required value={formData.store_name} onChange={handleChange} className={fieldInputClass} data-testid="input-store-name" />
            </div>

            <div className="space-y-2">
              <div className={fieldHeaderClass}>
                <Label htmlFor="phone" className={fieldLabelClass}>{t.phone}</Label>
              </div>
              <Input id="phone" name="phone" type="tel" dir="ltr" placeholder="07..." required value={formData.phone} onChange={handleChange} onBlur={handlePhoneBlur} aria-invalid={!!phoneInlineError} className={`${fieldInputClass} ${phoneInlineError ? fieldInvalidInputClass : ''}`} data-testid="input-phone" />
                {phoneInlineError && (
                  <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
                    {phoneInlineError}
                  </p>
                )}
            </div>

            <div className="space-y-2">
              <div className={fieldHeaderClass}>
                <Label htmlFor="activity_type" className={fieldLabelClass}>{t.activity_type}</Label>
              </div>
              <Select
                value={formData.activity_type}
                onValueChange={(val) => setFormData(prev => ({ ...prev, activity_type: val, custom_activity: '' }))}
              >
                <SelectTrigger className={fieldInputClass} data-testid="select-activity">
                  <SelectValue placeholder="-" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ملابس">
                    {t.activity_fashion}
                  </SelectItem>
                  <SelectItem value="إلكترونيات">
                    {t.activity_electronics}
                  </SelectItem>
                  <SelectItem value="مواد غذائية">
                    {t.activity_food}
                  </SelectItem>
                  <SelectItem value="عطور">
                    {t.activity_perfumes}
                  </SelectItem>
                  <SelectItem value="مجوهرات">
                    {t.activity_jewelry}
                  </SelectItem>
                  <SelectItem value="أخرى">
                    {t.activity_other}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom activity field — only shown when "Other" is selected */}
            {isOther && (
              <div className="space-y-2 md:col-span-2">
                <div className={fieldHeaderClass}>
                  <Label htmlFor="custom_activity" className={fieldLabelClass}>{customActivityLabel}</Label>
                </div>
                <Input
                  id="custom_activity"
                  name="custom_activity"
                  value={formData.custom_activity}
                  onChange={handleChange}
                  placeholder={customActivityPlaceholder}
                  className={fieldInputClass}
                  data-testid="input-custom-activity"
                />
              </div>
            )}

            <div className="space-y-2">
              <div className={fieldHeaderClass}>
                <Label htmlFor="password" className={fieldLabelClass}>{t.password}</Label>
              </div>
              <PasswordInput
                id="password"
                name="password"
                dir="ltr"
                required
                value={formData.password}
                onChange={handleChange}
                onBlur={handlePasswordBlur}
                aria-invalid={!!passwordInlineError}
                className={`${fieldInputClass} ${passwordInlineError ? fieldInvalidInputClass : ''}`}
                data-testid="input-password"
              />
                {passwordInlineError && (
                  <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
                    {passwordInlineError}
                  </p>
                )}
            </div>
            <div className="space-y-2">
              <div className={fieldHeaderClass}>
                <Label htmlFor="confirm_password" className={fieldLabelClass}>{t.confirm_password}</Label>
              </div>
              <PasswordInput
                id="confirm_password"
                name="confirm_password"
                dir="ltr"
                required
                value={formData.confirm_password}
                onChange={handleChange}
                onBlur={handleConfirmPasswordBlur}
                aria-invalid={!!confirmPasswordInlineError}
                className={`${fieldInputClass} ${confirmPasswordInlineError ? fieldInvalidInputClass : ''}`}
                data-testid="input-confirm-password"
              />
                {confirmPasswordInlineError && (
                  <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
                    {confirmPasswordInlineError}
                  </p>
                )}
            </div>
          </div>


          {/* Agreements */}
          <div className="pt-4 border-t space-y-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="agree_terms"
                checked={formData.agree_terms}
                onCheckedChange={(c) => handleCheckedChange('agree_terms', !!c)}
                data-testid="checkbox-terms"
              />
              <div className="space-y-1">
                <Label htmlFor="agree_terms" className="leading-relaxed font-normal text-sm cursor-pointer">
                  {t.agree_terms}
                </Label>
                <button
                  type="button"
                  onClick={() => { setPolicyTab('privacy'); setShowPolicyModal(true); }}
                  className="block text-xs text-primary underline hover:no-underline"
                  data-testid="button-read-policy"
                >
                  {readTermsLabel}
                </button>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="confirm_legal"
                checked={formData.confirm_legal}
                onCheckedChange={(c) => handleCheckedChange('confirm_legal', !!c)}
                data-testid="checkbox-legal"
              />
              <Label htmlFor="confirm_legal" className="leading-relaxed font-normal text-sm cursor-pointer text-muted-foreground">
                {t.confirm_legal}
              </Label>
            </div>
          </div>

          <Button type="submit" className="w-full h-12 rounded-xl text-base font-bold mt-8" disabled={loading} data-testid="button-create-account">
            {loading ? '...' : t.create_account}
          </Button>

          <div className="text-center text-sm text-muted-foreground pt-4">
            {t.already_have_account}{' '}
            <Link href="/login" className="text-primary hover:underline font-semibold">
              {t.login}
            </Link>
          </div>
        </form>
      </div>

      {/* Privacy / Terms modal */}
      <PolicyModal
        open={showPolicyModal}
        onOpenChange={setShowPolicyModal}
        policyTab={policyTab}
        setPolicyTab={setPolicyTab}
      />
    </div>
  );
}
