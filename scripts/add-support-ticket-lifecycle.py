from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def sub_once(path: Path, pattern: str, replacement: str) -> None:
    text = path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"Expected one regex match in {path}, got {count}: {pattern[:120]!r}")
    path.write_text(updated, encoding="utf-8")


auth_path = ROOT / "artifacts/api-server/src/routes/auth.ts"
types_path = ROOT / "artifacts/fawri/src/lib/types.ts"
notifications_path = ROOT / "artifacts/fawri/src/pages/dashboard/NotificationsPage.tsx"
merchant_support_path = ROOT / "artifacts/fawri/src/pages/dashboard/SupportPage.tsx"
admin_support_path = ROOT / "artifacts/fawri/src/components/admin/AdminSupportTab.tsx"

# ---------------------------------------------------------------------------
# API: persistent lifecycle metadata, reminders, escalation and auto-close.
# ---------------------------------------------------------------------------
replace_once(
    auth_path,
    '''type MerchantNotificationRecord =
  | MerchantBalanceNotificationRecord
  | MerchantInspectionNotificationRecord;
''',
    '''type MerchantSupportReplyReminderNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "support_reply_reminder";
  ticket_id: string;
  ticket_subject: string;
  action_url: string;
  created_at: string;
  read_at?: string;
};

type MerchantNotificationRecord =
  | MerchantBalanceNotificationRecord
  | MerchantInspectionNotificationRecord
  | MerchantSupportReplyReminderNotificationRecord;
''',
)

replace_once(
    auth_path,
    '''type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";
type SupportMessageSender = "merchant" | "admin" | "system";
''',
    '''type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";
type SupportTicketWaitingOn = "admin" | "merchant";
type SupportAutoCloseReason = "merchant_inactivity";
type SupportMessageSender = "merchant" | "admin" | "system";
''',
)

replace_once(
    auth_path,
    '''  updated_at: string;
  closed_at?: string;
  messages: SupportTicketMessage[];
''',
    '''  updated_at: string;
  closed_at?: string;
  waiting_on?: SupportTicketWaitingOn;
  waiting_since?: string;
  merchant_reminder_sent_at?: string;
  assistant_reminder_sent_at?: string;
  owner_escalated_at?: string;
  auto_closed_at?: string;
  auto_closed_reason?: SupportAutoCloseReason;
  messages: SupportTicketMessage[];
''',
)

replace_once(
    auth_path,
    '''  if (item.type === "subscription_balance_purchase") return true;

  return (
    item.type === "inspection_session_request" &&
''',
    '''  if (item.type === "subscription_balance_purchase") return true;

  if (item.type === "support_reply_reminder") {
    return (
      typeof item.ticket_id === "string" &&
      typeof item.ticket_subject === "string" &&
      typeof item.action_url === "string"
    );
  }

  return (
    item.type === "inspection_session_request" &&
''',
)

replace_once(
    auth_path,
    '''const ACCOUNT_CHANNEL_ACTIVATION_MS =
  ACCOUNT_CHANNEL_ACTIVATION_DAYS * 24 * 60 * 60 * 1000;
''',
    '''const ACCOUNT_CHANNEL_ACTIVATION_MS =
  ACCOUNT_CHANNEL_ACTIVATION_DAYS * 24 * 60 * 60 * 1000;

function supportDurationMs(envName: string, fallbackMinutes: number): number {
  const configuredMinutes = Number(process.env[envName]);
  const minutes =
    Number.isFinite(configuredMinutes) && configuredMinutes > 0
      ? configuredMinutes
      : fallbackMinutes;
  return minutes * 60 * 1000;
}

const SUPPORT_ASSISTANT_REMINDER_MS = supportDurationMs(
  "SUPPORT_ASSISTANT_REMINDER_MINUTES",
  24 * 60,
);
const SUPPORT_OWNER_ESCALATION_MS = supportDurationMs(
  "SUPPORT_OWNER_ESCALATION_MINUTES",
  48 * 60,
);
const SUPPORT_MERCHANT_REMINDER_MS = supportDurationMs(
  "SUPPORT_MERCHANT_REMINDER_MINUTES",
  24 * 60,
);
const SUPPORT_MERCHANT_AUTO_CLOSE_MS = supportDurationMs(
  "SUPPORT_AUTO_CLOSE_MINUTES",
  72 * 60,
);
const SUPPORT_LIFECYCLE_SWEEP_MS =
  process.env.NODE_ENV === "production" ? 60_000 : 5_000;
''',
)

