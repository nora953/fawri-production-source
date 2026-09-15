import { ADMIN_EMERGENCY_ACCESS_PAGE_TEXT } from '@/lib/translations/features/pages/AdminEmergencyAccessPage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Eye,
  FileWarning,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Store,
  XCircle,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

import { useI18n } from '@/lib/i18n';
import {
  clearSession,
  getAdminAuthHeaders,
  getAdminSessionToken,
} from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

type Lang = 'ar' | 'ku' | 'en';
type EmergencyStatus = 'pending' | 'active' | 'rejected' | 'expired' | 'ended';
type Severity = 'high' | 'critical';

type Authorization = {
  admin_id: string;
  admin_name: string;
  can_request: boolean;
  can_critical_self_activate: boolean;
  granted_by_owner_name: string;
  updated_at: string;
  revoked_at?: string;
};

type EmergencyRequest = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  requested_by_admin_id: string;
  requested_by_admin_name: string;
  incident_reference: string;
  severity: Severity;
  reason: string;
  duration_minutes: 15 | 30;
  read_only: true;
  status: EmergencyStatus;
  activation_mode: string;
  requested_at: string;
  request_expires_at?: string;
  reviewed_by_owner_name?: string;
  reviewed_at?: string;
  started_at?: string;
  expires_at?: string;
  ended_at?: string;
  end_reason?: string;
  viewed_sections: string[];
};

type OwnerAlert = {
  id: string;
  request_id: string;
  type: 'approval_required' | 'critical_self_activation';
  title: string;
  details: string;
  created_at: string;
};

type MerchantNotice = {
  id: string;
  merchant_id: string;
  request_id: string;
  incident_reference: string;
  accessed_by_admin_name: string;
  activation_mode: string;
  started_at: string;
  ended_at: string;
  created_at: string;
};

type Overview = {
  ok: boolean;
  is_owner: boolean;
  authorization: Authorization | null;
  authorizations?: Authorization[];
  requests: EmergencyRequest[];
  owner_alerts?: OwnerAlert[];
  merchant_notices?: MerchantNotice[];
  audit_chain?: {
    valid: boolean;
    event_count: number;
    latest_hash: string;
  };
};

type DirectoryMerchant = {
  id: string;
  store_name: string;
  owner_name: string;
  status: string;
};

type DirectoryAssistant = {
  id: string;
  owner_name: string;
  phone: string;
  status: string;
  admin_enabled: boolean;
};

type Directory = {
  ok: boolean;
  is_owner: boolean;
  merchants: DirectoryMerchant[];
  assistants?: DirectoryAssistant[];
};

type Snapshot = {
  merchant: Record<string, unknown>;
  subscription: Record<string, unknown> | null;
  products: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  conversations: Array<Record<string, unknown>>;
  saved_answers: Array<Record<string, unknown>>;
  training_requests: Array<Record<string, unknown>>;
  learned_answers: Array<Record<string, unknown>>;
  channels: Array<Record<string, unknown>>;
  counts: Record<string, number>;
  emergency_access: {
    request_id: string;
    incident_reference: string;
    severity: string;
    reason: string;
    expires_at: string;
  };
  generated_at: string;
};

const TEXT = ADMIN_EMERGENCY_ACCESS_PAGE_TEXT;

function formatDate(value: string | undefined, lang: Lang): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ');
}

function statusClass(status: EmergencyStatus): string {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
  if (status === 'pending') return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
  if (status === 'rejected') return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200';
  return 'bg-muted text-muted-foreground';
}

function safeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? '✓' : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function KeyValueGrid({ data }: { data: Record<string, unknown> | null }) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="rounded-lg border bg-background p-3">
          <p className="text-[11px] font-medium text-muted-foreground">{key.replaceAll('_', ' ')}</p>
          <p className="mt-1 break-words text-sm font-semibold">{safeValue(value)}</p>
        </div>
      ))}
    </div>
  );
}

function RecordList({ items, empty }: { items: Array<Record<string, unknown>>; empty: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={String(item.id || index)} className="rounded-lg border bg-background p-3">
          <KeyValueGrid data={item} />
        </div>
      ))}
    </div>
  );
}

