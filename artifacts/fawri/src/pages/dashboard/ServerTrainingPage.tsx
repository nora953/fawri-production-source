import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Brain, CheckCircle2, RefreshCw, Search, ShieldAlert, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KnowledgeStatusBadge } from "@/components/knowledge/KnowledgeStatusBadge";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { COMMON_UI_COPY } from "@/lib/translations/commonUi";
import { SERVER_TRAINING_PAGE_COPY } from "@/lib/translations/features/pages/dashboard/ServerTrainingPage";

type Language = "ar" | "ku" | "en";
type TrainingStatus = "pending_merchant_reply" | "pending_review" | "approved" | "rejected";
type LoadStatus = "loading" | "ready" | "unavailable";

type TrainingRequest = {
  id: string;
  customerTextPreview: string;
  customerTextHash: string;
  detectedIntent: string;
  detectedLanguage: Language;
  reason: string;
  suggestedReply: string | null;
  suggestedReplySource: "merchant_draft" | "openai_generated" | null;
  status: TrainingStatus;
  rejectionReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type ApiError = {
  code?: string;
  error?: string;
  current?: unknown;
  status?: number;
};

type Copy = (typeof SERVER_TRAINING_PAGE_COPY)[Language];

const COPY: Record<Language, Copy> = SERVER_TRAINING_PAGE_COPY;

function statusTone(status: TrainingStatus) {
  if (status === "approved") return "success" as const;
  if (status === "rejected") return "danger" as const;
  if (status === "pending_review") return "info" as const;
  return "warning" as const;
}

function isTrainingRequest(value: unknown): value is TrainingRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  const language = request.detectedLanguage;
  const source = request.suggestedReplySource;
  const status = request.status;
  const suggestedReply = request.suggestedReply;
  const rejectionReason = request.rejectionReason;

  return (
    typeof request.id === "string" &&
    request.id.length > 0 &&
    typeof request.customerTextPreview === "string" &&
    typeof request.customerTextHash === "string" &&
    /^[0-9a-f]{64}$/i.test(request.customerTextHash) &&
    typeof request.detectedIntent === "string" &&
    (language === "ar" || language === "ku" || language === "en") &&
    typeof request.reason === "string" &&
    (suggestedReply === null || typeof suggestedReply === "string") &&
    (source === null || source === "merchant_draft" || source === "openai_generated") &&
    (suggestedReply === null) === (source === null) &&
    (status === "pending_merchant_reply" ||
      status === "pending_review" ||
      status === "approved" ||
      status === "rejected") &&
    (rejectionReason === null || typeof rejectionReason === "string") &&
    typeof request.version === "number" &&
    Number.isInteger(request.version) &&
    request.version > 0 &&
    typeof request.createdAt === "string" &&
    typeof request.updatedAt === "string"
  );
}

async function readJson<T extends { ok?: boolean }>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & ApiError) | null;
  if (!response.ok || body?.ok !== true) {
    throw Object.assign(new Error(body?.error || "Request failed"), body || {}, {
      status: response.status,
    });
  }
  return body;
}

