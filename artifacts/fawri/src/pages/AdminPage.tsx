/**
 * AdminPage — Protected admin control panel (MVP).
 * PRODUCTION TODO: Replace localStorage session with secure server-side admin auth.
 */
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

// ── Plan configuration ─────────────────────────────────────────────────────────
const PLANS = {
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
type PlanKey = keyof typeof PLANS;

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({
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

function SubBadge({
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


function AutoReplyBadge({
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

function MerchantStatusSummary({
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

function SubscriptionUsageSummary({
  subscription,
  planName,
  locale,
  baseUsedLabel,
  baseRemainingLabel,
  baseLimitLabel,
  emergencyBalanceLabel,
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
  emergencyBalanceLabel: string;
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
  const emergencyRepliesRemaining = subscription.emergency_credit_remaining ?? 0;
  const addonRepliesRemaining = subscription.addon_replies_remaining ?? 0;
  const totalRepliesAvailable =
    baseRepliesRemaining + emergencyRepliesRemaining + addonRepliesRemaining;

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
    [emergencyBalanceLabel, emergencyRepliesRemaining],
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

      <div className={compact ? "grid grid-cols-2 gap-1.5" : "grid grid-cols-3 gap-2"}>
        {balanceItems.map(([label, value], index) => (
          <div
            key={label}
            className={
              "flex min-h-[54px] flex-col items-center justify-center rounded-lg border border-border/60 bg-background px-1.5 py-2 text-center " +
              (compact && index === 2 ? "col-span-2" : "")
            }
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

function formatUsagePercentage(used: number, limit: number, locale: string): string {
  if (limit <= 0 || used <= 0) return "0%";

  const percentage = (used / limit) * 100;
  if (percentage < 0.1) return "<0.1%";

  return `${percentage.toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
}

// ── Confirm dialog ─────────────────────────────────────────────────────────────
type ConfirmType =
  | "approve"
  | "reject"
  | "suspend"
  | "unsuspend"
  | "reset_replies"
  | "stop_auto_reply"
  | "restore_pending";
interface ConfirmState {
  type: ConfirmType;
  merchantId: string;
  merchantName: string;
}

function ConfirmDialog({
  state,
  onConfirm,
  onClose,
}: {
  state: ConfirmState;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const { lang } = useI18n();
  const adminText = getAdminText(lang);

  const needsReason =
    state.type === "reject" || state.type === "suspend";

  const isDestructive = [
    "reject",
    "suspend",
    "reset_replies",
    "stop_auto_reply",
  ].includes(state.type);

  const labels: Record<ConfirmType, string> = {
    approve: adminText.confirmApproveAccount,
    reject: adminText.confirmRejectStore,
    suspend: adminText.confirmSuspendStore,
    unsuspend: adminText.confirmUnsuspendStore,
    reset_replies: adminText.confirmResetReplies,
    stop_auto_reply: adminText.confirmStopAutoReply,
    restore_pending: adminText.confirmRestorePending,
  };

  const isApproval = state.type === "approve";
  const confirmationQuestion =
    state.type === "unsuspend"
      ? adminText.confirmUnsuspendQuestion
      : adminText.confirmActionQuestion;
  const confirmButtonLabel =
    state.type === "unsuspend"
      ? adminText.confirmUnsuspendButton
      : adminText.confirm;
  const textAlignmentClass =
    adminText.dir === "rtl"
      ? "!text-right sm:!text-right"
      : "!text-left sm:!text-left";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className={`${isApproval ? "max-w-md gap-4" : "max-w-sm gap-4"} ${
          adminText.dir === "rtl"
            ? "[&>button]:left-4 [&>button]:right-auto"
            : "[&>button]:right-4 [&>button]:left-auto"
        }`}
        dir={adminText.dir}
      >
        <DialogHeader
          className={`w-full ${textAlignmentClass} ${
            adminText.dir === "rtl" ? "pl-12" : "pr-12"
          }`}
        >
          <DialogTitle
            className={`w-full text-lg leading-6 ${textAlignmentClass} ${
              isDestructive ? "text-destructive" : ""
            }`}
          >
            {labels[state.type]}
          </DialogTitle>
        </DialogHeader>

        {isApproval ? (
          <div className={`space-y-3 ${textAlignmentClass}`}>
            <div className="rounded-xl border bg-muted/35 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {adminText.approvalAccountFor}
              </p>
              <p className="mt-1 text-base font-semibold text-foreground">
                {state.merchantName}
              </p>
            </div>

            <div className="rounded-xl border border-green-200 bg-green-50/70 px-4 py-3 text-sm leading-6 text-green-950 dark:border-green-900/70 dark:bg-green-950/30 dark:text-green-100">
              <p>{adminText.approvalNoPlan}</p>
              <p className="mt-1">{adminText.approvalDeadline}</p>
            </div>
          </div>
        ) : (
          <div className={`space-y-3 ${textAlignmentClass}`}>
            <div className={`rounded-xl border bg-muted/35 px-4 py-3 ${textAlignmentClass}`}>
              <p className="text-xs text-muted-foreground">
                {adminText.storeLabel}
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {state.merchantName}
              </p>
            </div>

            {needsReason ? (
              <div className={`space-y-1.5 ${textAlignmentClass}`}>
                <Label className={`block ${textAlignmentClass}`}>
                  {adminText.reasonRequired}
                </Label>

                <Textarea
                  className={`min-h-28 resize-none ${textAlignmentClass}`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={adminText.reasonPlaceholder}
                  rows={4}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {confirmationQuestion}
              </p>
            )}
          </div>
        )}

        {isApproval ? (
          <DialogFooter
            className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
            dir="ltr"
          >
            <Button
              variant="outline"
              onClick={onClose}
              className="h-auto min-h-10 w-full whitespace-normal px-4 py-2 sm:w-auto sm:min-w-20"
            >
              {adminText.cancel}
            </Button>
            <Button
              onClick={() => onConfirm(reason)}
              className="h-auto min-h-10 w-full whitespace-normal bg-green-600 px-4 py-2 text-white hover:bg-green-700 sm:w-auto sm:min-w-32"
            >
              {adminText.confirmApproveAccountButton}
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter
            className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
            dir="ltr"
          >
            <Button
              variant="outline"
              onClick={onClose}
              className="h-auto min-h-10 w-full whitespace-normal px-4 py-2 sm:w-auto sm:min-w-20"
            >
              {adminText.cancel}
            </Button>

            <Button
              variant={isDestructive ? "destructive" : "default"}
              disabled={needsReason && !reason.trim()}
              onClick={() => onConfirm(reason)}
              className="h-auto min-h-10 w-full whitespace-normal px-4 py-2 sm:w-auto sm:min-w-24"
            >
              {confirmButtonLabel}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Plan modal ─────────────────────────────────────────────────────────────────
interface PlanModalState {
  merchantId: string;
  merchantName: string;
  mode: "activate" | "change" | "renew";
  currentPlan?: PlanKey;
}

function PlanModal({
  state,
  onConfirm,
  onClose,
}: {
  state: PlanModalState;
  onConfirm: (plan: PlanKey) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<PlanKey | null>(
    state.mode === "renew" ? state.currentPlan ?? null : null,
  );
  const { lang } = useI18n();
  const adminText = getAdminText(lang);
  const locale = lang === "en" ? "en-US" : "ar-IQ";
  const textAlignmentClass =
    adminText.dir === "rtl"
      ? "!text-right sm:!text-right"
      : "!text-left sm:!text-left";

  const modeLabel: Record<PlanModalState["mode"], string> = {
    activate: adminText.planActivateTitle,
    change: adminText.planChangeTitle,
    renew: adminText.planRenewTitle,
  };

  const planNames: Record<PlanKey, string> = {
    silver: adminText.planSilver,
    gold: adminText.planGold,
    diamond: adminText.planDiamond,
  };

  const submitLabel: Record<PlanModalState["mode"], string> = {
    activate: adminText.confirmActivateSubscription,
    change: adminText.confirmChangePlan,
    renew: adminText.confirmRenewPlan,
  };

  const visiblePlanKeys: PlanKey[] =
    state.mode === "renew"
      ? state.currentPlan
        ? [state.currentPlan]
        : []
      : (Object.keys(PLANS) as PlanKey[]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className={`max-w-md ${
          adminText.dir === "rtl"
            ? "[&>button]:left-4 [&>button]:right-auto"
            : "[&>button]:right-4 [&>button]:left-auto"
        }`}
        dir={adminText.dir}
      >
        <DialogHeader className={textAlignmentClass}>
          <DialogTitle className={`w-full ${textAlignmentClass}`}>
            {modeLabel[state.mode]}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {adminText.storeLabel}:{" "}
            <span className="font-medium text-foreground">
              {state.merchantName}
            </span>
          </p>

          {visiblePlanKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              aria-pressed={selected === key}
              className={`w-full rounded-lg border-2 p-3 transition-colors ${
                adminText.dir === "rtl" ? "text-right" : "text-left"
              } ${
                selected === key
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">
                  {planNames[key]}
                </span>

                <span className="font-bold text-primary">
                  {PLANS[key].price.toLocaleString(locale)}{" "}
                  {adminText.currencyIqd}
                </span>
              </div>

              <p className="mt-1 text-xs text-muted-foreground">
                {PLANS[key].limit.toLocaleString(locale)}{" "}
                {adminText.repliesPerMonth}
                {" · "}
                {adminText.emergencyCredit}:{" "}
                {PLANS[key].emergency.toLocaleString(locale)}
              </p>
            </button>
          ))}
        </div>

        <DialogFooter
          className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
          dir="ltr"
        >
          <Button
            variant="outline"
            onClick={onClose}
            className="h-auto min-h-10 w-full whitespace-normal px-4 py-2 sm:w-auto"
          >
            {adminText.cancel}
          </Button>

          <Button
            disabled={!selected}
            onClick={() => selected && onConfirm(selected)}
            className="h-auto min-h-10 w-full whitespace-normal px-4 py-2 sm:w-auto"
          >
            {submitLabel[state.mode]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Replies modal ──────────────────────────────────────────────────────────────
interface RepliesModalState {
  merchantId: string;
  merchantName: string;
  mode: "add" | "deduct";
  currentUsed?: number;
  currentRemaining?: number;
  limit?: number;
}

function RepliesModal({
  state,
  onConfirm,
  onClose,
}: {
  state: RepliesModalState;
  onConfirm: (amount: number) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const { lang } = useI18n();
  const adminText = getAdminText(lang);
  const locale = lang === "en" ? "en-US" : "ar-IQ";
  const textAlignmentClass =
    adminText.dir === "rtl"
      ? "!text-right sm:!text-right"
      : "!text-left sm:!text-left";

  const currentUsed = state.currentUsed ?? 0;
  const limit = state.limit ?? 0;
  const currentRemaining =
    state.currentRemaining ?? Math.max(0, limit - currentUsed);
  const parsedAmount = Number(amount);
  const isValidInteger =
    amount.trim() !== "" && Number.isInteger(parsedAmount) && parsedAmount > 0;
  const exceedsRemaining =
    state.mode === "deduct" &&
    isValidInteger &&
    parsedAmount > currentRemaining;
  const remainingAfterDeduction =
    state.mode === "deduct" && isValidInteger && !exceedsRemaining
      ? currentRemaining - parsedAmount
      : currentRemaining;
  const validationMessage =
    amount.trim() === ""
      ? ""
      : !isValidInteger
        ? adminText.repliesInvalidAmount
        : exceedsRemaining
          ? adminText.repliesAmountExceedsRemaining
          : "";

  const handleSubmit = () => {
    if (!isValidInteger || exceedsRemaining) return;
    onConfirm(parsedAmount);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className={`max-w-md gap-5 ${
          adminText.dir === "rtl"
            ? "[&>button]:left-4 [&>button]:right-auto"
            : "[&>button]:right-4 [&>button]:left-auto"
        }`}
        dir={adminText.dir}
      >
        <DialogHeader
          className={`w-full ${textAlignmentClass} ${
            adminText.dir === "rtl" ? "pl-12" : "pr-12"
          }`}
        >
          <DialogTitle
            className={`w-full text-lg leading-6 ${textAlignmentClass} ${
              state.mode === "deduct" ? "text-destructive" : ""
            }`}
          >
            {state.mode === "add"
              ? adminText.repliesAddTitle
              : adminText.repliesDeductTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className={`rounded-xl border bg-muted/35 px-4 py-3 ${textAlignmentClass}`}>
            <p className="text-xs text-muted-foreground">
              {adminText.storeLabel}
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">
              {state.merchantName}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              [adminText.detailsReplyLimit, limit],
              [adminText.detailsUsed, currentUsed],
              [adminText.detailsRemaining, currentRemaining],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-lg border bg-card px-2 py-3 text-center"
              >
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 text-base font-semibold tabular-nums" dir="ltr">
                  {Number(value).toLocaleString(locale)}
                </p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label className={`block ${textAlignmentClass}`}>
              {adminText.repliesCountLabel}
            </Label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={state.mode === "deduct" ? currentRemaining : undefined}
              step={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={adminText.repliesCountPlaceholder}
              className={`h-11 text-base tabular-nums ${textAlignmentClass}`}
              aria-invalid={Boolean(validationMessage)}
            />
            {validationMessage && (
              <p className={`text-xs font-medium text-destructive ${textAlignmentClass}`}>
                {validationMessage}
              </p>
            )}
          </div>

          {state.mode === "deduct" && isValidInteger && !exceedsRemaining && (
            <div className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50/70 px-4 py-3 text-sm dark:border-orange-900/70 dark:bg-orange-950/20">
              <span className="text-muted-foreground">
                {adminText.repliesRemainingAfterLabel}
              </span>
              <span className="font-bold tabular-nums" dir="ltr">
                {remainingAfterDeduction.toLocaleString(locale)}
              </span>
            </div>
          )}
        </div>

        <DialogFooter
          className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
          dir="ltr"
        >
          <Button
            variant="outline"
            onClick={onClose}
            className="h-auto min-h-10 w-full px-4 py-2 sm:w-auto"
          >
            {adminText.cancel}
          </Button>
          <Button
            variant={state.mode === "deduct" ? "destructive" : "default"}
            disabled={!isValidInteger || exceedsRemaining}
            onClick={handleSubmit}
            className="h-auto min-h-10 w-full px-4 py-2 sm:w-auto"
          >
            {adminText.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Details modal ──────────────────────────────────────────────────────────────
function DetailsModal({
  merchant,
  sub,
  notes,
  channelOverrides,
  canManageNotes,
  canManageSubscriptions,
  canManageChannels,
  onClose,
  onSaveNote,
  onChannelStatusChange,
}: {
  merchant: Merchant;
  sub?: Subscription;
  notes: string;
  channelOverrides: Record<string, string>;
  canManageNotes: boolean;
  canManageSubscriptions: boolean;
  canManageChannels: boolean;
  onClose: () => void;
  onSaveNote: (note: string) => void;
  onChannelStatusChange: (platform: string, status: string) => void;
}) {
  const { lang } = useI18n();
  const adminText = getAdminText(lang);

  const [activeTab, setActiveTab] = useState<
    "store" | "subscription" | "channels" | "notes"
  >("store");

  const [noteText, setNoteText] = useState(notes);

  useEffect(() => {
    setNoteText(notes);
  }, [merchant.id, notes]);

  const locale = lang === "en" ? "en-US" : lang === "ku" ? "ckb-IQ" : "ar-IQ";
  const textAlignmentClass =
    adminText.dir === "rtl"
      ? "!text-right sm:!text-right"
      : "!text-left sm:!text-left";

  const planNames: Record<PlanKey, string> = {
    silver: adminText.planSilver,
    gold: adminText.planGold,
    diamond: adminText.planDiamond,
  };

  const daysRemaining = sub
    ? Math.max(
        0,
        Math.ceil(
          (new Date(sub.expires_at).getTime() - Date.now()) /
            86400000,
        ),
      )
    : 0;

  const baseReplyLimit = sub?.base_reply_limit ?? sub?.reply_limit ?? 0;
  const baseRepliesUsed = sub
    ? sub.base_replies_used ?? Math.min(sub.replies_used, baseReplyLimit)
    : 0;
  const baseRepliesRemaining = sub
    ? sub.base_replies_remaining ?? Math.max(0, baseReplyLimit - baseRepliesUsed)
    : 0;
  const emergencyRepliesRemaining = sub
    ? sub.emergency_credit_remaining ??
      Math.max(0, sub.emergency_credit_amount - sub.emergency_credit_used)
    : 0;
  const addonRepliesRemaining = sub?.addon_replies_remaining ?? 0;
  const totalRepliesAvailable =
    baseRepliesRemaining + emergencyRepliesRemaining + addonRepliesRemaining;
  const emergencyDebtRemaining =
    sub?.emergency_debt ?? sub?.pending_next_cycle_deduction ?? 0;
  const usedPct =
    baseReplyLimit > 0
      ? Math.round((baseRepliesUsed / baseReplyLimit) * 100)
      : 0;

  const tabs = [
    {
      id: "store" as const,
      label: adminText.detailsTabStore,
    },
    ...(canManageSubscriptions
      ? [{ id: "subscription" as const, label: adminText.detailsTabSubscription }]
      : []),
    ...(canManageChannels
      ? [{ id: "channels" as const, label: adminText.detailsTabChannels }]
      : []),
    ...(canManageNotes
      ? [{ id: "notes" as const, label: adminText.detailsTabNotes }]
      : []),
  ];

  const channels: Array<{
    key: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    editable: boolean;
    fixedStatus?: string;
  }> = [
    {
      key: "instagram",
      label: "Instagram",
      icon: FaInstagram,
      editable: true,
    },
    {
      key: "messenger",
      label: "Facebook Messenger",
      icon: FaFacebookMessenger,
      editable: true,
    },
    {
      key: "whatsapp",
      label: "WhatsApp Business",
      icon: FaWhatsapp,
      editable: false,
      fixedStatus: adminText.detailsChannelComingSoon,
    },
    {
      key: "web_chat",
      label: "Web Chat",
      icon: MessageSquare,
      editable: false,
      fixedStatus: adminText.detailsChannelInDevelopment,
    },
    {
      key: "telegram",
      label: "Telegram",
      icon: FaTelegram,
      editable: false,
      fixedStatus: adminText.detailsChannelInDevelopment,
    },
    {
      key: "tiktok",
      label: "TikTok",
      icon: FaTiktok,
      editable: false,
      fixedStatus: adminText.detailsChannelInDevelopment,
    },
  ];

  const getChannelStatusText = (status: string): string => {
    if (status === "connected") return adminText.detailsChannelConnected;
    if (status === "pending") return adminText.detailsChannelPending;
    return adminText.detailsChannelDisconnected;
  };

  const storeDetails: [string, string][] = [
    [adminText.detailsStoreName, merchant.store_name],
    [adminText.detailsOwnerName, merchant.owner_name],
    [adminText.detailsPhone, merchant.phone],
    [adminText.detailsActivityType, getLocalizedActivity(merchant.activity_type, lang)],
    [adminText.detailsStatus, getMerchantStatusLabel(merchant.status, lang)],
    [
      adminText.detailsRegistrationDate,
      new Date(merchant.created_at).toLocaleDateString(locale),
    ],
  ];


  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className={`flex max-h-[92vh] w-full max-w-3xl flex-col p-0 ${
          adminText.dir === "rtl"
            ? "[&>button]:left-4 [&>button]:right-auto"
            : "[&>button]:right-4 [&>button]:left-auto"
        }`}
        dir={adminText.dir}
      >
        <DialogHeader className={`px-5 pb-0 pt-4 ${textAlignmentClass}`}>
          <DialogTitle className={`w-full text-base ${textAlignmentClass}`}>
            {merchant.store_name}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 grid grid-cols-4 border-b px-3 sm:px-5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px min-w-0 whitespace-nowrap border-b-2 px-0.5 py-2 text-xs tracking-tight transition-colors sm:px-4 sm:text-sm sm:tracking-normal ${
                activeTab === tab.id
                  ? "border-primary font-medium text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          className={`px-4 py-3 sm:px-5 ${
            activeTab === "channels"
              ? "flex-none"
              : activeTab === "subscription"
                ? "min-h-0 flex-1 overflow-y-auto sm:flex-none sm:overflow-visible"
                : "min-h-0 flex-1 overflow-y-auto"
          }`}
        >
          {activeTab === "store" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {storeDetails.map(([label, value]) => (
                <div
                  key={label}
                  className={`flex min-h-28 flex-col justify-between gap-3 rounded-lg border p-3 ${textAlignmentClass}`}
                >
                  <p className="text-sm font-medium leading-5">{label}</p>

                  <span
                    className={`inline-flex min-h-9 w-full items-center justify-start rounded-md border bg-muted px-2 py-2 text-sm font-medium ${textAlignmentClass}`}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeTab === "subscription" &&
            (sub ? (
              <div className="grid items-stretch gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-border/80 bg-muted/15 p-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      [
                        adminText.detailsPlan,
                        planNames[sub.plan_name as PlanKey] ?? sub.plan_name,
                      ],
                      [
                        adminText.detailsSubscriptionStatus,
                        getSubscriptionStatusLabel(sub.status, lang),
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className={`rounded-lg bg-background px-2 py-1.5 ${textAlignmentClass}`}>
                        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
                        <p className="mt-0.5 text-sm font-bold leading-5 text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/15 p-2">
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      [
                        adminText.detailsStartDate,
                        new Date(sub.start_date).toLocaleDateString(locale),
                      ],
                      [
                        adminText.detailsExpiryDate,
                        new Date(sub.expires_at).toLocaleDateString(locale),
                      ],
                      [
                        adminText.detailsDaysRemaining,
                        `${daysRemaining.toLocaleString(locale)} ${adminText.detailsDay}`,
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className={`rounded-lg bg-background px-2 py-1.5 ${textAlignmentClass}`}>
                        <p className="text-[11px] font-medium leading-4 text-muted-foreground">{label}</p>
                        <p className="mt-0.5 text-xs font-bold leading-5 text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/15 p-2 sm:col-span-2">
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {[
                      [
                        adminText.detailsBaseReplyLimit,
                        baseReplyLimit.toLocaleString(locale),
                      ],
                      [
                        adminText.detailsBaseUsed,
                        `${baseRepliesUsed.toLocaleString(locale)} (${usedPct.toLocaleString(locale)}%)`,
                      ],
                      [
                        adminText.detailsBaseRemaining,
                        baseRepliesRemaining.toLocaleString(locale),
                      ],
                      [
                        adminText.detailsAutoReplies,
                        sub.auto_reply_enabled
                          ? adminText.detailsEnabled
                          : adminText.detailsDisabled,
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className={`rounded-lg bg-background px-2 py-1.5 ${textAlignmentClass}`}>
                        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
                        <p className="mt-0.5 text-sm font-bold leading-5 text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-2 dark:border-orange-900 dark:bg-orange-950/20">
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      [
                        adminText.detailsEmergencyCredit,
                        sub.emergency_credit_activated
                          ? adminText.detailsEnabled
                          : adminText.detailsNotEnabled,
                      ],
                      [
                        adminText.detailsEmergencyBalance,
                        emergencyRepliesRemaining.toLocaleString(locale),
                      ],
                      [
                        adminText.detailsEmergencyCreditUsed,
                        sub.emergency_credit_used.toLocaleString(locale),
                      ],
                      [
                        adminText.detailsNextCycleDeduction,
                        emergencyDebtRemaining.toLocaleString(locale),
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className={`rounded-lg bg-background px-2 py-1.5 ${textAlignmentClass}`}>
                        <p className="text-[11px] font-medium leading-4 text-muted-foreground">{label}</p>
                        <p className="mt-0.5 text-sm font-bold leading-5 text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/15 p-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      [
                        adminText.detailsAddonBalance,
                        addonRepliesRemaining.toLocaleString(locale),
                      ],
                      [
                        adminText.detailsTotalAvailable,
                        totalRepliesAvailable.toLocaleString(locale),
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className={`rounded-lg bg-background px-2 py-1.5 ${textAlignmentClass}`}>
                        <p className="text-[11px] font-medium leading-4 text-muted-foreground">{label}</p>
                        <p className="mt-0.5 text-base font-black leading-5 text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {adminText.detailsNoActiveSubscription}
              </p>
            ))}

          {activeTab === "channels" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {channels.map(({ key, label, icon: Icon, editable, fixedStatus }) => (
                <div
                  key={key}
                  className={`flex min-h-28 flex-col justify-between gap-2 rounded-lg border p-2 sm:gap-3 sm:p-3 ${textAlignmentClass}`}
                >
                  <div className="flex min-h-10 min-w-0 items-start gap-1.5 sm:items-center sm:gap-2">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground sm:mt-0 sm:h-5 sm:w-5" />
                    <p className="min-w-0 break-words text-[11px] font-medium leading-4 sm:text-sm">
                      {label}
                    </p>
                  </div>

                  {editable ? (
                    <Select
                      value={channelOverrides[key] ?? "disconnected"}
                      onValueChange={(value) =>
                        onChannelStatusChange(key, value)
                      }
                    >
                      <SelectTrigger className="h-auto min-h-10 w-full gap-1 px-2 py-1.5 text-[11px] [&>span]:!line-clamp-none [&>span]:whitespace-normal [&>span]:break-words [&>span]:text-center [&>span]:leading-4 sm:text-xs">
                        <span className="block min-w-0 flex-1 !line-clamp-none whitespace-normal break-words text-center leading-4">
                          {getChannelStatusText(
                            channelOverrides[key] ?? "disconnected",
                          )}
                        </span>
                      </SelectTrigger>

                      <SelectContent>
                        <SelectItem value="connected">
                          {adminText.detailsChannelConnected}
                        </SelectItem>

                        <SelectItem value="disconnected">
                          {adminText.detailsChannelDisconnected}
                        </SelectItem>

                        <SelectItem value="pending">
                          {adminText.detailsChannelPending}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="inline-flex min-h-9 w-full items-center justify-center rounded-md border bg-muted px-1.5 py-1.5 text-center text-[10px] font-medium leading-4 text-muted-foreground sm:px-2 sm:text-xs">
                      {fixedStatus}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === "notes" && (
            <div className={`space-y-4 ${textAlignmentClass}`}>
              <div className="space-y-2">
                <Label className={`block leading-6 ${textAlignmentClass}`}>
                  {adminText.detailsInternalNotes}
                </Label>

                <Textarea
                  className={`min-h-36 ${textAlignmentClass}`}
                  rows={6}
                  value={noteText}
                  onChange={(event) =>
                    setNoteText(event.target.value)
                  }
                  placeholder={adminText.detailsNotesPlaceholder}
                />
              </div>

              <div className="flex justify-start">
                <Button
                  size="sm"
                  onClick={() => {
                    onSaveNote(noteText);
                    toast.success(adminText.detailsNotesSaved);
                  }}
                >
                  {adminText.detailsSaveNotes}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-start border-t px-5 pb-3 pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            {adminText.close}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Admin logs tab ─────────────────────────────────────────────────────────────
function LogsTab({ logs }: { logs: AdminLog[] }) {
  const { lang } = useI18n();
  const adminText = getAdminText(lang);
  const supportText = getAdminSupportText(lang);

  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");

  const locale = lang === "en" ? "en-US" : "ar-IQ";

  const actionTypes = [
    ...new Set(logs.map((log) => log.action_type)),
  ];

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
    support_ticket_claimed: supportText.logClaimed,
    support_ticket_replied: supportText.logReplied,
    support_ticket_resolved: supportText.logResolved,
    support_ticket_in_progress: supportText.logInProgress,
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

// ── Actions dropdown/buttons ───────────────────────────────────────────────────
function ActionsMenu({
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

function hasAdminPermission(
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

// ── Main AdminPage ─────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [, setLocation] = useLocation();
  const { lang, setLang } = useI18n();
  const adminText = getAdminText(lang);
  const locale = lang === "en" ? "en-US" : "ar-IQ";

  const planNames: Record<PlanKey, string> = {
    silver: adminText.planSilver,
    gold: adminText.planGold,
    diamond: adminText.planDiamond,
  };

  const merchantStatusLabels: Record<string, string> = {
    pending_activation: getMerchantStatusLabel("pending_activation", lang),
    approved: getMerchantStatusLabel("approved", lang),
    suspended: getMerchantStatusLabel("suspended", lang),
    rejected: getMerchantStatusLabel("rejected", lang),
  };

  const subscriptionStatusLabels: Record<string, string> = {
    active: getSubscriptionStatusLabel("active", lang),
    expired: getSubscriptionStatusLabel("expired", lang),
    suspended: getSubscriptionStatusLabel("suspended", lang),
    replies_exhausted: getSubscriptionStatusLabel("replies_exhausted", lang),
    pending_activation: getSubscriptionStatusLabel("pending_activation", lang),
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

  const [currentAdmin, setCurrentAdmin] = useState<Merchant | undefined>();
  const isOwnerAdmin = currentAdmin?.admin_role === "owner_admin";
  const canManageAdmins = isOwnerAdmin;
  const canViewMerchants = hasAdminPermission(currentAdmin, "view_merchants");
  const canManageMerchants = hasAdminPermission(
    currentAdmin,
    "manage_merchant_status",
  );
  const canManageSubscriptions = hasAdminPermission(
    currentAdmin,
    "manage_subscriptions",
  );
  const canManageChannels = hasAdminPermission(currentAdmin, "manage_channels");
  const canViewLogs = hasAdminPermission(currentAdmin, "view_logs");
  const canInspectSessions = hasAdminPermission(
    currentAdmin,
    "inspect_merchant_sessions",
  );
  const canManageSupport = hasAdminPermission(currentAdmin, "manage_support");
  const canViewMerchantData =
    canViewMerchants ||
    canManageMerchants ||
    canManageSubscriptions ||
    canManageChannels ||
    canInspectSessions;

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [supportActiveCount, setSupportActiveCount] = useState(0);
  const latestSupportTicketIdRef = useRef<string | null>(null);
  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterActivity, setFilterActivity] = useState("all");
  const [adminNotesMap, setAdminNotesMap] = useState<Record<string, string>>(
    {},
  );
  const [channelOverridesMap, setChannelOverridesMap] = useState<
    Record<string, Record<string, string>>
  >({});

  const [detailsMerchant, setDetailsMerchant] = useState<Merchant | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState | null>(null);
  const [planModal, setPlanModal] = useState<PlanModalState | null>(null);
  const [repliesModal, setRepliesModal] = useState<RepliesModalState | null>(
    null,
  );
  const [deleteMerchantTarget, setDeleteMerchantTarget] =
    useState<Merchant | null>(null);
  const [deletionRequests, setDeletionRequests] = useState<
    MerchantDeletionRequest[]
  >([]);
  const permissionRefreshInFlightRef = useRef(false);

  const refreshCurrentAdminFromApi = useCallback(async (
    options: { preserveOnTransientError?: boolean } = {},
  ): Promise<Merchant | null> => {
    try {
      const response = await fetch("/api/auth/admin/me", {
        headers: getAdminAuthHeaders(),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok || !data.admin?.is_admin) {
        const sessionIsInvalid = response.status === 401 || response.status === 403;
        if (sessionIsInvalid || !options.preserveOnTransientError) {
          clearSession();
          setCurrentAdmin(undefined);
          setLocation("/login");
        }
        return null;
      }

      const serverAdmin = data.admin as Merchant;
      setCurrentAdmin(serverAdmin);
      return serverAdmin;
    } catch (error) {
      console.error("Current admin API refresh failed:", error);
      if (!options.preserveOnTransientError) {
        clearSession();
        setCurrentAdmin(undefined);
        setLocation("/login");
      }
      return null;
    }
  }, [setLocation]);

  const refreshAdminPermissions = useCallback(async () => {
    if (permissionRefreshInFlightRef.current) return;

    permissionRefreshInFlightRef.current = true;
    try {
      await refreshCurrentAdminFromApi({ preserveOnTransientError: true });
    } finally {
      permissionRefreshInFlightRef.current = false;
    }
  }, [refreshCurrentAdminFromApi]);

  useEffect(() => {
    void refreshCurrentAdminFromApi();
  }, [refreshCurrentAdminFromApi]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshAdminPermissions();
      }
    };

    const intervalId = window.setInterval(refreshWhenVisible, 15_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshAdminPermissions]);

  useEffect(() => {
    const merchantStatusConfirmTypes = new Set<ConfirmType>([
      "approve",
      "reject",
      "suspend",
      "unsuspend",
      "restore_pending",
    ]);
    const subscriptionConfirmTypes = new Set<ConfirmType>([
      "reset_replies",
      "stop_auto_reply",
    ]);

    setConfirmDialog((current) => {
      if (!current) return current;
      if (!canManageMerchants && merchantStatusConfirmTypes.has(current.type)) {
        return null;
      }
      if (!canManageSubscriptions && subscriptionConfirmTypes.has(current.type)) {
        return null;
      }
      return current;
    });

    if (!canManageSubscriptions) {
      setPlanModal(null);
      setRepliesModal(null);
      setFilterPlan("all");
    }
    if (!canManageMerchants) {
      setDeleteMerchantTarget(null);
    }
    if (!canViewMerchantData) {
      setDetailsMerchant(null);
    }
  }, [canManageMerchants, canManageSubscriptions, canViewMerchantData]);

  const refreshData = useCallback(() => {
    setSubscriptions(canManageSubscriptions ? getSubscriptions() : []);
    if (!canViewMerchantData) setMerchants([]);
    if (!canViewLogs) setLogs([]);
    if (!canManageMerchants) setAdminNotesMap({});
    if (!canManageChannels) setChannelOverridesMap({});
    if (!isOwnerAdmin && !canManageMerchants) setDeletionRequests([]);
  }, [
    canManageChannels,
    canManageMerchants,
    canManageSubscriptions,
    canViewLogs,
    canViewMerchantData,
    isOwnerAdmin,
  ]);

  const handleUnauthorizedAdminResponse = useCallback(
    (response: Response): boolean => {
      if (response.status === 401) {
        clearSession();
        setLocation("/login");
        return true;
      }

      if (response.status === 403) {
        void refreshCurrentAdminFromApi();
        toast.error(adminText.permissionDenied);
        return true;
      }

      return false;
    },
    [adminText.permissionDenied, refreshCurrentAdminFromApi, setLocation],
  );

  const refreshSupportSummary = useCallback(async () => {
    if (!canManageSupport) {
      setSupportActiveCount(0);
      latestSupportTicketIdRef.current = null;
      return;
    }

    try {
      const response = await fetch("/api/auth/admin/support/tickets", {
        headers: getAdminAuthHeaders(),
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (response.status === 401) {
        clearSession();
        setLocation("/login");
        return;
      }
      if (!response.ok || !data?.ok || !Array.isArray(data.tickets)) return;

      const activeCount = Number.isInteger(data.active_count)
        ? data.active_count
        : data.tickets.filter(
            (ticket: { status?: string }) =>
              ticket.status === "open" || ticket.status === "in_progress",
          ).length;
      const latestTicketId = data.tickets[0]?.id
        ? String(data.tickets[0].id)
        : null;

      if (
        latestSupportTicketIdRef.current &&
        latestTicketId &&
        latestTicketId !== latestSupportTicketIdRef.current
      ) {
        toast.info(getAdminSupportText(lang).newTicketNotification);
      }

      latestSupportTicketIdRef.current = latestTicketId;
      setSupportActiveCount(activeCount);
    } catch (error) {
      console.error("Admin support summary refresh failed:", error);
    }
  }, [canManageSupport, lang, setLocation]);

  useEffect(() => {
    void refreshSupportSummary();
    const intervalId = window.setInterval(
      () => void refreshSupportSummary(),
      15_000,
    );
    const handleFocus = () => void refreshSupportSummary();
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshSupportSummary]);

  const refreshMerchantsFromApi = useCallback(async () => {
    if (!canViewMerchantData) {
      setMerchants([]);
      return;
    }

    try {
      const response = await fetch("/api/auth/merchants", {
        headers: getAdminAuthHeaders(),
      });
      const data = await response.json().catch(() => null);

      if (handleUnauthorizedAdminResponse(response)) {
        return;
      }

      if (!response.ok || !data?.ok || !Array.isArray(data.merchants)) {
        throw new Error(data?.error || "Could not load merchants from API");
      }

      const apiMerchants = (data.merchants as Merchant[]).filter((m) => !m.is_admin);
      const localAdmins = getMerchants().filter((m) => m.is_admin);

      saveMerchants([...localAdmins, ...apiMerchants]);
      setMerchants(apiMerchants);
    } catch (error) {
      console.error("Admin merchants API sync failed:", error);
      toast.error(adminText.merchantLoadError);
    }
  }, [
    adminText.merchantLoadError,
    canViewMerchantData,
    handleUnauthorizedAdminResponse,
  ]);

  const refreshSubscriptionsFromApi = useCallback(async () => {
    if (!canManageSubscriptions) {
      setSubscriptions([]);
      return;
    }

    try {
      const response = await fetch("/api/auth/admin/subscriptions", {
        headers: getAdminAuthHeaders(),
      });
      const data = await response.json().catch(() => null);
      if (handleUnauthorizedAdminResponse(response)) return;
      if (!response.ok || !data?.ok || !Array.isArray(data.subscriptions)) {
        throw new Error(data?.error || "Could not load subscriptions");
      }
      const serverSubscriptions = data.subscriptions as Subscription[];
      saveSubscriptions(serverSubscriptions);
      setSubscriptions(serverSubscriptions);
    } catch (error) {
      console.error("Admin subscriptions API sync failed:", error);
      toast.error(adminText.subscriptionOperationError);
    }
  }, [
    adminText.subscriptionOperationError,
    canManageSubscriptions,
    handleUnauthorizedAdminResponse,
  ]);

  const migrateLegacySubscriptions = useCallback(async () => {
    if (!isOwnerAdmin || !currentAdmin?.id) return;
    const migrationKey = "fawri_subscriptions_migrated_v1_" + currentAdmin.id;
    if (localStorage.getItem(migrationKey) === "done") return;

    const localSubscriptions = getSubscriptions();
    try {
      const response = await fetch("/api/auth/admin/subscriptions/migrate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({ subscriptions: localSubscriptions }),
      });
      const data = await response.json().catch(() => null);
      if (handleUnauthorizedAdminResponse(response)) return;
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Could not migrate subscriptions");
      }
      localStorage.setItem(migrationKey, "done");
    } catch (error) {
      console.error("Legacy subscription migration failed:", error);
    }
  }, [currentAdmin?.id, handleUnauthorizedAdminResponse, isOwnerAdmin]);

  const migrateLegacyAdminData = useCallback(async () => {
    if (!isOwnerAdmin || !currentAdmin?.id) return;

    const migrationKey = `fawri_admin_data_migrated_v1_${currentAdmin.id}`;
    if (localStorage.getItem(migrationKey) === "done") return;

    try {
      const response = await fetch("/api/auth/admin/local-data-migration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({
          logs: getAdminLogs(),
          notes: getAdminNotes(),
          channel_overrides: getChannelOverrides(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (handleUnauthorizedAdminResponse(response)) return;
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Could not migrate legacy admin data");
      }
      localStorage.setItem(migrationKey, "done");
    } catch (error) {
      console.error("Legacy admin data migration failed:", error);
    }
  }, [currentAdmin?.id, handleUnauthorizedAdminResponse, isOwnerAdmin]);

  const refreshLogsFromApi = useCallback(async () => {
    if (!canViewLogs) {
      setLogs([]);
      return;
    }

    try {
      const response = await fetch("/api/auth/admin/logs", {
        headers: getAdminAuthHeaders(),
      });
      const data = await response.json().catch(() => null);
      if (handleUnauthorizedAdminResponse(response)) return;
      if (!response.ok || !data?.ok || !Array.isArray(data.logs)) {
        throw new Error(data?.error || "Could not load admin logs");
      }
      setLogs(data.logs as AdminLog[]);
    } catch (error) {
      console.error("Admin logs API sync failed:", error);
    }
  }, [canViewLogs, handleUnauthorizedAdminResponse]);

  const refreshChannelsFromApi = useCallback(async () => {
    if (!canManageChannels) {
      setChannelOverridesMap({});
      return;
    }

    try {
      const response = await fetch("/api/auth/admin/channels", {
        headers: getAdminAuthHeaders(),
      });
      const data = await response.json().catch(() => null);
      if (handleUnauthorizedAdminResponse(response)) return;
      if (!response.ok || !data?.ok || !data.channel_overrides) {
        throw new Error(data?.error || "Could not load channel statuses");
      }
      setChannelOverridesMap(data.channel_overrides);
    } catch (error) {
      console.error("Admin channels API sync failed:", error);
    }
  }, [canManageChannels, handleUnauthorizedAdminResponse]);

  const refreshDeletionRequestsFromApi = useCallback(async () => {
    if (!isOwnerAdmin && !canManageMerchants) {
      setDeletionRequests([]);
      return;
    }

    try {
      const response = await fetch("/api/auth/admin/deletion-requests", {
        headers: getAdminAuthHeaders(),
      });
      const data = await response.json().catch(() => null);
      if (handleUnauthorizedAdminResponse(response)) return;
      if (!response.ok || !data?.ok || !Array.isArray(data.deletion_requests)) {
        throw new Error(data?.error || "Could not load deletion requests");
      }
      setDeletionRequests(data.deletion_requests as MerchantDeletionRequest[]);
    } catch (error) {
      console.error("Deletion requests API sync failed:", error);
    }
  }, [canManageMerchants, handleUnauthorizedAdminResponse, isOwnerAdmin]);

  useEffect(() => {
    refreshData();
    void (async () => {
      await migrateLegacyAdminData();
      await migrateLegacySubscriptions();
      await Promise.all([
        refreshMerchantsFromApi(),
        refreshSubscriptionsFromApi(),
        refreshLogsFromApi(),
        refreshChannelsFromApi(),
        refreshDeletionRequestsFromApi(),
      ]);
    })();
  }, [
    migrateLegacyAdminData,
    migrateLegacySubscriptions,
    refreshChannelsFromApi,
    refreshData,
    refreshDeletionRequestsFromApi,
    refreshLogsFromApi,
    refreshMerchantsFromApi,
    refreshSubscriptionsFromApi,
  ]);

  const getSub = (id: string) =>
    subscriptions.find((s) => s.merchant_id === id);
  const getPendingDeletionRequest = (merchantId: string) =>
    deletionRequests.find(
      (request) =>
        request.merchant_id === merchantId && request.status === "pending",
    );
  const getDeletionAction = (
    merchant: Merchant,
  ): "request" | "review" | "pending" | undefined => {
    if (merchant.status !== "suspended") return undefined;

    const pendingRequest = getPendingDeletionRequest(merchant.id);
    if (isOwnerAdmin) return pendingRequest ? "review" : undefined;
    if (!canManageMerchants) return undefined;
    return pendingRequest ? "pending" : "request";
  };

  const getFiltered = (statusFilter?: string) =>
    merchants
      .filter((m) => !statusFilter || m.status === statusFilter)
      .filter((m) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          m.store_name.toLowerCase().includes(q) ||
          m.owner_name.toLowerCase().includes(q) ||
          m.phone.includes(q)
        );
      })
      .filter(
        (m) => filterPlan === "all" || getSub(m.id)?.plan_name === filterPlan,
      )
      .filter(
        (m) => filterActivity === "all" || m.activity_type === filterActivity,
      );

  const logAction = (
    action_type: string,
    merchant: Merchant,
    details: string,
    meta: AdminLogMeta = {},
    reason?: string,
  ) => {
    const clientLoggedSubscriptionActions = new Set([
      "plan_activated",
      "plan_changed",
      "plan_renewed",
      "replies_reset",
      "replies_added",
      "replies_deducted",
      "auto_reply_enabled",
      "auto_reply_disabled",
    ]);

    if (!clientLoggedSubscriptionActions.has(action_type)) {
      if (canViewLogs) void refreshLogsFromApi();
      return;
    }

    void (async () => {
      const response = await fetch("/api/auth/admin/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({
          action_type,
          merchant_id: merchant.id,
          details,
          meta,
          reason,
        }),
      });

      if (handleUnauthorizedAdminResponse(response)) return;
      if (canViewLogs) void refreshLogsFromApi();
    })().catch((error) => {
      console.error("Admin log write failed:", error);
    });
  };

  const getStatusSyncErrorMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || "");

    if (message === "ADMIN_SESSION_UNAUTHORIZED") {
      return null;
    }

    if (message.includes("phone number must be verified")) {
      return adminText.merchantOtpRequired;
    }

    return adminText.merchantStatusUpdateError;
  };

  const syncMerchantStatusToApi = async (
    id: string,
    status: Merchant["status"],
    reason?: string,
  ): Promise<Merchant> => {
    const response = await fetch(`/api/auth/merchants/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getAdminAuthHeaders(),
      },
      body: JSON.stringify({ status, reason }),
    });

    const data = await response.json().catch(() => null);

    if (handleUnauthorizedAdminResponse(response)) {
      throw new Error("ADMIN_SESSION_UNAUTHORIZED");
    }

    if (!response.ok || !data?.ok || !data?.merchant) {
      throw new Error(data?.error || "Could not update merchant status in API");
    }

    return data.merchant as Merchant;
  };

  const syncSubscriptionPlanToApi = async (
    id: string,
    operation: "activate" | "change" | "renew",
    plan: PlanKey,
  ): Promise<{ merchant: Merchant; subscription: Subscription }> => {
    const response = await fetch(
      `/api/auth/merchants/${encodeURIComponent(id)}/subscription`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({ operation, plan }),
      },
    );
    const data = await response.json().catch(() => null);
    if (handleUnauthorizedAdminResponse(response)) {
      throw new Error("ADMIN_SESSION_UNAUTHORIZED");
    }
    if (!response.ok || !data?.ok || !data?.merchant || !data?.subscription) {
      throw new Error(data?.error || "Could not update subscription");
    }
    return {
      merchant: data.merchant as Merchant,
      subscription: data.subscription as Subscription,
    };
  };

  const syncSubscriptionActionToApi = async (
    id: string,
    action: "add_replies" | "deduct_replies" | "reset_replies" | "set_auto_reply",
    values: { amount?: number; enabled?: boolean } = {},
  ): Promise<Subscription> => {
    const response = await fetch(
      `/api/auth/merchants/${encodeURIComponent(id)}/subscription`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({ action, ...values }),
      },
    );
    const data = await response.json().catch(() => null);
    if (handleUnauthorizedAdminResponse(response)) {
      throw new Error("ADMIN_SESSION_UNAUTHORIZED");
    }
    if (!response.ok || !data?.ok || !data?.subscription) {
      throw new Error(data?.error || "Could not update subscription");
    }
    return data.subscription as Subscription;
  };

  const updateMerchant = (id: string, patch: Partial<Merchant>) => {
    const all = getMerchants();
    saveMerchants(all.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    refreshData();
  };

  const storeServerSubscription = (subscription: Subscription) => {
    const nextSubscriptions = [
      ...getSubscriptions().filter(
        (item) => item.merchant_id !== subscription.merchant_id,
      ),
      subscription,
    ];
    saveSubscriptions(nextSubscriptions);
    setSubscriptions(nextSubscriptions);
  };

  // ── Actions ──────────────────────────────────────────────────────────────────
  const doApprove = async (merchantId: string) => {
    const m = merchants.find((x) => x.id === merchantId)!;

    try {
      const apiMerchant = await syncMerchantStatusToApi(merchantId, "approved");
      updateMerchant(merchantId, apiMerchant);
      logAction("approved", m, adminText.logMerchantApproved);
      await refreshMerchantsFromApi();
      toast.success(
        formatAdminMessage(adminText.toastMerchantApproved, {
          store: m.store_name,
        }),
      );
      setConfirmDialog(null);
    } catch (error) {
      console.error("Approve merchant failed:", error);
      const message = getStatusSyncErrorMessage(error);
      if (message) toast.error(message);
    }
  };

  const doReject = async (merchantId: string, reason: string) => {
    const m = merchants.find((x) => x.id === merchantId)!;

    try {
      const apiMerchant = await syncMerchantStatusToApi(
        merchantId,
        "rejected",
        reason,
      );
      updateMerchant(merchantId, apiMerchant);
      await refreshMerchantsFromApi();
      logAction(
        "rejected",
        m,
        adminText.logMerchantRejected,
        {},
        reason,
      );
      toast.success(
        formatAdminMessage(adminText.toastMerchantRejected, {
          store: m.store_name,
        }),
      );
      setConfirmDialog(null);
    } catch (error) {
      console.error("Reject merchant failed:", error);
      const message = getStatusSyncErrorMessage(error);
      if (message) toast.error(message);
    }
  };

  const doSuspend = async (merchantId: string, reason: string) => {
    const m = merchants.find((x) => x.id === merchantId)!;

    try {
      const apiMerchant = await syncMerchantStatusToApi(
        merchantId,
        "suspended",
        reason,
      );
      updateMerchant(merchantId, apiMerchant);
      await refreshMerchantsFromApi();
      if (canManageSubscriptions) await refreshSubscriptionsFromApi();
      logAction(
        "suspended",
        m,
        adminText.logMerchantSuspended,
        {},
        reason,
      );
      toast.success(
        formatAdminMessage(adminText.toastMerchantSuspended, {
          store: m.store_name,
        }),
      );
      setConfirmDialog(null);
    } catch (error) {
      console.error("Suspend merchant failed:", error);
      const message = getStatusSyncErrorMessage(error);
      if (message) toast.error(message);
    }
  };

  const doUnsuspend = async (merchantId: string) => {
    const m = merchants.find((x) => x.id === merchantId)!;

    try {
      const apiMerchant = await syncMerchantStatusToApi(merchantId, "approved");
      updateMerchant(merchantId, apiMerchant);
      await refreshMerchantsFromApi();
      if (canManageSubscriptions) await refreshSubscriptionsFromApi();
      logAction("unsuspended", m, adminText.logMerchantUnsuspended);
      toast.success(
        formatAdminMessage(adminText.toastMerchantUnsuspended, {
          store: m.store_name,
        }),
      );
      setConfirmDialog(null);
    } catch (error) {
      console.error("Unsuspend merchant failed:", error);
      const message = getStatusSyncErrorMessage(error);
      if (message) toast.error(message);
    }
  };

  const doRestorePending = async (merchantId: string) => {
    const m = merchants.find((x) => x.id === merchantId)!;

    try {
      const apiMerchant = await syncMerchantStatusToApi(merchantId, "pending_activation");
      updateMerchant(merchantId, apiMerchant);
      await refreshMerchantsFromApi();
      logAction("restore_pending", m, adminText.logMerchantRestored);
      toast.success(
        formatAdminMessage(adminText.toastMerchantRestored, {
          store: m.store_name,
        }),
      );
      setConfirmDialog(null);
    } catch (error) {
      console.error("Restore merchant to pending failed:", error);
      const message = getStatusSyncErrorMessage(error);
      if (message) toast.error(message);
    }
  };

  const doResetReplies = async (merchantId: string) => {
    try {
      const subscription = await syncSubscriptionActionToApi(
        merchantId,
        "reset_replies",
      );
      storeServerSubscription(subscription);
      toast.success(adminText.toastRepliesReset);
      setConfirmDialog(null);
    } catch (error) {
      console.error("Reset replies failed:", error);
      toast.error(adminText.subscriptionOperationError);
    }
  };

  const doAddReplies = async (merchantId: string, amount: number) => {
    try {
      const subscription = await syncSubscriptionActionToApi(
        merchantId,
        "add_replies",
        { amount },
      );
      storeServerSubscription(subscription);
      toast.success(
        formatAdminMessage(adminText.toastRepliesAdded, { amount }),
      );
      setRepliesModal(null);
    } catch (error) {
      console.error("Add replies failed:", error);
      toast.error(adminText.subscriptionOperationError);
    }
  };

  const doDeductReplies = async (merchantId: string, amount: number) => {
    try {
      const subscription = await syncSubscriptionActionToApi(
        merchantId,
        "deduct_replies",
        { amount },
      );
      storeServerSubscription(subscription);
      toast.success(
        formatAdminMessage(adminText.toastRepliesDeducted, { amount }),
      );
      setRepliesModal(null);
    } catch (error) {
      console.error("Deduct replies failed:", error);
      const message = error instanceof Error ? error.message : "";
      toast.error(
        message.includes("amount exceeds remaining replies")
          ? adminText.repliesAmountExceedsRemaining
          : adminText.subscriptionOperationError,
      );
    }
  };

  const doToggleAutoReply = async (merchantId: string) => {
    const current = getSub(merchantId);
    if (!current) {
      toast.error(adminText.noSubscriptionError);
      return;
    }

    try {
      const enabled = !current.auto_reply_enabled;
      const subscription = await syncSubscriptionActionToApi(
        merchantId,
        "set_auto_reply",
        { enabled },
      );
      storeServerSubscription(subscription);
      toast.success(
        enabled
          ? adminText.toastAutoReplyEnabled
          : adminText.toastAutoReplyDisabled,
      );
      setConfirmDialog(null);
    } catch (error) {
      console.error("Toggle automatic replies failed:", error);
      toast.error(adminText.subscriptionOperationError);
    }
  };

  const savePlanOperation = async (
    merchantId: string,
    plan: PlanKey,
    operation: "activate" | "change" | "renew",
  ) => {
    const m = merchants.find((item) => item.id === merchantId);
    if (!m) return;

    try {
      const result = await syncSubscriptionPlanToApi(
        merchantId,
        operation,
        plan,
      );
      updateMerchant(merchantId, result.merchant);
      storeServerSubscription(result.subscription);
      if (operation === "activate") {
        toast.success(
          formatAdminMessage(adminText.toastPlanActivated, {
            plan: planNames[plan],
          }),
        );
      } else if (operation === "change") {
        toast.success(
          formatAdminMessage(adminText.toastPlanChanged, {
            plan: planNames[plan],
          }),
        );
      } else {
        toast.success(
          formatAdminMessage(adminText.toastPlanRenewed, {
            plan: planNames[plan],
          }),
        );
      }
      setPlanModal(null);
    } catch (error) {
      console.error("Subscription plan operation failed:", error);
      toast.error(
        operation === "activate"
          ? adminText.planActivationSaveError
          : operation === "change"
            ? adminText.planChangeSaveError
            : adminText.planRenewSaveError,
      );
    }
  };

  const doActivatePaidSubscription = (merchantId: string, plan: PlanKey) =>
    savePlanOperation(merchantId, plan, "activate");

  const doChangePlan = (merchantId: string, plan: PlanKey) =>
    savePlanOperation(merchantId, plan, "change");

  const doRenewPlan = (merchantId: string, plan: PlanKey) =>
    savePlanOperation(merchantId, plan, "renew");

  const doSaveNote = async (merchantId: string, note: string) => {
    const m = merchants.find((x) => x.id === merchantId)!;
    try {
      const response = await fetch(
        `/api/auth/merchants/${encodeURIComponent(merchantId)}/note`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...getAdminAuthHeaders(),
          },
          body: JSON.stringify({ note }),
        },
      );
      const data = await response.json().catch(() => null);
      if (handleUnauthorizedAdminResponse(response)) return;
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Could not save merchant note");
      }
      setAdminNotesMap((current) => ({ ...current, [merchantId]: data.note || "" }));
      logAction("note_saved", m, adminText.logInternalNoteSaved);
    } catch (error) {
      console.error("Merchant note save failed:", error);
      toast.error(adminText.deletionOperationError);
    }
  };

  const doChannelStatusChange = async (
    merchantId: string,
    platform: string,
    status: string,
  ) => {
    const m = merchants.find((x) => x.id === merchantId)!;
    try {
      const response = await fetch(
        `/api/auth/merchants/${encodeURIComponent(merchantId)}/channels/${encodeURIComponent(platform)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getAdminAuthHeaders(),
          },
          body: JSON.stringify({ status }),
        },
      );
      const data = await response.json().catch(() => null);
      if (handleUnauthorizedAdminResponse(response)) return;
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Could not update channel status");
      }
      setChannelOverridesMap((current) => ({
        ...current,
        [merchantId]: {
          ...(current[merchantId] ?? {}),
          [platform]: status,
        },
      }));
      logAction(
        "channel_status_changed",
        m,
        `${platform}: ${status}`,
        { platform, status },
      );
    } catch (error) {
      console.error("Channel status update failed:", error);
      toast.error(adminText.deletionOperationError);
    }
  };

  const handleConfirm = (reason: string) => {
    if (!confirmDialog) return;
    const { type, merchantId } = confirmDialog;
    if (type === "approve") doApprove(merchantId);
    else if (type === "reject") doReject(merchantId, reason);
    else if (type === "suspend") doSuspend(merchantId, reason);
    else if (type === "unsuspend") doUnsuspend(merchantId);
    else if (type === "reset_replies") doResetReplies(merchantId);
    else if (type === "restore_pending") doRestorePending(merchantId);
    else if (type === "stop_auto_reply") doToggleAutoReply(merchantId);
  };

  const openConfirm = (type: ConfirmType, m: Merchant) =>
    setConfirmDialog({ type, merchantId: m.id, merchantName: m.store_name });
  const openPlan = (mode: PlanModalState["mode"], m: Merchant) => {
    const currentSubscriptionPlan = getSub(m.id)?.plan_name;
    const currentPlan =
      currentSubscriptionPlan && currentSubscriptionPlan in PLANS
        ? (currentSubscriptionPlan as PlanKey)
        : undefined;

    setPlanModal({
      merchantId: m.id,
      merchantName: m.store_name,
      mode,
      currentPlan: mode === "renew" ? currentPlan : undefined,
    });
  };
  const openReplies = (mode: RepliesModalState["mode"], m: Merchant) => {
    const s = getSub(m.id);
    setRepliesModal({
      merchantId: m.id,
      merchantName: m.store_name,
      mode,
      currentUsed: s?.replies_used,
      currentRemaining: s?.replies_remaining,
      limit: s?.reply_limit,
    });
  };

  const openMerchantDetails = async (merchant: Merchant) => {
    setDetailsMerchant(merchant);

    if (!canManageMerchants) return;

    try {
      const response = await fetch(
        `/api/auth/merchants/${encodeURIComponent(merchant.id)}/note`,
        { headers: getAdminAuthHeaders() },
      );
      const data = await response.json().catch(() => null);
      if (handleUnauthorizedAdminResponse(response)) return;
      if (!response.ok || !data?.ok) return;
      setAdminNotesMap((current) => ({
        ...current,
        [merchant.id]: data.note || "",
      }));
    } catch (error) {
      console.error("Merchant note load failed:", error);
    }
  };

  const openDeleteMerchant = (merchant: Merchant) => {
    if (!currentAdmin?.id) {
      toast.error(adminText.adminSessionVerificationError);
      return;
    }

    if (merchant.status !== "suspended") {
      toast.error(adminText.deletionMustBeSuspended);
      return;
    }

    const pendingRequest = getPendingDeletionRequest(merchant.id);

    if (isOwnerAdmin && !pendingRequest) {
      toast.error(adminText.deletionOperationError);
      return;
    }

    if (!isOwnerAdmin && pendingRequest) {
      toast.error(adminText.deletionRequestExists);
      return;
    }

    setDeleteMerchantTarget(merchant);
  };

  const handleDeletionRequested = (request: MerchantDeletionRequest) => {
    setDeletionRequests((current) => [
      request,
      ...current.filter((item) => item.id !== request.id),
    ]);
  };

  const handleDeletionRequestRejected = (request: MerchantDeletionRequest) => {
    setDeletionRequests((current) =>
      current.map((item) => (item.id === request.id ? request : item)),
    );
  };

  const handleMerchantDeleted = (merchant: Merchant) => {
    saveMerchants(
      getMerchants().filter((item) => item.id !== merchant.id),
    );
    setMerchants((current) =>
      current.filter((item) => item.id !== merchant.id),
    );

    saveSubscriptions(
      getSubscriptions().filter(
        (subscription) => subscription.merchant_id !== merchant.id,
      ),
    );
    setSubscriptions((current) =>
      current.filter(
        (subscription) => subscription.merchant_id !== merchant.id,
      ),
    );

    setAdminNotesMap((current) => {
      const next = { ...current };
      delete next[merchant.id];
      return next;
    });

    setChannelOverridesMap((current) => {
      const next = { ...current };
      delete next[merchant.id];
      return next;
    });

    setDeletionRequests((current) =>
      current.map((request) =>
        request.merchant_id === merchant.id && request.status === "pending"
          ? { ...request, status: "completed" }
          : request,
      ),
    );

    if (detailsMerchant?.id === merchant.id) {
      setDetailsMerchant(null);
    }

    logAction(
      "merchant_deleted",
      merchant,
      adminText.logMerchantDeleted,
    );

    setDeleteMerchantTarget(null);
  };

  useEffect(() => {
    const merchantTabs = new Set([
      "all",
      "pending",
      "approved",
      "suspended",
      "rejected",
    ]);
    const currentTabAllowed =
      (merchantTabs.has(tab) && canViewMerchantData) ||
      (tab === "administrators" && canManageAdmins) ||
      (tab === "deletion_requests" && isOwnerAdmin) ||
      (tab === "support" && canManageSupport) ||
      (tab === "logs" && canViewLogs);

    if (currentTabAllowed) return;

    if (canViewMerchantData) setTab("pending");
    else if (canManageSupport) setTab("support");
    else if (canViewLogs) setTab("logs");
    else if (canManageAdmins) setTab("administrators");
  }, [
    canManageAdmins,
    canManageSupport,
    canViewLogs,
    canViewMerchantData,
    isOwnerAdmin,
    tab,
  ]);

  // ── Tabs config ───────────────────────────────────────────────────────────────
  const TABS = [
    ...(canViewMerchantData ? [
    {
      id: "all",
      label: adminText.mainTabAll,
      filter: undefined as string | undefined,
    },
    {
      id: "pending",
      label: adminText.mainTabPending,
      filter: "pending_activation",
    },
    {
      id: "approved",
      label: adminText.mainTabApproved,
      filter: "approved",
    },
    {
      id: "suspended",
      label: adminText.mainTabSuspended,
      filter: "suspended",
    },
    {
      id: "rejected",
      label: adminText.mainTabRejected,
      filter: "rejected",
    },
    ] : []),
    ...(canManageSupport
      ? [
          {
            id: "support",
            label: getAdminSupportText(lang).tab,
            filter: "SUPPORT",
          },
        ]
      : []),
    ...(canManageAdmins
      ? [
          {
            id: "administrators",
            label: adminText.mainTabAdministrators,
            filter: "ADMINISTRATORS",
          },
        ]
      : []),
    ...(isOwnerAdmin
      ? [{
          id: "deletion_requests",
          label: adminText.mainTabDeletionRequests,
          filter: "DELETION_REQUESTS",
        }]
      : []),
    ...(canViewLogs
      ? [{
          id: "logs",
          label: adminText.mainTabLogs,
          filter: "LOGS",
        }]
      : []),
  ];

  const currentTab = TABS.find((t) => t.id === tab)!;
  const filteredMerchants =
    tab === "deletion_requests"
      ? merchants.filter((merchant) => Boolean(getPendingDeletionRequest(merchant.id)))
      : tab !== "logs" && tab !== "administrators" && tab !== "support"
        ? getFiltered(currentTab?.filter)
        : [];
  const uniqueActivities = [
    ...new Set(merchants.map((m) => m.activity_type)),
  ].filter(Boolean);

  const tabCount = (t: (typeof TABS)[0]) => {
    if (t.filter === "LOGS") return logs.length;
    if (t.filter === "SUPPORT") return supportActiveCount;
    if (t.filter === "DELETION_REQUESTS") {
      return deletionRequests.filter((request) => request.status === "pending").length;
    }
    if (t.filter === "ADMINISTRATORS") return 0;
    return getFiltered(t.filter).length;
  };

  return (
    <div className="min-h-screen bg-background" dir={adminText.dir}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 py-2 md:px-6">
          <div className="relative flex min-h-11 items-center justify-between gap-3">
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              <img
                src="/fawri-logo.svg"
                alt=""
                aria-hidden="true"
                className="h-9 w-auto shrink-0 object-contain sm:h-10"
                loading="eager"
                draggable={false}
              />
              <span className="fowri-header-brand-font truncate text-lg font-black leading-tight tracking-tight text-primary sm:text-xl">
                {adminText.mainAdminTitle}
              </span>
            </div>

            {currentAdmin && (
              <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border bg-card/90 px-3 py-1.5 text-sm shadow-sm md:flex">
                <span className="max-w-44 truncate font-semibold text-foreground">
                  {currentAdmin.owner_name}
                </span>
                <span className="h-4 w-px bg-border" aria-hidden="true" />
                <span className="font-medium tabular-nums text-muted-foreground" dir="ltr">
                  {currentAdmin.phone}
                </span>
              </div>
            )}

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <div className="flex items-center overflow-hidden rounded-md border text-xs font-medium">
                {(["ar", "ku", "en"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={`px-2 py-1 transition-colors ${
                      lang === l
                        ? "bg-primary text-white"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {l === "ar" ? adminText.langAr : l === "ku" ? adminText.langKu : adminText.langEn}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearSession();
                  setLocation("/");
                }}
              >
                <LogOut
                  className={`h-4 w-4 ${
                    adminText.dir === "rtl" ? "ml-1.5" : "mr-1.5"
                  }`}
                />
                <span className="hidden sm:inline">{adminText.mainLogout}</span>
              </Button>
            </div>
          </div>

          {currentAdmin && (
            <div className="mt-2 flex justify-center md:hidden">
              <div className="inline-flex max-w-full items-center gap-2 rounded-full border bg-card/90 px-3 py-1.5 text-xs shadow-sm">
                <span className="max-w-40 truncate font-semibold text-foreground">
                  {currentAdmin.owner_name}
                </span>
                <span className="h-3.5 w-px bg-border" aria-hidden="true" />
                <span className="font-medium tabular-nums text-muted-foreground" dir="ltr">
                  {currentAdmin.phone}
                </span>
              </div>
            </div>
          )}
        </div>
      </header>

      <main
        className={`mx-auto max-w-7xl px-4 py-5 md:px-6 ${
          tab === "support"
            ? "space-y-3 md:flex md:h-[calc(100dvh-4rem)] md:flex-col md:gap-3 md:space-y-0 md:overflow-hidden"
            : "space-y-4"
        }`}
      >
        {/* Tabs */}
        {TABS.length > 0 && (
          <div className="-mx-4 grid grid-cols-2 gap-2 px-4 sm:grid-cols-3 md:mx-0 md:grid-cols-4 md:px-0 lg:flex lg:flex-wrap">
          {TABS.map((t) => {
            const count = tabCount(t);
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex min-h-11 w-full min-w-0 items-center justify-center rounded-xl border px-3 py-2 text-xs font-medium whitespace-normal leading-4 transition-colors lg:w-auto lg:min-w-28 lg:whitespace-nowrap lg:px-4 lg:text-sm ${tab === t.id ? "border-primary bg-primary/10 text-primary shadow-sm" : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted/40 hover:text-foreground"}`}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      adminText.dir === "rtl" ? "mr-1.5" : "ml-1.5"
                    } ${
                      tab === t.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          </div>
        )}

        {!currentAdmin ? null : TABS.length === 0 ? (
          <Card className="mx-auto w-full max-w-lg">
            <CardContent className="px-6 py-12 text-center">
              <p className="font-semibold text-foreground">
                {adminText.mainNoPermissionsTitle}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {adminText.mainNoPermissionsDescription}
              </p>
            </CardContent>
          </Card>
        ) : tab === "support" && canManageSupport && currentAdmin ? (
          <AdminSupportTab
            adminId={currentAdmin.id}
            isOwner={isOwnerAdmin}
            canInspectSessions={canInspectSessions}
            onActiveCountChange={setSupportActiveCount}
          />
        ) : tab === "logs" ? (
          <LogsTab logs={logs} />
        ) : tab === "administrators" && canManageAdmins ? (
          <AdministratorsTab
            title={adminText.administratorsTitle}
            description={adminText.administratorsDescription}
            emptyTitle={adminText.administratorsEmptyTitle}
            emptyDescription={adminText.administratorsEmptyDescription}
            adminText={adminText}
          />
        ) : (
          <>
            {/* Search + filters */}
            <div className="grid grid-cols-2 gap-2">
              <div className="relative col-span-2">
                <Search
                  className={`absolute top-2.5 w-4 h-4 text-muted-foreground pointer-events-none ${
                    adminText.dir === "rtl" ? "right-2.5" : "left-2.5"
                  }`}
                />
                <Input
                  className={
                    adminText.dir === "rtl" ? "pr-9" : "pl-9"
                  }
                  placeholder={adminText.mainSearchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {canManageSubscriptions && (
                <Select value={filterPlan} onValueChange={setFilterPlan}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={adminText.mainPlanPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {adminText.mainAllPlans}
                    </SelectItem>
                    {(Object.keys(PLANS) as PlanKey[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {planNames[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {uniqueActivities.length > 0 && (
                <Select
                  value={filterActivity}
                  onValueChange={setFilterActivity}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={adminText.mainActivityPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {adminText.mainAllActivities}
                    </SelectItem>
                    {uniqueActivities.map((a) => (
                      <SelectItem key={a} value={a}>
                          {getLocalizedActivity(a, lang)}
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {formatAdminMessage(
                lang === "en" && filteredMerchants.length === 1
                  ? adminText.mainResultCountSingular
                  : adminText.mainResultsCount,
                { count: filteredMerchants.length },
              )}
            </p>

            {filteredMerchants.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                {adminText.mainNoStores}
              </div>
            ) : (
              <>
                {/* Mobile and tablet cards */}
                <div className="grid gap-4 md:grid-cols-2 xl:hidden">
                  {filteredMerchants.map((m) => {
                    const sub = getSub(m.id);
                    return (
                      <Card
                        key={m.id}
                        className="overflow-hidden border-border/80 bg-card shadow-sm transition-shadow hover:shadow-md"
                      >
                        <CardContent className="p-0">
                          <div className="border-b bg-muted/20 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-base font-bold text-foreground">
                                  {m.store_name}
                                </p>
                                <p className="mt-1 truncate text-sm font-medium text-muted-foreground">
                                  {m.owner_name}
                                </p>
                              </div>
                              <div className="shrink-0 rounded-lg border bg-background px-2.5 py-2 text-center shadow-sm">
                                <p className="text-[9px] font-medium text-muted-foreground">
                                  {adminText.mainTableRegistered}
                                </p>
                                <p className="mt-1 text-[11px] font-semibold tabular-nums" dir="ltr">
                                  {new Date(m.created_at).toLocaleDateString(locale)}
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <div className="rounded-lg border bg-background px-3 py-2.5">
                                <p className="text-[10px] font-medium text-muted-foreground">
                                  {adminText.detailsPhone}
                                </p>
                                <p className="mt-1 font-mono text-xs font-semibold" dir="ltr">
                                  {m.phone}
                                </p>
                              </div>
                              <div className="rounded-lg border bg-background px-3 py-2.5">
                                <p className="text-[10px] font-medium text-muted-foreground">
                                  {adminText.detailsActivityType}
                                </p>
                                <p className="mt-1 truncate text-xs font-semibold">
                                  {getLocalizedActivity(m.activity_type, lang)}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3 p-4">
                            <MerchantStatusSummary
                              merchant={m}
                              subscription={canManageSubscriptions ? sub : undefined}
                              accountStatusLabel={adminText.mainAccountStatusLabel}
                              subscriptionStatusLabel={adminText.detailsSubscriptionStatus}
                              autoRepliesLabel={adminText.detailsAutoReplies}
                              merchantStatusText={merchantStatusLabels[m.status] ?? m.status}
                              subscriptionStatusText={
                                sub
                                  ? subscriptionStatusLabels[sub.status] ?? sub.status
                                  : undefined
                              }
                              enabledLabel={adminText.detailsEnabled}
                              disabledLabel={adminText.detailsDisabled}
                            />

                            {canManageSubscriptions && sub && (
                              <SubscriptionUsageSummary
                                subscription={sub}
                                planName={planNames[sub.plan_name as PlanKey] ?? sub.plan_name}
                                locale={locale}
                                baseUsedLabel={adminText.detailsBaseUsed}
                                baseRemainingLabel={adminText.detailsBaseRemaining}
                                baseLimitLabel={adminText.detailsBaseReplyLimit}
                                emergencyBalanceLabel={adminText.detailsEmergencyBalance}
                                addonBalanceLabel={adminText.detailsAddonBalance}
                                totalAvailableLabel={adminText.detailsTotalAvailable}
                              />
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 border-t bg-muted/10 p-3">
                            {canManageMerchants && m.status === "pending_activation" && (
                              <Button
                                size="sm"
                                className="h-8 flex-1 bg-green-600 text-xs text-white hover:bg-green-700"
                                onClick={() => openConfirm("approve", m)}
                              >
                                {adminText.actionApprove}
                              </Button>
                            )}
                            {canManageMerchants && m.status === "approved" && (
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-8 flex-1 text-xs"
                                onClick={() => openConfirm("suspend", m)}
                              >
                                {adminText.actionSuspendShort}
                              </Button>
                            )}
                            {canManageMerchants && m.status === "suspended" && (
                              <Button
                                size="sm"
                                className="h-8 flex-1 bg-green-600 text-xs text-white hover:bg-green-700"
                                onClick={() => openConfirm("unsuspend", m)}
                              >
                                {adminText.actionUnsuspend}
                              </Button>
                            )}
                            {canManageMerchants && m.status === "rejected" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 flex-1 text-xs"
                                onClick={() => openConfirm("restore_pending", m)}
                              >
                                {adminText.actionRestoreReviewShort}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 min-w-9 px-2"
                              onClick={() => void openMerchantDetails(m)}
                              aria-label={adminText.actionViewDetails}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <ActionsMenu
                              mobile
                              merchant={m}
                              sub={sub}
                              onView={() => void openMerchantDetails(m)}
                              onApprove={() => openConfirm("approve", m)}
                              onReject={() => openConfirm("reject", m)}
                              onSuspend={() => openConfirm("suspend", m)}
                              onUnsuspend={() => openConfirm("unsuspend", m)}
                              onRestore={() => openConfirm("restore_pending", m)}
                              onResetReplies={() => openConfirm("reset_replies", m)}
                              onAddReplies={() => openReplies("add", m)}
                              onDeductReplies={() => openReplies("deduct", m)}
                              onToggleAutoReply={() => doToggleAutoReply(m.id)}
                              onChangePlan={() => openPlan(sub ? "change" : "activate", m)}
                              onRenewPlan={() => openPlan("renew", m)}
                              onDelete={() => openDeleteMerchant(m)}
                              canManageMerchants={canManageMerchants}
                              canManageSubscriptions={canManageSubscriptions}
                              deletionAction={getDeletionAction(m)}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                {/* Desktop grid */}
                <div className="hidden xl:block">
                  <div
                    className={
                      "grid items-center gap-2 rounded-t-xl border border-border/80 bg-muted/40 px-3 py-3 " +
                      (canManageSubscriptions
                        ? "grid-cols-[1.05fr_1.05fr_.95fr_1.7fr_1.1fr]"
                        : "grid-cols-[1.15fr_1.15fr_1fr_1.1fr]")
                    }
                  >
                    {[
                      adminText.mainTableStoreOwner,
                      adminText.mainTablePhoneActivity,
                      adminText.mainTableStatus,
                      ...(canManageSubscriptions
                        ? [adminText.mainTablePlanReplies]
                        : []),
                      adminText.mainTableActions,
                    ].map((heading) => (
                      <div
                        key={heading}
                        className="text-center text-xs font-semibold text-muted-foreground"
                      >
                        {heading}
                      </div>
                    ))}
                  </div>

                  <div className="divide-y divide-border/70 rounded-b-xl border-x border-b border-border/80 bg-card shadow-sm">
                    {filteredMerchants.map((m) => {
                      const sub = getSub(m.id);
                      return (
                        <div
                          key={m.id}
                          className={
                            "grid items-stretch gap-2 bg-card p-2.5 transition-colors hover:bg-muted/20 " +
                            (canManageSubscriptions
                              ? "grid-cols-[1.05fr_1.05fr_.95fr_1.7fr_1.1fr]"
                              : "grid-cols-[1.15fr_1.15fr_1fr_1.1fr]")
                          }
                        >
                          <div className="h-full min-w-0">
                            <div className="flex h-full min-h-[190px] flex-col justify-center rounded-xl border border-border/80 bg-gradient-to-b from-muted/30 to-background p-3 shadow-sm">
                              <p className="text-[10px] font-semibold text-muted-foreground">
                                {adminText.detailsStoreName}
                              </p>
                              <p className="mt-1.5 break-words text-base font-black leading-6 text-foreground">
                                {m.store_name}
                              </p>
                              <div className="my-3 h-px bg-border/70" aria-hidden="true" />
                              <p className="text-[10px] font-semibold text-muted-foreground">
                                {adminText.detailsOwnerName}
                              </p>
                              <p className="mt-1.5 break-words rounded-lg bg-muted/60 px-2.5 py-2 text-xs font-semibold leading-5 text-foreground">
                                {m.owner_name}
                              </p>
                              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[9px] text-muted-foreground">
                                <span>{adminText.mainTableRegistered}</span>
                                <strong className="font-semibold tabular-nums text-foreground" dir="ltr">
                                  {new Date(m.created_at).toLocaleDateString(locale)}
                                </strong>
                              </div>
                            </div>
                          </div>

                          <div className="h-full min-w-0">
                            <div className="flex h-full min-h-[190px] flex-col justify-center rounded-xl border border-border/80 bg-gradient-to-b from-muted/30 to-background p-3 shadow-sm">
                              <p className="text-[10px] font-semibold text-muted-foreground">
                                {adminText.detailsPhone}
                              </p>
                              <p
                                className="mt-1.5 rounded-lg bg-background px-2.5 py-2 text-center font-mono text-sm font-bold tabular-nums text-foreground shadow-sm"
                                dir="ltr"
                              >
                                {m.phone}
                              </p>
                              <div className="my-3 h-px bg-border/70" aria-hidden="true" />
                              <p className="text-[10px] font-semibold text-muted-foreground">
                                {adminText.detailsActivityType}
                              </p>
                              <span className="mt-1.5 inline-flex min-h-9 items-center justify-center rounded-lg border border-border/70 bg-muted/60 px-2.5 py-2 text-center text-xs font-semibold leading-5 text-foreground">
                                {getLocalizedActivity(m.activity_type, lang)}
                              </span>
                            </div>
                          </div>

                          <div className="h-full min-w-0">
                            <MerchantStatusSummary
                              compact
                              merchant={m}
                              subscription={canManageSubscriptions ? sub : undefined}
                              accountStatusLabel={adminText.mainAccountStatusLabel}
                              subscriptionStatusLabel={adminText.detailsSubscriptionStatus}
                              autoRepliesLabel={adminText.detailsAutoReplies}
                              merchantStatusText={merchantStatusLabels[m.status] ?? m.status}
                              subscriptionStatusText={
                                sub
                                  ? subscriptionStatusLabels[sub.status] ?? sub.status
                                  : undefined
                              }
                              enabledLabel={adminText.detailsEnabled}
                              disabledLabel={adminText.detailsDisabled}
                            />
                          </div>

                          {canManageSubscriptions && (
                            <div className="h-full min-w-0">
                              {sub ? (
                                <SubscriptionUsageSummary
                                  compact
                                  subscription={sub}
                                  planName={planNames[sub.plan_name as PlanKey] ?? sub.plan_name}
                                  locale={locale}
                                  baseUsedLabel={adminText.detailsBaseUsed}
                                  baseRemainingLabel={adminText.detailsBaseRemaining}
                                  baseLimitLabel={adminText.detailsBaseReplyLimit}
                                  emergencyBalanceLabel={adminText.detailsEmergencyBalance}
                                  addonBalanceLabel={adminText.detailsAddonBalance}
                                  totalAvailableLabel={adminText.detailsTotalAvailable}
                                />
                              ) : (
                                <div className="flex h-full min-h-[190px] items-center justify-center rounded-xl border border-border/80 bg-muted/20 text-xs text-muted-foreground">
                                  —
                                </div>
                              )}
                            </div>
                          )}

                          <div className="h-full min-w-0">
                            <ActionsMenu
                              merchant={m}
                              sub={sub}
                              onView={() => void openMerchantDetails(m)}
                              onApprove={() => openConfirm("approve", m)}
                              onReject={() => openConfirm("reject", m)}
                              onSuspend={() => openConfirm("suspend", m)}
                              onUnsuspend={() => openConfirm("unsuspend", m)}
                              onRestore={() => openConfirm("restore_pending", m)}
                              onResetReplies={() => openConfirm("reset_replies", m)}
                              onAddReplies={() => openReplies("add", m)}
                              onDeductReplies={() => openReplies("deduct", m)}
                              onToggleAutoReply={() => doToggleAutoReply(m.id)}
                              onChangePlan={() => openPlan(sub ? "change" : "activate", m)}
                              onRenewPlan={() => openPlan("renew", m)}
                              onDelete={() => openDeleteMerchant(m)}
                              canManageMerchants={canManageMerchants}
                              canManageSubscriptions={canManageSubscriptions}
                              deletionAction={getDeletionAction(m)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>

      {/* Modals */}
      {detailsMerchant && (
        <DetailsModal
          merchant={detailsMerchant}
          sub={getSub(detailsMerchant.id)}
          notes={adminNotesMap[detailsMerchant.id] ?? ""}
          channelOverrides={channelOverridesMap[detailsMerchant.id] ?? {}}
          canManageNotes={isOwnerAdmin}
          canManageSubscriptions={canManageSubscriptions}
          canManageChannels={canManageChannels}
          onClose={() => setDetailsMerchant(null)}
          onSaveNote={(note) => void doSaveNote(detailsMerchant.id, note)}
          onChannelStatusChange={(p, s) =>
            void doChannelStatusChange(detailsMerchant.id, p, s)
          }
        />
      )}

      {deleteMerchantTarget && currentAdmin?.id && (
        <DeleteMerchantDialog
          merchant={deleteMerchantTarget}
          adminId={currentAdmin.id}
          isOwner={isOwnerAdmin}
          deletionRequest={getPendingDeletionRequest(deleteMerchantTarget.id)}
          onClose={() => setDeleteMerchantTarget(null)}
          onRequested={handleDeletionRequested}
          onRejected={handleDeletionRequestRejected}
          onDeleted={(merchant) => handleMerchantDeleted(merchant)}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          state={confirmDialog}
          onConfirm={handleConfirm}
          onClose={() => setConfirmDialog(null)}
        />
      )}

      {planModal && (
        <PlanModal
          state={planModal}
          onConfirm={(plan) => {
            if (planModal.mode === "activate")
              doActivatePaidSubscription(planModal.merchantId, plan);
            else if (planModal.mode === "change")
              doChangePlan(planModal.merchantId, plan);
            else doRenewPlan(planModal.merchantId, plan);
          }}
          onClose={() => setPlanModal(null)}
        />
      )}

      {repliesModal && (
        <RepliesModal
          state={repliesModal}
          onConfirm={(amount) =>
            repliesModal.mode === "add"
              ? doAddReplies(repliesModal.merchantId, amount)
              : doDeductReplies(repliesModal.merchantId, amount)
          }
          onClose={() => setRepliesModal(null)}
        />
      )}
    </div>
  );
}
