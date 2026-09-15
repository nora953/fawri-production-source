import { BOT_TRAINING_PAGE_LOCALE_BY_LANG } from '@/lib/translations/features/pages/dashboard/BotTrainingPage';
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronLeft,
  Clock,
  FileText,
  RefreshCw,
  Search,
  Sparkles,
  XCircle, X
} from "lucide-react";
import { getCurrentMerchant } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { en } from "@/lib/translations/en";
import { ar } from "@/lib/translations/ar";
import { ku } from "@/lib/translations/ku";

type TrainingStatus =
  | "pending_merchant_reply"
  | "pending_review"
  | "approved"
  | "rejected";

type TrainingRequest = {
  id: string;
  merchantId: string;
  customerId: string;
  customerMessage: string;
  normalizedMessage: string;
  detectedIntent: string;
  detectedLanguage: string;
  reason: string;
  suggestedReply?: string | null;
  status: TrainingStatus;
  createdAt: string;
  updatedAt: string;
};

type Notice = {
  type: "success" | "error" | "warning" | "info";
  text: string;
};

type FilterValue = TrainingStatus | "all";

type Lang = "ar" | "ku" | "en";

const statusStyle: Record<TrainingStatus, string> = {
  pending_merchant_reply: "border-amber-300 bg-amber-50 text-amber-950",
  pending_review: "border-blue-300 bg-blue-50 text-blue-950",
  approved: "border-emerald-700 bg-emerald-100 text-emerald-950",
  rejected: "border-red-300 bg-red-50 text-red-950",
};

const noticeStyle: Record<Notice["type"], string> = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-950",
  error: "border-red-300 bg-red-50 text-red-950",
  warning: "border-amber-300 bg-amber-50 text-amber-950",
  info: "border-blue-300 bg-blue-50 text-blue-950",
};

function normalizeLang(lang: string | undefined): Lang {
  return lang === "ku" || lang === "en" || lang === "ar" ? lang : "ar";
}

const centralBotTrainingTranslations = {
  en,
  ar,
  ku,
};

function getCentralBotTrainingTranslation(lang: Lang) {
  return centralBotTrainingTranslations[lang];
}

function getStatusLabel(
  status: TrainingStatus,
  lang: Lang,
): string {
  const dictionary = getCentralBotTrainingTranslation(lang);

  const labels: Record<TrainingStatus, string> = {
    pending_merchant_reply:
      dictionary.bot_training_label_pending_merchant_reply,
    pending_review:
      dictionary.bot_training_label_pending_review,
    approved:
      dictionary.bot_training_label_approved,
    rejected:
      dictionary.bot_training_label_rejected,
  };

  return labels[status];
}

function getStatusHelp(
  status: TrainingStatus,
  lang: Lang,
): string {
  const dictionary = getCentralBotTrainingTranslation(lang);

  const helpTexts: Record<TrainingStatus, string> = {
    pending_merchant_reply:
      dictionary.bot_training_help_pending_merchant_reply,
    pending_review:
      dictionary.bot_training_help_pending_review,
    approved:
      dictionary.bot_training_help_approved,
    rejected:
      dictionary.bot_training_help_rejected,
  };

  return helpTexts[status];
}

function getFilterOptions(
  lang: Lang,
): Array<{ value: FilterValue; label: string }> {
  const dictionary = getCentralBotTrainingTranslation(lang);

  return [
    {
      value: "all",
      label: dictionary.bot_training_filter_all,
    },
    {
      value: "pending_merchant_reply",
      label: dictionary.bot_training_label_pending_merchant_reply,
    },
    {
      value: "pending_review",
      label: dictionary.bot_training_label_pending_review,
    },
    {
      value: "approved",
      label: dictionary.bot_training_label_approved,
    },
    {
      value: "rejected",
      label: dictionary.bot_training_label_rejected,
    },
  ];
}


