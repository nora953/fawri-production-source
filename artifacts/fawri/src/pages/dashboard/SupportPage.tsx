import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Headphones,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';

import { useI18n } from '@/lib/i18n';
import {
  MERCHANT_REALTIME_EVENT,
  type MerchantRealtimeDetail,
} from '@/hooks/useMerchantRealtime';

type SupportCategory = 'technical' | 'billing' | 'channels' | 'account' | 'other';
type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type SupportSender = 'merchant' | 'admin' | 'system';

type SupportMessage = {
  id: string;
  sender_type: SupportSender;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
};

type SupportTicket = {
  id: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  assigned_admin_name?: string;
  created_at: string;
  updated_at: string;
  messages: SupportMessage[];
};

const categoryValues: SupportCategory[] = [
  'technical',
  'billing',
  'channels',
  'account',
  'other',
];

export default function SupportPage() {
  const { t, lang, dir } = useI18n();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportCategory>('technical');
  const [newMessage, setNewMessage] = useState('');
  const [reply, setReply] = useState('');
  const [creating, setCreating] = useState(false);
  const [replying, setReplying] = useState(false);
  const [formError, setFormError] = useState('');

  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';
  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) ?? null,
    [tickets, selectedId],
  );

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch('/api/auth/support/tickets', { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !Array.isArray(data.tickets)) {
        throw new Error('invalid support tickets response');
      }
      const nextTickets = data.tickets as SupportTicket[];
      setTickets(nextTickets);
      setSelectedId((current) =>
        current && nextTickets.some((ticket) => ticket.id === current)
          ? current
          : nextTickets[0]?.id ?? null,
      );
    } catch (error) {
      console.error('Could not load support tickets:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
    const handleFocus = () => void loadTickets();
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<MerchantRealtimeDetail>).detail;
      if (detail?.event === 'support_updated') void loadTickets();
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);
    };
  }, [loadTickets]);

  const categoryLabel = (value: SupportCategory) =>
    ({
      technical: t.support_category_technical,
      billing: t.support_category_billing,
      channels: t.support_category_channels,
      account: t.support_category_account,
      other: t.support_category_other,
    })[value];

  const statusLabel = (value: SupportStatus) =>
    ({
      open: t.support_status_open,
      in_progress: t.support_status_in_progress,
      resolved: t.support_status_resolved,
      closed: t.support_status_closed,
    })[value];

  const createTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanSubject = subject.trim();
    const cleanMessage = newMessage.trim();
    setFormError('');
    if (cleanSubject.length < 3) {
      setFormError(t.support_subject_required);
      return;
    }
    if (cleanMessage.length < 2) {
      setFormError(t.support_message_required);
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/auth/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: cleanSubject, category, message: cleanMessage }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.ticket) {
        throw new Error('could not create support ticket');
      }
      const ticket = data.ticket as SupportTicket;
      setTickets((current) => [
        ticket,
        ...current.filter((item) => item.id !== ticket.id),
      ]);
      setSelectedId(ticket.id);
      setSubject('');
      setCategory('technical');
      setNewMessage('');
      setShowCreate(false);
    } catch (error) {
      console.error('Could not create support ticket:', error);
      setFormError(t.support_create_error);
    } finally {
      setCreating(false);
    }
  };

  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = reply.trim();
    if (!selectedTicket || !body) return;
    setReplying(true);
    try {
      const response = await fetch(
        `/api/auth/support/tickets/${encodeURIComponent(selectedTicket.id)}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: body }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.ticket) {
        throw new Error('could not send support reply');
      }
      const ticket = data.ticket as SupportTicket;
      setTickets((current) =>
        [ticket, ...current.filter((item) => item.id !== ticket.id)].sort(
          (left, right) =>
            new Date(right.updated_at).getTime() -
            new Date(left.updated_at).getTime(),
        ),
      );
      setReply('');
      setFormError('');
    } catch (error) {
      console.error('Could not send support reply:', error);
      setFormError(t.support_reply_error);
    } finally {
      setReplying(false);
    }
  };

  return (
    <div
      className="mx-auto flex w-full max-w-6xl flex-col gap-3 md:h-[calc(100dvh-7rem)] md:min-h-0 md:overflow-hidden"
      dir={dir}
    >
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
              <Headphones className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-black leading-tight text-foreground sm:text-2xl">
              {t.support_title}
            </h1>
          </div>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {t.support_subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormError('');
            setShowCreate((current) => !current);
          }}
          className="inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? t.support_cancel : t.support_new_ticket}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={createTicket}
          className="shrink-0 rounded-2xl border bg-card p-3 shadow-sm sm:p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="mb-1.5 block text-start text-sm font-extrabold leading-none text-foreground">
                {t.support_subject}
              </span>
              <input
                value={subject}
                maxLength={120}
                disabled={creating}
                onChange={(event) => setSubject(event.target.value)}
                className="h-10 w-full rounded-xl border bg-background px-3 text-start text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-start text-sm font-extrabold leading-none text-foreground">
                {t.support_category}
              </span>
              <select
                value={category}
                disabled={creating}
                onChange={(event) =>
                  setCategory(event.target.value as SupportCategory)
                }
                className="h-10 w-full rounded-xl border bg-background px-3 text-start text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
              >
                {categoryValues.map((value) => (
                  <option key={value} value={value}>
                    {categoryLabel(value)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-3 block min-w-0">
            <span className="mb-1.5 block text-start text-sm font-extrabold leading-none text-foreground">
              {t.support_message}
            </span>
            <textarea
              value={newMessage}
              maxLength={4000}
              rows={3}
              disabled={creating}
              onChange={(event) => setNewMessage(event.target.value)}
              className="min-h-[82px] w-full resize-none rounded-xl border bg-background px-3 py-2 text-start text-sm leading-5 outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </label>

          <div className="mt-3 flex min-h-10 items-center justify-between gap-3">
            {formError ? (
              <p className="text-sm font-bold text-destructive">{formError}</p>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={creating}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {creating ? t.support_sending : t.support_send}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex min-h-52 flex-1 items-center justify-center rounded-2xl border bg-card text-muted-foreground md:min-h-0">
          <Loader2 className="me-2 h-5 w-5 animate-spin" />
          {t.support_loading}
        </div>
      ) : loadError ? (
        <div className="flex min-h-52 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-4 text-center md:min-h-0">
          <p className="font-bold">{t.support_load_error}</p>
          <button
            type="button"
            onClick={() => void loadTickets()}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold"
          >
            <RefreshCw className="h-4 w-4" />
            {t.support_retry}
          </button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex min-h-52 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed bg-card p-4 text-center md:min-h-0">
          <MessageCircle className="h-9 w-9 text-muted-foreground" />
          <h2 className="mt-3 text-base font-black">{t.support_empty_title}</h2>
          <p className="mt-1.5 max-w-md text-sm leading-5 text-muted-foreground">
            {t.support_empty_body}
          </p>
        </div>
      ) : (
        <div className="grid min-h-[520px] flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm md:min-h-0 lg:grid-cols-[300px_1fr]">
          <div className="min-h-0 border-b lg:border-b-0 lg:border-e">
            <div className="h-full max-h-64 space-y-2 overflow-y-auto p-3 lg:max-h-none">
              {tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className={`w-full rounded-xl border p-3 text-start transition ${
                    selectedId === ticket.id
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
                      : 'hover:bg-muted/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <strong className="line-clamp-2 text-sm">{ticket.subject}</strong>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-bold">
                      {statusLabel(ticket.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {categoryLabel(ticket.category)}
                  </p>
                  <time
                    className="mt-2 block text-[10px] text-muted-foreground"
                    dateTime={ticket.updated_at}
                  >
                    {new Date(ticket.updated_at).toLocaleString(locale)}
                  </time>
                </button>
              ))}
            </div>
          </div>

          {selectedTicket ? (
            <div className="flex min-h-0 flex-col">
              <div className="shrink-0 border-b p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-black">{selectedTicket.subject}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {categoryLabel(selectedTicket.category)}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold">
                    {statusLabel(selectedTicket.status)}
                  </span>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-3">
                {selectedTicket.messages.map((message) => {
                  const merchantMessage = message.sender_type === 'merchant';
                  return (
                    <article
                      key={message.id}
                      className={`flex ${
                        merchantMessage ? 'justify-start' : 'justify-end'
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                          merchantMessage
                            ? 'border bg-background'
                            : 'bg-orange-500 text-white'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] opacity-75">
                          <strong>{message.sender_name}</strong>
                          <time dateTime={message.created_at}>
                            {new Date(message.created_at).toLocaleString(locale)}
                          </time>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                          {message.body}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>

              {selectedTicket.status !== 'closed' &&
                selectedTicket.status !== 'resolved' && (
                  <form onSubmit={sendReply} className="flex shrink-0 gap-2 border-t p-3">
                    <textarea
                      value={reply}
                      rows={2}
                      maxLength={4000}
                      disabled={replying}
                      placeholder={t.support_reply_placeholder}
                      onChange={(event) => setReply(event.target.value)}
                      className="min-h-12 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                    <button
                      type="submit"
                      disabled={replying || !reply.trim()}
                      aria-label={t.support_reply}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
                    >
                      {replying ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </button>
                  </form>
                )}
              {formError && (
                <p className="shrink-0 px-4 pb-3 text-sm font-bold text-destructive">
                  {formError}
                </p>
              )}
            </div>
          ) : (
            <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground md:min-h-0">
              {t.support_select_ticket}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
