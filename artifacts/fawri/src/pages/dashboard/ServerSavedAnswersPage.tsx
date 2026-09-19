import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { BookOpen, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KnowledgeStatusBadge } from "@/components/knowledge/KnowledgeStatusBadge";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { COMMON_UI_LABELS } from "@/lib/translations/commonUi";
import { SERVER_SAVED_ANSWERS_PAGE_COPY } from "@/lib/translations/features/pages/dashboard/ServerSavedAnswersPage";

type Language = "ar" | "ku" | "en";
const CATEGORY_VALUES = [
  "delivery",
  "payment",
  "return_exchange",
  "product",
  "warranty",
  "custom",
] as const;
type Category = (typeof CATEGORY_VALUES)[number];
type LoadStatus = "loading" | "ready" | "unavailable";
type SavedAnswerCursor = {
  updatedAt: string;
  id: string;
};

type SavedAnswer = {
  id: string;
  category: Category;
  questionPattern: string;
  answerText: string;
  language: Language;
  source: "merchant_approved";
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type ApiError = {
  code?: string;
  error?: string;
  current?: SavedAnswer;
  status?: number;
};

type Copy = (typeof SERVER_SAVED_ANSWERS_PAGE_COPY)[Language];

const COPY: Record<Language, Copy> = SERVER_SAVED_ANSWERS_PAGE_COPY;
const EMPTY_FORM = {
  category: "custom" as Category,
  questionPattern: "",
  answerText: "",
  language: "ar" as Language,
  active: true,
};

function isSavedAnswer(value: unknown): value is SavedAnswer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const answer = value as Record<string, unknown>;
  return (
    typeof answer.id === "string" &&
    answer.id.length > 0 &&
    typeof answer.category === "string" &&
    CATEGORY_VALUES.includes(answer.category as Category) &&
    typeof answer.questionPattern === "string" &&
    typeof answer.answerText === "string" &&
    (answer.language === "ar" || answer.language === "ku" || answer.language === "en") &&
    answer.source === "merchant_approved" &&
    typeof answer.active === "boolean" &&
    typeof answer.version === "number" &&
    Number.isInteger(answer.version) &&
    answer.version > 0 &&
    typeof answer.createdAt === "string" &&
    typeof answer.updatedAt === "string"
  );
}

