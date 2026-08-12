import { COMMON_UI_LABELS } from '@/lib/translations/commonUi';
import { SERVER_SAVED_ANSWERS_PAGE_COPY } from '@/lib/translations/features/pages/dashboard/ServerSavedAnswersPage';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { BookOpen, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { KnowledgeStatusBadge } from "@/components/knowledge/KnowledgeStatusBadge";

type Language = "ar" | "ku" | "en";

type SavedAnswer = {
  id: string;
  category: string;
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
};

type Copy = {
  title: string;
  subtitle: string;
  add: string;
  refresh: string;
  search: string;
  empty: string;
  loading: string;
  question: string;
  answer: string;
  category: string;
  language: string;
  active: string;
  inactive: string;
  approved: string;
  save: string;
  saving: string;
  cancel: string;
  edit: string;
  remove: string;
  confirmDelete: string;
  loadFailed: string;
  saveFailed: string;
  conflict: string;
  required: string;
};

const COPY: Record<Language, Copy> = SERVER_SAVED_ANSWERS_PAGE_COPY;

const EMPTY_FORM = {
  category: "custom",
  questionPattern: "",
  answerText: "",
  language: "ar" as Language,
  active: true,
};

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) throw Object.assign(new Error(body.error || "Request failed"), body);
  return body;
}

export default function ServerSavedAnswersPage() {
  const { lang, dir } = useI18n();
  const language: Language = lang === "ku" || lang === "en" ? lang : "ar";
  const copy = COPY[language];
  const [answers, setAnswers] = useState<SavedAnswer[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SavedAnswer | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, language });

  const load = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      const result = await readJson<{ answers: SavedAnswer[] }>(
        await fetch("/api/knowledge/saved-answers", { credentials: "same-origin" }),
      );
      setAnswers(Array.isArray(result.answers) ? result.answers : []);
    } catch {
      setNotice(copy.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [copy.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return answers;
    return answers.filter((item) =>
      [item.questionPattern, item.answerText, item.category]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [answers, query]);

  function startCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, language });
    setNotice("");
    setOpen(true);
  }

  function startEdit(answer: SavedAnswer) {
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            expectedVersion: editing?.version,
          }),
        },
      );
      const result = await readJson<{ answer: SavedAnswer }>(response);
      setAnswers((current) =>
        editing
          ? current.map((item) => (item.id === result.answer.id ? result.answer : item))
          : [result.answer, ...current],
      );
      setOpen(false);
      setEditing(null);
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.code === "VERSION_CONFLICT" && apiError.current) {
        setAnswers((current) =>
          current.map((item) => (item.id === apiError.current?.id ? apiError.current : item)),
        );
        setEditing(apiError.current);
        setForm({
          category: apiError.current.category,
          questionPattern: apiError.current.questionPattern,
          answerText: apiError.current.answerText,
          language: apiError.current.language,
          active: apiError.current.active,
        });
        setNotice(copy.conflict);
      } else {
        setNotice(copy.saveFailed);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(answer: SavedAnswer) {
    if (!window.confirm(copy.confirmDelete)) return;
    setSaving(true);
    setNotice("");
    try {
      await readJson(
        await fetch(`/api/knowledge/saved-answers/${encodeURIComponent(answer.id)}`, {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: answer.version }),
        }),
      );
      setAnswers((current) => current.filter((item) => item.id !== answer.id));
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.code === "VERSION_CONFLICT" && apiError.current) {
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

  return (
    <main className="min-h-screen bg-background p-4 pb-24 md:p-6" dir={dir}>
      <section className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{copy.title}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading || saving}>
              <RefreshCw className="me-2 h-4 w-4" />{copy.refresh}
            </Button>
            <Button onClick={startCreate} disabled={saving} className="bg-orange-500 text-white hover:bg-orange-600">
              <Plus className="me-2 h-4 w-4" />{copy.add}
            </Button>
          </div>
        </header>

        <div className="relative">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder={copy.search} className="ps-10" />
        </div>

        {notice ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{notice}</div> : null}

        {loading ? (
          <div className="rounded-3xl border bg-card p-12 text-center text-muted-foreground">{copy.loading}</div>
        ) : filtered.length === 0 ? (
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
                  <Button variant="outline" size="sm" onClick={() => startEdit(answer)} disabled={saving}>
                    <Pencil className="me-2 h-4 w-4" />{copy.edit}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void remove(answer)} disabled={saving}>
                    <Trash2 className="me-2 h-4 w-4" />{copy.remove}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
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
              <Input className="mt-1" value={form.category} onChange={(event: ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, category: event.target.value }))} maxLength={100} />
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
              <Button type="submit" disabled={saving} className="bg-orange-500 text-white hover:bg-orange-600">
                {saving ? copy.saving : copy.save}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
