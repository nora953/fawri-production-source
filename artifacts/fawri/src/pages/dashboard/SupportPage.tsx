import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Eye,
  Headphones,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';

import { useI18n } from '@/lib/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  MERCHANT_REALTIME_EVENT,
  type MerchantRealtimeDetail,
} from '@/hooks/useMerchantRealtime';

type SupportCategory = 'technical' | 'billing' | 'channels' | 'account' | 'other';
type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type SupportWaitingOn = 'admin' | 'merchant';
type SupportSender = 'merchant' | 'admin' | 'system';
type InspectionSessionMode = 'live_observation' | 'independent_read_only';
type InspectionSessionRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired';
type InspectionConsentDecision = 'approved' | 'rejected';
type InspectionSessionEndReason =
  | 'request_timeout'
  | 'approval_window_expired'
  | 'ticket_resolved'
  | 'ticket_closed'
  | 'merchant_terminated';

type InspectionSessionRequest = {
  id: string;
  ticket_id: string;
  merchant_id: string;
  admin_id: string;
  admin_name: string;
  mode: InspectionSessionMode;
  reason: string;
  status: InspectionSessionRequestStatus;
  consent_decision?: InspectionConsentDecision;
  end_reason?: InspectionSessionEndReason;
  ended_at?: string;
  read_only: true;
  session_duration_minutes: 30;
  requested_at: string;
  request_expires_at: string;
  responded_at?: string;
  approved_at?: string;
  rejected_at?: string;
  expired_at?: string;
  session_expires_at?: string;
};

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
  closed_at?: string;
  waiting_on?: SupportWaitingOn;
  waiting_since?: string;
  merchant_reminder_sent_at?: string;
  auto_closed_at?: string;
  auto_closed_reason?: 'merchant_inactivity';
  messages: SupportMessage[];
  inspection_requests?: InspectionSessionRequest[];
};

