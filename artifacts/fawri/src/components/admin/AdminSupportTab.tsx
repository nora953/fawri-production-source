import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Eye,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type AdminSupportTicketStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed';
type AdminSupportWaitingOn = 'admin' | 'merchant';

type AdminSupportCategory =
  | 'technical'
  | 'billing'
  | 'channels'
  | 'account'
  | 'other';

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
  waiting_on?: AdminSupportWaitingOn;
  waiting_since?: string;
  merchant_reminder_sent_at?: string;
  assistant_reminder_sent_at?: string;
  owner_escalated_at?: string;
  auto_closed_at?: string;
  auto_closed_reason?: 'merchant_inactivity';
  messages: AdminSupportMessage[];
  inspection_requests?: InspectionSessionRequest[];
};

const SUPPORT_TEXT = {
  ar: {
    tab: 'الدعم',
    title: 'تذاكر دعم التجار',
    subtitle: 'متابعة شكاوى ومحادثات التجار.',
    ownerNotice: 'وضع المراقبة فقط: يمكنك مشاهدة سير العمل دون استلام التذاكر أو الرد عليها.',
    waitingMerchant: 'بانتظار رد التاجر',
    waitingAdmin: 'بانتظار رد فريق الدعم',
    assistantReminderBanner: 'تنبيه: التاجر ما زال بانتظار رد من فريق الدعم.',
    assistantReminderToast: 'توجد تذكرة ما زال التاجر ينتظر الرد عليها.',
    ownerEscalationBanner: 'تم تصعيد هذه التذكرة للمالك بسبب تأخر رد فريق الدعم.',
    ownerEscalationToast: 'وصل تصعيد جديد لتذكرة متأخرة في الدعم.',
    ownerEscalationSummary: 'تذاكر مصعّدة للمتابعة: {count}',
    autoClosedMerchant: 'أُغلقت تلقائيًا لعدم رد التاجر خلال 72 ساعة.',
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
    requestInspection: 'طلب جلسة فحص',
    inspectionTitle: 'طلب فحص حساب التاجر',
    inspectionMode: 'نوع الجلسة',
    inspectionLive: 'مشاهدة مباشرة',
    inspectionReadOnly: 'فحص مستقل للقراءة فقط',
    inspectionReason: 'سبب طلب الفحص',
    inspectionReasonPlaceholder: 'اكتب سببًا واضحًا لطلب الجلسة...',
    inspectionRules: 'الجلسة للقراءة فقط، تتطلب موافقة التاجر، ومدتها 30 دقيقة. ينتهي الطلب بعد 10 دقائق إن لم يُقبل.',
    inspectionSend: 'إرسال الطلب',
    inspectionSending: 'جارٍ الإرسال...',
    inspectionCancel: 'إلغاء',
    inspectionSuccess: 'تم إرسال طلب جلسة الفحص إلى التاجر.',
    inspectionError: 'تعذر إرسال طلب جلسة الفحص.',
    inspectionRequestedBy: 'المسؤول الطالب',
    inspectionStatusPending: 'بانتظار موافقة التاجر',
    inspectionStatusApproved: 'وافق التاجر',
    inspectionStatusRejected: 'رفض التاجر',
    inspectionStatusExpired: 'انتهت صلاحية الطلب',
    inspectionExpires: 'انتهاء الطلب',
    inspectionDuration: 'مدة الموافقة',
    inspectionMinutes: 'دقيقة',
    inspectionHistory: 'سجل طلبات الفحص',
    inspectionViewHistory: 'عرض السجل',
    inspectionRequestedAt: 'وقت الطلب',
    inspectionLatestRequest: 'آخر طلب',
    inspectionDecision: 'قرار التاجر',
    inspectionSessionState: 'حالة الجلسة',
    inspectionDecisionPending: 'لم يصدر قرار',
    inspectionStateWaiting: 'بانتظار القرار',
    inspectionStateApprovalActive: 'الموافقة فعالة',
    inspectionStateNotStarted: 'لم تبدأ الجلسة',
    inspectionEndRequestTimeout: 'انتهى الطلب دون رد',
    inspectionEndApprovalExpired: 'انتهت مدة الموافقة',
    inspectionEndTicketResolved: 'انتهت بسبب حل التذكرة',
    inspectionEndTicketClosed: 'انتهت بسبب إغلاق التذكرة',
    inspectionEndMerchantTerminated: 'أنهى التاجر الجلسة',
    inspectionRespondedAt: 'وقت قرار التاجر',
    inspectionEndedAt: 'وقت الانتهاء',
    inspectionApprovedUntil: 'الموافقة فعالة حتى',
  },
  ku: {
    tab: 'پشتگیری',
    title: 'تیکێتەکانی پشتگیریی بازرگانان',
    subtitle: 'بەدواداچوونی کێشە و گفتوگۆکانی بازرگانان.',
    ownerNotice: 'تەنها چاودێریکردن: دەتوانیت ڕەوتی کار ببینیت بەبێ وەرگرتن یان وەڵامدانەوەی تیکێتەکان.',
    waitingMerchant: 'چاوەڕوانی وەڵامی بازرگان',
    waitingAdmin: 'چاوەڕوانی وەڵامی تیمی پشتگیری',
    assistantReminderBanner: 'ئاگاداری: بازرگان هێشتا چاوەڕوانی وەڵامی تیمی پشتگیرییە.',
    assistantReminderToast: 'تیکێتێک هەیە کە بازرگان هێشتا چاوەڕوانی وەڵامە.',
    ownerEscalationBanner: 'ئەم تیکێتە بەهۆی دواخستنی وەڵامی پشتگیری بۆ خاوەن سیستەم بەرزکرایەوە.',
    ownerEscalationToast: 'تیکێتێکی دواخراو بۆ چاودێری بەرزکرایەوە.',
    ownerEscalationSummary: 'تیکێتی بەرزکراوە بۆ چاودێری: {count}',
    autoClosedMerchant: 'بەهۆی نەبوونی وەڵامی بازرگان لە ماوەی ٧٢ کاتژمێردا خۆکارانە داخرا.',
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
    requestInspection: 'داواکاری دانیشتنی پشکنین',
    inspectionTitle: 'داواکاری پشکنینی هەژماری بازرگان',
    inspectionMode: 'جۆری دانیشتن',
    inspectionLive: 'بینینی ڕاستەوخۆ',
    inspectionReadOnly: 'پشکنینی سەربەخۆی تەنها خوێندنەوە',
    inspectionReason: 'هۆکاری داواکاری پشکنین',
    inspectionReasonPlaceholder: 'هۆکارێکی ڕوون بنووسە...',
    inspectionRules: 'دانیشتنەکە تەنها خوێندنەوەیە، پێویستی بە ڕەزامەندی بازرگان هەیە و 30 خولەکە. داواکارییەکە دوای 10 خولەک بەسەر دەچێت.',
    inspectionSend: 'ناردنی داواکاری',
    inspectionSending: 'دەنێردرێت...',
    inspectionCancel: 'هەڵوەشاندنەوە',
    inspectionSuccess: 'داواکاری دانیشتنی پشکنین بۆ بازرگان نێردرا.',
    inspectionError: 'ناردنی داواکاری پشکنین سەرکەوتوو نەبوو.',
    inspectionRequestedBy: 'بەرپرسی داواکار',
    inspectionStatusPending: 'چاوەڕوانی ڕەزامەندی بازرگان',
    inspectionStatusApproved: 'بازرگان ڕازی بوو',
    inspectionStatusRejected: 'بازرگان ڕەتی کردەوە',
    inspectionStatusExpired: 'کاتی داواکارییەکە بەسەرچوو',
    inspectionExpires: 'کۆتایی کاتی داواکاری',
    inspectionDuration: 'ماوەی ڕەزامەندی',
    inspectionMinutes: 'خولەک',
    inspectionHistory: 'تۆماری داواکارییەکانی پشکنین',
    inspectionViewHistory: 'بینینی تۆمار',
    inspectionRequestedAt: 'کاتی داواکاری',
    inspectionLatestRequest: 'دوایین داواکاری',
    inspectionDecision: 'بڕیاری بازرگان',
    inspectionSessionState: 'دۆخی دانیشتن',
    inspectionDecisionPending: 'هێشتا بڕیار نەدراوە',
    inspectionStateWaiting: 'چاوەڕوانی بڕیار',
    inspectionStateApprovalActive: 'ڕەزامەندی چالاکە',
    inspectionStateNotStarted: 'دانیشتن دەستی پێنەکردووە',
    inspectionEndRequestTimeout: 'داواکاری بێ وەڵام کۆتایی هات',
    inspectionEndApprovalExpired: 'ماوەی ڕەزامەندی کۆتایی هات',
    inspectionEndTicketResolved: 'بە چارەسەرکردنی تیکێت کۆتایی هات',
    inspectionEndTicketClosed: 'بە داخستنی تیکێت کۆتایی هات',
    inspectionEndMerchantTerminated: 'بازرگان دانیشتنەکەی کۆتایی پێهێنا',
    inspectionRespondedAt: 'کاتی بڕیاری بازرگان',
    inspectionEndedAt: 'کاتی کۆتایی',
    inspectionApprovedUntil: 'ڕەزامەندی چالاکە تا',
  },
  en: {
    tab: 'Support',
    title: 'Merchant Support Tickets',
    subtitle: 'Monitor merchant issues and conversations.',
    ownerNotice: 'Monitor-only mode: you can review workflow but cannot claim tickets or reply.',
    waitingMerchant: 'Waiting for merchant reply',
    waitingAdmin: 'Waiting for support reply',
    assistantReminderBanner: 'Reminder: the merchant is still waiting for a support reply.',
    assistantReminderToast: 'A merchant is still waiting for a support reply.',
    ownerEscalationBanner: 'This ticket was escalated to the owner because support has not replied.',
    ownerEscalationToast: 'A delayed support ticket was escalated for monitoring.',
    ownerEscalationSummary: 'Escalated tickets: {count}',
    autoClosedMerchant: 'Automatically closed after 72 hours without a merchant reply.',
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
    requestInspection: 'Request inspection session',
    inspectionTitle: 'Merchant account inspection request',
    inspectionMode: 'Session mode',
    inspectionLive: 'Live observation',
    inspectionReadOnly: 'Independent read-only inspection',
    inspectionReason: 'Reason for inspection',
    inspectionReasonPlaceholder: 'Write a clear reason for requesting the session...',
    inspectionRules: 'The session is read-only, requires merchant consent, and lasts 30 minutes. The request expires after 10 minutes if unanswered.',
    inspectionSend: 'Send request',
    inspectionSending: 'Sending...',
    inspectionCancel: 'Cancel',
    inspectionSuccess: 'The inspection session request was sent to the merchant.',
    inspectionError: 'Could not send the inspection session request.',
    inspectionRequestedBy: 'Requested by',
    inspectionStatusPending: 'Waiting for merchant consent',
    inspectionStatusApproved: 'Merchant approved',
    inspectionStatusRejected: 'Merchant rejected',
    inspectionStatusExpired: 'Request expired',
    inspectionExpires: 'Request expires',
    inspectionDuration: 'Approval duration',
    inspectionMinutes: 'minutes',
    inspectionHistory: 'Inspection request history',
    inspectionViewHistory: 'View history',
    inspectionRequestedAt: 'Requested at',
    inspectionLatestRequest: 'Latest request',
    inspectionDecision: 'Merchant decision',
    inspectionSessionState: 'Session state',
    inspectionDecisionPending: 'No decision yet',
    inspectionStateWaiting: 'Waiting for decision',
    inspectionStateApprovalActive: 'Approval is active',
    inspectionStateNotStarted: 'Session did not start',
    inspectionEndRequestTimeout: 'Request expired without a response',
    inspectionEndApprovalExpired: 'Approval period ended',
    inspectionEndTicketResolved: 'Ended because the ticket was resolved',
    inspectionEndTicketClosed: 'Ended because the ticket was closed',
    inspectionEndMerchantTerminated: 'Merchant ended the session',
    inspectionRespondedAt: 'Merchant decision time',
    inspectionEndedAt: 'Ended at',
    inspectionApprovedUntil: 'Approval active until',
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
  canInspectSessions: boolean;
  onActiveCountChange?: (count: number) => void;
};

export default function AdminSupportTab({
  adminId,
  isOwner,
  canInspectSessions,
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
  const [working, setWorking] = useState<'claim' | 'reply' | 'resolve' | 'inspection' | null>(null);
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [showInspectionHistory, setShowInspectionHistory] = useState(false);
  const [inspectionMode, setInspectionMode] = useState<InspectionSessionMode>('live_observation');
  const [inspectionReason, setInspectionReason] = useState('');
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const seenLifecycleAlertsRef = useRef<Set<string>>(new Set());

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) ?? null,
    [selectedId, tickets],
  );
  const selectedLastMessageId =
    selectedTicket?.messages[selectedTicket.messages.length - 1]?.id ?? null;
  const inspectionRequests = selectedTicket?.inspection_requests ?? [];
  const latestInspectionRequest = inspectionRequests[0] ?? null;

  useEffect(() => {
    setShowInspectionForm(false);
    setShowInspectionHistory(false);
    setInspectionMode('live_observation');
    setInspectionReason('');
  }, [selectedId]);

  useLayoutEffect(() => {
    const conversation = conversationRef.current;
    if (!conversation || !selectedLastMessageId) return;

    const frameId = window.requestAnimationFrame(() => {
      conversation.scrollTo({
        top: conversation.scrollHeight,
        behavior: 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [selectedId, selectedLastMessageId]);

  const ownerEscalationCount = useMemo(
    () =>
      tickets.filter(
        (ticket) =>
          Boolean(ticket.owner_escalated_at) &&
          ticket.waiting_on === 'admin' &&
          (ticket.status === 'open' || ticket.status === 'in_progress'),
      ).length,
    [tickets],
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
      for (const ticket of nextTickets) {
        const active = ticket.status === 'open' || ticket.status === 'in_progress';
        if (!active || ticket.waiting_on !== 'admin') continue;

        if (isOwner && ticket.owner_escalated_at) {
          const key = `owner:${ticket.id}:${ticket.owner_escalated_at}`;
          if (!seenLifecycleAlertsRef.current.has(key)) {
            seenLifecycleAlertsRef.current.add(key);
            toast.warning(text.ownerEscalationToast);
          }
        } else if (
          !isOwner &&
          ticket.assistant_reminder_sent_at &&
          (!ticket.assigned_admin_id || ticket.assigned_admin_id === adminId)
        ) {
          const key = `assistant:${ticket.id}:${ticket.assistant_reminder_sent_at}`;
          if (!seenLifecycleAlertsRef.current.has(key)) {
            seenLifecycleAlertsRef.current.add(key);
            toast.warning(text.assistantReminderToast);
          }
        }
      }
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
  }, [adminId, isOwner, text.assistantReminderToast, text.ownerEscalationToast]);

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


  const requestInspectionSession = async (event: React.FormEvent) => {
    event.preventDefault();
    const reason = inspectionReason.trim();
    if (!selectedTicket || isOwner || !canInspectSessions || reason.length < 5) return;

    setWorking('inspection');
    try {
      const response = await fetch(
        `/api/auth/admin/support/tickets/${encodeURIComponent(selectedTicket.id)}/inspection-requests`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
          body: JSON.stringify({ mode: inspectionMode, reason }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.ticket) {
        throw new Error(data?.error || 'could not request inspection session');
      }
      replaceTicket(data.ticket as AdminSupportTicket);
      setShowInspectionForm(false);
      setInspectionReason('');
      toast.success(text.inspectionSuccess);
    } catch (error) {
      console.error('Could not request inspection session:', error);
      toast.error(text.inspectionError);
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

  const statusLabel = (ticket: AdminSupportTicket) => {
    if (ticket.status === 'closed' && ticket.auto_closed_reason === 'merchant_inactivity') {
      return text.autoClosedMerchant;
    }
    if (ticket.status === 'open' || ticket.status === 'in_progress') {
      return ticket.waiting_on === 'merchant'
        ? text.waitingMerchant
        : text.waitingAdmin;
    }
    return ({
      open: text.statusOpen,
      in_progress: text.statusInProgress,
      resolved: text.statusResolved,
      closed: text.statusClosed,
    })[ticket.status];
  };

  const ticketStatusClass = (status: AdminSupportTicketStatus) =>
    ({
      open: 'border-border bg-card hover:bg-muted/50',
      in_progress:
        'border-yellow-300 bg-yellow-50 hover:bg-yellow-100/70 dark:border-yellow-800 dark:bg-yellow-950/30 dark:hover:bg-yellow-950/45',
      resolved:
        'border-green-300 bg-green-50 hover:bg-green-100/70 dark:border-green-800 dark:bg-green-950/30 dark:hover:bg-green-950/45',
      closed:
        'border-red-300 bg-red-50 hover:bg-red-100/70 dark:border-red-800 dark:bg-red-950/30 dark:hover:bg-red-950/45',
    })[status];

  const statusBadgeClass = (status: AdminSupportTicketStatus) =>
    ({
      open: 'bg-muted text-foreground',
      in_progress:
        'bg-yellow-100 text-yellow-900 dark:bg-yellow-950/70 dark:text-yellow-100',
      resolved:
        'bg-green-100 text-green-900 dark:bg-green-950/70 dark:text-green-100',
      closed: 'bg-red-100 text-red-900 dark:bg-red-950/70 dark:text-red-100',
    })[status];

  const inspectionConsentDecision = (
    request: InspectionSessionRequest,
  ): InspectionConsentDecision | null =>
    request.consent_decision ||
    (request.status === 'approved'
      ? 'approved'
      : request.status === 'rejected'
        ? 'rejected'
        : null);

  const inspectionDecisionLabel = (request: InspectionSessionRequest) => {
    const decision = inspectionConsentDecision(request);
    return decision === 'approved'
      ? text.inspectionStatusApproved
      : decision === 'rejected'
        ? text.inspectionStatusRejected
        : text.inspectionDecisionPending;
  };

  const inspectionModeLabel = (mode: InspectionSessionMode) =>
    mode === 'live_observation' ? text.inspectionLive : text.inspectionReadOnly;

  const inspectionEndLabel = (request: InspectionSessionRequest) => {
    if (request.end_reason === 'request_timeout') return text.inspectionEndRequestTimeout;
    if (request.end_reason === 'approval_window_expired') return text.inspectionEndApprovalExpired;
    if (request.end_reason === 'ticket_resolved') return text.inspectionEndTicketResolved;
    if (request.end_reason === 'ticket_closed') return text.inspectionEndTicketClosed;
    if (request.end_reason === 'merchant_terminated') return text.inspectionEndMerchantTerminated;
    if (request.status === 'pending') return text.inspectionStateWaiting;
    if (inspectionConsentDecision(request) === 'approved') return text.inspectionStateApprovalActive;
    if (inspectionConsentDecision(request) === 'rejected') return text.inspectionStateNotStarted;
    return text.inspectionStatusExpired;
  };

  const inspectionDecisionClass = (request: InspectionSessionRequest) => {
    const decision = inspectionConsentDecision(request);
    return decision === 'approved'
      ? 'border-green-300 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950/30 dark:text-green-100'
      : decision === 'rejected'
        ? 'border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100'
        : 'border-yellow-300 bg-yellow-50 text-yellow-950 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-100';
  };

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
  const inspectionRequestIsActive = Boolean(
    latestInspectionRequest &&
      !latestInspectionRequest.ended_at &&
      (latestInspectionRequest.status === 'pending' || latestInspectionRequest.status === 'approved'),
  );
  const canRequestInspection =
    !isOwner &&
    canInspectSessions &&
    isAssignedToCurrentAdmin &&
    ticketIsActive &&
    !inspectionRequestIsActive;

  return (
    <section
      className="flex min-h-0 flex-col gap-2 md:flex-1 md:overflow-hidden"
      dir={dir}
    >
      {loading ? (
        <div className="flex min-h-80 flex-1 items-center justify-center rounded-2xl border bg-card text-muted-foreground md:min-h-0">
          <Loader2 className="me-2 h-5 w-5 animate-spin" />
          {text.loading}
        </div>
      ) : loadError ? (
        <div className="flex min-h-80 flex-1 flex-col items-center justify-center gap-4 rounded-2xl border bg-card p-6 text-center md:min-h-0">
          <p className="font-bold">{text.loadError}</p>
          <Button variant="outline" onClick={() => void loadTickets()}>
            <RefreshCw className="me-2 h-4 w-4" />
            {text.retry}
          </Button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex min-h-80 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed bg-card p-6 text-center md:min-h-0">
          <MessageCircle className="h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 font-black">{text.emptyTitle}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{text.emptyBody}</p>
        </div>
      ) : (
        <div className="grid min-h-[480px] flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm md:min-h-0 lg:grid-cols-[300px_1fr]">
          <div className="flex min-h-0 flex-col overflow-hidden border-b lg:border-b-0 lg:border-e">
            <div className="shrink-0 border-b bg-background p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Headphones className="h-4 w-4 shrink-0 text-primary" />
                    <h2 className="truncate text-sm font-black">{text.title}</h2>
                  </div>
                  <p className="mt-1 truncate text-[11px] leading-4 text-muted-foreground" title={text.subtitle}>
                    {text.subtitle}
                  </p>
                </div>
                <div className="shrink-0 rounded-xl border bg-muted/30 px-2.5 py-1 text-center">
                  <p className="text-[9px] font-medium leading-3 text-muted-foreground">{text.activeTickets}</p>
                  <p className="text-base font-black leading-5 tabular-nums">{activeCount}</p>
                </div>
              </div>

              {isOwner && (
                <>
                  <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[10px] font-semibold leading-4 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100">
                    {text.ownerNotice}
                  </p>
                  {ownerEscalationCount > 0 && (
                    <p className="mt-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10px] font-black leading-4 text-red-900 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100">
                      {text.ownerEscalationSummary.replace('{count}', ownerEscalationCount.toLocaleString(locale))}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="min-h-0 flex-1 max-h-72 space-y-2 overflow-y-auto p-3 lg:max-h-none">
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
              <div className="shrink-0 border-b bg-background px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black leading-5">{selectedTicket.subject}</h3>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusBadgeClass(
                          selectedTicket.status,
                        )}`}
                      >
                        {statusLabel(selectedTicket)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] leading-4 text-muted-foreground">
                      <span>{text.merchant}: <strong className="text-foreground">{selectedTicket.merchant_name}</strong></span>
                      <span>{text.phone}: <strong dir="ltr" className="text-foreground">{selectedTicket.merchant_phone}</strong></span>
                      <span>{text.assignedTo}: <strong className="text-foreground">{selectedTicket.assigned_admin_name || text.unassigned}</strong></span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {latestInspectionRequest && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => setShowInspectionHistory(true)}
                      >
                        <Eye className="me-2 h-3.5 w-3.5" />
                        {text.inspectionHistory} ({inspectionRequests.length})
                      </Button>
                    )}

                    {canRequestInspection && !showInspectionForm && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={working !== null}
                        onClick={() => setShowInspectionForm(true)}
                      >
                        <Eye className="me-2 h-3.5 w-3.5" />
                        {text.requestInspection}
                      </Button>
                    )}

                    {!isOwner && ticketIsActive && !selectedTicket.assigned_admin_id && (
                      <Button
                        className="h-8"
                        size="sm"
                        disabled={working !== null}
                        onClick={() => void claimTicket()}
                      >
                        {working === 'claim' ? (
                          <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserCheck className="me-2 h-3.5 w-3.5" />
                        )}
                        {working === 'claim' ? text.claiming : text.claim}
                      </Button>
                    )}
                  </div>
                </div>

                {latestInspectionRequest && (
                  <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] leading-4">
                    <span className="text-muted-foreground">{text.inspectionLatestRequest}:</span>
                    <span className={`rounded-full border px-2 py-0.5 font-black ${inspectionDecisionClass(latestInspectionRequest)}`}>
                      {inspectionDecisionLabel(latestInspectionRequest)}
                    </span>
                    <span className="rounded-full border bg-muted/40 px-2 py-0.5 font-bold text-muted-foreground">
                      {inspectionEndLabel(latestInspectionRequest)}
                    </span>
                  </div>
                )}

                {!isOwner &&
                  selectedTicket.waiting_on === 'admin' &&
                  selectedTicket.assistant_reminder_sent_at &&
                  ticketIsActive &&
                  (!selectedTicket.assigned_admin_id || isAssignedToCurrentAdmin) && (
                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                      {text.assistantReminderBanner}
                    </p>
                  )}

                {isOwner && selectedTicket.owner_escalated_at && ticketIsActive && (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-900 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100">
                    {text.ownerEscalationBanner}
                  </p>
                )}

                {selectedTicket.auto_closed_reason === 'merchant_inactivity' && (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-900 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100">
                    {text.autoClosedMerchant}
                  </p>
                )}

                {!isOwner && isAssignedToOther && (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                    {text.assignedOther}
                  </p>
                )}
              </div>

              <div
                ref={conversationRef}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-muted/20 p-3"
              >
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
                <div className="shrink-0 border-t bg-background p-2.5">
                  <form onSubmit={sendReply} className="flex items-end gap-2">
                    <Textarea
                      value={reply}
                      rows={1}
                      maxLength={4000}
                      disabled={working !== null}
                      placeholder={text.replyPlaceholder}
                      onChange={(event) => setReply(event.target.value)}
                      className="min-h-10 max-h-24 resize-none py-2"
                    />
                    <Button
                      type="submit"
                      className="h-10 w-10 shrink-0 p-0"
                      disabled={working !== null || !reply.trim()}
                      aria-label={text.sendReply}
                    >
                      {working === 'reply' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 shrink-0"
                      disabled={working !== null}
                      onClick={() => void resolveTicket()}
                    >
                      {working === 'resolve' ? (
                        <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="me-2 h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">{working === 'resolve' ? text.resolving : text.markResolved}</span>
                    </Button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog
        open={showInspectionForm}
        onOpenChange={(open) => {
          if (working === null) setShowInspectionForm(open);
        }}
      >
        <DialogContent
          className="max-w-xl"
          closeButtonClassName={dir === 'rtl' ? 'left-4 right-auto' : 'left-auto right-4'}
          dir={dir}
        >
          <DialogHeader>
            <DialogTitle className="text-start">{text.inspectionTitle}</DialogTitle>
          </DialogHeader>

          <form onSubmit={requestInspectionSession} className="space-y-4">
            <label className="block text-xs font-bold">
              <span className="mb-1.5 block">{text.inspectionMode}</span>
              <div className="relative">
                <select
                  value={inspectionMode}
                  disabled={working !== null}
                  onChange={(event) => setInspectionMode(event.target.value as InspectionSessionMode)}
                  className="h-11 w-full appearance-none rounded-xl border bg-background ps-3 pe-10 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="live_observation">{text.inspectionLive}</option>
                  <option value="independent_read_only">{text.inspectionReadOnly}</option>
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground ${
                    dir === 'rtl' ? 'left-4' : 'right-4'
                  }`}
                />
              </div>
            </label>

            <label className="block text-xs font-bold">
              <span className="mb-1.5 block">{text.inspectionReason}</span>
              <Textarea
                value={inspectionReason}
                maxLength={500}
                rows={4}
                disabled={working !== null}
                placeholder={text.inspectionReasonPlaceholder}
                onChange={(event) => setInspectionReason(event.target.value)}
                className="min-h-24 resize-none"
              />
            </label>

            <p className="rounded-xl border bg-muted/30 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
              {text.inspectionRules}
            </p>

            <div className="flex flex-wrap justify-start gap-2">
              <Button
                type="submit"
                disabled={working !== null || inspectionReason.trim().length < 5}
              >
                {working === 'inspection' && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {working === 'inspection' ? text.inspectionSending : text.inspectionSend}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={working !== null}
                onClick={() => setShowInspectionForm(false)}
              >
                {text.inspectionCancel}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showInspectionHistory} onOpenChange={setShowInspectionHistory}>
        <DialogContent
          className="max-w-2xl"
          closeButtonClassName={dir === 'rtl' ? 'left-4 right-auto' : 'left-auto right-4'}
          dir={dir}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-start">
              {text.inspectionHistory} ({inspectionRequests.length})
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto pe-1">
            {inspectionRequests.map((request) => {
              const decision = inspectionConsentDecision(request);
              return (
                <article key={request.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black">{inspectionModeLabel(request.mode)}</p>
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/35 px-3 py-2 text-sm leading-6">
                        {request.reason}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${inspectionDecisionClass(request)}`}>
                        {text.inspectionDecision}: {inspectionDecisionLabel(request)}
                      </span>
                      <span className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-bold text-muted-foreground">
                        {text.inspectionSessionState}: {inspectionEndLabel(request)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-x-5 gap-y-2 border-t pt-3 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
                    <span><strong className="text-foreground">{text.inspectionRequestedBy}:</strong> {request.admin_name}</span>
                    <span><strong className="text-foreground">{text.inspectionRequestedAt}:</strong> {new Date(request.requested_at).toLocaleString(locale)}</span>
                    {request.responded_at && decision && (
                      <span><strong className="text-foreground">{text.inspectionRespondedAt}:</strong> {new Date(request.responded_at).toLocaleString(locale)}</span>
                    )}
                    {request.status === 'pending' && !request.ended_at && (
                      <span><strong className="text-foreground">{text.inspectionExpires}:</strong> {new Date(request.request_expires_at).toLocaleString(locale)}</span>
                    )}
                    {decision === 'approved' && (
                      <span><strong className="text-foreground">{text.inspectionDuration}:</strong> {request.session_duration_minutes} {text.inspectionMinutes}</span>
                    )}
                    {decision === 'approved' && request.session_expires_at && !request.ended_at && (
                      <span><strong className="text-foreground">{text.inspectionApprovedUntil}:</strong> {new Date(request.session_expires_at).toLocaleString(locale)}</span>
                    )}
                    {request.ended_at && (
                      <span><strong className="text-foreground">{text.inspectionEndedAt}:</strong> {new Date(request.ended_at).toLocaleString(locale)}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
