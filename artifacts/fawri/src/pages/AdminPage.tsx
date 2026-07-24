/**
 * AdminPage — Protected admin control panel (MVP).
 * PRODUCTION TODO: Replace localStorage session with secure server-side admin auth.
 */
import React, { useState, useEffect, useCallback } from "react";
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
  getCurrentMerchant,
  getAdminAuthHeaders,
  clearSession,
  createSubscriptionForPlan,
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
} from "lucide-react";
import { FaInstagram, FaFacebookMessenger, FaTelegram } from "react-icons/fa";

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

// ── Confirm dialog ─────────────────────────────────────────────────────────────
type ConfirmType =
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
    reject: adminText.confirmRejectStore,
    suspend: adminText.confirmSuspendStore,
    unsuspend: adminText.confirmUnsuspendStore,
    reset_replies: adminText.confirmResetReplies,
    stop_auto_reply: adminText.confirmStopAutoReply,
    restore_pending: adminText.confirmRestorePending,
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className="max-w-sm"
        dir={adminText.dir}
      >
        <DialogHeader>
          <DialogTitle
            className={isDestructive ? "text-destructive" : ""}
          >
            {labels[state.type]}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {adminText.storeLabel}:{" "}
            <span className="font-medium text-foreground">
              {state.merchantName}
            </span>
          </p>

          {needsReason ? (
            <div className="space-y-1.5">
              <Label>{adminText.reasonRequired}</Label>

              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={adminText.reasonPlaceholder}
                rows={3}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {adminText.confirmActionQuestion}
            </p>
          )}
        </div>

        <DialogFooter className="flex gap-2 flex-row-reverse justify-start">
          <Button
            variant={isDestructive ? "destructive" : "default"}
            disabled={needsReason && !reason.trim()}
            onClick={() => onConfirm(reason)}
          >
            {adminText.confirm}
          </Button>

          <Button variant="outline" onClick={onClose}>
            {adminText.cancel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Plan modal ─────────────────────────────────────────────────────────────────
interface PlanModalState {
  merchantId: string;
  merchantName: string;
  mode: "activate" | "change" | "renew";
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
  const [selected, setSelected] = useState<PlanKey>("gold");
  const { lang } = useI18n();
  const adminText = getAdminText(lang);
  const locale = lang === "en" ? "en-US" : "ar-IQ";

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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className="max-w-md"
        dir={adminText.dir}
      >
        <DialogHeader>
          <DialogTitle>{modeLabel[state.mode]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {adminText.storeLabel}:{" "}
            <span className="font-medium text-foreground">
              {state.merchantName}
            </span>
          </p>

          {(Object.keys(PLANS) as PlanKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={`w-full rounded-lg border-2 p-3 text-start transition-colors ${
                selected === key
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">
                  {planNames[key]} — {PLANS[key].label}
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

        <DialogFooter className="flex gap-2 flex-row-reverse justify-start">
          <Button onClick={() => onConfirm(selected)}>
            {adminText.confirm}
          </Button>

          <Button variant="outline" onClick={onClose}>
            {adminText.cancel}
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className="max-w-sm"
        dir={adminText.dir}
      >
        <DialogHeader>
          <DialogTitle
            className={
              state.mode === "deduct"
                ? "text-destructive"
                : ""
            }
          >
            {state.mode === "add"
              ? adminText.repliesAddTitle
              : adminText.repliesDeductTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {adminText.storeLabel}:{" "}
            <span className="font-medium text-foreground">
              {state.merchantName}
            </span>
          </p>

          {state.currentUsed !== undefined && (
            <p className="text-xs text-muted-foreground">
              {adminText.repliesUsedLabel}:{" "}
              {state.currentUsed} / {state.limit}
            </p>
          )}

          <div className="space-y-1.5">
            <Label>{adminText.repliesCountLabel}</Label>

            <Input
              type="number"
              min="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={adminText.repliesCountPlaceholder}
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2 flex-row-reverse justify-start">
          <Button
            variant={
              state.mode === "deduct"
                ? "destructive"
                : "default"
            }
            disabled={!amount || parseInt(amount) < 1}
            onClick={() => onConfirm(parseInt(amount))}
          >
            {adminText.confirm}
          </Button>

          <Button variant="outline" onClick={onClose}>
            {adminText.cancel}
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
  canManageMerchants,
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
  canManageMerchants: boolean;
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

  const locale = lang === "en" ? "en-US" : "ar-IQ";

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

  const usedPct = sub
    ? Math.round((sub.replies_used / sub.reply_limit) * 100)
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
    ...(canManageMerchants
      ? [{ id: "notes" as const, label: adminText.detailsTabNotes }]
      : []),
  ];

  const channels = [
    {
      key: "instagram",
      label: "Instagram",
      icon: FaInstagram,
      link: merchant.instagram_link,
    },
    {
      key: "messenger",
      label: "Messenger",
      icon: FaFacebookMessenger,
      link: merchant.messenger_link,
    },
    {
      key: "telegram",
      label: "Telegram",
      icon: FaTelegram,
      link: merchant.telegram_link,
    },
  ];

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
    [
      adminText.detailsInstagramLink,
      merchant.instagram_link || "—",
    ],
    [
      adminText.detailsMessengerLink,
      merchant.messenger_link || "—",
    ],
    [
      adminText.detailsTelegramLink,
      merchant.telegram_link || "—",
    ],
  ];

  const subscriptionDetails: [string, string][] = sub
    ? [
        [
          adminText.detailsPlan,
          `${planNames[sub.plan_name as PlanKey] ?? sub.plan_name} — ${
            PLANS[sub.plan_name as PlanKey]?.label ?? ""
          }`,
        ],
        [
            adminText.detailsSubscriptionStatus,
            getSubscriptionStatusLabel(sub.status, lang),
          ],
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
          `${daysRemaining} ${adminText.detailsDay}`,
        ],
        [
          adminText.detailsReplyLimit,
          sub.reply_limit.toLocaleString(locale),
        ],
        [
          adminText.detailsUsed,
          `${sub.replies_used.toLocaleString(locale)} (${usedPct}%)`,
        ],
        [
          adminText.detailsRemaining,
          sub.replies_remaining.toLocaleString(locale),
        ],
        [
          adminText.detailsAutoReplies,
          sub.auto_reply_enabled
            ? adminText.detailsEnabled
            : adminText.detailsDisabled,
        ],
        [
          adminText.detailsEmergencyCredit,
          sub.emergency_credit_activated
            ? adminText.detailsEnabled
            : adminText.detailsNotEnabled,
        ],
        [
          adminText.detailsEmergencyCreditAmount,
          sub.emergency_credit_amount.toLocaleString(locale),
        ],
        [
          adminText.detailsEmergencyCreditUsed,
          sub.emergency_credit_used.toLocaleString(locale),
        ],
        [
          adminText.detailsNextCycleDeduction,
          sub.pending_next_cycle_deduction.toLocaleString(locale),
        ],
      ]
    : [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className="flex max-h-[90vh] w-full max-w-2xl flex-col p-0"
        dir={adminText.dir}
      >
        <DialogHeader className="px-6 pb-0 pt-5">
          <DialogTitle className="text-base">
            {merchant.store_name}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-3 flex gap-0 border-b px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors ${
                activeTab === tab.id
                  ? "border-primary font-medium text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1 px-6 py-4">
          {activeTab === "store" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {storeDetails.map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg bg-muted/50 p-3"
                >
                  <p className="text-xs text-muted-foreground">
                    {label}
                  </p>

                  <p className="mt-0.5 break-all text-sm font-medium">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {activeTab === "subscription" &&
            (sub ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {subscriptionDetails.map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg bg-muted/50 p-3"
                  >
                    <p className="text-xs text-muted-foreground">
                      {label}
                    </p>

                    <p className="mt-0.5 text-sm font-medium">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {adminText.detailsNoActiveSubscription}
              </p>
            ))}

          {activeTab === "channels" && (
            <div className="space-y-3">
              <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                {adminText.detailsMockChannelNotice}
              </p>

              {channels.map(
                ({ key, label, icon: Icon, link }) => (
                  <div
                    key={key}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {label}
                      </p>

                      {link ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {link}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {adminText.detailsNoLink}
                        </p>
                      )}
                    </div>

                    <Select
                      value={
                        channelOverrides[key] ??
                        "disconnected"
                      }
                      onValueChange={(value) =>
                        onChannelStatusChange(key, value)
                      }
                    >
                      <SelectTrigger className="h-8 w-36 text-xs">
                        <SelectValue />
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
                  </div>
                ),
              )}
            </div>
          )}

          {activeTab === "notes" && (
            <div className="space-y-3">
              <Label>{adminText.detailsInternalNotes}</Label>

              <Textarea
                rows={6}
                value={noteText}
                onChange={(event) =>
                  setNoteText(event.target.value)
                }
                placeholder={adminText.detailsNotesPlaceholder}
              />

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
          )}
        </ScrollArea>

        <div className="flex justify-end border-t px-6 pb-4 pt-4">
          <Button variant="outline" onClick={onClose}>
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
        return plan
          ? formatAdminMessage(adminText.logMerchantApproved, {
              plan,
            })
          : log.details;

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
              {canManageSubscriptions && (
                <DropdownMenuItem
                  onClick={onApprove}
                  className="text-green-600 focus:text-green-600"
                >
                  <CheckCircle
                    className={`h-3.5 w-3.5 ${iconSpacingClass}`}
                  />
                  {adminText.actionApproveActivate}
                </DropdownMenuItem>
              )}

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
                    {sub?.auto_reply_enabled ? (
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
      className="flex flex-wrap gap-1.5"
      dir={adminText.dir}
    >
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onView}
      >
        <Eye
          className={`h-3 w-3 ${compactIconSpacingClass}`}
        />
        {adminText.actionDetailsShort}
      </Button>

      {canManageMerchants && status === "pending_activation" && (
        <>
          {canManageSubscriptions && (
            <Button
              size="sm"
              className="h-7 bg-green-600 px-2 text-xs text-white hover:bg-green-700"
              onClick={onApprove}
            >
              {adminText.actionApprove}
            </Button>
          )}

          <Button
            variant="destructive"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onReject}
          >
            {adminText.actionReject}
          </Button>
        </>
      )}

      {status === "approved" && (
        <>
          {canManageSubscriptions && (
            <>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onChangePlan}>
                {adminText.actionPlanShort}
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onRenewPlan}>
                {adminText.actionRenewShort}
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onResetReplies}>
                <RefreshCcw className={`h-3 w-3 ${compactIconSpacingClass}`} />
                {adminText.actionRepliesShort}
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onAddReplies}>
                <Plus className={`h-3 w-3 ${compactIconSpacingClass}`} />
                {adminText.actionAddShort}
              </Button>
            </>
          )}

          {canManageMerchants && (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onSuspend}
            >
              {adminText.actionSuspendShort}
            </Button>
          )}
        </>
      )}

      {canManageMerchants && status === "suspended" && (
        <>
          <Button
            size="sm"
            className="h-7 bg-green-600 px-2 text-xs text-white hover:bg-green-700"
            onClick={onUnsuspend}
          >
            {adminText.actionUnsuspend}
          </Button>

          <Button
            variant="destructive"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onReject}
          >
            {adminText.actionReject}
          </Button>
        </>
      )}

      {canManageMerchants && status === "rejected" && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onRestore}
        >
          {adminText.actionRestoreReviewShort}
        </Button>
      )}

      {deletionAction && (
        <Button
          variant="destructive"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onDelete}
          disabled={deletionAction === "pending"}
        >
          {deletionActionLabel}
        </Button>
      )}
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

  const currentAdmin = getCurrentMerchant();
  const isOwnerAdmin = currentAdmin?.admin_role === "owner_admin";
  const canManageAdmins = hasAdminPermission(currentAdmin, "manage_admins");
  const canManageMerchants = hasAdminPermission(currentAdmin, "manage_merchants");
  const canManageSubscriptions = hasAdminPermission(
    currentAdmin,
    "manage_subscriptions",
  );
  const canManageChannels = hasAdminPermission(currentAdmin, "manage_channels");
  const canViewLogs = hasAdminPermission(currentAdmin, "view_logs");
  const canInspectSessions = hasAdminPermission(
    currentAdmin,
    "inspection_sessions",
  );
  const canViewMerchantData =
    canManageMerchants ||
    canManageSubscriptions ||
    canManageChannels ||
    canInspectSessions;

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
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

  // Guard: admin-only
  useEffect(() => {
    const current = getCurrentMerchant();
    if (!current) {
      setLocation("/login");
      return;
    }
    if (!current.is_admin) {
      setLocation("/dashboard");
      return;
    }
  }, [setLocation]);

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
        toast.error(adminText.permissionDenied);
        return true;
      }

      return false;
    },
    [adminText.permissionDenied, setLocation],
  );

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
      await Promise.all([
        refreshMerchantsFromApi(),
        refreshLogsFromApi(),
        refreshChannelsFromApi(),
        refreshDeletionRequestsFromApi(),
      ]);
    })();
  }, [
    migrateLegacyAdminData,
    refreshChannelsFromApi,
    refreshData,
    refreshDeletionRequestsFromApi,
    refreshLogsFromApi,
    refreshMerchantsFromApi,
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

  const syncMerchantSubscriptionToApi = async (
    id: string,
    subscription: Subscription,
  ): Promise<Merchant> => {
    const response = await fetch(
      `/api/auth/merchants/${encodeURIComponent(id)}/subscription`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({
          subscription_started_at: subscription.start_date,
          subscription_expires_at: subscription.expires_at,
        }),
      },
    );

    const data = await response.json().catch(() => null);

    if (handleUnauthorizedAdminResponse(response)) {
      throw new Error("ADMIN_SESSION_UNAUTHORIZED");
    }

    if (!response.ok || !data?.ok || !data?.merchant) {
      throw new Error(
        data?.error || "Could not synchronize subscription with API",
      );
    }

    return data.merchant as Merchant;
  };

  const updateMerchant = (id: string, patch: Partial<Merchant>) => {
    const all = getMerchants();
    saveMerchants(all.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    refreshData();
  };

  const updateSub = (merchantId: string, patch: Partial<Subscription>) => {
    const all = getSubscriptions();
    saveSubscriptions(
      all.map((s) => (s.merchant_id === merchantId ? { ...s, ...patch } : s)),
    );
    refreshData();
  };

  // ── Actions ──────────────────────────────────────────────────────────────────
  const doApprove = async (merchantId: string, plan: PlanKey) => {
    const m = merchants.find((x) => x.id === merchantId)!;

    try {
      const previousSubscriptions = getSubscriptions();
      const apiMerchant = await syncMerchantStatusToApi(merchantId, "approved");
      updateMerchant(merchantId, apiMerchant);

      try {
        const subscription = createSubscriptionForPlan(merchantId, plan);
        const syncedMerchant = await syncMerchantSubscriptionToApi(
          merchantId,
          subscription,
        );
        updateMerchant(merchantId, syncedMerchant);
      } catch (error) {
        saveSubscriptions(previousSubscriptions);

        const revertedMerchant = await syncMerchantStatusToApi(
          merchantId,
          "pending_activation",
        );
        updateMerchant(merchantId, revertedMerchant);

        throw error;
      }
      logAction(
        "plan_activated",
        m,
        formatAdminMessage(adminText.logPlanLabel, {
          plan: planNames[plan],
        }),
        { plan },
      );
      logAction(
        "approved",
        m,
        formatAdminMessage(adminText.logMerchantApproved, {
          plan: planNames[plan],
        }),
        { plan },
      );
      refreshData();
      toast.success(
        formatAdminMessage(adminText.toastMerchantApproved, {
          store: m.store_name,
          plan: planNames[plan],
        }),
      );
      setPlanModal(null);
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
      updateSub(merchantId, { status: "suspended", auto_reply_enabled: false });
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
      updateSub(merchantId, { status: "active", auto_reply_enabled: true });
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

  const doResetReplies = (merchantId: string) => {
    const m = merchants.find((x) => x.id === merchantId)!;
    const s = getSub(merchantId);
    if (!s) {
      toast.error(adminText.noSubscriptionError);
      return;
    }
    updateSub(merchantId, {
      replies_used: 0,
      replies_remaining: s.reply_limit,
      status: "active",
      pending_next_cycle_deduction: 0,
    });
    logAction(
      "replies_reset",
      m,
      formatAdminMessage(adminText.logRepliesReset, {
        limit: s.reply_limit,
      }),
      { limit: s.reply_limit },
    );
    toast.success(adminText.toastRepliesReset);
    setConfirmDialog(null);
  };

  const doAddReplies = (merchantId: string, amount: number) => {
    const m = merchants.find((x) => x.id === merchantId)!;
    const s = getSub(merchantId);
    if (!s) {
      toast.error(adminText.noSubscriptionError);
      return;
    }
    updateSub(merchantId, {
      reply_limit: s.reply_limit + amount,
      replies_remaining: s.replies_remaining + amount,
    });
    logAction(
      "replies_added",
      m,
      formatAdminMessage(adminText.logRepliesAdded, { amount }),
      { amount },
    );
    toast.success(
      formatAdminMessage(adminText.toastRepliesAdded, { amount }),
    );
    setRepliesModal(null);
  };

  const doDeductReplies = (merchantId: string, amount: number) => {
    const m = merchants.find((x) => x.id === merchantId)!;
    const s = getSub(merchantId);
    if (!s) {
      toast.error(adminText.noSubscriptionError);
      return;
    }
    const newUsed = Math.min(s.replies_used + amount, s.reply_limit);
    updateSub(merchantId, {
      replies_used: newUsed,
      replies_remaining: Math.max(0, s.reply_limit - newUsed),
    });
    logAction(
      "replies_deducted",
      m,
      formatAdminMessage(adminText.logRepliesDeducted, { amount }),
      { amount },
    );
    toast.success(
      formatAdminMessage(adminText.toastRepliesDeducted, { amount }),
    );
    setRepliesModal(null);
  };

  const doToggleAutoReply = (merchantId: string) => {
    const m = merchants.find((x) => x.id === merchantId)!;
    const s = getSub(merchantId);
    if (!s) {
      toast.error(adminText.noSubscriptionError);
      return;
    }
    const enabled = !s.auto_reply_enabled;
    updateSub(merchantId, { auto_reply_enabled: enabled });
    logAction(
      enabled ? "auto_reply_enabled" : "auto_reply_disabled",
      m,
      enabled
        ? adminText.logAutoReplyEnabled
        : adminText.logAutoReplyDisabled,
    );
    toast.success(
      enabled
        ? adminText.toastAutoReplyEnabled
        : adminText.toastAutoReplyDisabled,
    );
  };

  const doChangePlan = async (merchantId: string, plan: PlanKey) => {
    const m = merchants.find((x) => x.id === merchantId)!;
    const previousSubscriptions = getSubscriptions();

    try {
      const subscription = createSubscriptionForPlan(merchantId, plan);
      const apiMerchant = await syncMerchantSubscriptionToApi(
        merchantId,
        subscription,
      );

      updateMerchant(merchantId, apiMerchant);
      logAction(
        "plan_changed",
        m,
        formatAdminMessage(adminText.logPlanChanged, {
          plan: planNames[plan],
        }),
        { plan },
      );
      toast.success(
        formatAdminMessage(adminText.toastPlanChanged, {
          plan: planNames[plan],
        }),
      );
      setPlanModal(null);
      refreshData();
    } catch (error) {
      saveSubscriptions(previousSubscriptions);
      refreshData();
      console.error("Change plan synchronization failed:", error);
      toast.error(adminText.planChangeSaveError);
    }
  };

  const doRenewPlan = async (merchantId: string, plan: PlanKey) => {
    const m = merchants.find((x) => x.id === merchantId)!;
    const deduct = getSub(merchantId)?.pending_next_cycle_deduction ?? 0;
    const previousSubscriptions = getSubscriptions();

    try {
      const subscription = createSubscriptionForPlan(merchantId, plan);
      const apiMerchant = await syncMerchantSubscriptionToApi(
        merchantId,
        subscription,
      );
      updateMerchant(merchantId, apiMerchant);
    if (deduct > 0) {
      const all = getSubscriptions();
      saveSubscriptions(
        all.map((x) =>
          x.merchant_id === merchantId
            ? {
                ...x,
                replies_used: deduct,
                replies_remaining: Math.max(0, x.reply_limit - deduct),
              }
            : x,
        ),
      );
    }
    logAction(
      "plan_renewed",
      m,
      `${planNames[plan]}${
        deduct > 0
          ? formatAdminMessage(adminText.emergencyDeduction, {
              amount: deduct,
            })
          : ""
      }`,
      {
        plan,
        emergency_deduction: deduct,
      },
    );
      toast.success(
        formatAdminMessage(adminText.toastPlanRenewed, {
          plan: planNames[plan],
        }),
      );
      setPlanModal(null);
      refreshData();
    } catch (error) {
      saveSubscriptions(previousSubscriptions);
      refreshData();
      console.error("Renew plan synchronization failed:", error);
      toast.error(adminText.planRenewSaveError);
    }
  };

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
    if (type === "reject") doReject(merchantId, reason);
    else if (type === "suspend") doSuspend(merchantId, reason);
    else if (type === "unsuspend") doUnsuspend(merchantId);
    else if (type === "reset_replies") doResetReplies(merchantId);
    else if (type === "restore_pending") doRestorePending(merchantId);
    else if (type === "stop_auto_reply") doToggleAutoReply(merchantId);
  };

  const openConfirm = (type: ConfirmType, m: Merchant) =>
    setConfirmDialog({ type, merchantId: m.id, merchantName: m.store_name });
  const openPlan = (mode: PlanModalState["mode"], m: Merchant) =>
    setPlanModal({ merchantId: m.id, merchantName: m.store_name, mode });
  const openReplies = (mode: RepliesModalState["mode"], m: Merchant) => {
    const s = getSub(m.id);
    setRepliesModal({
      merchantId: m.id,
      merchantName: m.store_name,
      mode,
      currentUsed: s?.replies_used,
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
      (tab === "logs" && canViewLogs);

    if (currentTabAllowed) return;

    if (canViewMerchantData) setTab("pending");
    else if (canViewLogs) setTab("logs");
    else if (canManageAdmins) setTab("administrators");
  }, [
    canManageAdmins,
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
      : tab !== "logs" && tab !== "administrators"
        ? getFiltered(currentTab?.filter)
        : [];
  const uniqueActivities = [
    ...new Set(merchants.map((m) => m.activity_type)),
  ].filter(Boolean);

  const tabCount = (t: (typeof TABS)[0]) => {
    if (t.filter === "LOGS") return logs.length;
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
        <div className="flex items-center justify-between h-14 px-4 md:px-6 max-w-7xl mx-auto">
          <span className="text-lg font-bold text-primary fowri-header-brand-font">
            {adminText.mainAdminTitle}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {currentAdmin?.phone}
            </span>
            <div className="flex items-center border rounded-md overflow-hidden text-xs font-medium">
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
                className={`w-4 h-4 ${
                  adminText.dir === "rtl" ? "ml-1.5" : "mr-1.5"
                }`}
              />
              {adminText.mainLogout}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-5 space-y-4">
        {/* Tabs */}
        <div className="flex overflow-x-auto border-b no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          {TABS.map((t) => {
            const count = tabCount(t);
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      adminText.dir === "rtl" ? "mr-1.5" : "ml-1.5"
                    } ${
                      tab === t.id ? "bg-primary/15" : "bg-muted"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {tab === "logs" ? (
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
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-44">
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
                  <SelectTrigger className="w-36">
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
                  <SelectTrigger className="w-36">
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
              {formatAdminMessage(adminText.mainResultsCount, {
                count: filteredMerchants.length,
              })}
            </p>

            {filteredMerchants.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                {adminText.mainNoStores}
              </div>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {filteredMerchants.map((m) => {
                    const sub = getSub(m.id);
                    const pct = sub
                      ? Math.round((sub.replies_used / sub.reply_limit) * 100)
                      : 0;
                    return (
                      <Card key={m.id}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate">
                                {m.store_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {m.owner_name} · {m.phone}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {getLocalizedActivity(m.activity_type, lang)}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <StatusBadge
                                status={m.status}
                                label={merchantStatusLabels[m.status] ?? m.status}
                              />
                              {sub && (
                                <span className="text-[10px] text-muted-foreground capitalize">
                                  {planNames[sub.plan_name as PlanKey] ?? sub.plan_name}
                                </span>
                              )}
                            </div>
                          </div>
                          {sub && (
                            <div className="bg-muted/50 rounded-md p-2 text-xs">
                              <div className="flex justify-between mb-1">
                                <span className="text-muted-foreground">
                                  {adminText.actionRepliesShort}
                                </span>
                                <span className="font-medium">
                                  {sub.replies_used.toLocaleString(locale)} /{" "}
                                  {sub.reply_limit.toLocaleString(locale)} ({pct}%)
                                </span>
                              </div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-primary"}`}
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            {canManageMerchants && canManageSubscriptions && m.status === "pending_activation" && (
                              <Button
                                size="sm"
                                className="h-8 text-xs flex-1 bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => openPlan("activate", m)}
                              >
                                {adminText.actionApproveActivate}
                              </Button>
                            )}
                            {canManageMerchants && m.status === "approved" && (
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-8 text-xs flex-1"
                                onClick={() => openConfirm("suspend", m)}
                              >
                                {adminText.actionSuspendShort}
                              </Button>
                            )}
                            {canManageMerchants && m.status === "suspended" && (
                              <Button
                                size="sm"
                                className="h-8 text-xs flex-1 bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => openConfirm("unsuspend", m)}
                              >
                                {adminText.actionUnsuspend}
                              </Button>
                            )}
                            {canManageMerchants && m.status === "rejected" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs flex-1"
                                onClick={() =>
                                  openConfirm("restore_pending", m)
                                }
                              >
                                {adminText.actionRestoreReviewShort}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => void openMerchantDetails(m)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <ActionsMenu
                              mobile
                              merchant={m}
                              sub={sub}
                              onView={() => void openMerchantDetails(m)}
                              onApprove={() => openPlan("activate", m)}
                              onReject={() => openConfirm("reject", m)}
                              onSuspend={() => openConfirm("suspend", m)}
                              onUnsuspend={() => openConfirm("unsuspend", m)}
                              onRestore={() =>
                                openConfirm("restore_pending", m)
                              }
                              onResetReplies={() =>
                                openConfirm("reset_replies", m)
                              }
                              onAddReplies={() => openReplies("add", m)}
                              onDeductReplies={() => openReplies("deduct", m)}
                              onToggleAutoReply={() => doToggleAutoReply(m.id)}
                              onChangePlan={() => openPlan("change", m)}
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

                {/* Desktop table */}
                <div className="hidden md:block rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        {[
                          adminText.mainTableStoreOwner,
                          adminText.mainTablePhoneActivity,
                          adminText.mainTableStatus,
                          adminText.mainTablePlanReplies,
                          adminText.mainTableRegistered,
                          adminText.mainTableActions,
                        ].map((h) => (
                          <th
                            key={h}
                            className={`px-4 py-3 font-medium text-muted-foreground text-xs ${
                              adminText.dir === "rtl"
                                ? "text-right"
                                : "text-left"
                            }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredMerchants.map((m) => {
                        const sub = getSub(m.id);
                        const pct = sub
                          ? Math.round(
                              (sub.replies_used / sub.reply_limit) * 100,
                            )
                          : 0;
                        return (
                          <tr
                            key={m.id}
                            className="hover:bg-muted/25 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <p className="font-medium">{m.store_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {m.owner_name}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-mono text-xs">{m.phone}</p>
                              <p className="text-xs text-muted-foreground">
                                {getLocalizedActivity(m.activity_type, lang)}
                              </p>
                            </td>
                            <td className="px-4 py-3 space-y-1">
                              <div>
                                <StatusBadge
                                status={m.status}
                                label={merchantStatusLabels[m.status] ?? m.status}
                              />
                              </div>
                              {sub && (
                                <div>
                                  <SubBadge
                                    status={sub.status}
                                    label={
                                      subscriptionStatusLabels[sub.status] ??
                                      sub.status
                                    }
                                  />
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {sub ? (
                                <div className="space-y-1">
                                  <span className="text-xs font-medium capitalize">
                                    {planNames[sub.plan_name as PlanKey] ?? sub.plan_name}
                                  </span>
                                  <p className="text-xs text-muted-foreground">
                                    {sub.replies_used.toLocaleString(locale)} /{" "}
                                    {sub.reply_limit.toLocaleString(locale)} ({pct}%)
                                  </p>
                                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-primary"}`}
                                      style={{
                                        width: `${Math.min(100, pct)}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {new Date(m.created_at).toLocaleDateString(
                                locale,
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <ActionsMenu
                                merchant={m}
                                sub={sub}
                                onView={() => void openMerchantDetails(m)}
                                onApprove={() => openPlan("activate", m)}
                                onReject={() => openConfirm("reject", m)}
                                onSuspend={() => openConfirm("suspend", m)}
                                onUnsuspend={() => openConfirm("unsuspend", m)}
                                onRestore={() =>
                                  openConfirm("restore_pending", m)
                                }
                                onResetReplies={() =>
                                  openConfirm("reset_replies", m)
                                }
                                onAddReplies={() => openReplies("add", m)}
                                onDeductReplies={() => openReplies("deduct", m)}
                                onToggleAutoReply={() =>
                                  doToggleAutoReply(m.id)
                                }
                                onChangePlan={() => openPlan("change", m)}
                                onRenewPlan={() => openPlan("renew", m)}
                                onDelete={() => openDeleteMerchant(m)}
                                canManageMerchants={canManageMerchants}
                                canManageSubscriptions={canManageSubscriptions}
                                deletionAction={getDeletionAction(m)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
          canManageMerchants={canManageMerchants}
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
              doApprove(planModal.merchantId, plan);
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