replace_once(
    auth_path,
    '''            .map((ticket) => ({
              ...ticket,
              inspection_requests: normalizeInspectionRequests(
                ticket.inspection_requests,
                ticket.status,
              ),
            }))
''',
    '''            .map((ticket) =>
              normalizeSupportTicketLifecycle({
                ...ticket,
                inspection_requests: normalizeInspectionRequests(
                  ticket.inspection_requests,
                  ticket.status,
                ),
              }),
            )
''',
)

replace_once(
    auth_path,
    '''function refreshInspectionRequestExpirations(db: AuthDb): boolean {
''',
    '''function normalizeSupportTicketLifecycle(
  ticket: SupportTicketRecord,
): SupportTicketRecord {
  const lastHumanMessage = [...ticket.messages]
    .reverse()
    .find(
      (message) =>
        message.sender_type === "merchant" || message.sender_type === "admin",
    );
  const waitingOn: SupportTicketWaitingOn =
    ticket.waiting_on === "merchant" || ticket.waiting_on === "admin"
      ? ticket.waiting_on
      : lastHumanMessage?.sender_type === "admin"
        ? "merchant"
        : "admin";
  const waitingSince =
    typeof ticket.waiting_since === "string" &&
    Number.isFinite(new Date(ticket.waiting_since).getTime())
      ? ticket.waiting_since
      : lastHumanMessage?.created_at || ticket.updated_at || ticket.created_at;

  return {
    ...ticket,
    waiting_on: waitingOn,
    waiting_since: waitingSince,
  };
}

function setSupportTicketWaitingOn(
  ticket: SupportTicketRecord,
  waitingOn: SupportTicketWaitingOn,
  waitingSince: string,
): void {
  ticket.waiting_on = waitingOn;
  ticket.waiting_since = waitingSince;
  delete ticket.merchant_reminder_sent_at;
  delete ticket.assistant_reminder_sent_at;
  delete ticket.owner_escalated_at;
}

function refreshInspectionRequestExpirations(db: AuthDb): boolean {
''',
)

replace_once(
    auth_path,
    '''function appendMerchantBalanceNotification(
''',
    '''function appendSystemAdminLog(
  db: AuthDb,
  ticket: SupportTicketRecord,
  actionType: string,
  details: string,
): AdminLogRecord {
  const log: AdminLogRecord = {
    id: makeId("admin-log"),
    admin_name: "Fawri System",
    admin_phone: "system",
    action_type: actionType,
    merchant_id: ticket.merchant_id,
    merchant_name: ticket.merchant_name,
    details,
    meta: {
      ticket_id: ticket.id,
      subject: ticket.subject,
    },
    created_at: now(),
  };
  db.admin_logs.unshift(log);
  return log;
}

function appendMerchantBalanceNotification(
''',
)