export default function ServerTrainingPage() {
  const { lang, dir } = useI18n();
  const language: Language = lang === "ku" || lang === "en" ? lang : "ar";
  const copy = COPY[language];
  const commonCopy = COMMON_UI_COPY[language];
  const [requests, setRequests] = useState<TrainingRequest[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TrainingStatus | "all">("all");
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const loadRequestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setLoadStatus("loading");
    setNotice("");
    try {
      const result = await readJson<{ ok: true; requests: unknown }>(
        await fetch("/api/knowledge/training-requests", {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
      );
      if (!Array.isArray(result.requests) || !result.requests.every(isTrainingRequest)) {
        throw new Error("Training authority returned an invalid response");
      }
      if (requestId !== loadRequestIdRef.current) return;
      const nextRequests = result.requests;
      setRequests(nextRequests);
      setDrafts(
        Object.fromEntries(
          nextRequests.map((item) => [item.id, item.suggestedReply || ""]),
        ),
      );
      setLoadStatus("ready");
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;
      console.error("Load training requests failed:", error);
      setLoadStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      loadRequestIdRef.current += 1;
    };
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return requests.filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (!normalized) return true;
      return [
        item.customerTextPreview,
        item.detectedIntent,
        item.reason,
        item.suggestedReply || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [filter, query, requests]);

  const mutationsAllowed = loadStatus === "ready" && savingId === null;
  const unavailableWithoutData = loadStatus === "unavailable" && requests.length === 0;
  const staleData = loadStatus === "unavailable" && requests.length > 0;

  function replaceCurrent(current: TrainingRequest) {
    setRequests((items) =>
      items.map((item) => (item.id === current.id ? current : item)),
    );
    setDrafts((items) => ({
      ...items,
      [current.id]: current.suggestedReply || "",
    }));
  }

  async function act(
    request: TrainingRequest,
    action: "propose" | "approve" | "reject",
  ) {
    if (!mutationsAllowed) return;
    const reply = (drafts[request.id] || "").trim();
    if (action !== "reject" && !reply) {
      setNotice(copy.replyRequired);
      return;
    }

    setSavingId(request.id);
    setNotice("");
    try {
      const result = await readJson<{ ok: true; request: unknown }>(
        await fetch(
          `/api/knowledge/training-requests/${encodeURIComponent(request.id)}/${action}`,
          {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              expectedVersion: request.version,
              suggestedReply: action === "propose" ? reply : undefined,
              approvedAnswer: action === "approve" ? reply : undefined,
              reason: action === "reject" ? "merchant_rejected" : undefined,
            }),
          },
        ),
      );
      if (!isTrainingRequest(result.request)) {
        throw new Error("Training authority returned an invalid mutation response");
      }
      const current = result.request;
      replaceCurrent(current);
    } catch (error) {
      const apiError = error as ApiError;
      if (
        apiError.code === "VERSION_CONFLICT" &&
        isTrainingRequest(apiError.current)
      ) {
        const current = apiError.current;
        replaceCurrent(current);
        setNotice(copy.conflict);
      } else {
        setNotice(copy.actionFailed);
      }
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background p-4 pb-24 md:p-6" dir={dir}>
      <section className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{copy.title}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {copy.subtitle}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loadStatus === "loading" || savingId !== null}
          >
            <RefreshCw className="me-2 h-4 w-4" />
            {copy.refresh}
          </Button>
        </header>

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setQuery(event.target.value)
              }
              placeholder={copy.search}
              className="ps-10"
            />
          </div>
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={filter}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setFilter(event.target.value as TrainingStatus | "all")
            }
          >
            <option value="all">{commonCopy.all}</option>
            {Object.entries(copy.statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <ShieldAlert className="me-2 inline h-4 w-4" />
          {copy.approvalNote}
        </div>

        {notice ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {notice}
          </div>
        ) : null}

        {staleData ? (
          <div className="flex items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex min-w-0 items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{copy.staleBody}</span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="me-2 h-4 w-4" />
              {copy.retry}
            </Button>
          </div>
        ) : null}

        {loadStatus === "loading" ? (
          <div className="rounded-3xl border bg-card p-12 text-center text-muted-foreground">
            {copy.loading}
          </div>
        ) : unavailableWithoutData ? (
          <div className="rounded-3xl border border-amber-200 bg-card p-12 text-center">
            <ShieldAlert className="mx-auto mb-3 h-12 w-12 text-amber-500/60" />
            <h2 className="font-extrabold text-amber-950">{copy.unavailableTitle}</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              {copy.unavailableBody}
            </p>
            <Button className="mt-4" variant="outline" onClick={() => void load()}>
              <RefreshCw className="me-2 h-4 w-4" />
              {copy.retry}
            </Button>
          </div>
        ) : loadStatus === "ready" && filtered.length === 0 ? (
          <div className="rounded-3xl border bg-card p-12 text-center">
            <Brain className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
            <p className="font-semibold text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((request) => {
              const busy = savingId === request.id;
              const isApproved = request.status === "approved";
              const canReview =
                request.status === "pending_review" ||
                request.status === "pending_merchant_reply";
              return (
                <article
                  key={request.id}
                  className="rounded-3xl border bg-card p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <KnowledgeStatusBadge tone={statusTone(request.status)}>
                      {copy.statuses[request.status]}
                    </KnowledgeStatusBadge>
                    {request.suggestedReplySource ? (
                      <KnowledgeStatusBadge
                        tone={
                          request.suggestedReplySource === "openai_generated"
                            ? "warning"
                            : "neutral"
                        }
                      >
                        {request.suggestedReplySource === "openai_generated"
                          ? copy.generated
                          : copy.merchantDraft}
                      </KnowledgeStatusBadge>
                    ) : null}
                    <KnowledgeStatusBadge>
                      {request.detectedLanguage.toUpperCase()}
                    </KnowledgeStatusBadge>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div className="md:col-span-2">
                      <p className="text-xs font-semibold text-muted-foreground">
                        {copy.customer}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                        {request.customerTextPreview}
                      </p>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-1">
                      <div>
                        <dt className="text-xs font-semibold text-muted-foreground">
                          {copy.intent}
                        </dt>
                        <dd>{request.detectedIntent}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold text-muted-foreground">
                          {copy.reason}
                        </dt>
                        <dd>{request.reason}</dd>
                      </div>
                    </dl>
                  </div>

                  <label className="mt-4 block text-sm font-semibold">
                    {copy.reply}
                    <Textarea
                      className="mt-1 min-h-28"
                      value={drafts[request.id] || ""}
                      onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                        setDrafts((current) => ({
                          ...current,
                          [request.id]: event.target.value,
                        }))
                      }
                      placeholder={copy.replyPlaceholder}
                      maxLength={2000}
                      disabled={isApproved || !mutationsAllowed}
                    />
                  </label>

                  <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                    {!isApproved ? (
                      <Button
                        variant="outline"
                        onClick={() => void act(request, "propose")}
                        disabled={!mutationsAllowed || busy}
                      >
                        {busy ? copy.saving : copy.propose}
                      </Button>
                    ) : null}
                    {canReview ? (
                      <Button
                        onClick={() => void act(request, "approve")}
                        disabled={!mutationsAllowed || busy}
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="me-2 h-4 w-4" />
                        {copy.approve}
                      </Button>
                    ) : null}
                    {canReview ? (
                      <Button
                        variant="outline"
                        onClick={() => void act(request, "reject")}
                        disabled={!mutationsAllowed || busy}
                      >
                        <XCircle className="me-2 h-4 w-4" />
                        {copy.reject}
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
