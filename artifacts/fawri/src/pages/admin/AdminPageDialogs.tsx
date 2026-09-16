
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
import { PLANS } from '@/pages/admin/AdminPageSections';
import type { PlanKey } from '@/pages/admin/AdminPageSections';
export type ConfirmType =
  | "approve"
  | "reject"
  | "suspend"
  | "unsuspend"
  | "reset_replies"
  | "stop_auto_reply"
  | "restore_pending";
export interface ConfirmState {
  type: ConfirmType;
  merchantId: string;
  merchantName: string;
}
export function ConfirmDialog({
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
export interface PlanModalState {
  merchantId: string;
  merchantName: string;
  mode: "activate" | "change" | "renew";
  currentPlan?: PlanKey;
}
export function PlanModal({
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
export interface RepliesModalState {
  merchantId: string;
  merchantName: string;
  mode: "add" | "deduct";
  currentUsed?: number;
  currentRemaining?: number;
  limit?: number;
}
export function RepliesModal({
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
export function DetailsModal({
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
  const addonRepliesRemaining = sub?.addon_replies_remaining ?? 0;
  const totalRepliesAvailable =
    baseRepliesRemaining + addonRepliesRemaining;
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