replace_once(
    auth_path,
    '''type MerchantRealtimeEventName =
''',
    '''function appendMerchantSupportReplyReminderNotification(
  db: AuthDb,
  ticket: SupportTicketRecord,
): MerchantSupportReplyReminderNotificationRecord {
  const notification: MerchantSupportReplyReminderNotificationRecord = {
    id: makeId("merchant-notification"),
    merchant_id: ticket.merchant_id,
    type: "support_reply_reminder",
    ticket_id: ticket.id,
    ticket_subject: ticket.subject,
    action_url: `/dashboard/support?ticket=${encodeURIComponent(ticket.id)}`,
    created_at: now(),
  };
  db.merchant_notifications.unshift(notification);

  const merchantNotificationIds = db.merchant_notifications
    .filter((item) => item.merchant_id === ticket.merchant_id)
    .slice(100)
    .map((item) => item.id);
  if (merchantNotificationIds.length > 0) {
    const expiredIds = new Set(merchantNotificationIds);
    db.merchant_notifications = db.merchant_notifications.filter(
      (item) => !expiredIds.has(item.id),
    );
  }

  return notification;
}

type SupportLifecycleRefreshResult = {
  changed: boolean;
  merchantIds: Set<string>;
  notificationMerchantIds: Set<string>;
};

function supportSystemMessage(
  language: Lang,
): { senderName: string; body: string } {
  if (language === "en") {
    return {
      senderName: "Fawri",
      body: "This ticket was closed automatically because no merchant reply was received for 72 hours. You can open a new ticket if the issue continues.",
    };
  }
  if (language === "ku") {
    return {
      senderName: "فورى",
      body: "ئەم تیکێتە خۆکارانە داخرا، چونکە بۆ ماوەی ٧٢ کاتژمێر هیچ وەڵامێک لە بازرگانەوە نەگەیشت. ئەگەر کێشەکە بەردەوامە دەتوانیت تیکێتێکی نوێ بکەیتەوە.",
    };
  }
  return {
    senderName: "فوري",
    body: "تم إغلاق هذه التذكرة تلقائيًا لعدم ورود رد من التاجر خلال 72 ساعة. يمكنك فتح تذكرة جديدة إذا استمرت المشكلة.",
  };
}

function refreshSupportTicketLifecycle(
  db: AuthDb,
): SupportLifecycleRefreshResult {
  const timestamp = Date.now();
  const merchantIds = new Set<string>();
  const notificationMerchantIds = new Set<string>();
  let changed = false;

  for (const rawTicket of db.support_tickets) {
    const ticket = normalizeSupportTicketLifecycle(rawTicket);
    Object.assign(rawTicket, ticket);
    if (ticket.status !== "open" && ticket.status !== "in_progress") continue;

    const waitingSince = new Date(ticket.waiting_since || ticket.updated_at).getTime();
    if (!Number.isFinite(waitingSince)) continue;
    const elapsed = timestamp - waitingSince;

    if (ticket.waiting_on === "merchant") {
      if (
        !ticket.merchant_reminder_sent_at &&
        elapsed >= SUPPORT_MERCHANT_REMINDER_MS
      ) {
        const existingReminder = db.merchant_notifications.find(
          (notification) =>
            notification.type === "support_reply_reminder" &&
            notification.merchant_id === ticket.merchant_id &&
            notification.ticket_id === ticket.id &&
            new Date(notification.created_at).getTime() >= waitingSince,
        );
        const reminder =
          existingReminder ||
          appendMerchantSupportReplyReminderNotification(db, ticket);
        ticket.merchant_reminder_sent_at = reminder.created_at;
        merchantIds.add(ticket.merchant_id);
        notificationMerchantIds.add(ticket.merchant_id);
        changed = true;
      }

      if (elapsed >= SUPPORT_MERCHANT_AUTO_CLOSE_MS) {
        const closedAt = now();
        ticket.status = "closed";
        ticket.closed_at = closedAt;
        ticket.updated_at = closedAt;
        ticket.auto_closed_at = closedAt;
        ticket.auto_closed_reason = "merchant_inactivity";

        const merchant = findRegularMerchant(db, ticket.merchant_id);
        const systemMessageText = supportSystemMessage(
          merchant?.language || "ar",
        );
        ticket.messages.push({
          id: makeId("support-message"),
          sender_type: "system",
          sender_id: "system",
          sender_name: systemMessageText.senderName,
          body: systemMessageText.body,
          created_at: closedAt,
        });

        for (const notification of db.merchant_notifications) {
          if (
            notification.type === "support_reply_reminder" &&
            notification.merchant_id === ticket.merchant_id &&
            notification.ticket_id === ticket.id &&
            !notification.read_at
          ) {
            notification.read_at = closedAt;
            notificationMerchantIds.add(ticket.merchant_id);
          }
        }

        appendSystemAdminLog(
          db,
          ticket,
          "support_ticket_auto_closed_merchant_inactivity",
          "Ticket auto-closed after 72 hours without a merchant reply",
        );
        merchantIds.add(ticket.merchant_id);
        changed = true;
      }
      continue;
    }

    if (
      !ticket.assistant_reminder_sent_at &&
      elapsed >= SUPPORT_ASSISTANT_REMINDER_MS
    ) {
      ticket.assistant_reminder_sent_at = now();
      changed = true;
    }

    if (
      !ticket.owner_escalated_at &&
      elapsed >= SUPPORT_OWNER_ESCALATION_MS
    ) {
      ticket.owner_escalated_at = now();
      appendSystemAdminLog(
        db,
        ticket,
        "support_ticket_owner_escalated",
        "Ticket escalated to the owner because the merchant is still waiting for support",
      );
      changed = true;
    }
  }

  if (changed) refreshInspectionRequestExpirations(db);
  return { changed, merchantIds, notificationMerchantIds };
}

type MerchantRealtimeEventName =
''',
)

