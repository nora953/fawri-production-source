from pathlib import Path

ROOT = Path('.')
AUTH = ROOT / 'artifacts/api-server/src/routes/auth.ts'
APP = ROOT / 'artifacts/fawri/src/App.tsx'
SIDEBAR = ROOT / 'artifacts/fawri/src/components/layout/Sidebar.tsx'
BOTTOM_NAV = ROOT / 'artifacts/fawri/src/components/layout/BottomNav.tsx'
REALTIME = ROOT / 'artifacts/fawri/src/hooks/useMerchantRealtime.ts'
SUPPORT_PAGE = ROOT / 'artifacts/fawri/src/pages/dashboard/SupportPage.tsx'
AR = ROOT / 'artifacts/fawri/src/lib/translations/ar.ts'
EN = ROOT / 'artifacts/fawri/src/lib/translations/en.ts'
KU = ROOT / 'artifacts/fawri/src/lib/translations/ku.ts'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


def append_translation_keys(path: Path, block: str) -> None:
    text = path.read_text(encoding='utf-8')
    if 'support_nav:' in text:
        raise RuntimeError(f'{path}: support translations already exist')
    marker = '\n};'
    index = text.rfind(marker)
    if index < 0:
        raise RuntimeError(f'{path}: translation object ending not found')
    text = text[:index] + '\n' + block.rstrip() + text[index:]
    path.write_text(text, encoding='utf-8')


auth = AUTH.read_text(encoding='utf-8')

auth = replace_once(
    auth,
    '''type MerchantBalanceNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "subscription_balance_purchase";
  purchased_replies: number;
  emergency_debt_paid: number;
  addon_replies_added: number;
  emergency_debt_remaining: number;
  base_replies_remaining: number;
  emergency_replies_remaining: number;
  addon_replies_remaining: number;
  total_replies_available: number;
  created_at: string;
  read_at?: string;
};
''',
    '''type MerchantBalanceNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "subscription_balance_purchase";
  purchased_replies: number;
  emergency_debt_paid: number;
  addon_replies_added: number;
  emergency_debt_remaining: number;
  base_replies_remaining: number;
  emergency_replies_remaining: number;
  addon_replies_remaining: number;
  total_replies_available: number;
  created_at: string;
  read_at?: string;
};

type SupportTicketCategory =
  | "technical"
  | "billing"
  | "channels"
  | "account"
  | "other";
type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";
type SupportMessageSender = "merchant" | "admin" | "system";

type SupportTicketMessage = {
  id: string;
  sender_type: SupportMessageSender;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
};

type SupportTicketRecord = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_phone: string;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  assigned_admin_id?: string;
  assigned_admin_name?: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  messages: SupportTicketMessage[];
};
''',
    'support ticket types',
)

auth = replace_once(
    auth,
    '''  merchant_notifications: MerchantBalanceNotificationRecord[];
  deletion_requests: MerchantDeletionRequest[];
''',
    '''  merchant_notifications: MerchantBalanceNotificationRecord[];
  support_tickets: SupportTicketRecord[];
  deletion_requests: MerchantDeletionRequest[];
''',
    'support ticket database field',
)

auth = replace_once(
    auth,
    '''    merchant_notifications: [],
    deletion_requests: [],
''',
    '''    merchant_notifications: [],
    support_tickets: [],
    deletion_requests: [],
''',
    'initial support ticket database',
)

auth = replace_once(
    auth,
    '''      deletion_requests: Array.isArray(parsed.deletion_requests)
        ? parsed.deletion_requests
        : [],
''',
    '''      support_tickets: Array.isArray(parsed.support_tickets)
        ? parsed.support_tickets.filter(
            (ticket): ticket is SupportTicketRecord =>
              Boolean(
                ticket &&
                typeof ticket === "object" &&
                !Array.isArray(ticket) &&
                typeof ticket.id === "string" &&
                typeof ticket.merchant_id === "string" &&
                typeof ticket.subject === "string" &&
                Array.isArray(ticket.messages),
              ),
          )
        : [],
      deletion_requests: Array.isArray(parsed.deletion_requests)
        ? parsed.deletion_requests
        : [],
''',
    'load support ticket database',
)