const INSPECTION_TEXT = {
  ar: {
    title: 'طلب فحص حسابك',
    viewDetails: 'عرض التفاصيل',
    requestedBy: 'المسؤول الطالب',
    mode: 'نوع الجلسة',
    live: 'مشاهدة مباشرة أثناء استخدامك للحساب',
    readOnly: 'فحص مستقل للقراءة فقط',
    reason: 'سبب الطلب',
    rules: 'لن يستطيع المسؤول التعديل أو الحفظ أو الإرسال أو التصدير. مدة الجلسة 30 دقيقة، ويمكنك الرفض.',
    pending: 'بانتظار قرارك',
    approved: 'تمت الموافقة',
    rejected: 'تم الرفض',
    expired: 'انتهت صلاحية الطلب',
    approve: 'موافقة',
    reject: 'رفض',
    deciding: 'جارٍ الحفظ...',
    decisionError: 'تعذر حفظ قرارك.',
    requestExpires: 'ينتهي الطلب',
    approvedUntil: 'تنتهي الموافقة',
    decisionAt: 'وقت القرار',
    endedAt: 'وقت الانتهاء',
    requestTimeout: 'انتهى الطلب دون رد',
    approvalExpired: 'انتهت مدة الموافقة',
    ticketResolved: 'انتهت بسبب حل التذكرة',
    ticketClosed: 'انتهت بسبب إغلاق التذكرة',
    merchantTerminated: 'تم إنهاء الجلسة من قبلك',
    terminate: 'إنهاء الجلسة',
    terminateConfirm: 'هل أنت متأكد من إنهاء جلسة الفحص؟ ستتوقف صلاحية الفحص فورًا.',
    confirmTerminate: 'تأكيد الإنهاء',
    cancelTerminate: 'تراجع',
    terminating: 'جارٍ الإنهاء...',
    terminateError: 'تعذر إنهاء الجلسة.',
  },
  ku: {
    title: 'داواکاری پشکنینی هەژمارەکەت',
    viewDetails: 'بینینی وردەکارییەکان',
    requestedBy: 'بەرپرسی داواکار',
    mode: 'جۆری دانیشتن',
    live: 'بینینی ڕاستەوخۆ لە کاتی بەکارهێنانی هەژمار',
    readOnly: 'پشکنینی سەربەخۆی تەنها خوێندنەوە',
    reason: 'هۆکاری داواکاری',
    rules: 'بەرپرس ناتوانێت دەستکاری، پاشەکەوت، ناردن یان هەناردە بکات. ماوەکە 30 خولەکە و دەتوانیت ڕەتی بکەیتەوە.',
    pending: 'چاوەڕوانی بڕیارت',
    approved: 'ڕەزامەندی درا',
    rejected: 'ڕەت کرایەوە',
    expired: 'کاتی داواکاری بەسەرچوو',
    approve: 'ڕەزامەندی',
    reject: 'ڕەتکردنەوە',
    deciding: 'پاشەکەوت دەکرێت...',
    decisionError: 'پاشەکەوتکردنی بڕیار سەرکەوتوو نەبوو.',
    requestExpires: 'داواکاری کۆتایی دێت',
    approvedUntil: 'ڕەزامەندی کۆتایی دێت',
    decisionAt: 'کاتی بڕیار',
    endedAt: 'کاتی کۆتایی',
    requestTimeout: 'داواکاری بێ وەڵام کۆتایی هات',
    approvalExpired: 'ماوەی ڕەزامەندی کۆتایی هات',
    ticketResolved: 'بە چارەسەرکردنی تیکێت کۆتایی هات',
    ticketClosed: 'بە داخستنی تیکێت کۆتایی هات',
    merchantTerminated: 'دانیشتنەکەت کۆتایی پێهێنا',
    terminate: 'کۆتاییهێنان بە دانیشتن',
    terminateConfirm: 'دڵنیایت دەتەوێت دانیشتنی پشکنین کۆتایی پێبهێنیت؟ دەسەڵاتی پشکنین دەستبەجێ دەوەستێت.',
    confirmTerminate: 'پشتڕاستکردنەوەی کۆتاییهێنان',
    cancelTerminate: 'پاشگەزبوونەوە',
    terminating: 'کۆتایی پێدەهێنرێت...',
    terminateError: 'کۆتاییهێنان بە دانیشتن سەرکەوتوو نەبوو.',
  },
  en: {
    title: 'Account inspection request',
    viewDetails: 'View details',
    requestedBy: 'Requested by',
    mode: 'Session mode',
    live: 'Live observation while you use the account',
    readOnly: 'Independent read-only inspection',
    reason: 'Reason',
    rules: 'The administrator cannot edit, save, send, or export. The session lasts 30 minutes, and you may reject it.',
    pending: 'Waiting for your decision',
    approved: 'Approved',
    rejected: 'Rejected',
    expired: 'Request expired',
    approve: 'Approve',
    reject: 'Reject',
    deciding: 'Saving...',
    decisionError: 'Could not save your decision.',
    requestExpires: 'Request expires',
    approvedUntil: 'Approval expires',
    decisionAt: 'Decision time',
    endedAt: 'Ended at',
    requestTimeout: 'Request expired without a response',
    approvalExpired: 'Approval period ended',
    ticketResolved: 'Ended because the ticket was resolved',
    ticketClosed: 'Ended because the ticket was closed',
    merchantTerminated: 'You ended the session',
    terminate: 'End session',
    terminateConfirm: 'Are you sure you want to end the inspection session? Inspection access will stop immediately.',
    confirmTerminate: 'Confirm end',
    cancelTerminate: 'Cancel',
    terminating: 'Ending...',
    terminateError: 'Could not end the session.',
  },
} as const;

