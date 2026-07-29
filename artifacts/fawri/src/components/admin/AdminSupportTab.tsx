import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Headphones,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import { useI18n } from '@/lib/i18n';
import { getAdminAuthHeaders } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export type AdminSupportTicketStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed';

type AdminSupportCategory =
  | 'technical'
  | 'billing'
  | 'channels'
  | 'account'
  | 'other';

type AdminSupportMessage = {
  id: string;
  sender_type: 'merchant' | 'admin' | 'system';
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
};

export type AdminSupportTicket = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_phone: string;
  subject: string;
  category: AdminSupportCategory;
  status: AdminSupportTicketStatus;
  assigned_admin_id?: string;
  assigned_admin_name?: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  messages: AdminSupportMessage[];
};

const SUPPORT_TEXT = {
  ar: {
    tab: 'الدعم',
    title: 'تذاكر دعم التجار',
    subtitle: 'متابعة شكاوى التجار ومحادثاتهم مع فريق الدعم.',
    ownerNotice: 'وضع المراقبة فقط: يمكنك مشاهدة سير العمل دون استلام التذاكر أو الرد عليها.',
    newTicketNotification: 'وصلت تذكرة دعم جديدة من أحد التجار.',
    loading: 'جارٍ تحميل تذاكر الدعم...',
    loadError: 'تعذر تحميل تذاكر الدعم.',
    retry: 'إعادة المحاولة',
    emptyTitle: 'لا توجد تذاكر دعم',
    emptyBody: 'ستظهر هنا التذاكر التي يرسلها التجار.',
    activeTickets: 'التذاكر النشطة',
    ticket: 'التذكرة',
    merchant: 'المتجر',
    phone: 'الهاتف',
    assignedTo: 'المسؤول المستلم',
    unassigned: 'لم يستلمها مسؤول بعد',
    claim: 'استلام التذكرة',
    claiming: 'جارٍ الاستلام...',
    claimSuccess: 'تم استلام التذكرة وأصبحت قيد المعالجة.',
    claimError: 'تعذر استلام التذكرة.',
    assignedOther: 'هذه التذكرة مستلمة من مسؤول آخر.',
    replyPlaceholder: 'اكتب ردك للتاجر...',
    sendReply: 'إرسال الرد',
    replySuccess: 'تم إرسال الرد إلى التاجر.',
    replyError: 'تعذر إرسال الرد.',
    markResolved: 'تم حل المشكلة',
    resolving: 'جارٍ الإغلاق...',
    resolveSuccess: 'تم تسجيل التذكرة على أنها محلولة.',
    resolveError: 'تعذر تحديث حالة التذكرة.',
    statusOpen: 'مفتوحة',
    statusInProgress: 'قيد المعالجة',
    statusResolved: 'تم الحل',
    statusClosed: 'مغلقة',
    categoryTechnical: 'مشكلة تقنية',
    categoryBilling: 'الاشتراك والدفع',
    categoryChannels: 'القنوات',
    categoryAccount: 'الحساب',
    categoryOther: 'أخرى',
    logClaimed: 'استلام تذكرة دعم',
    logReplied: 'الرد على تذكرة دعم',
    logResolved: 'حل تذكرة دعم',
    logInProgress: 'تذكرة دعم قيد المعالجة',
  },
  ku: {
    tab: 'پشتگیری',
    title: 'تیکێتەکانی پشتگیریی بازرگانان',
    subtitle: 'بەدواداچوونی کێشە و گفتوگۆکانی بازرگانان لەگەڵ تیمی پشتگیری.',
    ownerNotice: 'تەنها چاودێریکردن: دەتوانیت ڕەوتی کار ببینیت بەبێ وەرگرتن یان وەڵامدانەوەی تیکێتەکان.',
    newTicketNotification: 'تیکێتێکی نوێی پشتگیری لە بازرگانێکەوە گەیشت.',
    loading: 'تیکێتەکانی پشتگیری بار دەکرێن...',
    loadError: 'بارکردنی تیکێتەکانی پشتگیری سەرکەوتوو نەبوو.',
    retry: 'هەوڵدانەوە',
    emptyTitle: 'هیچ تیکێتی پشتگیری نییە',
    emptyBody: 'تیکێتە نێردراوەکانی بازرگانان لێرە دەردەکەون.',
    activeTickets: 'تیکێتە چالاکەکان',
    ticket: 'تیکێت',
    merchant: 'فرۆشگا',
    phone: 'تەلەفۆن',
    assignedTo: 'بەرپرسی وەرگر',
    unassigned: 'هێشتا هیچ بەرپرسێک وەری نەگرتووە',
    claim: 'وەرگرتنی تیکێت',
    claiming: 'وەردەگیرێت...',
    claimSuccess: 'تیکێتەکە وەرگیرا و خراوەتە ژێر چارەسەرکردن.',
    claimError: 'وەرگرتنی تیکێت سەرکەوتوو نەبوو.',
    assignedOther: 'ئەم تیکێتە لەلایەن بەرپرسێکی ترەوە وەرگیراوە.',
    replyPlaceholder: 'وەڵامەکەت بۆ بازرگان بنووسە...',
    sendReply: 'ناردنی وەڵام',
    replySuccess: 'وەڵام بۆ بازرگان نێردرا.',
    replyError: 'ناردنی وەڵام سەرکەوتوو نەبوو.',
    markResolved: 'کێشەکە چارەسەر کرا',
    resolving: 'دادەخرێت...',
    resolveSuccess: 'تیکێتەکە وەک چارەسەرکراو تۆمار کرا.',
    resolveError: 'نوێکردنەوەی دۆخی تیکێت سەرکەوتوو نەبوو.',
    statusOpen: 'کراوە',
    statusInProgress: 'لە ژێر چارەسەرکردندا',
    statusResolved: 'چارەسەر کرا',
    statusClosed: 'داخراوە',
    categoryTechnical: 'کێشەی تەکنیکی',
    categoryBilling: 'بەشداریکردن و پارەدان',
    categoryChannels: 'کەناڵەکان',
    categoryAccount: 'هەژمار',
    categoryOther: 'هی تر',
    logClaimed: 'وەرگرتنی تیکێتی پشتگیری',
    logReplied: 'وەڵامدانەوەی تیکێتی پشتگیری',
    logResolved: 'چارەسەرکردنی تیکێتی پشتگیری',
    logInProgress: 'تیکێتی پشتگیری لە ژێر چارەسەرکردندا',
  },
  en: {
    tab: 'Support',
    title: 'Merchant Support Tickets',
    subtitle: 'Monitor merchant issues and conversations with the support team.',
    ownerNotice: 'Monitor-only mode: you can review workflow but cannot claim tickets or reply.',
    newTicketNotification: 'A new merchant support ticket has arrived.',
    loading: 'Loading support tickets...',
    loadError: 'Could not load support tickets.',
    retry: 'Try again',
    emptyTitle: 'No support tickets',
    emptyBody: 'Tickets submitted by merchants will appear here.',
    activeTickets: 'Active tickets',
    ticket: 'Ticket',
    merchant: 'Store',
    phone: 'Phone',
    assignedTo: 'Assigned administrator',
    unassigned: 'Not assigned yet',
    claim: 'Claim ticket',
    claiming: 'Claiming...',
    claimSuccess: 'The ticket is now assigned and in progress.',
    claimError: 'Could not claim the ticket.',
    assignedOther: 'This ticket is assigned to another administrator.',
    replyPlaceholder: 'Write your reply to the merchant...',
    sendReply: 'Send reply',
    replySuccess: 'Reply sent to the merchant.',
    replyError: 'Could not send the reply.',
    markResolved: 'Mark resolved',
    resolving: 'Closing...',
    resolveSuccess: 'The ticket was marked as resolved.',
    resolveError: 'Could not update the ticket status.',
    statusOpen: 'Open',
    statusInProgress: 'In progress',
    statusResolved: 'Resolved',
    statusClosed: 'Closed',
    categoryTechnical: 'Technical issue',
    categoryBilling: 'Subscription and billing',
    categoryChannels: 'Channels',
    categoryAccount: 'Account',
    categoryOther: 'Other',
    logClaimed: 'Support ticket claimed',
    logReplied: 'Support ticket replied',
    logResolved: 'Support ticket resolved',
    logInProgress: 'Support ticket in progress',
  },
} as const;

