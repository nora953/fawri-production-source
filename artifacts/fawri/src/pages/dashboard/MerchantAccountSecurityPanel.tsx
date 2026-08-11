import { MERCHANT_ACCOUNT_SECURITY_PANEL_COPY } from '@/lib/translations/features/pages/dashboard/MerchantAccountSecurityPanel';
import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Laptop, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { clearMerchantTabSession } from '@/lib/store';
import { useI18n } from '@/lib/i18n';

type UiLanguage = 'ar' | 'ku' | 'en';

type MerchantAccountResponse = {
  ok: boolean;
  error?: string;
  code?: string;
  account?: {
    id: string;
    phone: string;
    kind: 'merchant';
    enabled: boolean;
    otp_verified: boolean;
  };
  merchant_profile?: {
    merchantId: string;
    tenantId: string;
    ownerName: string;
    storeName: string;
    activityType: string;
    language: UiLanguage;
    accountStatus: string;
    onboardingStatus: string;
    requestedPlan: 'silver' | 'gold' | 'diamond' | null;
    createdAt: string;
  };
};

type PublicMerchantSession = {
  id: string;
  account_id: string;
  account_kind: 'merchant';
  tenant_id: string;
  account_version: number;
  permissions: string[];
  device_hash?: string;
  device_label: string;
  created_at: string;
  last_seen_at: string;
  idle_expires_at: string;
  absolute_expires_at: string;
  rotate_after: string;
};

type SessionsResponse = {
  ok: boolean;
  error?: string;
  code?: string;
  current_session_id?: string;
  sessions?: PublicMerchantSession[];
};

type ActionResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  reauthentication_required?: boolean;
};

type Copy = {
  securityTitle: string;
  securityDescription: string;
  profileTitle: string;
  profileReadOnly: string;
  owner: string;
  store: string;
  phone: string;
  activity: string;
  accountStatus: string;
  createdAt: string;
  unavailable: string;
  sessionsTitle: string;
  sessionsDescription: string;
  currentSession: string;
  otherSession: string;
  lastSeen: string;
  created: string;
  expires: string;
  revoke: string;
  revokeConfirm: string;
  revokeSuccess: string;
  noOtherSessions: string;
  passwordTitle: string;
  passwordDescription: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  changePassword: string;
  passwordChanging: string;
  logoutAllTitle: string;
  logoutAllDescription: string;
  logoutAll: string;
  logoutAllConfirm: string;
  loading: string;
  retry: string;
  genericError: string;
};

const COPY: Record<UiLanguage, Copy> = MERCHANT_ACCOUNT_SECURITY_PANEL_COPY;

async function readJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

function responseError(body: ActionResponse | null, fallback: string): string {
  return body?.error || body?.code || fallback;
}

function redirectToLogin(): void {
  clearMerchantTabSession();
  window.location.href = '/login';
}