const SUPPORT_LIFECYCLE_TEXT = {
  ar: {
    waitingForYou: 'بانتظار ردك',
    waitingForSupport: 'بانتظار رد فريق الدعم',
    autoClosed: 'أُغلقت لعدم ورود رد منك خلال 72 ساعة.',
  },
  ku: {
    waitingForYou: 'چاوەڕوانی وەڵامەکەت',
    waitingForSupport: 'چاوەڕوانی وەڵامی تیمی پشتگیری',
    autoClosed: 'بەهۆی نەگەیشتنی وەڵامت لە ماوەی ٧٢ کاتژمێردا داخرا.',
  },
  en: {
    waitingForYou: 'Waiting for your reply',
    waitingForSupport: 'Waiting for support',
    autoClosed: 'Closed because no reply was received from you for 72 hours.',
  },
} as const;

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
  const [inspectionDecision, setInspectionDecision] = useState<'approve' | 'reject' | null>(null);
  const [confirmInspectionTermination, setConfirmInspectionTermination] = useState(false);
  const [terminatingInspection, setTerminatingInspection] = useState(false);
  const [inspectionTerminationError, setInspectionTerminationError] = useState('');
  const [showInspectionDetails, setShowInspectionDetails] = useState(false);
  const [formError, setFormError] = useState('');
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const requestedTicketIdRef = useRef<string | null>(
    new URLSearchParams(window.location.search).get('ticket'),
  );

  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';
  const inspectionDateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    [locale],
  );
  const kurdishInspectionDateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    [],
  );
  const formatInspectionDateTime = (value: string) => {
    const date = new Date(value);
    if (lang !== 'ku') return inspectionDateTimeFormatter.format(date);

    const parts = kurdishInspectionDateTimeFormatter.formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value ?? '';

    return `${part('year')}/${part('month')}/${part('day')} — ${part('hour')}:${part('minute')}`;
  };
  const inspectionText = lang === 'en' ? INSPECTION_TEXT.en : lang === 'ku' ? INSPECTION_TEXT.ku : INSPECTION_TEXT.ar;
  const lifecycleText =
    lang === 'en'
      ? SUPPORT_LIFECYCLE_TEXT.en
      : lang === 'ku'
        ? SUPPORT_LIFECYCLE_TEXT.ku
        : SUPPORT_LIFECYCLE_TEXT.ar;
  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) ?? null,
    [tickets, selectedId],
  );
  const selectedLastMessageId =
    selectedTicket?.messages[selectedTicket.messages.length - 1]?.id ?? null;
  const latestInspectionRequest = selectedTicket?.inspection_requests?.[0] ?? null;
  const latestInspectionDecision: InspectionConsentDecision | null = latestInspectionRequest
    ? latestInspectionRequest.consent_decision ||
      (latestInspectionRequest.status === 'approved'
        ? 'approved'
        : latestInspectionRequest.status === 'rejected'
          ? 'rejected'
          : null)
    : null;
  const latestInspectionEndLabel = latestInspectionRequest
    ? latestInspectionRequest.end_reason === 'request_timeout'
      ? inspectionText.requestTimeout
      : latestInspectionRequest.end_reason === 'approval_window_expired'
        ? inspectionText.approvalExpired
        : latestInspectionRequest.end_reason === 'ticket_resolved'
          ? inspectionText.ticketResolved
          : latestInspectionRequest.end_reason === 'ticket_closed'
            ? inspectionText.ticketClosed
            : latestInspectionRequest.end_reason === 'merchant_terminated'
              ? inspectionText.merchantTerminated
              : null
    : null;
  const latestInspectionStatusLabel = latestInspectionRequest
    ? latestInspectionDecision === 'approved'
      ? inspectionText.approved
      : latestInspectionDecision === 'rejected'
        ? inspectionText.rejected
        : latestInspectionRequest.status === 'pending'
          ? inspectionText.pending
          : inspectionText.expired
    : '';
  const latestInspectionModeLabel = latestInspectionRequest
    ? latestInspectionRequest.mode === 'live_observation'
      ? inspectionText.live
      : inspectionText.readOnly
    : '';
  const latestInspectionToneClass = latestInspectionRequest
    ? latestInspectionDecision === 'approved'
      ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
      : latestInspectionDecision === 'rejected'
        ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
        : latestInspectionRequest.status === 'pending'
          ? 'border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30'
          : 'border-border bg-muted/40'
    : '';

  useLayoutEffect(() => {
    const conversation = conversationRef.current;
    if (loading || !conversation || !selectedLastMessageId) return;

    const frameId = window.requestAnimationFrame(() => {
      conversation.scrollTo({
        top: conversation.scrollHeight,
        behavior: 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [loading, selectedId, selectedLastMessageId]);

  const loadTickets = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setLoadError(false);
    }
    try {
      const response = await fetch('/api/auth/support/tickets', { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !Array.isArray(data.tickets)) {
        throw new Error('invalid support tickets response');
      }
      const nextTickets = data.tickets as SupportTicket[];
      setTickets(nextTickets);
      const requestedTicketId = requestedTicketIdRef.current;
      const requestedTicketExists = Boolean(
        requestedTicketId &&
          nextTickets.some((ticket) => ticket.id === requestedTicketId),
      );
      if (requestedTicketExists) {
        requestedTicketIdRef.current = null;
        window.history.replaceState(null, '', window.location.pathname);
      }
      setSelectedId((current) =>
        requestedTicketExists
          ? requestedTicketId
          : current && nextTickets.some((ticket) => ticket.id === current)
            ? current
            : nextTickets[0]?.id ?? null,
      );
    } catch (error) {
      console.error('Could not load support tickets:', error);
      if (!silent) setLoadError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
    const intervalId = window.setInterval(() => void loadTickets(true), 10_000);
    const handleFocus = () => void loadTickets(true);
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<MerchantRealtimeDetail>).detail;
      if (detail?.event === 'support_updated') void loadTickets(true);
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener(MERCHANT_REALTIME_EVENT, handleRealtime);
    return () => {
      window.clearInterval(intervalId);
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

  const statusLabel = (ticket: SupportTicket) => {
    if (ticket.status === 'closed' && ticket.auto_closed_reason === 'merchant_inactivity') {
      return lifecycleText.autoClosed;
    }
    if (ticket.status === 'open' || ticket.status === 'in_progress') {
      return ticket.waiting_on === 'merchant'
        ? lifecycleText.waitingForYou
        : lifecycleText.waitingForSupport;
    }
    return ({
      open: t.support_status_open,
      in_progress: t.support_status_in_progress,
      resolved: t.support_status_resolved,
      closed: t.support_status_closed,
    })[ticket.status];
  };

  const ticketStatusClass = (value: SupportStatus) =>
    ({
      open: 'border-border bg-card hover:bg-muted/60',
      in_progress:
        'border-yellow-300 bg-yellow-50 hover:bg-yellow-100/70 dark:border-yellow-800 dark:bg-yellow-950/30 dark:hover:bg-yellow-950/45',
      resolved:
        'border-green-300 bg-green-50 hover:bg-green-100/70 dark:border-green-800 dark:bg-green-950/30 dark:hover:bg-green-950/45',
      closed:
        'border-red-300 bg-red-50 hover:bg-red-100/70 dark:border-red-800 dark:bg-red-950/30 dark:hover:bg-red-950/45',
    })[value];

  const statusBadgeClass = (value: SupportStatus) =>
    ({
      open: 'bg-muted text-foreground',
      in_progress:
        'bg-yellow-100 text-yellow-900 dark:bg-yellow-950/70 dark:text-yellow-100',
      resolved:
        'bg-green-100 text-green-900 dark:bg-green-950/70 dark:text-green-100',
      closed: 'bg-red-100 text-red-900 dark:bg-red-950/70 dark:text-red-100',
    })[value];

  const respondToInspectionRequest = async (decision: 'approve' | 'reject') => {
    if (!selectedTicket || !latestInspectionRequest || latestInspectionRequest.status !== 'pending') return;

    setInspectionDecision(decision);
    setFormError('');
    try {
      const response = await fetch(
        `/api/auth/support/tickets/${encodeURIComponent(selectedTicket.id)}/inspection-requests/${encodeURIComponent(latestInspectionRequest.id)}/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.ticket) {
        throw new Error(data?.error || 'could not save inspection decision');
      }
      const ticket = data.ticket as SupportTicket;
      setTickets((current) =>
        [ticket, ...current.filter((item) => item.id !== ticket.id)].sort(
          (left, right) =>
            new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
        ),
      );
      setSelectedId(ticket.id);
    } catch (error) {
      console.error('Could not save inspection decision:', error);
      setFormError(inspectionText.decisionError);
    } finally {
      setInspectionDecision(null);
    }
  };

  const terminateInspectionRequest = async () => {
    if (
      !selectedTicket ||
      !latestInspectionRequest ||
      latestInspectionDecision !== 'approved' ||
      latestInspectionRequest.ended_at
    ) {
      return;
    }

    setTerminatingInspection(true);
    setInspectionTerminationError('');
    try {
      const response = await fetch(
        `/api/auth/support/tickets/${encodeURIComponent(selectedTicket.id)}/inspection-requests/${encodeURIComponent(latestInspectionRequest.id)}/terminate`,
        { method: 'POST' },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.ticket) {
        throw new Error(data?.error || 'could not terminate inspection session');
      }

      const ticket = data.ticket as SupportTicket;
      setTickets((current) =>
        [ticket, ...current.filter((item) => item.id !== ticket.id)].sort(
          (left, right) =>
            new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
        ),
      );
      setSelectedId(ticket.id);
      setConfirmInspectionTermination(false);
    } catch (error) {
      console.error('Could not terminate inspection session:', error);
      setInspectionTerminationError(inspectionText.terminateError);
    } finally {
      setTerminatingInspection(false);
    }
  };

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
          className={
            showCreate
              ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border bg-card text-muted-foreground shadow-sm transition hover:bg-muted'
              : 'inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground'
          }
          aria-label={showCreate ? t.support_cancel : t.support_new_ticket}
          title={showCreate ? t.support_cancel : t.support_new_ticket}
        >
          {showCreate ? (
            <X className="h-4 w-4" />
          ) : (
            <>
              <Plus className="h-4 w-4" />
              {t.support_new_ticket}
            </>
          )}
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
              <div className="relative">
                <select
                  value={category}
                  disabled={creating}
                  onChange={(event) =>
                    setCategory(event.target.value as SupportCategory)
                  }
                  className="h-10 w-full appearance-none rounded-xl border bg-background ps-3 pe-10 text-start text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
                >
                  {categoryValues.map((value) => (
                    <option key={value} value={value}>
                      {categoryLabel(value)}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
              </div>
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

          <div className="mt-3 flex min-h-10 flex-wrap items-center justify-start gap-3">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {creating ? t.support_sending : t.support_send}
            </button>
            {formError && (
              <p className="text-sm font-bold text-destructive">{formError}</p>
            )}
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
                  className={`w-full rounded-xl border p-3 text-start transition ${ticketStatusClass(
                    ticket.status,
                  )} ${
                    selectedId === ticket.id
                      ? 'ring-2 ring-foreground/20 ring-offset-1 ring-offset-background'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <strong className="line-clamp-2 text-sm">{ticket.subject}</strong>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${statusBadgeClass(
                        ticket.status,
                      )}`}
                    >
                      {statusLabel(ticket)}
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
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(
                      selectedTicket.status,
                    )}`}
                  >
                    {statusLabel(selectedTicket)}
                  </span>
                </div>
                {selectedTicket.auto_closed_reason === 'merchant_inactivity' && (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-900 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100">
                    {lifecycleText.autoClosed}
                  </p>
                )}
              </div>

              {latestInspectionRequest && (
                <>
                  <div className={`shrink-0 border-b px-3 py-2 ${latestInspectionToneClass}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                        <strong>{inspectionText.title}</strong>
                        <span className="rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-black">
                          {latestInspectionStatusLabel}
                        </span>
                        <span className="max-w-full truncate text-muted-foreground sm:max-w-[320px]">
                          {latestInspectionModeLabel}
                        </span>
                        {latestInspectionEndLabel && (
                          <span className="rounded-full border bg-background/70 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                            {latestInspectionEndLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowInspectionDetails(true)}
                          className="inline-flex h-8 shrink-0 items-center gap-2 rounded-xl border bg-background px-3 text-xs font-bold shadow-sm"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {inspectionText.viewDetails}
                        </button>

                        {latestInspectionRequest.status === 'pending' && !latestInspectionRequest.ended_at && (
                          <>
                            <button
                              type="button"
                              disabled={inspectionDecision !== null}
                              onClick={() => void respondToInspectionRequest('approve')}
                              className="inline-flex h-8 shrink-0 items-center justify-center rounded-xl bg-green-600 px-3 text-xs font-bold text-white transition hover:bg-green-700 disabled:opacity-60"
                            >
                              {inspectionDecision === 'approve' ? inspectionText.deciding : inspectionText.approve}
                            </button>
                            <button
                              type="button"
                              disabled={inspectionDecision !== null}
                              onClick={() => void respondToInspectionRequest('reject')}
                              className="inline-flex h-8 shrink-0 items-center justify-center rounded-xl bg-red-600 px-3 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                            >
                              {inspectionDecision === 'reject' ? inspectionText.deciding : inspectionText.reject}
                            </button>
                          </>
                        )}

                        {latestInspectionDecision === 'approved' &&
                          latestInspectionRequest.session_expires_at &&
                          !latestInspectionRequest.ended_at && (
                            <button
                              type="button"
                              disabled={terminatingInspection}
                              onClick={() => {
                                setInspectionTerminationError('');
                                setConfirmInspectionTermination(true);
                                setShowInspectionDetails(true);
                              }}
                              className="inline-flex h-8 shrink-0 items-center justify-center rounded-xl bg-red-600 px-3 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                            >
                              {inspectionText.terminate}
                            </button>
                          )}
                      </div>
                    </div>
                  </div>

                  <Dialog
                    open={showInspectionDetails}
                    onOpenChange={(open) => {
                      setShowInspectionDetails(open);
                      if (!open) {
                        setConfirmInspectionTermination(false);
                        setInspectionTerminationError('');
                      }
                    }}
                  >
                    <DialogContent
                      className="max-w-xl"
                      closeButtonClassName={dir === 'rtl' ? 'left-4 right-auto top-3' : 'left-auto right-4 top-3'}
                      dir={dir}
                      onOpenAutoFocus={(event) => event.preventDefault()}
                    >
                      <DialogHeader className="min-h-10 justify-center">
                        <DialogTitle className="pe-12 text-start">{inspectionText.title}</DialogTitle>
                      </DialogHeader>

                      <div className={`rounded-xl border px-4 pb-4 pt-3 ${latestInspectionToneClass}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="rounded-full bg-background/80 px-2.5 py-1 text-xs font-black">
                            {latestInspectionStatusLabel}
                          </span>
                          {latestInspectionEndLabel && (
                            <span className="rounded-full border bg-background/70 px-2.5 py-1 text-xs font-bold text-muted-foreground">
                              {latestInspectionEndLabel}
                            </span>
                          )}
                        </div>

                        <div className="mt-3 space-y-2 text-sm leading-6">
                          <p><strong>{inspectionText.requestedBy}:</strong> {latestInspectionRequest.admin_name}</p>
                          <p><strong>{inspectionText.mode}:</strong> {latestInspectionModeLabel}</p>
                          <p className="whitespace-pre-wrap"><strong>{inspectionText.reason}:</strong> {latestInspectionRequest.reason}</p>
                        </div>

                        <p className="mt-3 rounded-lg border bg-background/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
                          {inspectionText.rules}
                        </p>

                        {latestInspectionRequest.responded_at && latestInspectionDecision && (
                          <p className="mt-2 pb-1 text-xs text-muted-foreground">
                            {inspectionText.decisionAt}: <bdi dir="ltr">{formatInspectionDateTime(latestInspectionRequest.responded_at)}</bdi>
                          </p>
                        )}

                        {latestInspectionRequest.ended_at && latestInspectionEndLabel && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {inspectionText.endedAt}: <bdi dir="ltr">{formatInspectionDateTime(latestInspectionRequest.ended_at)}</bdi>
                          </p>
                        )}

                        {latestInspectionRequest.status === 'pending' && !latestInspectionRequest.ended_at && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {inspectionText.requestExpires}: <bdi dir="ltr">{formatInspectionDateTime(latestInspectionRequest.request_expires_at)}</bdi>
                          </p>
                        )}

                        {latestInspectionDecision === 'approved' && latestInspectionRequest.session_expires_at && !latestInspectionRequest.ended_at && (
                          <div className="mt-3 space-y-3">
                            <p className="text-xs font-semibold text-green-800 dark:text-green-200">
                              {inspectionText.approvedUntil}: <bdi dir="ltr">{formatInspectionDateTime(latestInspectionRequest.session_expires_at)}</bdi>
                            </p>

                            {confirmInspectionTermination && (
                              <div className="rounded-xl border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
                                <p className="text-xs font-semibold leading-5 text-red-900 dark:text-red-100">
                                  {inspectionText.terminateConfirm}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={terminatingInspection}
                                    onClick={() => void terminateInspectionRequest()}
                                    className="inline-flex h-9 items-center justify-center rounded-xl bg-red-600 px-4 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                                  >
                                    {terminatingInspection
                                      ? inspectionText.terminating
                                      : inspectionText.confirmTerminate}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={terminatingInspection}
                                    onClick={() => {
                                      setConfirmInspectionTermination(false);
                                      setInspectionTerminationError('');
                                    }}
                                    className="inline-flex h-9 items-center justify-center rounded-xl border bg-background px-4 text-xs font-bold disabled:opacity-60"
                                  >
                                    {inspectionText.cancelTerminate}
                                  </button>
                                </div>
                              </div>
                            )}

                            {inspectionTerminationError && (
                              <p className="text-xs font-bold text-red-700 dark:text-red-300">
                                {inspectionTerminationError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}

              <div
                ref={conversationRef}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-muted/20 p-3"
              >
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