export function getAdminSupportText(language: string) {
  return language === 'en'
    ? SUPPORT_TEXT.en
    : language === 'ku'
      ? SUPPORT_TEXT.ku
      : SUPPORT_TEXT.ar;
}

type AdminSupportTabProps = {
  adminId: string;
  isOwner: boolean;
  onActiveCountChange?: (count: number) => void;
};

export default function AdminSupportTab({
  adminId,
  isOwner,
  onActiveCountChange,
}: AdminSupportTabProps) {
  const { lang } = useI18n();
  const text = getAdminSupportText(lang);
  const dir = lang === 'en' ? 'ltr' : 'rtl';
  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reply, setReply] = useState('');
  const [working, setWorking] = useState<'claim' | 'reply' | 'resolve' | null>(null);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) ?? null,
    [selectedId, tickets],
  );

  const activeCount = useMemo(
    () =>
      tickets.filter(
        (ticket) => ticket.status === 'open' || ticket.status === 'in_progress',
      ).length,
    [tickets],
  );

  useEffect(() => {
    onActiveCountChange?.(activeCount);
  }, [activeCount, onActiveCountChange]);

  const loadTickets = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch('/api/auth/admin/support/tickets', {
        headers: getAdminAuthHeaders(),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !Array.isArray(data.tickets)) {
        throw new Error(data?.error || 'invalid support response');
      }
      const nextTickets = data.tickets as AdminSupportTicket[];
      setTickets(nextTickets);
      setSelectedId((current) =>
        current && nextTickets.some((ticket) => ticket.id === current)
          ? current
          : nextTickets[0]?.id ?? null,
      );
    } catch (error) {
      console.error('Could not load admin support tickets:', error);
      if (!silent) setLoadError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
    const intervalId = window.setInterval(() => void loadTickets(true), 10_000);
    const handleFocus = () => void loadTickets(true);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadTickets]);

  const replaceTicket = (ticket: AdminSupportTicket) => {
    setTickets((current) =>
      [ticket, ...current.filter((item) => item.id !== ticket.id)].sort(
        (left, right) =>
          new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      ),
    );
    setSelectedId(ticket.id);
  };

  const claimTicket = async () => {
    if (!selectedTicket || isOwner) return;
    setWorking('claim');
    try {
      const response = await fetch(
        `/api/auth/admin/support/tickets/${encodeURIComponent(selectedTicket.id)}/claim`,
        { method: 'POST', headers: getAdminAuthHeaders() },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.ticket) {
        throw new Error(data?.error || 'could not claim ticket');
      }
      replaceTicket(data.ticket as AdminSupportTicket);
      toast.success(text.claimSuccess);
    } catch (error) {
      console.error('Could not claim support ticket:', error);
      toast.error(text.claimError);
    } finally {
      setWorking(null);
    }
  };

  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = reply.trim();
    if (!selectedTicket || !body || isOwner) return;
    setWorking('reply');
    try {
      const response = await fetch(
        `/api/auth/admin/support/tickets/${encodeURIComponent(selectedTicket.id)}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
          body: JSON.stringify({ message: body }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.ticket) {
        throw new Error(data?.error || 'could not reply');
      }
      replaceTicket(data.ticket as AdminSupportTicket);
      setReply('');
      toast.success(text.replySuccess);
    } catch (error) {
      console.error('Could not reply to support ticket:', error);
      toast.error(text.replyError);
    } finally {
      setWorking(null);
    }
  };

  const resolveTicket = async () => {
    if (!selectedTicket || isOwner) return;
    setWorking('resolve');
    try {
      const response = await fetch(
        `/api/auth/admin/support/tickets/${encodeURIComponent(selectedTicket.id)}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
          body: JSON.stringify({ status: 'resolved' }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.ticket) {
        throw new Error(data?.error || 'could not resolve ticket');
      }
      replaceTicket(data.ticket as AdminSupportTicket);
      toast.success(text.resolveSuccess);
    } catch (error) {
      console.error('Could not resolve support ticket:', error);
      toast.error(text.resolveError);
    } finally {
      setWorking(null);
    }
  };

  const statusLabel = (status: AdminSupportTicketStatus) =>
    ({
      open: text.statusOpen,
      in_progress: text.statusInProgress,
      resolved: text.statusResolved,
      closed: text.statusClosed,
    })[status];

  const categoryLabel = (category: AdminSupportCategory) =>
    ({
      technical: text.categoryTechnical,
      billing: text.categoryBilling,
      channels: text.categoryChannels,
      account: text.categoryAccount,
      other: text.categoryOther,
    })[category];

  const isAssignedToCurrentAdmin = selectedTicket?.assigned_admin_id === adminId;
  const isAssignedToOther = Boolean(
    selectedTicket?.assigned_admin_id && !isAssignedToCurrentAdmin,
  );
  const ticketIsActive =
    selectedTicket?.status === 'open' || selectedTicket?.status === 'in_progress';

  return (
    <section className="space-y-3" dir={dir}>
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Headphones className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-black">{text.title}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{text.subtitle}</p>
        </div>
        <div className="rounded-xl border bg-muted/30 px-3 py-2 text-center">
          <p className="text-[10px] font-medium text-muted-foreground">{text.activeTickets}</p>
          <p className="mt-0.5 text-lg font-black tabular-nums">{activeCount}</p>
        </div>
      </div>

      {isOwner && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold leading-6 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100">
          {text.ownerNotice}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-80 items-center justify-center rounded-2xl border bg-card text-muted-foreground">
          <Loader2 className="me-2 h-5 w-5 animate-spin" />
          {text.loading}
        </div>
      ) : loadError ? (
        <div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-2xl border bg-card p-6 text-center">
          <p className="font-bold">{text.loadError}</p>
          <Button variant="outline" onClick={() => void loadTickets()}>
            <RefreshCw className="me-2 h-4 w-4" />
            {text.retry}
          </Button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed bg-card p-6 text-center">
          <MessageCircle className="h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 font-black">{text.emptyTitle}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{text.emptyBody}</p>
        </div>
      ) : (
        <div className="grid min-h-[540px] overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[330px_1fr]">
          <div className="border-b lg:border-b-0 lg:border-e">
            <div className="max-h-72 space-y-2 overflow-y-auto p-3 lg:max-h-[640px]">
              {tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className={`w-full rounded-xl border p-3 text-start transition ${
                    selectedId === ticket.id
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <strong className="line-clamp-2 text-sm">{ticket.subject}</strong>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-bold">
                      {statusLabel(ticket.status)}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-xs font-semibold">{ticket.merchant_name}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{categoryLabel(ticket.category)}</p>
                  <time className="mt-2 block text-[10px] text-muted-foreground" dateTime={ticket.updated_at}>
                    {new Date(ticket.updated_at).toLocaleString(locale)}
                  </time>
                </button>
              ))}
            </div>
          </div>

          {selectedTicket && (
            <div className="flex min-h-0 flex-col">
              <div className="border-b p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black">{selectedTicket.subject}</h3>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{text.merchant}: <strong className="text-foreground">{selectedTicket.merchant_name}</strong></span>
                      <span>{text.phone}: <strong dir="ltr" className="text-foreground">{selectedTicket.merchant_phone}</strong></span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {text.assignedTo}: <strong className="text-foreground">{selectedTicket.assigned_admin_name || text.unassigned}</strong>
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold">
                    {statusLabel(selectedTicket.status)}
                  </span>
                </div>

                {!isOwner && ticketIsActive && !selectedTicket.assigned_admin_id && (
                  <Button
                    className="mt-3"
                    size="sm"
                    disabled={working !== null}
                    onClick={() => void claimTicket()}
                  >
                    {working === 'claim' ? (
                      <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UserCheck className="me-2 h-4 w-4" />
                    )}
                    {working === 'claim' ? text.claiming : text.claim}
                  </Button>
                )}

                {!isOwner && isAssignedToOther && (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                    {text.assignedOther}
                  </p>
                )}
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4 lg:max-h-[430px]">
                {selectedTicket.messages.map((message) => {
                  const merchantMessage = message.sender_type === 'merchant';
                  return (
                    <article key={message.id} className={`flex ${merchantMessage ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[86%] rounded-2xl px-4 py-3 ${merchantMessage ? 'border bg-background' : 'bg-orange-500 text-white'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] opacity-75">
                          <strong>{message.sender_name}</strong>
                          <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString(locale)}</time>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                      </div>
                    </article>
                  );
                })}
              </div>

              {!isOwner && isAssignedToCurrentAdmin && ticketIsActive && (
                <div className="shrink-0 border-t p-3">
                  <form onSubmit={sendReply} className="flex gap-2">
                    <Textarea
                      value={reply}
                      rows={2}
                      maxLength={4000}
                      disabled={working !== null}
                      placeholder={text.replyPlaceholder}
                      onChange={(event) => setReply(event.target.value)}
                      className="min-h-12 resize-none"
                    />
                    <Button
                      type="submit"
                      className="h-12 w-12 shrink-0 p-0"
                      disabled={working !== null || !reply.trim()}
                      aria-label={text.sendReply}
                    >
                      {working === 'reply' ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </Button>
                  </form>
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={working !== null}
                      onClick={() => void resolveTicket()}
                    >
                      {working === 'resolve' ? (
                        <Loader2 className="me-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="me-2 h-4 w-4" />
                      )}
                      {working === 'resolve' ? text.resolving : text.markResolved}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