auth = replace_once(
    auth,
    '''type MerchantRealtimeEventName =
  | "snapshot"
  | "subscription_updated"
  | "notifications_updated";
''',
    '''type MerchantRealtimeEventName =
  | "snapshot"
  | "subscription_updated"
  | "notifications_updated"
  | "support_updated";
''',
    'backend support realtime event',
)

support_routes = r'''
router.get("/support/tickets", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  const tickets = db.support_tickets
    .filter((ticket) => ticket.merchant_id === merchantId)
    .sort(
      (left, right) =>
        new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
    );

  res.setHeader("Cache-Control", "no-store");
  return res.json({ ok: true, tickets });
});

router.post("/support/tickets", requireMerchantSession, (req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  const subject = String(req.body?.subject || "").trim();
  const message = String(req.body?.message || "").trim();
  const category = String(req.body?.category || "other").trim() as SupportTicketCategory;
  const allowedCategories: readonly SupportTicketCategory[] = [
    "technical",
    "billing",
    "channels",
    "account",
    "other",
  ];

  if (subject.length < 3 || subject.length > 120) {
    return sendError(res, 400, "invalid support subject");
  }
  if (message.length < 2 || message.length > 4000) {
    return sendError(res, 400, "invalid support message");
  }
  if (!allowedCategories.includes(category)) {
    return sendError(res, 400, "invalid support category");
  }

  const activeCount = db.support_tickets.filter(
    (ticket) =>
      ticket.merchant_id === merchantId &&
      (ticket.status === "open" || ticket.status === "in_progress"),
  ).length;
  if (activeCount >= 10) {
    return sendError(res, 409, "too many active support tickets");
  }

  const createdAt = now();
  const ticket: SupportTicketRecord = {
    id: makeId("support-ticket"),
    merchant_id: merchant.id,
    merchant_name: merchant.store_name,
    merchant_phone: merchant.phone,
    subject,
    category,
    status: "open",
    created_at: createdAt,
    updated_at: createdAt,
    messages: [
      {
        id: makeId("support-message"),
        sender_type: "merchant",
        sender_id: merchant.id,
        sender_name: merchant.owner_name,
        body: message,
        created_at: createdAt,
      },
    ],
  };

  db.support_tickets.unshift(ticket);
  writeDb(db);
  emitMerchantRealtimeState(db, merchantId, "support_updated");
  return res.status(201).json({ ok: true, ticket });
});

router.get(
  "/support/tickets/:id",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const ticketId = String(req.params.id || "").trim();
    const db = ensureDb();
    const ticket = db.support_tickets.find(
      (item) => item.id === ticketId && item.merchant_id === merchantId,
    );
    if (!ticket) return sendError(res, 404, "support ticket not found");

    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, ticket });
  },
);

router.post(
  "/support/tickets/:id/messages",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const ticketId = String(req.params.id || "").trim();
    const body = String(req.body?.message || "").trim();
    const db = ensureDb();
    const merchant = findRegularMerchant(db, merchantId);
    const ticket = db.support_tickets.find(
      (item) => item.id === ticketId && item.merchant_id === merchantId,
    );

    if (!merchant) return sendError(res, 404, "merchant not found");
    if (!ticket) return sendError(res, 404, "support ticket not found");
    if (ticket.status === "closed" || ticket.status === "resolved") {
      return sendError(res, 409, "support ticket is closed");
    }
    if (body.length < 1 || body.length > 4000) {
      return sendError(res, 400, "invalid support message");
    }

    const supportMessage: SupportTicketMessage = {
      id: makeId("support-message"),
      sender_type: "merchant",
      sender_id: merchant.id,
      sender_name: merchant.owner_name,
      body,
      created_at: now(),
    };
    ticket.messages.push(supportMessage);
    ticket.updated_at = supportMessage.created_at;
    writeDb(db);
    emitMerchantRealtimeState(db, merchantId, "support_updated");
    return res.status(201).json({ ok: true, ticket, message: supportMessage });
  },
);

'''

auth = replace_once(
    auth,
    'router.get("/subscription/current", requireMerchantSession, (_req: Request, res: Response) => {\n',
    support_routes + 'router.get("/subscription/current", requireMerchantSession, (_req: Request, res: Response) => {\n',
    'merchant support routes',
)
AUTH.write_text(auth, encoding='utf-8')

