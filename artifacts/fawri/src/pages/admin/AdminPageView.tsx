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
import type { AdminPageViewModel } from '@/pages/admin/useAdminPageController';

export function AdminPageView({ model }: { model: AdminPageViewModel }) {
  const {
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
  } = model;

  return (
    <div className="min-h-screen bg-background" dir={adminText.dir}>
      {currentAdmin?.must_change_password === true && (
        <RequiredAdminPasswordChangeDialog
          admin={currentAdmin}
          onChanged={setCurrentAdmin}
        />
      )}
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