replace_once(
    auth_path,
    '''function isChannelPlatform(value: unknown): value is ChannelPlatform {
''',
    '''function refreshAndPersistSupportLifecycle(db: AuthDb): boolean {
  const lifecycle = refreshSupportTicketLifecycle(db);
  const inspectionChanged = refreshInspectionRequestExpirations(db);
  if (!lifecycle.changed && !inspectionChanged) return false;

  writeDb(db);
  for (const merchantId of lifecycle.merchantIds) {
    emitMerchantRealtimeState(db, merchantId, "support_updated");
  }
  for (const merchantId of lifecycle.notificationMerchantIds) {
    emitMerchantRealtimeState(db, merchantId, "notifications_updated");
  }
  return true;
}

const supportLifecycleTimer = setInterval(() => {
  try {
    refreshAndPersistSupportLifecycle(ensureDb());
  } catch (error) {
    console.error("Support ticket lifecycle sweep failed:", error);
  }
}, SUPPORT_LIFECYCLE_SWEEP_MS);
supportLifecycleTimer.unref();

function isChannelPlatform(value: unknown): value is ChannelPlatform {
''',
)

replace_once(
    auth_path,
    '''  const db = ensureDb();
  if (refreshInspectionRequestExpirations(db)) writeDb(db);
  const unreadOnly = String(req.query.unread || "") === "1";
''',
    '''  const db = ensureDb();
  refreshAndPersistSupportLifecycle(db);
  const unreadOnly = String(req.query.unread || "") === "1";
''',
)

replace_once(
    auth_path,
    '''router.get("/support/tickets", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  if (refreshInspectionRequestExpirations(db)) writeDb(db);
''',
    '''router.get("/support/tickets", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  refreshAndPersistSupportLifecycle(db);
''',
)

replace_once(
    auth_path,
    '''    status: "open",
    created_at: createdAt,
    updated_at: createdAt,
    inspection_requests: [],
''',
    '''    status: "open",
    created_at: createdAt,
    updated_at: createdAt,
    waiting_on: "admin",
    waiting_since: createdAt,
    inspection_requests: [],
''',
)

replace_once(
    auth_path,
    '''    const db = ensureDb();
    if (refreshInspectionRequestExpirations(db)) writeDb(db);
    const ticket = db.support_tickets.find(
''',
    '''    const db = ensureDb();
    refreshAndPersistSupportLifecycle(db);
    const ticket = db.support_tickets.find(
''',
)