realtime = REALTIME.read_text(encoding='utf-8')
realtime = replace_once(
    realtime,
    '''  | 'subscription_updated'
  | 'notifications_updated';
''',
    '''  | 'subscription_updated'
  | 'notifications_updated'
  | 'support_updated';
''',
    'frontend support realtime type',
)
realtime = replace_once(
    realtime,
    '''  'subscription_updated',
  'notifications_updated',
];
''',
    '''  'subscription_updated',
  'notifications_updated',
  'support_updated',
];
''',
    'frontend support realtime listener',
)
REALTIME.write_text(realtime, encoding='utf-8')

app = APP.read_text(encoding='utf-8')
app = replace_once(
    app,
    'const SettingsPage = lazy(() => import("@/pages/dashboard/SettingsPage"));\n',
    'const SettingsPage = lazy(() => import("@/pages/dashboard/SettingsPage"));\nconst SupportPage = lazy(() => import("@/pages/dashboard/SupportPage"));\n',
    'support page lazy import',
)
app = replace_once(
    app,
    '''        <Route path="/dashboard/settings">
          {() => <DashboardRoute Page={SettingsPage} />}
        </Route>
''',
    '''        <Route path="/dashboard/support">
          {() => <DashboardRoute Page={SupportPage} />}
        </Route>

        <Route path="/dashboard/settings">
          {() => <DashboardRoute Page={SettingsPage} />}
        </Route>
''',
    'support dashboard route',
)
APP.write_text(app, encoding='utf-8')

sidebar = SIDEBAR.read_text(encoding='utf-8')
sidebar = replace_once(
    sidebar,
    '''  Bell,
} from "lucide-react";
''',
    '''  Bell,
  Headphones,
} from "lucide-react";
''',
    'sidebar support icon import',
)
sidebar = replace_once(
    sidebar,
    '''    {
      href: "/dashboard/subscription",
      label: t.subscription,
      icon: CreditCard,
    },
    { href: "/dashboard/settings", label: t.settings, icon: Settings },
''',
    '''    {
      href: "/dashboard/subscription",
      label: t.subscription,
      icon: CreditCard,
    },
    { href: "/dashboard/support", label: t.support_nav, icon: Headphones },
    { href: "/dashboard/settings", label: t.settings, icon: Settings },
''',
    'sidebar support navigation',
)
SIDEBAR.write_text(sidebar, encoding='utf-8')

bottom = BOTTOM_NAV.read_text(encoding='utf-8')
bottom = replace_once(
    bottom,
    '''  Bell,
} from "lucide-react";
''',
    '''  Bell,
  Headphones,
} from "lucide-react";
''',
    'bottom support icon import',
)
bottom = replace_once(
    bottom,
    '''    {
      href: "/dashboard/subscription",
      label: t.subscription,
      icon: CreditCard,
    },
    {
      href: "/dashboard/settings",
''',
    '''    {
      href: "/dashboard/subscription",
      label: t.subscription,
      icon: CreditCard,
    },
    {
      href: "/dashboard/support",
      label: t.support_nav,
      icon: Headphones,
    },
    {
      href: "/dashboard/settings",
''',
    'bottom support navigation',
)
BOTTOM_NAV.write_text(bottom, encoding='utf-8')

