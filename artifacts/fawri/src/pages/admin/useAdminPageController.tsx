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
import { ActionsMenu, AutoReplyBadge, ConfirmDialog, DetailsModal, LogsTab, MerchantStatusSummary, PLANS, PlanModal, RepliesModal, StatusBadge, SubBadge, SubscriptionUsageSummary, formatUsagePercentage, hasAdminPermission } from '@/pages/admin/AdminPageParts';
import type { ConfirmState, ConfirmType, PlanKey, PlanModalState, RepliesModalState } from '@/pages/admin/AdminPageParts';

export function useAdminPageController() {

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
  const passwordChangeRequired = currentAdmin?.must_change_password === true;
  const isOwnerAdmin = currentAdmin?.admin_role === "owner_admin";
  const canManageAdmins = isOwnerAdmin && !passwordChangeRequired;
  const canViewMerchants =
    !passwordChangeRequired &&
    hasAdminPermission(currentAdmin, "view_merchants");
  const canManageMerchants =
    !passwordChangeRequired &&
    hasAdminPermission(currentAdmin, "manage_merchant_status");
  const canManageSubscriptions =
    !passwordChangeRequired &&
    hasAdminPermission(currentAdmin, "manage_subscriptions");
  const canManageChannels =
    !passwordChangeRequired &&
    hasAdminPermission(currentAdmin, "manage_channels");
  const canViewLogs =
    !passwordChangeRequired &&
    hasAdminPermission(currentAdmin, "view_logs");
  const canInspectSessions =
    !passwordChangeRequired &&
    hasAdminPermission(currentAdmin, "inspect_merchant_sessions");
  const canManageSupport =
    !passwordChangeRequired &&
    hasAdminPermission(currentAdmin, "manage_support");
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
  const adminLogRefreshInFlightRef = useRef(false);

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
    if (adminLogRefreshInFlightRef.current) return;

    adminLogRefreshInFlightRef.current = true;
    try {
      const response = await fetch("/api/auth/admin/logs", {
        headers: getAdminAuthHeaders(),
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (handleUnauthorizedAdminResponse(response)) return;
      if (!response.ok || !data?.ok || !Array.isArray(data.logs)) {
        throw new Error(data?.error || "Could not load admin logs");
      }
      setLogs(data.logs as AdminLog[]);
    } catch (error) {
      console.error("Admin logs API sync failed:", error);
    } finally {
      adminLogRefreshInFlightRef.current = false;
    }
  }, [canViewLogs, handleUnauthorizedAdminResponse]);

  useEffect(() => {
    if (!canViewLogs) return;

    const refreshLogsWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refreshLogsFromApi();
    };

    const intervalId = window.setInterval(refreshLogsWhenVisible, 3_000);
    window.addEventListener("focus", refreshLogsWhenVisible);
    document.addEventListener("visibilitychange", refreshLogsWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshLogsWhenVisible);
      document.removeEventListener("visibilitychange", refreshLogsWhenVisible);
    };
  }, [canViewLogs, refreshLogsFromApi]);

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

  useEffect(() => {
    if (!canManageSubscriptions) return;

    let active = true;
    let reconnectTimer: number | undefined;
    let controller: AbortController | null = null;

    const applySnapshot = (serverSubscriptions: Subscription[]) => {
      saveSubscriptions(serverSubscriptions);
      setSubscriptions(serverSubscriptions);
    };

    const applyUpdate = (
      merchantId: string,
      subscription: Subscription | null,
    ) => {
      setSubscriptions((current) => {
        const next = current.filter(
          (item) => item.merchant_id !== merchantId,
        );
        if (subscription) next.push(subscription);
        saveSubscriptions(next);
        return next;
      });
    };

    const connect = async (): Promise<void> => {
      controller = new AbortController();

      try {
        const response = await fetch(
          "/api/auth/admin/subscriptions/events",
          {
            headers: getAdminAuthHeaders(),
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (handleUnauthorizedAdminResponse(response)) return;
        if (!response.ok || !response.body) {
          throw new Error("Could not connect to admin subscription updates");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (active) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");

            if (!block || block.startsWith(":")) continue;
            const lines = block.split("\n");
            const eventName = lines
              .find((line) => line.startsWith("event:"))
              ?.slice("event:".length)
              .trim();
            const data = lines
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice("data:".length).trimStart())
              .join("\n");
            if (!eventName || !data) continue;

            const payload = JSON.parse(data) as {
              merchant_id?: string | null;
              subscription?: Subscription | null;
              subscriptions?: Subscription[];
            };

            if (
              eventName === "snapshot" &&
              Array.isArray(payload.subscriptions)
            ) {
              applySnapshot(payload.subscriptions);
            } else if (
              eventName === "subscription_updated" &&
              typeof payload.merchant_id === "string"
            ) {
              applyUpdate(
                payload.merchant_id,
                payload.subscription || null,
              );
            }
          }
        }
      } catch (error) {
        if (
          active &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          console.error("Admin subscription realtime connection failed:", error);
        }
      }

      if (active) {
        reconnectTimer = window.setTimeout(() => void connect(), 1_500);
      }
    };

    void connect();

    return () => {
      active = false;
      controller?.abort();
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
    };
  }, [
    canManageSubscriptions,
    handleUnauthorizedAdminResponse,
  ]);

  useEffect(() => {
    if (!canManageSubscriptions) return;

    const refreshSubscriptionsWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refreshSubscriptionsFromApi();
    };

    const intervalId = window.setInterval(
      refreshSubscriptionsWhenVisible,
      5_000,
    );
    window.addEventListener("focus", refreshSubscriptionsWhenVisible);
    document.addEventListener(
      "visibilitychange",
      refreshSubscriptionsWhenVisible,
    );

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshSubscriptionsWhenVisible);
      document.removeEventListener(
        "visibilitychange",
        refreshSubscriptionsWhenVisible,
      );
    };
  }, [canManageSubscriptions, refreshSubscriptionsFromApi]);

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
      const message = error instanceof Error ? error.message : "";
      const cycleStillActive = message.includes(
        "a new subscription cycle requires exhausted base replies or an expired subscription",
      );
      toast.error(
        cycleStillActive
          ? adminText.planCycleStartBlocked
          : operation === "activate"
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

  return {
    TABS,
    adminLogRefreshInFlightRef,
    adminNotesMap,
    adminText,
    canInspectSessions,
    canManageAdmins,
    canManageChannels,
    canManageMerchants,
    canManageSubscriptions,
    canManageSupport,
    canViewLogs,
    canViewMerchantData,
    canViewMerchants,
    channelOverridesMap,
    confirmDialog,
    currentAdmin,
    currentTab,
    deleteMerchantTarget,
    deletionRequests,
    detailsMerchant,
    doActivatePaidSubscription,
    doAddReplies,
    doApprove,
    doChangePlan,
    doChannelStatusChange,
    doDeductReplies,
    doReject,
    doRenewPlan,
    doResetReplies,
    doRestorePending,
    doSaveNote,
    doSuspend,
    doToggleAutoReply,
    doUnsuspend,
    filterActivity,
    filterPlan,
    filteredMerchants,
    formatAdminMessage,
    getDeletionAction,
    getFiltered,
    getPendingDeletionRequest,
    getStatusSyncErrorMessage,
    getSub,
    handleConfirm,
    handleDeletionRequestRejected,
    handleDeletionRequested,
    handleMerchantDeleted,
    handleUnauthorizedAdminResponse,
    isOwnerAdmin,
    lang,
    latestSupportTicketIdRef,
    locale,
    logAction,
    logs,
    merchantStatusLabels,
    merchants,
    migrateLegacyAdminData,
    migrateLegacySubscriptions,
    openConfirm,
    openDeleteMerchant,
    openMerchantDetails,
    openPlan,
    openReplies,
    passwordChangeRequired,
    permissionRefreshInFlightRef,
    planModal,
    planNames,
    refreshAdminPermissions,
    refreshChannelsFromApi,
    refreshCurrentAdminFromApi,
    refreshData,
    refreshDeletionRequestsFromApi,
    refreshLogsFromApi,
    refreshMerchantsFromApi,
    refreshSubscriptionsFromApi,
    refreshSupportSummary,
    repliesModal,
    savePlanOperation,
    search,
    setAdminNotesMap,
    setChannelOverridesMap,
    setConfirmDialog,
    setCurrentAdmin,
    setDeleteMerchantTarget,
    setDeletionRequests,
    setDetailsMerchant,
    setFilterActivity,
    setFilterPlan,
    setLang,
    setLocation,
    setLogs,
    setMerchants,
    setPlanModal,
    setRepliesModal,
    setSearch,
    setSubscriptions,
    setSupportActiveCount,
    setTab,
    storeServerSubscription,
    subscriptionStatusLabels,
    subscriptions,
    supportActiveCount,
    syncMerchantStatusToApi,
    syncSubscriptionActionToApi,
    syncSubscriptionPlanToApi,
    tab,
    tabCount,
    uniqueActivities,
    updateMerchant,
  };
}

export type AdminPageViewModel = ReturnType<typeof useAdminPageController>;