replace_once(
    auth_path,
    '''    ticket.messages.push(supportMessage);
    ticket.updated_at = supportMessage.created_at;
    writeDb(db);
    emitMerchantRealtimeState(db, merchantId, "support_updated");
''',
    '''    ticket.messages.push(supportMessage);
    ticket.updated_at = supportMessage.created_at;
    setSupportTicketWaitingOn(ticket, "admin", supportMessage.created_at);
    let notificationChanged = false;
    for (const notification of db.merchant_notifications) {
      if (
        notification.type === "support_reply_reminder" &&
        notification.merchant_id === merchantId &&
        notification.ticket_id === ticket.id &&
        !notification.read_at
      ) {
        notification.read_at = supportMessage.created_at;
        notificationChanged = true;
      }
    }
    writeDb(db);
    emitMerchantRealtimeState(db, merchantId, "support_updated");
    if (notificationChanged) {
      emitMerchantRealtimeState(db, merchantId, "notifications_updated");
    }
''',
)

replace_once(
    auth_path,
    '''  const db = ensureDb();
  if (refreshInspectionRequestExpirations(db)) writeDb(db);
  const tickets = [...db.support_tickets].sort(
''',
    '''  const db = ensureDb();
  refreshAndPersistSupportLifecycle(db);
  const tickets = [...db.support_tickets].sort(
''',
)

replace_once(
    auth_path,
    '''    ticket.messages.push(message);
    ticket.status = "in_progress";
    ticket.updated_at = message.created_at;

    appendAdminLog(
''',
    '''    ticket.messages.push(message);
    ticket.status = "in_progress";
    ticket.updated_at = message.created_at;
    setSupportTicketWaitingOn(ticket, "merchant", message.created_at);

    appendAdminLog(
''',
)

# ---------------------------------------------------------------------------
# Shared frontend notification types.
# ---------------------------------------------------------------------------
replace_once(
    types_path,
    '''export type MerchantNotification =
  | MerchantBalanceNotification
  | MerchantInspectionNotification;
''',
    '''export interface MerchantSupportReplyReminderNotification {
  id: string;
  merchant_id: string;
  type: 'support_reply_reminder';
  ticket_id: string;
  ticket_subject: string;
  action_url: string;
  created_at: string;
  read_at?: string;
}

export type MerchantNotification =
  | MerchantBalanceNotification
  | MerchantInspectionNotification
  | MerchantSupportReplyReminderNotification;
''',
)

# ---------------------------------------------------------------------------
# Merchant notification center: render the 24-hour reply reminder.
# ---------------------------------------------------------------------------
replace_once(
    notifications_path,
    '''import { Bell, Check, ExternalLink, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
''',
    '''import { Bell, Check, ExternalLink, Loader2, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react';
''',
)

replace_once(
    notifications_path,
    '''  MerchantInspectionNotification,
  MerchantNotification,
} from '@/lib/types';
''',
    '''  MerchantInspectionNotification,
  MerchantNotification,
  MerchantSupportReplyReminderNotification,
} from '@/lib/types';
''',
)

replace_once(
    notifications_path,
    '''} as const;

export default function NotificationsPage() {
''',
    '''} as const;

const SUPPORT_REPLY_REMINDER_TEXT = {
  ar: {
    title: 'تذكير: ننتظر ردك',
    body: 'فريق الدعم رد على تذكرة «{ticket}» وينتظر ردك. ستُغلق التذكرة تلقائيًا بعد 72 ساعة من آخر رد للدعم إذا لم يصل رد منك.',
    open: 'فتح التذكرة',
  },
  ku: {
    title: 'بیرهێنانەوە: چاوەڕوانی وەڵامەکەتین',
    body: 'تیمی پشتگیری وەڵامی تیکێتی «{ticket}»ی داوەتەوە و چاوەڕوانی وەڵامەکەتە. ئەگەر وەڵام نەدەیت، تیکێتەکە دوای ٧٢ کاتژمێر لە دوا وەڵامی پشتگیری خۆکارانە دادەخرێت.',
    open: 'کردنەوەی تیکێت',
  },
  en: {
    title: 'Reminder: awaiting your reply',
    body: 'Support replied to the “{ticket}” ticket and is waiting for you. The ticket will close automatically 72 hours after the latest support reply if you do not respond.',
    open: 'Open ticket',
  },
} as const;

export default function NotificationsPage() {
''',
)