support_page = r'''import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
      setTickets((current) => [ticket, ...current.filter((item) => item.id !== ticket.id)]);
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
            new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
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
    <div className="mx-auto max-w-6xl space-y-5" dir={dir}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600">
              <Headphones className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-black text-foreground">{t.support_title}</h1>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.support_subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormError('');
            setShowCreate((current) => !current);
          }}
          className="inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? t.support_cancel : t.support_new_ticket}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={createTicket} className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-bold">{t.support_subject}</span>
              <input
                value={subject}
                maxLength={120}
                disabled={creating}
                onChange={(event) => setSubject(event.target.value)}
                className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold">{t.support_category}</span>
              <select
                value={category}
                disabled={creating}
                onChange={(event) => setCategory(event.target.value as SupportCategory)}
                className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
              >
                {categoryValues.map((value) => (
                  <option key={value} value={value}>{categoryLabel(value)}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-4 block space-y-2">
            <span className="text-sm font-bold">{t.support_message}</span>
            <textarea
              value={newMessage}
              maxLength={4000}
              rows={4}
              disabled={creating}
              onChange={(event) => setNewMessage(event.target.value)}
              className="w-full resize-y rounded-xl border bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </label>
          {formError && <p className="mt-3 text-sm font-bold text-destructive">{formError}</p>}
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {creating ? t.support_sending : t.support_send}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border bg-card text-muted-foreground">
          <Loader2 className="me-2 h-5 w-5 animate-spin" />
          {t.support_loading}
        </div>
      ) : loadError ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-2xl border bg-card p-6 text-center">
          <p className="font-bold">{t.support_load_error}</p>
          <button type="button" onClick={() => void loadTickets()} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold">
            <RefreshCw className="h-4 w-4" />
            {t.support_retry}
          </button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed bg-card p-6 text-center">
          <MessageCircle className="h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-black">{t.support_empty_title}</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t.support_empty_body}</p>
        </div>
      ) : (
        <div className="grid min-h-[520px] overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[320px_1fr]">
          <div className="border-b lg:border-b-0 lg:border-e">
            <div className="max-h-64 space-y-2 overflow-y-auto p-3 lg:max-h-[620px]">
              {tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className={`w-full rounded-xl border p-3 text-start transition ${selectedId === ticket.id ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20' : 'hover:bg-muted/60'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <strong className="line-clamp-2 text-sm">{ticket.subject}</strong>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-bold">{statusLabel(ticket.status)}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{categoryLabel(ticket.category)}</p>
                  <time className="mt-2 block text-[10px] text-muted-foreground" dateTime={ticket.updated_at}>
                    {new Date(ticket.updated_at).toLocaleString(locale)}
                  </time>
                </button>
              ))}
            </div>
          </div>

          {selectedTicket ? (
            <div className="flex min-h-0 flex-col">
              <div className="border-b p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-black">{selectedTicket.subject}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{categoryLabel(selectedTicket.category)}</p>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold">{statusLabel(selectedTicket.status)}</span>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4 lg:max-h-[450px]">
                {selectedTicket.messages.map((message) => {
                  const merchantMessage = message.sender_type === 'merchant';
                  return (
                    <article key={message.id} className={`flex ${merchantMessage ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${merchantMessage ? 'border bg-background' : 'bg-orange-500 text-white'}`}>
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

              {selectedTicket.status !== 'closed' && selectedTicket.status !== 'resolved' && (
                <form onSubmit={sendReply} className="flex gap-2 border-t p-3">
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
                    {replying ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </button>
                </form>
              )}
              {formError && <p className="px-4 pb-3 text-sm font-bold text-destructive">{formError}</p>}
            </div>
          ) : (
            <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">{t.support_select_ticket}</div>
          )}
        </div>
      )}
    </div>
  );
}
'''

if SUPPORT_PAGE.exists():
    raise RuntimeError('SupportPage.tsx already exists')
SUPPORT_PAGE.write_text(support_page, encoding='utf-8')

append_translation_keys(AR, '''  support_nav: "الدعم",
  support_title: "الدعم وتواصل معنا",
  support_subtitle: "أرسل استفسارك أو مشكلتك وتابع الردود داخل محادثة الدعم.",
  support_new_ticket: "فتح تذكرة جديدة",
  support_cancel: "إلغاء",
  support_subject: "عنوان المشكلة",
  support_category: "نوع الطلب",
  support_message: "تفاصيل المشكلة",
  support_send: "إرسال الطلب",
  support_sending: "جارٍ الإرسال...",
  support_loading: "جارٍ تحميل تذاكر الدعم...",
  support_load_error: "تعذر تحميل تذاكر الدعم.",
  support_retry: "إعادة المحاولة",
  support_empty_title: "لا توجد تذاكر دعم",
  support_empty_body: "افتح تذكرة جديدة عند حاجتك إلى مساعدة من فريق فوري.",
  support_subject_required: "اكتب عنوانًا واضحًا للمشكلة.",
  support_message_required: "اكتب تفاصيل المشكلة.",
  support_create_error: "تعذر إنشاء تذكرة الدعم.",
  support_reply_error: "تعذر إرسال الرد.",
  support_reply_placeholder: "اكتب رسالتك لفريق الدعم...",
  support_reply: "إرسال الرد",
  support_select_ticket: "اختر تذكرة لعرض المحادثة.",
  support_status_open: "مفتوحة",
  support_status_in_progress: "قيد المعالجة",
  support_status_resolved: "تم الحل",
  support_status_closed: "مغلقة",
  support_category_technical: "مشكلة تقنية",
  support_category_billing: "الاشتراك والدفع",
  support_category_channels: "القنوات",
  support_category_account: "الحساب",
  support_category_other: "أخرى",''')