function isSavedAnswerCursor(value: unknown): value is SavedAnswerCursor {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const cursor = value as Record<string, unknown>;
  return (
    typeof cursor.id === "string" &&
    cursor.id.length > 0 &&
    typeof cursor.updatedAt === "string" &&
    Number.isFinite(new Date(cursor.updatedAt).getTime())
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

export default function ServerSavedAnswersPage() {
  const { lang, dir } = useI18n();
  const language: Language = lang === "ku" || lang === "en" ? lang : "ar";
  const copy = COPY[language];
  const categoryLabels: Record<Category, string> = {
    delivery: copy.categoryDelivery,
    payment: copy.categoryPayment,
    return_exchange: copy.categoryReturnExchange,
    product: copy.categoryProduct,
    warranty: copy.categoryWarranty,
    custom: copy.categoryCustom,
  };
  const [answers, setAnswers] = useState<SavedAnswer[]>([]);
  const [query, setQuery] = useState("");
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [nextCursor, setNextCursor] = useState<SavedAnswerCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SavedAnswer | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, language });
  const loadRequestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setLoadStatus("loading");
    setLoadingMore(false);
    setNotice("");
    try {
      const result = await readJson<{
        ok: true;
        answers: unknown;
        nextCursor?: unknown;
      }>(
        await fetch("/api/knowledge/saved-answers?limit=500", {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
      );
      if (
        !Array.isArray(result.answers) ||
        !result.answers.every(isSavedAnswer) ||
        !(
          result.nextCursor === undefined ||
          result.nextCursor === null ||
          isSavedAnswerCursor(result.nextCursor)
        )
      ) {
        throw new Error("Saved answers authority returned an invalid response");
      }
      if (requestId !== loadRequestIdRef.current) return;
      setAnswers(result.answers);
      setNextCursor(isSavedAnswerCursor(result.nextCursor) ? result.nextCursor : null);
      setLoadStatus("ready");
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;
      console.error("Load saved answers failed:", error);
      setNotice(copy.loadFailed);
      setNextCursor(null);
      setLoadStatus("unavailable");
    }
  }, [copy.loadFailed]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadStatus !== "ready" || saving || loadingMore) return;
    const requestId = ++loadRequestIdRef.current;
    setLoadingMore(true);
    setNotice("");
    try {
      const params = new URLSearchParams({
        limit: "500",
        beforeUpdatedAt: nextCursor.updatedAt,
        beforeId: nextCursor.id,
      });
      const result = await readJson<{
        ok: true;
        answers: unknown;
        nextCursor?: unknown;
      }>(
        await fetch(`/api/knowledge/saved-answers?${params.toString()}`, {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
      );
      if (
        !Array.isArray(result.answers) ||
        !result.answers.every(isSavedAnswer) ||
        !(
          result.nextCursor === undefined ||
          result.nextCursor === null ||
          isSavedAnswerCursor(result.nextCursor)
        )
      ) {
        throw new Error("Saved answers authority returned an invalid response");
      }
      if (requestId !== loadRequestIdRef.current) return;
      const pageAnswers = result.answers;
      setAnswers((current) => {
        const knownIds = new Set(current.map((item) => item.id));
        return [...current, ...pageAnswers.filter((item) => !knownIds.has(item.id))];
      });
      setNextCursor(isSavedAnswerCursor(result.nextCursor) ? result.nextCursor : null);
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;
      console.error("Load more saved answers failed:", error);
      setNotice(copy.loadFailed);
    } finally {
      if (requestId === loadRequestIdRef.current) setLoadingMore(false);
    }
  }, [copy.loadFailed, loadStatus, loadingMore, nextCursor, saving]);

  useEffect(() => {
    void load();
    return () => {
      loadRequestIdRef.current += 1;
    };
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return answers;
    return answers.filter((item) =>
      [
        item.questionPattern,
        item.answerText,
        item.category,
        categoryLabels[item.category],
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [answers, categoryLabels, query]);

  const mutationsAllowed = loadStatus === "ready" && !saving && !loadingMore;

  function startCreate() {
    if (!mutationsAllowed) return;
    setEditing(null);
    setForm({ ...EMPTY_FORM, language });
    setNotice("");
    setOpen(true);
  }

  function startEdit(answer: SavedAnswer) {
    if (!mutationsAllowed) return;
    setEditing(answer);
    setForm({
      category: answer.category,
      questionPattern: answer.questionPattern,
      answerText: answer.answerText,
      language: answer.language,
      active: answer.active,
    });
    setNotice("");
    setOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!mutationsAllowed) return;
    if (!form.questionPattern.trim() || !form.answerText.trim()) {
      setNotice(copy.required);
      return;
    }

    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(
        editing
          ? `/api/knowledge/saved-answers/${encodeURIComponent(editing.id)}`
          : "/api/knowledge/saved-answers",
        {
          method: editing ? "PATCH" : "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, expectedVersion: editing?.version }),
        },
      );
      const result = await readJson<{ ok: true; answer: unknown }>(response);
      if (!isSavedAnswer(result.answer)) throw new Error("Invalid saved answer response");
      const savedAnswer = result.answer;
      setAnswers((current) =>
        editing
          ? current.map((item) => (item.id === savedAnswer.id ? savedAnswer : item))
          : [savedAnswer, ...current],
      );
      setOpen(false);
      setEditing(null);
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.code === "VERSION_CONFLICT" && isSavedAnswer(apiError.current)) {
        const currentAnswer = apiError.current;
        setAnswers((current) =>
          current.some((item) => item.id === currentAnswer.id)
            ? current.map((item) => (item.id === currentAnswer.id ? currentAnswer : item))
            : [currentAnswer, ...current],
        );
        if (editing && currentAnswer.id === editing.id) {
          setEditing(currentAnswer);
          setForm({
            category: currentAnswer.category,
            questionPattern: currentAnswer.questionPattern,
            answerText: currentAnswer.answerText,
            language: currentAnswer.language,
            active: currentAnswer.active,
          });
          setNotice(copy.conflict);
        } else {
          setNotice(copy.duplicate);
        }
      } else {
        setNotice(copy.saveFailed);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(answer: SavedAnswer) {
    if (!mutationsAllowed || !window.confirm(copy.confirmDelete)) return;
    setSaving(true);
    setNotice("");
    try {
      await readJson<{ ok: true }>(
        await fetch(`/api/knowledge/saved-answers/${encodeURIComponent(answer.id)}`, {
          method: "DELETE",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: answer.version }),
        }),
      );
      setAnswers((current) => current.filter((item) => item.id !== answer.id));
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.code === "VERSION_CONFLICT" && isSavedAnswer(apiError.current)) {
        setAnswers((current) =>
          current.map((item) => (item.id === apiError.current?.id ? apiError.current : item)),
        );
        setNotice(copy.conflict);
      } else {
        setNotice(copy.saveFailed);
      }
    } finally {
      setSaving(false);
    }
  }

  const unavailableWithoutData = loadStatus === "unavailable" && answers.length === 0;
  const staleData = loadStatus === "unavailable" && answers.length > 0;

  return (
    <main className="min-h-screen bg-background p-4 pb-24 md:p-6" dir={dir}>
      <section className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{copy.title}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loadStatus === "loading" || saving}>
              <RefreshCw className="me-2 h-4 w-4" />{copy.refresh}
            </Button>
            <Button onClick={startCreate} disabled={!mutationsAllowed} className="bg-orange-500 text-white hover:bg-orange-600">
              <Plus className="me-2 h-4 w-4" />{copy.add}
            </Button>
          </div>
        </header>

        <div className="relative">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder={copy.search} className="ps-10" />
        </div>

        {notice ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{notice}</div> : null}
        {staleData ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{copy.loadFailed}</div> : null}

        {loadStatus === "loading" ? (
          <div className="rounded-3xl border bg-card p-12 text-center text-muted-foreground">{copy.loading}</div>
        ) : unavailableWithoutData ? (
          <div className="rounded-3xl border border-amber-200 bg-card p-12 text-center">
            <BookOpen className="mx-auto mb-3 h-12 w-12 text-amber-500/60" />
            <p className="font-semibold text-amber-900">{copy.loadFailed}</p>
            <Button className="mt-4" variant="outline" onClick={() => void load()}>
              <RefreshCw className="me-2 h-4 w-4" />{copy.refresh}
            </Button>
          </div>
        ) : loadStatus === "ready" && filtered.length === 0 ? (
          <div className="rounded-3xl border bg-card p-12 text-center">
            <BookOpen className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
            <p className="font-semibold text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((answer) => (
              <article key={answer.id} className="rounded-3xl border bg-card p-5 shadow-sm">
                <div className="mb-3 flex flex-wrap gap-2">
                  <KnowledgeStatusBadge tone="success">{copy.approved}</KnowledgeStatusBadge>
                  <KnowledgeStatusBadge>{categoryLabels[answer.category]}</KnowledgeStatusBadge>
                  <KnowledgeStatusBadge tone={answer.active ? "info" : "neutral"}>
                    {answer.active ? copy.active : copy.inactive}
                  </KnowledgeStatusBadge>
                  <KnowledgeStatusBadge>{answer.language.toUpperCase()}</KnowledgeStatusBadge>
                </div>
                <p className="text-xs font-semibold text-muted-foreground">{copy.question}</p>
                <h2 className="mt-1 font-bold leading-6">{answer.questionPattern}</h2>
                <p className="mt-4 text-xs font-semibold text-muted-foreground">{copy.answer}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{answer.answerText}</p>
                <div className="mt-5 flex gap-2 border-t pt-4">
                  <Button variant="outline" size="sm" onClick={() => startEdit(answer)} disabled={!mutationsAllowed}>
                    <Pencil className="me-2 h-4 w-4" />{copy.edit}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void remove(answer)} disabled={!mutationsAllowed}>
                    <Trash2 className="me-2 h-4 w-4" />{copy.remove}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}

        {nextCursor && loadStatus === "ready" ? (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => void loadMore()}
              disabled={loadingMore || saving}
            >
              <RefreshCw className={`me-2 h-4 w-4 ${loadingMore ? "animate-spin" : ""}`} />
              {loadingMore ? copy.loadingMore : copy.loadMore}
            </Button>
          </div>
        ) : null}
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center" role="dialog" aria-modal="true">
          <form onSubmit={save} className="w-full max-w-2xl space-y-4 rounded-t-3xl bg-background p-5 shadow-xl sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">{editing ? copy.edit : copy.add}</h2>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={copy.cancel}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <label className="block text-sm font-semibold">
              {copy.category}
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                value={form.category}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setForm((current) => ({
                    ...current,
                    category: event.target.value as Category,
                  }))
                }
              >
                {CATEGORY_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {categoryLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              {copy.language}
              <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={form.language} onChange={(event: ChangeEvent<HTMLSelectElement>) => setForm((current) => ({ ...current, language: event.target.value as Language }))}>
                <option value="ar">{COMMON_UI_LABELS.languageNames.ar}</option><option value="ku">{COMMON_UI_LABELS.languageNames.ku}</option><option value="en">{COMMON_UI_LABELS.languageNames.en}</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">
              {copy.question}
              <Textarea className="mt-1" value={form.questionPattern} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setForm((current) => ({ ...current, questionPattern: event.target.value }))} maxLength={500} />
            </label>
            <label className="block text-sm font-semibold">
              {copy.answer}
              <Textarea className="mt-1 min-h-32" value={form.answerText} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setForm((current) => ({ ...current, answerText: event.target.value }))} maxLength={2000} />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={form.active} onChange={(event: ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, active: event.target.checked }))} />
              {copy.active}
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{copy.cancel}</Button>
              <Button type="submit" disabled={saving || loadingMore || loadStatus !== "ready"} className="bg-orange-500 text-white hover:bg-orange-600">
                {saving ? copy.saving : copy.save}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}