replace_once(
    notifications_path,
    '''  const inspectionText =
    lang === 'en'
      ? INSPECTION_NOTIFICATION_TEXT.en
      : lang === 'ku'
        ? INSPECTION_NOTIFICATION_TEXT.ku
        : INSPECTION_NOTIFICATION_TEXT.ar;
''',
    '''  const inspectionText =
    lang === 'en'
      ? INSPECTION_NOTIFICATION_TEXT.en
      : lang === 'ku'
        ? INSPECTION_NOTIFICATION_TEXT.ku
        : INSPECTION_NOTIFICATION_TEXT.ar;
  const supportReminderText =
    lang === 'en'
      ? SUPPORT_REPLY_REMINDER_TEXT.en
      : lang === 'ku'
        ? SUPPORT_REPLY_REMINDER_TEXT.ku
        : SUPPORT_REPLY_REMINDER_TEXT.ar;
''',
)

replace_once(
    notifications_path,
    '''  const openInspectionRequest = async (
    notification: MerchantInspectionNotification,
  ) => {
    if (!notification.read_at) await markAsRead(notification.id);
    window.location.assign(notification.action_url);
  };
''',
    '''  const openNotificationAction = async (
    notification:
      | MerchantInspectionNotification
      | MerchantSupportReplyReminderNotification,
  ) => {
    if (!notification.read_at) await markAsRead(notification.id);
    window.location.assign(notification.action_url);
  };
''',
)

replace_once(
    notifications_path,
    '''            if (notification.type === 'inspection_session_request') {
''',
    '''            if (notification.type === 'support_reply_reminder') {
              const body = formatNotificationText(supportReminderText.body, {
                ticket: notification.ticket_subject,
              });
              return (
                <article
                  key={notification.id}
                  className={`rounded-2xl border p-4 shadow-sm transition-colors sm:p-5 ${
                    unread
                      ? 'border-orange-300 bg-orange-50/80 dark:border-orange-800 dark:bg-orange-950/25'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      unread
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      <MessageCircle className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="font-black text-foreground">{supportReminderText.title}</h2>
                        <time className="text-[11px] font-medium text-muted-foreground" dateTime={notification.created_at}>
                          {new Date(notification.created_at).toLocaleString(locale)}
                        </time>
                      </div>
                      <p className="mt-2 text-sm font-medium leading-7 text-foreground/90">{body}</p>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          disabled={marking}
                          onClick={() => void openNotificationAction(notification)}
                          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                          {supportReminderText.open}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            }

            if (notification.type === 'inspection_session_request') {
''',
)

replace_once(
    notifications_path,
    '''onClick={() => void openInspectionRequest(notification)}''',
    '''onClick={() => void openNotificationAction(notification)}''',
)

# ---------------------------------------------------------------------------
# Merchant support page: derived waiting labels and auto-close reason.
# ---------------------------------------------------------------------------
replace_once(
    merchant_support_path,
    '''type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
''',
    '''type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type SupportWaitingOn = 'admin' | 'merchant';
''',
)

replace_once(
    merchant_support_path,
    '''  updated_at: string;
  messages: SupportMessage[];
''',
    '''  updated_at: string;
  closed_at?: string;
  waiting_on?: SupportWaitingOn;
  waiting_since?: string;
  merchant_reminder_sent_at?: string;
  auto_closed_at?: string;
  auto_closed_reason?: 'merchant_inactivity';
  messages: SupportMessage[];
''',
)

replace_once(
    merchant_support_path,
    '''const categoryValues: SupportCategory[] = [
''',
    '''const SUPPORT_LIFECYCLE_TEXT = {
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
''',
)