function getPageText(lang: Lang) {
  const dictionary = getCentralBotTrainingTranslation(lang);

  return {
    all: dictionary.bot_training_page_all,
    close: dictionary.bot_training_page_close,
    searchPlaceholder:
      dictionary.bot_training_page_searchPlaceholder,
    customerMessage:
      dictionary.bot_training_page_customerMessage,
    issueReason:
      dictionary.bot_training_page_issueReason,
    suggestedReply:
      dictionary.bot_training_page_suggestedReply,
    noSuggestedReply:
      dictionary.bot_training_page_noSuggestedReply,
    status:
      dictionary.bot_training_page_status,
    idealReplyPlaceholder:
      dictionary.bot_training_page_idealReplyPlaceholder,
    saving:
      dictionary.bot_training_page_saving,
    approveReply:
      dictionary.bot_training_page_approveReply,
    saveApprovedEdit:
      dictionary.bot_training_page_saveApprovedEdit,
    replyRequired:
      dictionary.bot_training_page_replyRequired,
    actionSuccess:
      dictionary.bot_training_page_actionSuccess,
    actionFailed:
      dictionary.bot_training_page_actionFailed,
    emptyTitle:
      dictionary.bot_training_page_emptyTitle,
    emptyDescription:
      dictionary.bot_training_page_emptyDescription,
    refresh:
      dictionary.bot_training_page_refresh,
    rejectConfirm:
      dictionary.bot_training_page_rejectConfirm,
    reject:
      dictionary.bot_training_page_reject,
    cancel:
      dictionary.bot_training_page_cancel,
    editApprovedReply:
      dictionary.bot_training_page_editApprovedReply,
    requestDetails:
      dictionary.bot_training_page_requestDetails,
    idealReplyLabel:
      dictionary.bot_training_page_idealReplyLabel,
    approved:
      dictionary.bot_training_page_approved,
    approvedNote:
      dictionary.bot_training_page_approvedNote,

    pageBadge:
      dictionary.bot_training_label_pageBadge,
    pageTitle:
      dictionary.bot_training_label_pageTitle,
    pageSubtitle:
      dictionary.bot_training_label_pageSubtitle,
    editStarted:
      dictionary.bot_training_label_editStarted,
    customerMessageFallback:
      dictionary.bot_training_label_customerMessageFallback,
    details:
      dictionary.bot_training_label_details,
    approvedReply:
      dictionary.bot_training_label_approvedReply,
    cancelEdit:
      dictionary.bot_training_label_cancelEdit,
    rejectReply:
      dictionary.bot_training_label_rejectReply,
    noValue:
      dictionary.bot_training_label_noValue,
    approvedNoticeTitle:
      dictionary.bot_training_label_approvedNoticeTitle,
    approvedNoticeLine1:
      dictionary.bot_training_label_approvedNoticeLine1,
    approvedNoticeLine2:
      dictionary.bot_training_label_approvedNoticeLine2,
      plainTitle:
        dictionary.bot_training_plain_title,
      intent:
        dictionary.bot_training_intent,
      language:
        dictionary.bot_training_language,
      unknown:
        dictionary.bot_training_unknown,
  };
}


