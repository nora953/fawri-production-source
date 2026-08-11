import { LOGIN_PAGE_SECURITY_TEXT } from '@/lib/translations/features/pages/LoginPage';
import React, { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Link, useLocation } from 'wouter';
import {
  clearMerchantTabSession,
  getMerchants,
  saveMerchants,
  setSession,
} from '@/lib/store';
import {
  authDeviceLabel,
  getStableAuthDeviceId,
  secureAdminLogout,
  secureMerchantLogout,
} from '@/lib/authClientCutover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import ForgotPasswordModal from '@/components/ForgotPasswordModal';
import { PolicyModal, type PolicyTab, getPolicyReadLabel } from '@/components/PolicyModal';

function cacheMerchantLocally(merchant: any) {
  if (!merchant?.id) return;
  const merchants = getMerchants();
  const cleaned = merchants.filter(item => item.id !== merchant.id && item.phone !== merchant.phone);
  saveMerchants([merchant, ...cleaned]);
}

async function loginRequest(
  endpoint: '/api/auth/login' | '/api/auth/admin/login',
  phone: string,
  password: string,
) {
  const deviceId = getStableAuthDeviceId();
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Fawri-Device-Id': deviceId,
    },
    body: JSON.stringify({
      phone,
      password,
      device_id: deviceId,
      device_label: authDeviceLabel(),
    }),
  });
  return {
    response,
    result: await response.json().catch(() => null),
  };
}

export default function LoginPage() {
  const { t, lang, isRTL } = useI18n();
  const [, setLocation] = useLocation();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyTab, setPolicyTab] = useState<PolicyTab>('privacy');
  const securityText = LOGIN_PAGE_SECURITY_TEXT[lang];

  const showAuthError = (result: any) => {
    if (result?.code === 'ADMIN_DEVICE_APPROVAL_REQUIRED') {
      toast.error(securityText.approval, { duration: 9000 });
    } else if (result?.code === 'ADMIN_SESSION_LIMIT_REACHED') {
      toast.error(securityText.sessionLimit, { duration: 8000 });
    } else if (result?.code === 'ADMIN_DEVICE_ID_REQUIRED') {
      toast.error(securityText.deviceRequired);
    } else {
      toast.error(t.login_error_invalid);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const cleanPhone = phone.trim();
    const cleanPassword = password.trim();

    if (!cleanPhone || !cleanPassword) {
      toast.error(t.login_error_required);
      return;
    }

    setLoading(true);

    try {
      const merchantAttempt = await loginRequest(
        '/api/auth/login',
        cleanPhone,
        cleanPassword,
      );

      if (
        merchantAttempt.response.ok &&
        merchantAttempt.result?.ok &&
        merchantAttempt.result?.merchant_profile &&
        merchantAttempt.result?.merchant
      ) {
        await secureAdminLogout();
        const user = merchantAttempt.result.merchant;
        clearMerchantTabSession();
        cacheMerchantLocally(user);
        setSession(user.id);

        if (user.status === 'approved') {
          toast.success(t.login_success);
          setLocation('/dashboard');
          return;
        }
        if (user.status === 'pending_activation') {
          setLocation('/pending');
          return;
        }
        toast.error(
          user.status === 'suspended'
            ? t.login_account_suspended
            : t.login_account_rejected,
        );
        return;
      }

      const mayBeAdmin =
        merchantAttempt.response.status === 401 &&
        merchantAttempt.result?.code === 'INVALID_CREDENTIALS';
      if (!mayBeAdmin) {
        showAuthError(merchantAttempt.result);
        return;
      }

      const adminAttempt = await loginRequest(
        '/api/auth/admin/login',
        cleanPhone,
        cleanPassword,
      );
      if (
        adminAttempt.response.ok &&
        adminAttempt.result?.ok &&
        adminAttempt.result?.admin_profile &&
        adminAttempt.result?.admin?.is_admin === true
      ) {
        await secureMerchantLogout();
        clearMerchantTabSession();
        toast.success(t.login_success_admin);
        setLocation('/admin');
        return;
      }

      showAuthError(adminAttempt.result);
    } catch (error) {
      console.error('Login request failed:', error);
      toast.error(t.login_error_connection);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="w-full max-w-md rounded-3xl border bg-card p-8 shadow-xl md:translate-y-3">
          <div className="mb-8 flex flex-col items-center text-center">
            <Link href="/" className="mb-4 inline-block text-3xl font-extrabold leading-none tracking-tight text-primary fowri-header-brand-font">
              {lang === 'en' ? 'Fawri' : lang === 'ku' ? 'فورى' : 'فوري'}
            </Link>

            <h1 className="fowri-auth-title text-2xl font-extrabold">{t.login_title}</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <div className="space-y-2">
              <div className="flex min-h-5 items-center justify-between gap-3">
                <Label htmlFor="phone" className="leading-5">{t.phone}</Label>
              </div>
              <Input
                id="phone"
                type="tel"
                dir="ltr"
                value={phone}
                onChange={event => setPhone(event.target.value)}
                placeholder="07..."
                required
                className="h-12 rounded-xl"
                data-testid="input-phone"
              />
            </div>

            <div className="space-y-2">
              <div className="flex min-h-5 items-center justify-between gap-3">
                <Label htmlFor="password" className="leading-5">{t.password}</Label>

                <button
                  type="button"
                  onClick={() => setForgotPasswordOpen(true)}
                  className="text-sm font-semibold leading-5 text-primary hover:underline"
                >
                  {t.forgot_password}
                </button>
              </div>

              <PasswordInput
                id="password"
                dir="ltr"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
                className="h-12 rounded-xl"
                data-testid="input-password"
              />
            </div>

            <Button
              type="submit"
              className="h-12 w-full rounded-xl text-base font-bold"
              disabled={loading}
              data-testid="button-login"
            >
              {loading ? '...' : t.login}
            </Button>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {t.no_account}{' '}
              <Link href="/signup" className="font-semibold text-primary hover:underline">
                {t.create_account}
              </Link>
            </div>
          </form>

          <div className="mt-8 border-t pt-6 text-center">
            <button
              type="button"
              onClick={() => { setPolicyTab('privacy'); setShowPolicyModal(true); }}
              className="text-sm font-extrabold text-primary underline-offset-4 transition hover:underline"
              data-testid="button-read-policy-login"
            >
              {getPolicyReadLabel(lang)}
            </button>
          </div>
        </div>
      </div>

      <ForgotPasswordModal
        open={forgotPasswordOpen}
        onClose={() => setForgotPasswordOpen(false)}
      />

      <PolicyModal
        open={showPolicyModal}
        onOpenChange={setShowPolicyModal}
        policyTab={policyTab}
        setPolicyTab={setPolicyTab}
      />
    </>
  );
}