replace_once(
    merchant_support_path,
    '''  const inspectionText = lang === 'en' ? INSPECTION_TEXT.en : lang === 'ku' ? INSPECTION_TEXT.ku : INSPECTION_TEXT.ar;
''',
    '''  const inspectionText = lang === 'en' ? INSPECTION_TEXT.en : lang === 'ku' ? INSPECTION_TEXT.ku : INSPECTION_TEXT.ar;
  const lifecycleText =
    lang === 'en'
      ? SUPPORT_LIFECYCLE_TEXT.en
      : lang === 'ku'
        ? SUPPORT_LIFECYCLE_TEXT.ku
        : SUPPORT_LIFECYCLE_TEXT.ar;
''',
)

replace_once(
    merchant_support_path,
    '''  const statusLabel = (value: SupportStatus) =>
    ({
      open: t.support_status_open,
      in_progress: t.support_status_in_progress,
      resolved: t.support_status_resolved,
      closed: t.support_status_closed,
    })[value];
''',
    '''  const statusLabel = (ticket: SupportTicket) => {
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
''',
)

replace_once(merchant_support_path, '''{statusLabel(ticket.status)}''', '''{statusLabel(ticket)}''')
replace_once(merchant_support_path, '''{statusLabel(selectedTicket.status)}''', '''{statusLabel(selectedTicket)}''')

replace_once(
    merchant_support_path,
    '''                </div>
              </div>

              {latestInspectionRequest && (
''',
    '''                </div>
                {selectedTicket.auto_closed_reason === 'merchant_inactivity' && (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-900 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100">
                    {lifecycleText.autoClosed}
                  </p>
                )}
              </div>

              {latestInspectionRequest && (
''',
)

# ---------------------------------------------------------------------------
# Admin support page: persistent assistant reminder and owner escalation.
# ---------------------------------------------------------------------------
replace_once(
    admin_support_path,
    '''export type AdminSupportTicketStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed';
''',
    '''export type AdminSupportTicketStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed';
type AdminSupportWaitingOn = 'admin' | 'merchant';
''',
)

replace_once(
    admin_support_path,
    '''  updated_at: string;
  closed_at?: string;
  messages: AdminSupportMessage[];
''',
    '''  updated_at: string;
  closed_at?: string;
  waiting_on?: AdminSupportWaitingOn;
  waiting_since?: string;
  merchant_reminder_sent_at?: string;
  assistant_reminder_sent_at?: string;
  owner_escalated_at?: string;
  auto_closed_at?: string;
  auto_closed_reason?: 'merchant_inactivity';
  messages: AdminSupportMessage[];
''',
)