export default function MerchantAccountSecurityPanel() {
  const { lang } = useI18n();
  const language = (lang === 'en' || lang === 'ku' ? lang : 'ar') as UiLanguage;
  const copy = COPY[language];
  const [account, setAccount] = useState<MerchantAccountResponse | null>(null);
  const [sessions, setSessions] = useState<PublicMerchantSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'ar-IQ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
    [language],
  );

  const formatDate = (value: string | undefined) => {
    const timestamp = value ? new Date(value) : null;
    return timestamp && Number.isFinite(timestamp.getTime())
      ? dateFormatter.format(timestamp)
      : copy.unavailable;
  };

  const loadSecurity = async () => {
    setLoading(true);
    setLoadError('');
    setActionError('');

    try {
      const [accountResponse, sessionsResponse] = await Promise.all([
        fetch('/api/auth/me', {
          credentials: 'same-origin',
          cache: 'no-store',
        }),
        fetch('/api/auth/sessions', {
          credentials: 'same-origin',
          cache: 'no-store',
        }),
      ]);

      if (accountResponse.status === 401 || sessionsResponse.status === 401) {
        redirectToLogin();
        return;
      }

      const [accountBody, sessionsBody] = await Promise.all([
        readJson<MerchantAccountResponse>(accountResponse),
        readJson<SessionsResponse>(sessionsResponse),
      ]);

      if (!accountResponse.ok || !accountBody?.ok || !accountBody.account || !accountBody.merchant_profile) {
        throw new Error(accountBody?.error || accountBody?.code || copy.genericError);
      }
      if (!sessionsResponse.ok || !sessionsBody?.ok || !Array.isArray(sessionsBody.sessions)) {
        throw new Error(sessionsBody?.error || sessionsBody?.code || copy.genericError);
      }

      setAccount(accountBody);
      setCurrentSessionId(String(sessionsBody.current_session_id || ''));
      setSessions(sessionsBody.sessions);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : copy.genericError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSecurity();
  }, []);

  const orderedSessions = useMemo(
    () => [...sessions].sort((left, right) => {
      if (left.id === currentSessionId) return -1;
      if (right.id === currentSessionId) return 1;
      return new Date(right.last_seen_at).getTime() - new Date(left.last_seen_at).getTime();
    }),
    [currentSessionId, sessions],
  );

  const otherSessionCount = orderedSessions.filter(session => session.id !== currentSessionId).length;

  const revokeSession = async (sessionId: string) => {
    if (!sessionId || sessionId === currentSessionId || !window.confirm(copy.revokeConfirm)) return;
    setBusyAction(`revoke:${sessionId}`);
    setActionError('');
    setActionSuccess('');

    try {
      const response = await fetch(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (response.status === 401) {
        redirectToLogin();
        return;
      }
      const body = await readJson<ActionResponse>(response);
      if (!response.ok || body?.ok !== true) {
        throw new Error(responseError(body, copy.genericError));
      }
      setSessions(current => current.filter(session => session.id !== sessionId));
      setActionSuccess(copy.revokeSuccess);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : copy.genericError);
    } finally {
      setBusyAction('');
    }
  };

  const logoutAll = async () => {
    if (!window.confirm(copy.logoutAllConfirm)) return;
    setBusyAction('logout-all');
    setActionError('');
    setActionSuccess('');

    try {
      const response = await fetch('/api/auth/logout-all', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const body = await readJson<ActionResponse>(response);
      if (!response.ok || body?.ok !== true) {
        if (response.status === 401) {
          redirectToLogin();
          return;
        }
        throw new Error(responseError(body, copy.genericError));
      }
      redirectToLogin();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : copy.genericError);
      setBusyAction('');
    }
  };

  const submitPasswordChange = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyAction('password');
    setActionError('');
    setActionSuccess('');

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      const body = await readJson<ActionResponse>(response);
      if (!response.ok || body?.ok !== true || body.reauthentication_required !== true) {
        if (response.status === 401 && body?.code !== 'CURRENT_PASSWORD_INVALID') {
          redirectToLogin();
          return;
        }
        throw new Error(responseError(body, copy.genericError));
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      redirectToLogin();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : copy.genericError);
      setBusyAction('');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm font-medium text-muted-foreground">
          {copy.loading}
        </CardContent>
      </Card>
    );
  }

  if (loadError || !account?.account || !account.merchant_profile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{copy.securityTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {loadError || copy.genericError}
          </p>
          <Button type="button" variant="outline" onClick={() => void loadSecurity()}>
            {copy.retry}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const profile = account.merchant_profile;

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <CardTitle>{copy.securityTitle}</CardTitle>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.securityDescription}</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {(actionError || actionSuccess) && (
        <div
          role="status"
          className={`rounded-md border p-3 text-sm ${
            actionError
              ? 'border-destructive/40 bg-destructive/5 text-destructive'
              : 'border-border bg-muted/40 text-foreground'
          }`}
        >
          {actionError || actionSuccess}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <CardTitle>{copy.profileTitle}</CardTitle>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.profileReadOnly}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            [copy.owner, profile.ownerName],
            [copy.store, profile.storeName],
            [copy.phone, account.account.phone],
            [copy.activity, profile.activityType],
            [copy.accountStatus, profile.accountStatus],
            [copy.createdAt, formatDate(profile.createdAt)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="mt-1 break-words font-semibold">{value || copy.unavailable}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <Laptop className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <CardTitle>{copy.sessionsTitle}</CardTitle>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.sessionsDescription}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {orderedSessions.map(session => {
            const isCurrent = session.id === currentSessionId;
            const revokeBusy = busyAction === `revoke:${session.id}`;
            return (
              <div key={session.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words font-semibold">{session.device_label || copy.unavailable}</p>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {isCurrent ? copy.currentSession : copy.otherSession}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-1 text-xs leading-5 text-muted-foreground sm:grid-cols-3 sm:gap-x-4">
                      <span>{copy.lastSeen}: {formatDate(session.last_seen_at)}</span>
                      <span>{copy.created}: {formatDate(session.created_at)}</span>
                      <span>{copy.expires}: {formatDate(session.absolute_expires_at)}</span>
                    </div>
                  </div>
                  {!isCurrent && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={Boolean(busyAction)}
                      onClick={() => void revokeSession(session.id)}
                    >
                      {revokeBusy ? '…' : copy.revoke}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {otherSessionCount === 0 && (
            <p className="text-sm text-muted-foreground">{copy.noOtherSessions}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <CardTitle>{copy.passwordTitle}</CardTitle>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.passwordDescription}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={submitPasswordChange}>
            <label className="space-y-2 text-sm font-medium">
              <span>{copy.currentPassword}</span>
              <Input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={event => setCurrentPassword(event.target.value)}
                required
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>{copy.newPassword}</span>
              <Input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={event => setNewPassword(event.target.value)}
                required
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>{copy.confirmPassword}</span>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                required
              />
            </label>
            <div className="md:col-span-3">
              <Button type="submit" disabled={Boolean(busyAction)}>
                {busyAction === 'password' ? copy.passwordChanging : copy.changePassword}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <LogOut className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <CardTitle>{copy.logoutAllTitle}</CardTitle>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.logoutAllDescription}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="destructive"
            disabled={Boolean(busyAction)}
            onClick={() => void logoutAll()}
          >
            {copy.logoutAll}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