export default function AdminEmergencyAccessPage() {
  const { lang } = useI18n();
  const text = TEXT[lang];
  const [, setLocation] = useLocation();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [snapshotRequestId, setSnapshotRequestId] = useState<string | null>(null);
  const [merchantId, setMerchantId] = useState('');
  const [incidentReference, setIncidentReference] = useState('');
  const [severity, setSeverity] = useState<Severity>('high');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState<'15' | '30'>('15');
  const [criticalSelfActivate, setCriticalSelfActivate] = useState(false);
  const [authorizationDrafts, setAuthorizationDrafts] = useState<Record<string, { canRequest: boolean; canCritical: boolean }>>({});

  const dir = lang === 'en' ? 'ltr' : 'rtl';
  const headers = useMemo(() => ({ ...getAdminAuthHeaders(), 'Content-Type': 'application/json' }), []);

  const handleUnauthorized = useCallback((response: Response) => {
    if (response.status === 401) {
      clearSession();
      setLocation('/login');
      return true;
    }
    return false;
  }, [setLocation]);

  const loadAll = useCallback(async (silent = false) => {
    if (!getAdminSessionToken()) {
      setLocation('/login');
      return;
    }
    if (!silent) {
      setLoading(true);
      setLoadError(false);
    }
    try {
      const [overviewResponse, directoryResponse] = await Promise.all([
        fetch('/api/auth/admin/emergency-read-access/overview', { headers, cache: 'no-store' }),
        fetch('/api/auth/admin/emergency-read-access/directory', { headers, cache: 'no-store' }),
      ]);
      if (handleUnauthorized(overviewResponse) || handleUnauthorized(directoryResponse)) return;
      const overviewData = (await overviewResponse.json().catch(() => null)) as Overview | null;
      const directoryData = (await directoryResponse.json().catch(() => null)) as Directory | null;
      if (!overviewResponse.ok || !directoryResponse.ok || !overviewData?.ok || !directoryData?.ok) {
        throw new Error('Emergency access load failed');
      }
      setOverview(overviewData);
      setDirectory(directoryData);
      const drafts: Record<string, { canRequest: boolean; canCritical: boolean }> = {};
      for (const assistant of directoryData.assistants || []) {
        const authorization = overviewData.authorizations?.find((item) => item.admin_id === assistant.id);
        drafts[assistant.id] = {
          canRequest: Boolean(authorization?.can_request && !authorization.revoked_at),
          canCritical: Boolean(authorization?.can_critical_self_activate && !authorization.revoked_at),
        };
      }
      setAuthorizationDrafts(drafts);
    } catch (error) {
      console.error('Emergency access load failed:', error);
      if (!silent) setLoadError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [handleUnauthorized, headers, setLocation]);

  useEffect(() => {
    void loadAll();
    const timer = window.setInterval(() => void loadAll(true), 10_000);
    return () => window.clearInterval(timer);
  }, [loadAll]);

  const createRequest = async () => {
    if (!merchantId || incidentReference.trim().length < 5 || reason.trim().length < 10) {
      toast.error(text.requestError);
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/admin/emergency-read-access/requests', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          merchant_id: merchantId,
          incident_reference: incidentReference.trim(),
          severity,
          reason: reason.trim(),
          duration_minutes: Number(duration),
          critical_self_activate: criticalSelfActivate,
        }),
      });
      if (handleUnauthorized(response)) return;
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Request failed');
      toast.success(text.requestSuccess);
      setIncidentReference('');
      setReason('');
      setCriticalSelfActivate(false);
      await loadAll(true);
    } catch (error) {
      console.error('Emergency access request failed:', error);
      toast.error(text.requestError);
    } finally {
      setSubmitting(false);
    }
  };

  const decideRequest = async (requestId: string, decision: 'approve' | 'reject') => {
    setBusyRequestId(requestId);
    try {
      const response = await fetch(`/api/auth/admin/emergency-read-access/requests/${encodeURIComponent(requestId)}/decision`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ decision }),
      });
      if (handleUnauthorized(response)) return;
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Decision failed');
      await loadAll(true);
    } catch (error) {
      console.error('Emergency access decision failed:', error);
      toast.error(text.requestError);
    } finally {
      setBusyRequestId(null);
    }
  };

  const endRequest = async (requestId: string) => {
    setBusyRequestId(requestId);
    try {
      const response = await fetch(`/api/auth/admin/emergency-read-access/requests/${encodeURIComponent(requestId)}/end`, {
        method: 'POST',
        headers,
      });
      if (handleUnauthorized(response)) return;
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'End failed');
      if (snapshotRequestId === requestId) {
        setSnapshot(null);
        setSnapshotRequestId(null);
      }
      await loadAll(true);
    } catch (error) {
      console.error('Emergency access end failed:', error);
      toast.error(text.requestError);
    } finally {
      setBusyRequestId(null);
    }
  };

  const openSnapshot = async (requestId: string) => {
    setBusyRequestId(requestId);
    try {
      const response = await fetch(`/api/auth/admin/emergency-read-access/requests/${encodeURIComponent(requestId)}/snapshot`, {
        headers,
        cache: 'no-store',
      });
      if (handleUnauthorized(response)) return;
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.snapshot) throw new Error(data?.error || 'Snapshot failed');
      setSnapshot(data.snapshot as Snapshot);
      setSnapshotRequestId(requestId);
    } catch (error) {
      console.error('Emergency snapshot load failed:', error);
      toast.error(text.loadError);
    } finally {
      setBusyRequestId(null);
    }
  };

  const saveAuthorization = async (assistantId: string) => {
    const draft = authorizationDrafts[assistantId];
    if (!draft) return;
    setBusyRequestId(assistantId);
    try {
      const response = await fetch(`/api/auth/admin/emergency-read-access/authorizations/${encodeURIComponent(assistantId)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          can_request: draft.canRequest,
          can_critical_self_activate: draft.canRequest && draft.canCritical,
        }),
      });
      if (handleUnauthorized(response)) return;
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Authorization failed');
      toast.success(text.authorizationSaved);
      await loadAll(true);
    } catch (error) {
      console.error('Emergency authorization update failed:', error);
      toast.error(text.requestError);
    } finally {
      setBusyRequestId(null);
    }
  };

  const statusLabel = (status: EmergencyStatus) => text[status];
  const activationLabel = (mode: string) =>
    mode === 'critical_self_activation'
      ? text.criticalSelf
      : mode === 'owner_direct_activation'
        ? text.ownerDirect
        : text.ownerApproval;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" dir={dir}>
        <div className="flex items-center gap-3 text-sm font-semibold text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {text.loading}
        </div>
      </div>
    );
  }

  if (loadError || !overview || !directory) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4" dir={dir}>
        <Card className="w-full max-w-md">
          <CardContent className="py-10 text-center">
            <ShieldOff className="mx-auto h-10 w-10 text-destructive" />
            <p className="mt-4 font-semibold">{text.loadError}</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="outline" onClick={() => setLocation('/admin')}>{text.back}</Button>
              <Button onClick={() => void loadAll()}>{text.retry}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allowed = overview.is_owner || overview.authorization?.can_request;

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-destructive/10 p-2 text-destructive">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black sm:text-xl">{text.title}</h1>
              <p className="hidden max-w-3xl text-xs text-muted-foreground sm:block">{text.subtitle}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setLocation('/admin')}>
            <ArrowLeft className={`h-4 w-4 ${dir === 'rtl' ? 'ml-2 rotate-180' : 'mr-2'}`} />
            {text.back}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 md:px-6">
        {!allowed ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ShieldOff className="mx-auto h-10 w-10 text-destructive" />
              <p className="mt-3 font-semibold">{text.noAuthorization}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-destructive/30">
              <CardContent className="flex items-start gap-3 py-4 text-sm">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <p className="leading-6">{text.subtitle}</p>
              </CardContent>
            </Card>

            <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
              <Card>
                <CardHeader><CardTitle className="text-base">{text.requestTitle}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>{text.merchant}</Label>
                    <Select value={merchantId} onValueChange={setMerchantId}>
                      <SelectTrigger><SelectValue placeholder={text.chooseMerchant} /></SelectTrigger>
                      <SelectContent>
                        {directory.merchants.map((merchant) => (
                          <SelectItem key={merchant.id} value={merchant.id}>
                            {merchant.store_name} — {merchant.owner_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{text.incidentReference}</Label>
                    <Input value={incidentReference} onChange={(event) => setIncidentReference(event.target.value)} placeholder={text.incidentPlaceholder} dir="ltr" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>{text.severity}</Label>
                      <Select value={severity} onValueChange={(value) => setSeverity(value as Severity)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">{text.high}</SelectItem>
                          <SelectItem value="critical">{text.critical}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{text.duration}</Label>
                      <Select value={duration} onValueChange={(value) => setDuration(value as '15' | '30')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">{text.minutes15}</SelectItem>
                          <SelectItem value="30">{text.minutes30}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{text.reason}</Label>
                    <Textarea rows={5} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={text.reasonPlaceholder} />
                  </div>

                  {!overview.is_owner && overview.authorization?.can_critical_self_activate && severity === 'critical' && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                      <label className="flex items-start gap-3">
                        <Checkbox checked={criticalSelfActivate} onCheckedChange={(checked) => setCriticalSelfActivate(checked === true)} />
                        <span>
                          <span className="block text-sm font-semibold">{text.criticalActivate}</span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{text.criticalActivateHelp}</span>
                        </span>
                      </label>
                    </div>
                  )}

                  <Button className="w-full" disabled={submitting} onClick={() => void createRequest()}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                    <span className={dir === 'rtl' ? 'mr-2' : 'ml-2'}>{submitting ? text.activating : text.submit}</span>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-base">{text.requestsTitle}</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => void loadAll(true)}>
                    <RefreshCw className="h-4 w-4" />
                    <span className={dir === 'rtl' ? 'mr-2' : 'ml-2'}>{text.refresh}</span>
                  </Button>
                </CardHeader>
                <CardContent>
                  {overview.requests.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">{text.emptyRequests}</p>
                  ) : (
                    <div className="space-y-3">
                      {overview.requests.map((request) => (
                        <div key={request.id} className="rounded-xl border bg-card p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-bold">{request.merchant_name}</p>
                              <p className="mt-1 font-mono text-xs text-muted-foreground" dir="ltr">{request.incident_reference}</p>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(request.status)}`}>{statusLabel(request.status)}</span>
                          </div>
                          <p className="mt-3 text-sm leading-6">{request.reason}</p>
                          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                            <span>{text.requester}: <strong className="text-foreground">{request.requested_by_admin_name}</strong></span>
                            <span>{text.requestedAt}: <strong className="text-foreground">{formatDate(request.requested_at, lang)}</strong></span>
                            <span>{text.activationMode}: <strong className="text-foreground">{activationLabel(request.activation_mode)}</strong></span>
                            <span>{text.expiresAt}: <strong className="text-foreground">{formatDate(request.expires_at || request.request_expires_at, lang)}</strong></span>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {overview.is_owner && request.status === 'pending' && (
                              <>
                                <Button size="sm" disabled={busyRequestId === request.id} onClick={() => void decideRequest(request.id, 'approve')}>
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span className={dir === 'rtl' ? 'mr-2' : 'ml-2'}>{text.approve}</span>
                                </Button>
                                <Button size="sm" variant="destructive" disabled={busyRequestId === request.id} onClick={() => void decideRequest(request.id, 'reject')}>
                                  <XCircle className="h-4 w-4" />
                                  <span className={dir === 'rtl' ? 'mr-2' : 'ml-2'}>{text.reject}</span>
                                </Button>
                              </>
                            )}
                            {request.status === 'active' && request.requested_by_admin_id !== '' && (
                              <>
                                {(!overview.is_owner || request.requested_by_admin_id === overview.authorization?.admin_id) && (
                                  <Button size="sm" variant="outline" disabled={busyRequestId === request.id} onClick={() => void openSnapshot(request.id)}>
                                    <Eye className="h-4 w-4" />
                                    <span className={dir === 'rtl' ? 'mr-2' : 'ml-2'}>{text.view}</span>
                                  </Button>
                                )}
                                <Button size="sm" variant="destructive" disabled={busyRequestId === request.id} onClick={() => void endRequest(request.id)}>
                                  <ShieldOff className="h-4 w-4" />
                                  <span className={dir === 'rtl' ? 'mr-2' : 'ml-2'}>{text.end}</span>
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {overview.is_owner && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{text.authorizationsTitle}</CardTitle>
                    <p className="text-sm text-muted-foreground">{text.authorizationHelp}</p>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    {(directory.assistants || []).map((assistant) => {
                      const draft = authorizationDrafts[assistant.id] || { canRequest: false, canCritical: false };
                      return (
                        <div key={assistant.id} className="rounded-xl border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold">{assistant.owner_name}</p>
                              <p className="mt-1 font-mono text-xs text-muted-foreground" dir="ltr">{assistant.phone}</p>
                            </div>
                            {assistant.admin_enabled ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <ShieldOff className="h-5 w-5 text-destructive" />}
                          </div>
                          <div className="mt-4 space-y-3">
                            <label className="flex items-center gap-3 text-sm">
                              <Checkbox checked={draft.canRequest} onCheckedChange={(checked) => setAuthorizationDrafts((current) => ({ ...current, [assistant.id]: { canRequest: checked === true, canCritical: checked === true ? current[assistant.id]?.canCritical || false : false } }))} />
                              {text.allowRequest}
                            </label>
                            <label className="flex items-center gap-3 text-sm">
                              <Checkbox disabled={!draft.canRequest} checked={draft.canCritical} onCheckedChange={(checked) => setAuthorizationDrafts((current) => ({ ...current, [assistant.id]: { canRequest: true, canCritical: checked === true } }))} />
                              {text.allowCritical}
                            </label>
                          </div>
                          <Button className="mt-4 w-full" size="sm" disabled={busyRequestId === assistant.id || !assistant.admin_enabled} onClick={() => void saveAuthorization(assistant.id)}>{text.saveAuthorization}</Button>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <div className="grid gap-5 lg:grid-cols-3">
                  <Card>
                    <CardHeader><CardTitle className="text-base">{text.auditTitle}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3 rounded-xl border bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                        <ShieldCheck className="h-6 w-6" />
                        <div>
                          <p className="font-bold">{text.auditValid}</p>
                          <p className="text-xs">{text.events}: {overview.audit_chain?.event_count || 0}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle className="text-base">{text.ownerAlertsTitle}</CardTitle></CardHeader>
                    <CardContent>
                      {(overview.owner_alerts || []).length === 0 ? <p className="text-sm text-muted-foreground">{text.noAlerts}</p> : (
                        <div className="space-y-2">
                          {(overview.owner_alerts || []).slice(0, 5).map((alert) => (
                            <div key={alert.id} className="rounded-lg border p-3 text-sm">
                              <p className="font-semibold">{alert.details}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{formatDate(alert.created_at, lang)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle className="text-base">{text.merchantNoticesTitle}</CardTitle></CardHeader>
                    <CardContent>
                      {(overview.merchant_notices || []).length === 0 ? <p className="text-sm text-muted-foreground">{text.noNotices}</p> : (
                        <div className="space-y-2">
                          {(overview.merchant_notices || []).slice(0, 5).map((notice) => (
                            <div key={notice.id} className="rounded-lg border p-3 text-sm">
                              <p className="font-semibold">{notice.incident_reference}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{notice.accessed_by_admin_name} · {formatDate(notice.created_at, lang)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </>
        )}

        {snapshot && (
          <Card className="border-primary/40">
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><Eye className="h-5 w-5" />{text.snapshotTitle}</CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">{text.snapshotSubtitle}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setSnapshot(null); setSnapshotRequestId(null); }}>{text.closeSnapshot}</Button>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border bg-destructive/5 p-3"><FileWarning className="h-5 w-5 text-destructive" /><p className="mt-2 text-sm font-bold">{snapshot.emergency_access.incident_reference}</p></div>
                <div className="rounded-xl border p-3"><Clock3 className="h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-bold">{formatDate(snapshot.emergency_access.expires_at, lang)}</p></div>
                <div className="rounded-xl border p-3"><Store className="h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-bold">{safeValue(snapshot.merchant.store_name)}</p></div>
              </div>

              {[
                [text.storeSection, <KeyValueGrid data={snapshot.merchant} />],
                [text.subscriptionSection, snapshot.subscription ? <KeyValueGrid data={snapshot.subscription} /> : <p className="text-sm text-muted-foreground">{text.empty}</p>],
                [text.productsSection, <RecordList items={snapshot.products} empty={text.empty} />],
                [text.ordersSection, <RecordList items={snapshot.orders} empty={text.empty} />],
                [text.conversationsSection, <RecordList items={snapshot.conversations} empty={text.empty} />],
                [text.channelsSection, <RecordList items={snapshot.channels} empty={text.empty} />],
                [text.savedSection, <RecordList items={[...snapshot.saved_answers, ...snapshot.training_requests, ...snapshot.learned_answers]} empty={text.empty} />],
              ].map(([title, content]) => (
                <section key={String(title)} className="rounded-xl border bg-muted/10 p-4">
                  <h2 className="mb-3 font-bold">{title}</h2>
                  {content}
                </section>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
