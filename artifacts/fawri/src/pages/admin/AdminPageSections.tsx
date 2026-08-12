
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { getAdminText } from "@/lib/admin-translations";
import { getLocalizedActivity } from "@/lib/activity-translations";
import {
  getMerchantStatusLabel,
  getSubscriptionStatusLabel,
} from "@/lib/admin-status-translations";
import {
  getMerchants,
  saveMerchants,
  getSubscriptions,
  saveSubscriptions,
  getAdminAuthHeaders,
  clearSession,
  getAdminLogs,
  getAdminNotes,
  getChannelOverrides,
} from "@/lib/store";
import {
  Merchant,
  Subscription,
  AdminLog,
  AdminLogMeta,
  AdminPermission,
  MerchantDeletionRequest,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import DeleteMerchantDialog from "@/components/DeleteMerchantDialog";
import AdministratorsTab from "@/components/admin/AdministratorsTab";
import RequiredAdminPasswordChangeDialog from "@/components/admin/RequiredAdminPasswordChangeDialog";
import AdminSupportTab, { getAdminSupportText } from "@/components/admin/AdminSupportTab";
import {
  LogOut,
  Search,
  MoreVertical,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCcw,
  Plus,
  Minus,
  Power,
  PowerOff,
  FileText,
  MessageSquare,
} from "lucide-react";
import {
  FaInstagram,
  FaFacebookMessenger,
  FaTelegram,
  FaWhatsapp,
  FaTiktok,
} from "react-icons/fa";
export const PLANS = {
  silver: {
    label: "Silver",
    price: 25000,
    limit: 4000,
    emergency: 400,
  },
  gold: {
    label: "Gold",
    price: 49000,
    limit: 8000,
    emergency: 800,
  },
  diamond: {
    label: "Diamond",
    price: 75000,
    limit: 14000,
    emergency: 1400,
  },
} as const;
export type PlanKey = keyof typeof PLANS;
export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  const styles: Record<string, string> = {
    pending_activation:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200",
    approved:
      "bg-green-100  text-green-800  dark:bg-green-900/50  dark:text-green-200",
    suspended:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200",
    rejected:
      "bg-red-100    text-red-800    dark:bg-red-900/50 dark:text-red-200",
  };
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${styles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {label}
    </span>
  );
}
export function SubBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  const styles: Record<string, string> = {
    active:
      "bg-green-100  text-green-800  dark:bg-green-900/50  dark:text-green-200",
    expired:
      "bg-red-100    text-red-800    dark:bg-red-900/50    dark:text-red-200",
    suspended:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200",
    replies_exhausted:
      "bg-red-100    text-red-800    dark:bg-red-900/50    dark:text-red-200",
    pending_activation:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200",
  };
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${styles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {label}
    </span>
  );
}
export function AutoReplyBadge({
  enabled,
  enabledLabel,
  disabledLabel,
}: {
  enabled: boolean;
  enabledLabel: string;
  disabledLabel: string;
}) {
  const Icon = enabled ? Power : PowerOff;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium whitespace-nowrap " +
        (enabled
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
          : "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200")
      }
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {enabled ? enabledLabel : disabledLabel}
    </span>
  );
}
export function MerchantStatusSummary({
  merchant,
  subscription,
  accountStatusLabel,
  subscriptionStatusLabel,
  autoRepliesLabel,
  merchantStatusText,
  subscriptionStatusText,
  enabledLabel,
  disabledLabel,
  compact = false,
}: {
  merchant: Merchant;
  subscription?: Subscription;
  accountStatusLabel: string;
  subscriptionStatusLabel: string;
  autoRepliesLabel: string;
  merchantStatusText: string;
  subscriptionStatusText?: string;
  enabledLabel: string;
  disabledLabel: string;
  compact?: boolean;
}) {
  const statusItems = [
    {
      label: accountStatusLabel,
      content: <StatusBadge status={merchant.status} label={merchantStatusText} />,
    },
    ...(subscription
      ? [
          {
            label: subscriptionStatusLabel,
            content: (
              <SubBadge
                status={subscription.status}
                label={subscriptionStatusText ?? subscription.status}
              />
            ),
          },
          {
            label: autoRepliesLabel,
            content: (
              <AutoReplyBadge
                enabled={subscription.auto_reply_enabled}
                enabledLabel={enabledLabel}
                disabledLabel={disabledLabel}
              />
            ),
          },
        ]
      : []),
  ];
  return (
    <div
      className={
        compact
          ? "flex min-h-[190px] h-full flex-col justify-center gap-2 rounded-xl border border-border/80 bg-muted/20 p-3 shadow-sm"
          : "grid gap-2 sm:grid-cols-3"
      }
    >
      {statusItems.map((item) => (
        <div
          key={item.label}
          className={
            "rounded-lg border border-border/70 bg-background/80 " +
            (compact ? "px-2.5 py-2" : "px-3 py-2.5")
          }
        >
          <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">
            {item.label}
          </p>
          {item.content}
        </div>
      ))}
    </div>
  );
}
export function SubscriptionUsageSummary({
  subscription,
  planName,
  locale,
  baseUsedLabel,
  baseRemainingLabel,
  baseLimitLabel,
  addonBalanceLabel,
  totalAvailableLabel,
  compact = false,
}: {
  subscription: Subscription;
  planName: string;
  locale: string;
  baseUsedLabel: string;
  baseRemainingLabel: string;
  baseLimitLabel: string;
  addonBalanceLabel: string;
  totalAvailableLabel: string;
  compact?: boolean;
}) {
  const baseReplyLimit = subscription.base_reply_limit ?? subscription.reply_limit;
  const baseRepliesUsed =
    subscription.base_replies_used ??
    Math.min(subscription.replies_used, baseReplyLimit);
  const baseRepliesRemaining =
    subscription.base_replies_remaining ??
    Math.max(0, baseReplyLimit - baseRepliesUsed);
  const addonRepliesRemaining = subscription.addon_replies_remaining ?? 0;
  const totalRepliesAvailable =
    baseRepliesRemaining + addonRepliesRemaining;
  const exactPercentage =
    baseReplyLimit > 0 ? (baseRepliesUsed / baseReplyLimit) * 100 : 0;
  const percentageText = formatUsagePercentage(
    baseRepliesUsed,
    baseReplyLimit,
    locale,
  );
  const progressWidth =
    baseRepliesUsed > 0
      ? Math.max(0.5, Math.min(100, exactPercentage))
      : 0;
  const roundedPercentage = Math.round(exactPercentage);
  const balanceItems = [
    [addonBalanceLabel, addonRepliesRemaining],
    [totalAvailableLabel, totalRepliesAvailable],
  ] as const;
  return (
    <div
      className={
        "rounded-xl border border-border/80 bg-gradient-to-b from-muted/35 to-background shadow-sm " +
        (compact
          ? "flex min-h-[190px] h-full min-w-0 flex-col justify-center gap-2.5 p-3"
          : "space-y-2.5 p-3.5")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold capitalize text-foreground">
          {planName}
        </span>
        <span
          className="rounded-full bg-background px-2 py-1 text-[11px] font-semibold tabular-nums text-muted-foreground shadow-sm"
          dir="ltr"
        >
          {percentageText}
        </span>
      </div>
      <div className="rounded-lg border border-border/60 bg-background px-2.5 py-2">
        <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
          <span>{baseLimitLabel}</span>
          <strong className="text-xs font-bold tabular-nums text-foreground" dir="ltr">
            {baseReplyLimit.toLocaleString(locale)}
          </strong>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, roundedPercentage)}
        >
          <div
            className={
              "h-full rounded-full transition-all " +
              (roundedPercentage >= 90
                ? "bg-red-500"
                : roundedPercentage >= 80
                  ? "bg-yellow-500"
                  : "bg-primary")
            }
            style={{ width: String(progressWidth) + "%" }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-[9px] text-muted-foreground">
          <span>
            {baseUsedLabel}: <strong className="tabular-nums text-foreground" dir="ltr">{baseRepliesUsed.toLocaleString(locale)}</strong>
          </span>
          <span>
            {baseRemainingLabel}: <strong className="tabular-nums text-foreground" dir="ltr">{baseRepliesRemaining.toLocaleString(locale)}</strong>
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {balanceItems.map(([label, value]) => (
          <div
            key={label}
            className="flex min-h-[54px] flex-col items-center justify-center rounded-lg border border-border/60 bg-background px-1.5 py-2 text-center"
          >
            <p className="text-[9px] font-medium leading-3.5 text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 text-xs font-bold tabular-nums text-foreground" dir="ltr">
              {value.toLocaleString(locale)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
export function formatUsagePercentage(used: number, limit: number, locale: string): string {
  if (limit <= 0 || used <= 0) return "0%";
  const percentage = (used / limit) * 100;
  if (percentage < 0.1) return "<0.1%";
  return `${percentage.toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
}
export function LogsTab({ logs }: { logs: AdminLog[] }) {
  const { lang } = useI18n();
  const adminText = getAdminText(lang);
  const supportText = getAdminSupportText(lang);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const locale = lang === "en" ? "en-US" : "ar-IQ";
  const actionTypes = [
    ...new Set(logs.map((log) => log.action_type)),
  ];
  const securityActionLabels: Record<string, string> =
    lang === "ar"
      ? {
          assistant_device_trusted: "منح الثقة لجهاز المسؤول المساعد",
          assistant_device_trust_revoked: "سحب الثقة من جهاز المسؤول المساعد",
          assistant_session_revoked: "إنهاء جلسة المسؤول المساعد",
          assistant_sessions_revoked: "إنهاء جميع جلسات المسؤول المساعد",
        }
      : lang === "ku"
        ? {
            assistant_device_trusted: "متمانەپێکردنی ئامێری بەڕێوەبەری یاریدەدەر",
            assistant_device_trust_revoked: "سەندنەوەی متمانە لە ئامێری بەڕێوەبەری یاریدەدەر",
            assistant_session_revoked: "کۆتاییهێنان بە دانیشتنی بەڕێوەبەری یاریدەدەر",
            assistant_sessions_revoked: "کۆتاییهێنان بە هەموو دانیشتنەکانی بەڕێوەبەری یاریدەدەر",
          }
        : {
            assistant_device_trusted: "Trust assistant device",
            assistant_device_trust_revoked: "Revoke assistant device trust",
            assistant_session_revoked: "Terminate assistant session",
            assistant_sessions_revoked: "Terminate all assistant sessions",
          };
  const securityActionDetails: Record<string, string> =
    lang === "ar"
      ? {
          assistant_device_trusted: "تم منح الثقة لجهاز المسؤول المساعد",
          assistant_device_trust_revoked: "تم سحب الثقة من جهاز المسؤول المساعد",
          assistant_session_revoked: "تم إنهاء جلسة المسؤول المساعد",
          assistant_sessions_revoked: "تم إنهاء جميع جلسات المسؤول المساعد",
        }
      : lang === "ku"
        ? {
            assistant_device_trusted: "متمانە بە ئامێری بەڕێوەبەری یاریدەدەر درا",
            assistant_device_trust_revoked: "متمانە لە ئامێری بەڕێوەبەری یاریدەدەر سەندرایەوە",
            assistant_session_revoked: "دانیشتنی بەڕێوەبەری یاریدەدەر کۆتایی پێ هات",
            assistant_sessions_revoked: "هەموو دانیشتنەکانی بەڕێوەبەری یاریدەدەر کۆتاییان پێ هات",
          }
        : {
            assistant_device_trusted: "The assistant administrator device was trusted",
            assistant_device_trust_revoked: "Trust was revoked from the assistant administrator device",
            assistant_session_revoked: "The assistant administrator session was terminated",
            assistant_sessions_revoked: "All assistant administrator sessions were terminated",
          };
  const actionLabel: Record<string, string> = {
    approved: adminText.logsActionApproved,
    rejected: adminText.logsActionRejected,
    suspended: adminText.logsActionSuspended,
    unsuspended: adminText.logsActionUnsuspended,
    plan_activated: adminText.logsActionPlanActivated,
    plan_changed: adminText.logsActionPlanChanged,
    plan_renewed: adminText.logsActionPlanRenewed,
    replies_reset: adminText.logsActionRepliesReset,
    replies_added: adminText.logsActionRepliesAdded,
    replies_deducted: adminText.logsActionRepliesDeducted,
    auto_reply_enabled: adminText.logsActionAutoReplyEnabled,
    auto_reply_disabled: adminText.logsActionAutoReplyDisabled,
    channel_status_changed:
      adminText.logsActionChannelStatusChanged,
    note_saved: adminText.logsActionNoteSaved,
    restore_pending: adminText.logsActionRestorePending,
    merchant_deleted: adminText.logsActionMerchantDeleted,
    subscription_updated: adminText.logsActionSubscriptionUpdated,
    deletion_requested: adminText.logsActionDeletionRequested,
    deletion_request_rejected:
      adminText.logsActionDeletionRequestRejected,
    assistant_admin_password_reset:
      adminText.logsActionAssistantPasswordReset,
    assistant_admin_password_changed:
      adminText.logsActionAssistantPasswordChanged,
    support_ticket_claimed: supportText.logClaimed,
    support_ticket_replied: supportText.logReplied,
    support_ticket_resolved: supportText.logResolved,
    support_ticket_in_progress: supportText.logInProgress,
    assistant_device_trusted: securityActionLabels.assistant_device_trusted,
    assistant_device_trust_revoked:
      securityActionLabels.assistant_device_trust_revoked,
    assistant_session_revoked: securityActionLabels.assistant_session_revoked,
    assistant_sessions_revoked:
      securityActionLabels.assistant_sessions_revoked,
  };
  const planNames: Record<
    NonNullable<AdminLogMeta["plan"]>,
    string
  > = {
    silver: adminText.planSilver,
    gold: adminText.planGold,
    diamond: adminText.planDiamond,
  };
  const channelStatusLabels: Record<string, string> = {
    connected: adminText.detailsChannelConnected,
    disconnected: adminText.detailsChannelDisconnected,
    pending: adminText.detailsChannelPending,
  };
  const formatAdminMessage = (
    template: string,
    values: Record<string, string | number>,
  ) =>
    Object.entries(values).reduce(
      (message, [key, value]) =>
        message.split(`{${key}}`).join(String(value)),
      template,
    );
  const getLocalizedDetails = (log: AdminLog) => {
    const localizedSecurityDetail = securityActionDetails[log.action_type];
    if (localizedSecurityDetail) return localizedSecurityDetail;
    const meta = log.meta ?? {};
    const plan = meta.plan
      ? planNames[meta.plan] ?? meta.plan
      : "";
    switch (log.action_type) {
      case "plan_activated":
        return plan
          ? formatAdminMessage(adminText.logPlanLabel, { plan })
          : log.details;
      case "approved":
        return adminText.logMerchantApproved;
      case "rejected":
        return adminText.logMerchantRejected;
      case "suspended":
        return adminText.logMerchantSuspended;
      case "unsuspended":
        return adminText.logMerchantUnsuspended;
      case "restore_pending":
        return adminText.logMerchantRestored;
      case "replies_reset":
        return typeof meta.limit === "number"
          ? formatAdminMessage(adminText.logRepliesReset, {
              limit: meta.limit,
            })
          : log.details;
      case "replies_added":
        return typeof meta.amount === "number"
          ? formatAdminMessage(adminText.logRepliesAdded, {
              amount: meta.amount,
            })
          : log.details;
      case "replies_deducted":
        return typeof meta.amount === "number"
          ? formatAdminMessage(adminText.logRepliesDeducted, {
              amount: meta.amount,
            })
          : log.details;
      case "auto_reply_enabled":
        return adminText.logAutoReplyEnabled;
      case "auto_reply_disabled":
        return adminText.logAutoReplyDisabled;
      case "plan_changed":
        return plan
          ? formatAdminMessage(adminText.logPlanChanged, { plan })
          : log.details;
      case "plan_renewed": {
        if (!plan) {
          return log.details;
        }
        const deduction =
          typeof meta.emergency_deduction === "number"
            ? meta.emergency_deduction
            : 0;
        return `${plan}${
          deduction > 0
            ? formatAdminMessage(adminText.emergencyDeduction, {
                amount: deduction,
              })
            : ""
        }`;
      }
      case "note_saved":
        return adminText.logInternalNoteSaved;
      case "assistant_admin_password_reset":
        return adminText.logAssistantAdminPasswordReset;
      case "assistant_admin_password_changed":
        return adminText.logAssistantAdminPasswordChanged;
      case "channel_status_changed": {
        const platform = meta.platform ?? "";
        const status = meta.status
          ? channelStatusLabels[meta.status] ??
            meta.status
          : "";
        return [platform, status].filter(Boolean).join(": ") ||
          log.details;
      }
      case "merchant_deleted":
        return adminText.logMerchantDeleted;
      case "subscription_updated":
        return adminText.logsActionSubscriptionUpdated;
      case "deletion_requested":
        return adminText.actionRequestDeletion;
      case "deletion_request_rejected":
        return adminText.deletionRequestRejected;
      default:
        return log.details;
    }
  };
  const filtered = logs
    .filter(
      (log) =>
        filterAction === "all" ||
        log.action_type === filterAction,
    )
    .filter(
      (log) =>
        !search ||
        log.merchant_name
          .toLowerCase()
          .includes(search.toLowerCase()) ||
        log.merchant_id
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  return (
    <div className="space-y-3" dir={adminText.dir}>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-40 flex-1">
          <Search
            className={`pointer-events-none absolute top-2.5 h-4 w-4 text-muted-foreground ${
              adminText.dir === "rtl" ? "right-2.5" : "left-2.5"
            }`}
          />
          <Input
            className={adminText.dir === "rtl" ? "pr-9" : "pl-9"}
            placeholder={adminText.logsSearchPlaceholder}
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        </div>
        <Select
          value={filterAction}
          onValueChange={setFilterAction}
        >
          <SelectTrigger className="w-44">
            <SelectValue
              placeholder={
                adminText.logsActionTypePlaceholder
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {adminText.logsAllActions}
            </SelectItem>
            {actionTypes.map((action) => (
              <SelectItem
                key={action}
                value={action}
              >
                {actionLabel[action] ?? action}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {adminText.logsEmpty}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => (
            <div
              key={log.id}
              className="rounded-lg border bg-card p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-medium">
                    {log.merchant_name}
                  </span>
                  <span className="mx-2 text-muted-foreground">
                    ·
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {actionLabel[log.action_type] ??
                      log.action_type}
                  </span>
                  {log.details && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {getLocalizedDetails(log)}
                    </p>
                  )}
                  {log.reason && (
                    <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                      {adminText.logsReasonLabel}:{" "}
                      {log.reason}
                    </p>
                  )}
                  {(log.admin_role === "owner_admin" ||
                    log.admin_name ||
                    log.admin_phone) && (
                    <p className="mt-2 flex flex-wrap items-center gap-x-1 text-xs font-medium text-foreground">
                      <span>{adminText.logsPerformedByLabel}:</span>
                      {log.admin_role === "owner_admin" ? (
                        <span>{adminText.logsSystemOwner}</span>
                      ) : (
                        <>
                          {log.admin_name && <span>{log.admin_name}</span>}
                          {log.admin_name && log.admin_phone && (
                            <span aria-hidden="true">—</span>
                          )}
                          {log.admin_phone && (
                            <span dir="ltr" className="tabular-nums">
                              {log.admin_phone}
                            </span>
                          )}
                        </>
                      )}
                    </p>
                  )}
                </div>
                <time className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(
                    log.created_at,
                  ).toLocaleString(locale)}
                </time>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function ActionsMenu({
  merchant,
  sub,
  mobile = false,
  onView,
  onApprove,
  onReject,
  onSuspend,
  onUnsuspend,
  onRestore,
  onResetReplies,
  onAddReplies,
  onDeductReplies,
  onToggleAutoReply,
  onChangePlan,
  onRenewPlan,
  onDelete,
  canManageMerchants,
  canManageSubscriptions,
  deletionAction,
}: {
  merchant: Merchant;
  sub?: Subscription;
  mobile?: boolean;
  onView: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSuspend: () => void;
  onUnsuspend: () => void;
  onRestore: () => void;
  onResetReplies: () => void;
  onAddReplies: () => void;
  onDeductReplies: () => void;
  onToggleAutoReply: () => void;
  onChangePlan: () => void;
  onRenewPlan: () => void;
  onDelete: () => void;
  canManageMerchants: boolean;
  canManageSubscriptions: boolean;
  deletionAction?: "request" | "review" | "pending";
}) {
  const { lang } = useI18n();
  const adminText = getAdminText(lang);
  const { status } = merchant;
  const iconSpacingClass =
    adminText.dir === "rtl" ? "ml-2" : "mr-2";
  const compactIconSpacingClass =
    adminText.dir === "rtl" ? "ml-1" : "mr-1";
  const deletionActionLabel =
    deletionAction === "review"
      ? adminText.actionReviewDeletionRequest
      : deletionAction === "pending"
        ? adminText.actionDeletionRequestPending
        : adminText.actionRequestDeletion;
  if (mobile) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48"
        >
          <DropdownMenuItem onClick={onView}>
            <Eye
              className={`h-3.5 w-3.5 ${iconSpacingClass}`}
            />
            {adminText.actionViewDetails}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {canManageMerchants && status === "pending_activation" && (
            <>
              <DropdownMenuItem
                onClick={onApprove}
                className="text-green-600 focus:text-green-600"
              >
                <CheckCircle
                  className={`h-3.5 w-3.5 ${iconSpacingClass}`}
                />
                {adminText.actionApprove}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onReject}
                className="text-destructive focus:text-destructive"
              >
                <XCircle
                  className={`h-3.5 w-3.5 ${iconSpacingClass}`}
                />
                {adminText.actionReject}
              </DropdownMenuItem>
            </>
          )}
          {status === "approved" && (
            <>
              {canManageSubscriptions && (
                sub ? (
                  <>
                    <DropdownMenuItem onClick={onChangePlan}>
                      <FileText className={`h-3.5 w-3.5 ${iconSpacingClass}`} />
                      {adminText.actionChangePlan}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onRenewPlan}>
                      <RefreshCcw className={`h-3.5 w-3.5 ${iconSpacingClass}`} />
                      {adminText.actionRenewPlan}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onResetReplies}>
                      <RefreshCcw className={`h-3.5 w-3.5 ${iconSpacingClass}`} />
                      {adminText.actionResetReplies}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onAddReplies}>
                      <Plus className={`h-3.5 w-3.5 ${iconSpacingClass}`} />
                      {adminText.actionAddReplies}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={onDeductReplies}
                      className="text-destructive focus:text-destructive"
                    >
                      <Minus className={`h-3.5 w-3.5 ${iconSpacingClass}`} />
                      {adminText.actionDeductReplies}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onToggleAutoReply}>
                      {sub.auto_reply_enabled ? (
                        <>
                          <PowerOff className={`h-3.5 w-3.5 ${iconSpacingClass}`} />
                          {adminText.actionDisableAutoReplies}
                        </>
                      ) : (
                        <>
                          <Power className={`h-3.5 w-3.5 ${iconSpacingClass}`} />
                          {adminText.actionEnableAutoReplies}
                        </>
                      )}
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onClick={onChangePlan}>
                    <FileText className={`h-3.5 w-3.5 ${iconSpacingClass}`} />
                    {adminText.actionActivatePaidSubscription}
                  </DropdownMenuItem>
                )
              )}
              {canManageMerchants && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onSuspend}
                    className="text-destructive focus:text-destructive"
                  >
                    <AlertTriangle className={`h-3.5 w-3.5 ${iconSpacingClass}`} />
                    {adminText.actionSuspendStore}
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
          {canManageMerchants && status === "suspended" && (
            <>
              <DropdownMenuItem
                onClick={onUnsuspend}
                className="text-green-600 focus:text-green-600"
              >
                <CheckCircle
                  className={`h-3.5 w-3.5 ${iconSpacingClass}`}
                />
                {adminText.actionUnsuspend}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onReject}
                className="text-destructive focus:text-destructive"
              >
                <XCircle
                  className={`h-3.5 w-3.5 ${iconSpacingClass}`}
                />
                {adminText.actionFinalReject}
              </DropdownMenuItem>
            </>
          )}
          {canManageMerchants && status === "rejected" && (
            <DropdownMenuItem onClick={onRestore}>
              <RefreshCcw
                className={`h-3.5 w-3.5 ${iconSpacingClass}`}
              />
              {adminText.actionRestoreReview}
            </DropdownMenuItem>
          )}
          {deletionAction && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                disabled={deletionAction === "pending"}
                className="text-destructive focus:text-destructive"
              >
                {deletionActionLabel}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  return (
    <div
      className="flex min-h-[190px] h-full min-w-0 flex-col justify-center gap-2 rounded-xl border border-border/80 bg-muted/20 p-2.5 shadow-sm"
      dir={adminText.dir}
    >
      <Button
        variant="outline"
        size="sm"
        className="h-9 w-full justify-center gap-2 text-xs font-semibold"
        onClick={onView}
        title={adminText.actionViewDetails}
      >
        <Eye className="h-4 w-4 shrink-0" />
        <span>{adminText.actionViewDetails}</span>
      </Button>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-2">
        <span className="text-[10px] font-medium text-muted-foreground">
          {adminText.mainTableActions}
        </span>
        <ActionsMenu
          mobile
          merchant={merchant}
          sub={sub}
          onView={onView}
          onApprove={onApprove}
          onReject={onReject}
          onSuspend={onSuspend}
          onUnsuspend={onUnsuspend}
          onRestore={onRestore}
          onResetReplies={onResetReplies}
          onAddReplies={onAddReplies}
          onDeductReplies={onDeductReplies}
          onToggleAutoReply={onToggleAutoReply}
          onChangePlan={onChangePlan}
          onRenewPlan={onRenewPlan}
          onDelete={onDelete}
          canManageMerchants={canManageMerchants}
          canManageSubscriptions={canManageSubscriptions}
          deletionAction={deletionAction}
        />
      </div>
    </div>
  );
}
export function hasAdminPermission(
  admin: Merchant | undefined,
  permission: AdminPermission,
): boolean {
  if (!admin || admin.is_admin !== true) return false;
  // The owner always has full access, including sessions cached before
  // the permissions migration was introduced.
  if (admin.admin_role === "owner_admin") return true;
  return Array.isArray(admin.permissions) &&
    admin.permissions.includes(permission);
}