replace_once(
    admin_support_path,
    '''    ownerNotice: 'وضع المراقبة فقط: يمكنك مشاهدة سير العمل دون استلام التذاكر أو الرد عليها.',
''',
    '''    ownerNotice: 'وضع المراقبة فقط: يمكنك مشاهدة سير العمل دون استلام التذاكر أو الرد عليها.',
    waitingMerchant: 'بانتظار رد التاجر',
    waitingAdmin: 'بانتظار رد فريق الدعم',
    assistantReminderBanner: 'تنبيه: التاجر ما زال بانتظار رد من فريق الدعم.',
    assistantReminderToast: 'توجد تذكرة ما زال التاجر ينتظر الرد عليها.',
    ownerEscalationBanner: 'تم تصعيد هذه التذكرة للمالك بسبب تأخر رد فريق الدعم.',
    ownerEscalationToast: 'وصل تصعيد جديد لتذكرة متأخرة في الدعم.',
    ownerEscalationSummary: 'تذاكر مصعّدة للمتابعة: {count}',
    autoClosedMerchant: 'أُغلقت تلقائيًا لعدم رد التاجر خلال 72 ساعة.',
''',
)
replace_once(
    admin_support_path,
    '''    ownerNotice: 'تەنها چاودێریکردن: دەتوانیت ڕەوتی کار ببینیت بەبێ وەرگرتن یان وەڵامدانەوەی تیکێتەکان.',
''',
    '''    ownerNotice: 'تەنها چاودێریکردن: دەتوانیت ڕەوتی کار ببینیت بەبێ وەرگرتن یان وەڵامدانەوەی تیکێتەکان.',
    waitingMerchant: 'چاوەڕوانی وەڵامی بازرگان',
    waitingAdmin: 'چاوەڕوانی وەڵامی تیمی پشتگیری',
    assistantReminderBanner: 'ئاگاداری: بازرگان هێشتا چاوەڕوانی وەڵامی تیمی پشتگیرییە.',
    assistantReminderToast: 'تیکێتێک هەیە کە بازرگان هێشتا چاوەڕوانی وەڵامە.',
    ownerEscalationBanner: 'ئەم تیکێتە بەهۆی دواخستنی وەڵامی پشتگیری بۆ خاوەن سیستەم بەرزکرایەوە.',
    ownerEscalationToast: 'تیکێتێکی دواخراو بۆ چاودێری بەرزکرایەوە.',
    ownerEscalationSummary: 'تیکێتی بەرزکراوە بۆ چاودێری: {count}',
    autoClosedMerchant: 'بەهۆی نەبوونی وەڵامی بازرگان لە ماوەی ٧٢ کاتژمێردا خۆکارانە داخرا.',
''',
)
replace_once(
    admin_support_path,
    '''    ownerNotice: 'Monitor-only mode: you can review workflow but cannot claim tickets or reply.',
''',
    '''    ownerNotice: 'Monitor-only mode: you can review workflow but cannot claim tickets or reply.',
    waitingMerchant: 'Waiting for merchant reply',
    waitingAdmin: 'Waiting for support reply',
    assistantReminderBanner: 'Reminder: the merchant is still waiting for a support reply.',
    assistantReminderToast: 'A merchant is still waiting for a support reply.',
    ownerEscalationBanner: 'This ticket was escalated to the owner because support has not replied.',
    ownerEscalationToast: 'A delayed support ticket was escalated for monitoring.',
    ownerEscalationSummary: 'Escalated tickets: {count}',
    autoClosedMerchant: 'Automatically closed after 72 hours without a merchant reply.',
''',
)

replace_once(
    admin_support_path,
    '''  const conversationRef = useRef<HTMLDivElement | null>(null);
''',
    '''  const conversationRef = useRef<HTMLDivElement | null>(null);
  const seenLifecycleAlertsRef = useRef<Set<string>>(new Set());
''',
)

replace_once(
    admin_support_path,
    '''  const activeCount = useMemo(
''',
    '''  const ownerEscalationCount = useMemo(
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
''',
)

replace_once(
    admin_support_path,
    '''      const nextTickets = data.tickets as AdminSupportTicket[];
      setTickets(nextTickets);
''',
    '''      const nextTickets = data.tickets as AdminSupportTicket[];
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
''',
)

replace_once(
    admin_support_path,
    '''  }, []);

  useEffect(() => {
    void loadTickets();
''',
    '''  }, [adminId, isOwner, text.assistantReminderToast, text.ownerEscalationToast]);

  useEffect(() => {
    void loadTickets();
''',
)

replace_once(
    admin_support_path,
    '''  const statusLabel = (status: AdminSupportTicketStatus) =>
    ({
      open: text.statusOpen,
      in_progress: text.statusInProgress,
      resolved: text.statusResolved,
      closed: text.statusClosed,
    })[status];
''',
    '''  const statusLabel = (ticket: AdminSupportTicket) => {
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
''',
)

replace_once(admin_support_path, '''{statusLabel(ticket.status)}''', '''{statusLabel(ticket)}''')
replace_once(admin_support_path, '''{statusLabel(selectedTicket.status)}''', '''{statusLabel(selectedTicket)}''')

replace_once(
    admin_support_path,
    '''              {isOwner && (
                <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[10px] font-semibold leading-4 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100">
                  {text.ownerNotice}
                </p>
              )}
''',
    '''              {isOwner && (
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
''',
)

replace_once(
    admin_support_path,
    '''                {!isOwner && isAssignedToOther && (
''',
    '''                {!isOwner &&
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
''',
)

print("Added support ticket waiting lifecycle, reminders, owner escalation, and 72-hour auto-close.")