export default function BotTrainingPage() {
  const { lang } = useI18n();
  const currentLang = normalizeLang(lang);
  const pageText = useMemo(() => getPageText(currentLang), [currentLang]);
  const filterOptions = useMemo(
    () => getFilterOptions(currentLang),
    [currentLang],
  );
  const merchantId = useMemo(() => {
    const merchant = getCurrentMerchant();
    return merchant?.id || "test_merchant";
  }, []);

  const [requests, setRequests] = useState<TrainingRequest[]>([]);
  const [replyById, setReplyById] = useState<Record<string, string>>({});
  const [editModeById, setEditModeById] = useState<Record<string, boolean>>({});
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const counters = useMemo(() => {
    return {
      all: requests.length,
      pendingMerchantReply: requests.filter(
        (item) => item.status === "pending_merchant_reply",
      ).length,
      pendingReview: requests.filter((item) => item.status === "pending_review")
        .length,
      approved: requests.filter((item) => item.status === "approved").length,
      rejected: requests.filter((item) => item.status === "rejected").length,
    };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const keyword = normalizeText(search);

    return requests.filter((request) => {
      const statusMatches = filter === "all" || request.status === filter;
      const text = normalizeText(
        [
          request.customerMessage,
          request.normalizedMessage,
          request.detectedIntent,
          request.detectedLanguage,
          request.reason,
          request.suggestedReply || "",
        ].join(" "),
      );

      return statusMatches && (!keyword || text.includes(keyword));
    });
  }, [requests, filter, search]);

  const activeRequest = useMemo(() => {
    if (!activeRequestId) return filteredRequests[0] || null;

    return (
      requests.find((request) => request.id === activeRequestId) ||
      filteredRequests[0] ||
      null
    );
  }, [activeRequestId, filteredRequests, requests]);

  const loadRequests = useCallback(
    async (options?: { keepNotice?: boolean }) => {
      setLoading(true);

      if (!options?.keepNotice) {
        setNotice(null);
      }

      try {
        const response = await fetch(
          `/api/bot-training/requests?merchantId=${encodeURIComponent(
            merchantId,
          )}`,
        );

        if (!response.ok) {
          throw new Error("Failed to load training requests");
        }

        const data = await response.json();
        const list: TrainingRequest[] = Array.isArray(data.requests)
          ? data.requests
          : [];
        const nextReplies: Record<string, string> = {};

        list.forEach((request) => {
          nextReplies[request.id] = request.suggestedReply || "";
        });

        setRequests(list);
        setReplyById(nextReplies);
        setEditModeById({});
        setActiveRequestId((previousId) => {
          if (previousId && list.some((item) => item.id === previousId)) {
            return previousId;
          }

          return list[0]?.id || null;
        });
      } catch (error) {
        console.error(error);
        setNotice({ type: "error", text: pageText.actionFailed });
      } finally {
        setLoading(false);
      }
    },
    [merchantId, pageText.actionFailed],
  );

  async function approveRequest(request: TrainingRequest) {
    const idealReply = (replyById[request.id] || "").trim();

    if (!idealReply) {
      setNotice({ type: "warning", text: pageText.replyRequired });
      return;
    }

    setSavingId(request.id);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/bot-training/requests/${encodeURIComponent(
          request.id,
        )}/approve?merchantId=${encodeURIComponent(merchantId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchantId,
            idealReply,
            keywords: buildKeywordsFromMessage(request.customerMessage),
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to approve training request");
      }

      setNotice({ type: "success", text: pageText.actionSuccess });
      await loadRequests({ keepNotice: true });
    } catch (error) {
      console.error(error);
      setNotice({ type: "error", text: pageText.actionFailed });
    } finally {
      setSavingId(null);
    }
  }

  async function saveApprovedEdit(request: TrainingRequest) {
    const idealReply = (replyById[request.id] || "").trim();

    if (!idealReply) {
      setNotice({ type: "warning", text: pageText.replyRequired });
      return;
    }

    setSavingId(request.id);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/bot-training/requests/${encodeURIComponent(
          request.id,
        )}/reply?merchantId=${encodeURIComponent(merchantId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchantId,
            idealReply,
            keywords: buildKeywordsFromMessage(request.customerMessage),
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to update approved reply");
      }

      setNotice({ type: "success", text: pageText.actionSuccess });
      setEditModeById((prev) => ({ ...prev, [request.id]: false }));
      await loadRequests({ keepNotice: true });
    } catch (error) {
      console.error(error);
      setNotice({ type: "error", text: pageText.actionFailed });
    } finally {
      setSavingId(null);
    }
  }

  async function rejectRequest(request: TrainingRequest) {
    const confirmed = window.confirm(pageText.rejectConfirm);

    if (!confirmed) return;

    setSavingId(request.id);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/bot-training/requests/${encodeURIComponent(
          request.id,
        )}/reject?merchantId=${encodeURIComponent(merchantId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchantId }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to reject training request");
      }

      setNotice({ type: "info", text: pageText.actionSuccess });
      setDetailsOpen(false);
      await loadRequests({ keepNotice: true });
    } catch (error) {
      console.error(error);
      setNotice({ type: "error", text: pageText.actionFailed });
    } finally {
      setSavingId(null);
    }
  }

  function openDetails(request: TrainingRequest) {
    setActiveRequestId(request.id);
    setDetailsOpen(true);
  }

  function startEdit(request: TrainingRequest) {
    setActiveRequestId(request.id);
    setDetailsOpen(true);
    setReplyById((prev) => ({
      ...prev,
      [request.id]: request.suggestedReply || "",
    }));
    setEditModeById((prev) => ({ ...prev, [request.id]: true }));
    setNotice({ type: "info", text: pageText.editStarted });
  }

  function cancelEdit(request: TrainingRequest) {
    setReplyById((prev) => ({
      ...prev,
      [request.id]: request.suggestedReply || "",
    }));
    setEditModeById((prev) => ({ ...prev, [request.id]: false }));
    setNotice(null);
  }

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  return (
    <div
      className="min-h-screen bg-slate-50 px-3 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] pt-3 sm:px-4 md:px-6 md:pb-8 md:pt-6"
      dir={currentLang === "en" ? "ltr" : "rtl"}
    >
      <div className="mx-auto max-w-7xl space-y-5 fowri-bottraining-page-safe-bottom">
        <section className="rounded-[2rem] border overflow-hidden border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="fowri-bot-training-header-right">
            <span className="fowri-bot-training-plain-title">{pageText.plainTitle}</span>
            <div className="shrink-0 rounded-2xl bg-indigo-50 p-3 text-indigo-700">
              <Brain className="h-7 w-7" />
            </div>
          </div>

              <div className="min-w-0">
                <div className="inline-flex rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">
                  {pageText.pageBadge}
                </div>
                <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
                  {pageText.pageTitle}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
                  {pageText.pageSubtitle}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => loadRequests()}
              disabled={loading}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              {pageText.refresh}
            </button>
          </div>

          {notice && (
            <div
              className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-medium leading-7 ${noticeStyle[notice.type]}`}
              role="status"
            >
              {notice.text}
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard title={pageText.all} value={counters.all}
            icon={<Sparkles className="h-5 w-5" />}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <StatCard title={getStatusLabel("pending_merchant_reply", currentLang)} value={counters.pendingMerchantReply}
            icon={<Clock className="h-5 w-5" />}
            active={filter === "pending_merchant_reply"}
            onClick={() => setFilter("pending_merchant_reply")}
          />
          <StatCard title={getStatusLabel("pending_review", currentLang)} value={counters.pendingReview}
            icon={<Search className="h-5 w-5" />}
            active={filter === "pending_review"}
            onClick={() => setFilter("pending_review")}
          />
          <StatCard title={getStatusLabel("approved", currentLang)} value={counters.approved}
            icon={<CheckCircle2 className="h-5 w-5" />}
            active={filter === "approved"}
            onClick={() => setFilter("approved")}
          />
          <div className="fowri-bottraining-rejected-card-wrap">

            <StatCard

              title={getStatusLabel("rejected", currentLang)}

              value={counters.rejected}

              icon={<XCircle className="h-5 w-5" />}

              active={filter === "rejected"}

              onClick={() => setFilter("rejected")}

            />

          </div>
        </section>

        <section className="rounded-[2rem] border overflow-hidden border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-lg">
              <Search
                className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 ${
                  currentLang === "en" ? "left-4" : "right-4"
                }`}
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={pageText.searchPlaceholder}
                className={`min-h-12 w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 ${
                  currentLang === "en" ? "pl-11 pr-4" : "pl-4 pr-11"
                }`}
              />
            </div>

            <select value={filter}
              onChange={(event) => setFilter(event.target.value as FilterValue)}
              className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 fowri-bottraining-native-select"
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="space-y-3">
            {loading && requests.length === 0 ? (
              <EmptyState
                  title={pageText.emptyTitle}
                  description={pageText.emptyDescription}
                />
            ) : filteredRequests.length === 0 ? (
              <EmptyState
                  title={pageText.emptyTitle}
                  description={pageText.emptyDescription}
                />
            ) : (
              filteredRequests.map((request) => (
                <CompactRequestCard
                  key={request.id}
                  request={request}
                  lang={currentLang}
                  active={activeRequest?.id === request.id}
                  onClick={() => openDetails(request)}
                />
              ))
            )}
          </div>

          <div className="hidden lg:sticky lg:top-6 lg:block">
            {activeRequest ? (
              <TrainingDetailsPanel
                request={activeRequest}
                lang={currentLang}
                reply={replyById[activeRequest.id] || ""}
                editMode={editModeById[activeRequest.id] === true}
                loading={loading}
                saving={savingId === activeRequest.id}
                onReplyChange={(value) =>
                  setReplyById((prev) => ({
                    ...prev,
                    [activeRequest.id]: value,
                  }))
                }
                onApprove={() => approveRequest(activeRequest)}
                onReject={() => rejectRequest(activeRequest)}
                onStartEdit={() => startEdit(activeRequest)}
                onCancelEdit={() => cancelEdit(activeRequest)}
                onSaveEdit={() => saveApprovedEdit(activeRequest)}
              />
            ) : (
              <EmptyState
                  title={pageText.emptyTitle}
                  description={pageText.emptyDescription}
                />
            )}
          </div>
        </section>
      </div>

      {detailsOpen && activeRequest && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label={pageText.close}
            className="absolute inset-0 bg-slate-950/45"
            onClick={() => setDetailsOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-[2rem] bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
            <TrainingDetailsPanel
              request={activeRequest}
              lang={currentLang}
              reply={replyById[activeRequest.id] || ""}
              editMode={editModeById[activeRequest.id] === true}
              loading={loading}
              saving={savingId === activeRequest.id}
              mobile
              onClose={() => setDetailsOpen(false)}
              onReplyChange={(value) =>
                setReplyById((prev) => ({
                  ...prev,
                  [activeRequest.id]: value,
                }))
              }
              onApprove={() => approveRequest(activeRequest)}
              onReject={() => rejectRequest(activeRequest)}
              onStartEdit={() => startEdit(activeRequest)}
              onCancelEdit={() => cancelEdit(activeRequest)}
              onSaveEdit={() => saveApprovedEdit(activeRequest)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CompactRequestCard({
  request,
  lang,
  active,
  onClick,
}: {
  request: TrainingRequest;
  lang: Lang;
  active: boolean;
  onClick: () => void;
}) {
  const pageText = getPageText(lang);
  const StatusIcon = getStatusIcon(request.status);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[1.7rem] border bg-white p-4 text-start shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        active ? "border-indigo-300 ring-4 ring-indigo-50" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusPill status={request.status} lang={lang} />
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {request.detectedIntent || pageText.unknown}
            </span>
          </div>

          <h3 className="max-h-14 overflow-hidden text-base font-black leading-7 text-slate-950">
            {request.customerMessage || pageText.customerMessageFallback}
          </h3>

          <p className="mt-1 max-h-12 overflow-hidden text-sm leading-6 text-slate-500">
            {request.suggestedReply || pageText.noSuggestedReply}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3">
          <span className="text-xs leading-5 text-slate-400">
            {formatDate(request.createdAt, lang)}
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-indigo-700">
            {pageText.details}
            <ChevronLeft
              className={`h-4 w-4 ${lang === "en" ? "rotate-180" : ""}`}
            />
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <StatusIcon className="h-4 w-4" />
        <span>{getStatusHelp(request.status, lang)}</span>
      </div>
    </button>
  );
}

function TrainingDetailsPanel({
  request,
  lang,
  reply,
  editMode,
  loading,
  saving,
  mobile = false,
  onClose,
  onReplyChange,
  onApprove,
  onReject,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: {
  request: TrainingRequest;
  lang: Lang;
  reply: string;
  editMode: boolean;
  loading: boolean;
  saving: boolean;
  mobile?: boolean;
  onClose?: () => void;
  onReplyChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
}) {
  const pageText = getPageText(lang);
  const isApproved = request.status === "approved";
  const isRejected = request.status === "rejected";
  const canEditReply = !isApproved || editMode;

  return (
    <article
      className={`border border-slate-200 bg-white shadow-sm ${
        mobile ? "rounded-[1.75rem] border-0 shadow-none" : "rounded-[2rem] p-5"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={request.status} lang={lang} />
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {pageText.intent}: {request.detectedIntent || pageText.unknown}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {pageText.language}: {request.detectedLanguage || pageText.unknown}
            </span>
          </div>

          <h2 className="mt-4 text-xl font-black text-slate-950">
            {pageText.requestDetails}
          </h2>
          <p className="mt-1 text-xs leading-6 text-slate-400">
            {formatDate(request.createdAt, lang)}
          </p>
        </div>

        {mobile && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border bg-card text-muted-foreground shadow-sm transition hover:bg-muted disabled:opacity-60"
            aria-label={pageText.close}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-5 space-y-4">
        <InfoBox
          title={pageText.customerMessage}
          value={request.customerMessage}
          noValue={pageText.noValue}
          strong
        />
        <InfoBox
          title={pageText.issueReason}
          value={request.reason}
          noValue={pageText.noValue}
        />
        <InfoBox
          title={pageText.suggestedReply}
          value={request.suggestedReply || pageText.noSuggestedReply}
          noValue={pageText.noValue}
          blue
        />

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
          <div className="mb-1 font-black text-slate-900">{pageText.status}</div>
          {getStatusHelp(request.status, lang)}
        </div>

        {isApproved && !editMode && (
          <div className="flex items-start gap-2 rounded-2xl border border-emerald-500 bg-emerald-100 p-4 text-sm leading-7 text-emerald-950">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-black">{pageText.approvedNoticeLine1}</p>
              <p>{pageText.approvedNoticeLine2}
              </p>
            </div>
          </div>
        )}

        {isRejected && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-black">
                {getStatusLabel("rejected", lang)}
              </p>
              <p>{getStatusHelp("rejected", lang)}</p>
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="block text-sm font-black text-slate-900">
              {pageText.idealReplyLabel}
            </label>

            {isApproved && !editMode && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500 bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-950">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {pageText.approved}
              </span>
            )}
          </div>

          <textarea
            value={reply}
            onChange={(event) => onReplyChange(event.target.value)}
            readOnly={!canEditReply || isRejected}
            placeholder={pageText.idealReplyPlaceholder}
            rows={mobile ? 5 : 6}
            className={`w-full resize-none rounded-2xl border p-4 text-sm leading-8 outline-none transition ${
              canEditReply && !isRejected
                ? "border-slate-200 bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          />

          {isApproved && !editMode && (
            <p className="mt-2 text-xs leading-6 text-slate-500">
              {pageText.approvedNote}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {!isApproved && !isRejected && (
            <button
              type="button"
              onClick={onReject}
              disabled={loading || saving}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-red-300 bg-white px-4 py-3 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <XCircle className="h-4 w-4" />
              {pageText.rejectReply}
            </button>
          )}

          {!isApproved && !isRejected && (
            <button
              type="button"
              onClick={onApprove}
              disabled={loading || saving}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              {saving ? pageText.saving : pageText.approveReply}
            </button>
          )}

          {isApproved && !editMode && (
            <button
              type="button"
              onClick={onStartEdit}
              disabled={loading || saving}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileText className="h-4 w-4" />
              {pageText.editApprovedReply}
            </button>
          )}

          {isApproved && !editMode && (
            <button
              type="button"
              disabled
              className="inline-flex min-h-12 cursor-default items-center justify-center gap-2 rounded-2xl border border-emerald-600 bg-emerald-100 px-4 py-3 text-sm font-black text-emerald-950"
            >
              <CheckCircle2 className="h-4 w-4" />
              {pageText.approvedReply}
            </button>
          )}

          {isApproved && editMode && (
            <>
              <button
                type="button"
                onClick={onCancelEdit}
                disabled={loading || saving}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pageText.cancelEdit}
              </button>
              <button
                type="button"
                onClick={onSaveEdit}
                disabled={loading || saving}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {saving ? pageText.saving : pageText.saveApprovedEdit}
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function StatusPill({
  status,
  lang,
}: {
  status: TrainingStatus;
  lang: Lang;
}) {
  const StatusIcon = getStatusIcon(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black ${statusStyle[status]}`}
    >
      <StatusIcon className="h-3.5 w-3.5" />
      {getStatusLabel(status, lang)}
    </span>
  );
}

function InfoBox({
  title,
  value,
  noValue,
  blue = false,
  strong = false,
}: {
  title: string;
  value?: string | null;
  noValue: string;
  blue?: boolean;
  strong?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-black text-slate-900">
        {title}
      </label>
      <div
        className={`min-h-16 rounded-2xl border p-4 text-sm leading-8 ${
          blue
            ? "border-blue-100 bg-blue-50 text-blue-950"
            : strong
              ? "border-slate-200 bg-white text-slate-900"
              : "border-slate-200 bg-slate-50 text-slate-700"
        }`}
      >
        {value || noValue}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  active,
  onClick,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[9.5rem] rounded-[1.7rem] border bg-white p-4 text-start shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        active ? "border-indigo-300 ring-4 ring-indigo-50" : "border-slate-200"
      }`}
    >
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="shrink-0 rounded-2xl bg-indigo-50 p-3 text-indigo-700">
          {icon}
        </div>

        <div className="min-w-0 max-w-full">
          <p className="mx-auto line-clamp-2 min-h-[2rem] max-w-[8rem] text-center text-[11px] font-extrabold leading-tight text-slate-500">
            {title}
          </p>
          <p className="mt-1 text-3xl font-black leading-none text-slate-950">
            {value}
          </p>
        </div>
      </div>
    </button>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[2rem] border overflow-hidden border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Brain className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-black text-slate-950">{title}</h2>
      <p
        dir={/[\u0600-\u06FF]/.test(description) ? 'rtl' : 'ltr'}
        className="mt-1 text-sm leading-7 text-slate-500"
      >
        {description}
      </p>
    </div>
  );
}

function getStatusIcon(status: TrainingStatus) {
  if (status === "approved") return CheckCircle2;
  if (status === "rejected") return XCircle;
  if (status === "pending_merchant_reply") return Clock;
  return Search;
}

function formatDate(value: string, lang: Lang): string {
  if (!value) return "";

  const localeByLang: Record<Lang, string> = BOT_TRAINING_PAGE_LOCALE_BY_LANG;

  try {
    return new Intl.DateTimeFormat(localeByLang[lang], {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ى]/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

function buildKeywordsFromMessage(message: string): string[] {
  const words = message
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3)
    .slice(0, 8);

  return Array.from(new Set(words));
}