append_translation_keys(EN, '''  support_nav: "Support",
  support_title: "Support and Contact Us",
  support_subtitle: "Send your question or issue and follow replies in the support conversation.",
  support_new_ticket: "Open new ticket",
  support_cancel: "Cancel",
  support_subject: "Issue title",
  support_category: "Request type",
  support_message: "Issue details",
  support_send: "Send request",
  support_sending: "Sending...",
  support_loading: "Loading support tickets...",
  support_load_error: "Could not load support tickets.",
  support_retry: "Try again",
  support_empty_title: "No support tickets",
  support_empty_body: "Open a new ticket whenever you need help from the Fawri team.",
  support_subject_required: "Enter a clear issue title.",
  support_message_required: "Enter the issue details.",
  support_create_error: "Could not create the support ticket.",
  support_reply_error: "Could not send the reply.",
  support_reply_placeholder: "Write your message to support...",
  support_reply: "Send reply",
  support_select_ticket: "Select a ticket to view the conversation.",
  support_status_open: "Open",
  support_status_in_progress: "In progress",
  support_status_resolved: "Resolved",
  support_status_closed: "Closed",
  support_category_technical: "Technical issue",
  support_category_billing: "Subscription and billing",
  support_category_channels: "Channels",
  support_category_account: "Account",
  support_category_other: "Other",''')

append_translation_keys(KU, '''  support_nav: "پشتگیری",
  support_title: "پشتگیری و پەیوەندی بە ئێمەوە",
  support_subtitle: "پرسیار یان کێشەکەت بنێرە و وەڵامەکان لە گفتوگۆی پشتگیریدا بەدواداچوون بکە.",
  support_new_ticket: "کردنەوەی تیکێتی نوێ",
  support_cancel: "هەڵوەشاندنەوە",
  support_subject: "ناونیشانی کێشە",
  support_category: "جۆری داواکاری",
  support_message: "وردەکاریی کێشە",
  support_send: "ناردنی داواکاری",
  support_sending: "دەنێردرێت...",
  support_loading: "تیکێتەکانی پشتگیری بار دەکرێن...",
  support_load_error: "بارکردنی تیکێتەکانی پشتگیری سەرکەوتوو نەبوو.",
  support_retry: "هەوڵدانەوە",
  support_empty_title: "هیچ تیکێتی پشتگیری نییە",
  support_empty_body: "کاتێک پێویستت بە یارمەتی تیمی فورى هەیە تیکێتێکی نوێ بکەرەوە.",
  support_subject_required: "ناونیشانێکی ڕوون بۆ کێشەکە بنووسە.",
  support_message_required: "وردەکاریی کێشەکە بنووسە.",
  support_create_error: "دروستکردنی تیکێتی پشتگیری سەرکەوتوو نەبوو.",
  support_reply_error: "ناردنی وەڵام سەرکەوتوو نەبوو.",
  support_reply_placeholder: "نامەکەت بۆ تیمی پشتگیری بنووسە...",
  support_reply: "ناردنی وەڵام",
  support_select_ticket: "تیکێتێک هەڵبژێرە بۆ بینینی گفتوگۆکە.",
  support_status_open: "کراوە",
  support_status_in_progress: "لە ژێر چارەسەرکردندا",
  support_status_resolved: "چارەسەر کرا",
  support_status_closed: "داخراوە",
  support_category_technical: "کێشەی تەکنیکی",
  support_category_billing: "بەشداریکردن و پارەدان",
  support_category_channels: "کەناڵەکان",
  support_category_account: "هەژمار",
  support_category_other: "هی تر",''')

print('Added merchant support ticket API, page, navigation, realtime refresh, and translations.')
