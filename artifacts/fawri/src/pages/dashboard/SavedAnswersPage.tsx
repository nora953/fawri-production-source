import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { getCurrentMerchant } from '@/lib/store';
import { SavedAnswer } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  MessageSquareText,
  Sparkles,
} from 'lucide-react';

type Language = 'ar' | 'ku' | 'en';

type SavedAnswerForm = {
  category: string;
  question_pattern: string;
  answer_text: string;
  language: Language;
  active: boolean;
};

const emptyForm: SavedAnswerForm = {
  category: 'custom',
  question_pattern: '',
  answer_text: '',
  language: 'ar',
  active: true,
};

type SavedAnswersApiResult = {
  ok: boolean;
  answers?: SavedAnswer[];
  answer?: SavedAnswer;
  error?: string;
};

const SAVED_ANSWERS_API_PATH = '/api/saved-answers';

function sortSavedAnswers(answers: SavedAnswer[]) {
  return [...answers].sort((a, b) => {
    const aTime = Date.parse(a.created_at || '');
    const bTime = Date.parse(b.created_at || '');

    if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
      return bTime - aTime;
    }

    return 0;
  });
}

async function readSavedAnswersApiResult(response: Response) {
  const result = (await response.json().catch(() => null)) as
    | SavedAnswersApiResult
    | null;

  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || 'Saved answers request failed');
  }

  return result;
}

async function fetchSavedAnswers(merchantId: string) {
  const response = await fetch(
    `${SAVED_ANSWERS_API_PATH}?merchantId=${encodeURIComponent(merchantId)}`,
  );
  const result = await readSavedAnswersApiResult(response);
  return sortSavedAnswers(result.answers || []);
}

async function createSavedAnswer(
  merchantId: string,
  form: SavedAnswerForm,
): Promise<SavedAnswer> {
  const response = await fetch(SAVED_ANSWERS_API_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantId,
      category: form.category,
      question_pattern: form.question_pattern.trim(),
      answer_text: form.answer_text.trim(),
      language: form.language,
      approved: true,
      active: form.active,
    }),
  });

  const result = await readSavedAnswersApiResult(response);

  if (!result.answer) {
    throw new Error('Saved answer was not returned by the server');
  }

  return result.answer;
}

async function updateSavedAnswer(
  merchantId: string,
  answerId: string,
  patch: Partial<SavedAnswerForm>,
): Promise<SavedAnswer> {
  const response = await fetch(
    `${SAVED_ANSWERS_API_PATH}/${encodeURIComponent(answerId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantId,
        ...patch,
        question_pattern:
          patch.question_pattern === undefined
            ? undefined
            : patch.question_pattern.trim(),
        answer_text:
          patch.answer_text === undefined ? undefined : patch.answer_text.trim(),
      }),
    },
  );

  const result = await readSavedAnswersApiResult(response);

  if (!result.answer) {
    throw new Error('Updated saved answer was not returned by the server');
  }

  return result.answer;
}

async function deleteSavedAnswer(merchantId: string, answerId: string) {
  const response = await fetch(
    `${SAVED_ANSWERS_API_PATH}/${encodeURIComponent(
      answerId,
    )}?merchantId=${encodeURIComponent(merchantId)}`,
    { method: 'DELETE' },
  );

  await readSavedAnswersApiResult(response);
}

function FawriToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'bg-orange-500' : 'bg-zinc-300'
      }`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-all duration-200 ${
          checked ? 'right-7' : 'right-1'
        }`}
      />
    </button>
  );
}

export default function SavedAnswersPage() {
  const { t, lang, dir } = useI18n();
  const currentLang = (lang || 'ar') as Language;

  const merchant = getCurrentMerchant();
  const merchantId = merchant?.id || '';

  const categories = [
    { value: 'delivery', label: t.saved_answers_delivery },
    { value: 'payment', label: t.saved_answers_payment },
    { value: 'return_exchange', label: t.saved_answers_return_exchange },
    { value: 'product', label: t.saved_answers_product },
    { value: 'warranty', label: t.saved_answers_warranty },
    { value: 'custom', label: t.saved_answers_custom },
  ];

  const languages = [
    { value: 'ar', label: t.saved_answers_arabic },
    { value: 'ku', label: t.saved_answers_kurdish },
    { value: 'en', label: t.saved_answers_english },
  ];

  const [answers, setAnswers] = useState<SavedAnswer[]>([]);
  const [loadingAnswers, setLoadingAnswers] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SavedAnswerForm>({
    ...emptyForm,
    language: currentLang,
  });

  useEffect(() => {
    let isMounted = true;

    if (!merchantId) {
      setAnswers([]);
      return () => {
        isMounted = false;
      };
    }

    setLoadingAnswers(true);

    fetchSavedAnswers(merchantId)
      .then(nextAnswers => {
        if (isMounted) setAnswers(nextAnswers);
      })
      .catch(error => {
        console.error('Load saved answers failed:', error);
        if (isMounted) {
          setAnswers([]);
          toast.error(t.saved_answers_status_loadFailed);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingAnswers(false);
      });

    return () => {
      isMounted = false;
    };
  }, [merchantId, t.saved_answers_status_loadFailed]);

  const filteredAnswers = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return answers;

    return answers.filter(answer =>
      answer.question_pattern.toLowerCase().includes(search) ||
      answer.answer_text.toLowerCase().includes(search) ||
      answer.category.toLowerCase().includes(search)
    );
  }, [answers, searchTerm]);

  if (!merchant) return null;

  const getCategoryLabel = (category: string) =>
    categories.find(item => item.value === category)?.label || t.saved_answers_custom;

  const getLanguageLabel = (language: string) =>
    languages.find(item => item.value === language)?.label || language;

  const updateForm = (field: keyof SavedAnswerForm, value: string | boolean) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const openAddSheet = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      language: currentLang,
    });
    setIsSheetOpen(true);
  };

  const openEditSheet = (answer: SavedAnswer) => {
    setEditingId(answer.id);
    setForm({
      category: answer.category || 'custom',
      question_pattern: answer.question_pattern || '',
      answer_text: answer.answer_text || '',
      language: (answer.language || currentLang) as Language,
      active: answer.active !== false,
    });
    setIsSheetOpen(true);
  };

  const closeSheet = () => {
    setIsSheetOpen(false);
    setEditingId(null);
    setForm({
      ...emptyForm,
      language: currentLang,
    });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!merchantId) return;

    if (!form.question_pattern.trim()) {
      toast.error(t.saved_answers_requiredQuestion);
      return;
    }

    if (!form.answer_text.trim()) {
      toast.error(t.saved_answers_requiredAnswer);
      return;
    }

    setIsSaving(true);

    try {
      if (editingId) {
        const updatedAnswer = await updateSavedAnswer(merchantId, editingId, {
          category: form.category,
          question_pattern: form.question_pattern,
          answer_text: form.answer_text,
          language: form.language,
          active: form.active,
        });

        setAnswers(current =>
          sortSavedAnswers(
            current.map(answer =>
              answer.id === editingId ? updatedAnswer : answer
            )
          )
        );
        toast.success(t.saved_answers_updated);
      } else {
        const newAnswer = await createSavedAnswer(merchantId, form);

        setAnswers(current => sortSavedAnswers([newAnswer, ...current]));
        toast.success(t.saved_answers_added);
      }

      closeSheet();
    } catch (error) {
      console.error('Save saved answer failed:', error);
      toast.error(editingId ? t.saved_answers_status_updateFailed : t.saved_answers_status_saveFailed);
    } finally {
      setIsSaving(false);
    }
  };

  const requestDelete = (id: string) => {
    if (!merchantId || isSaving) return;
    setPendingDeleteId(id);
  };

  const cancelDelete = () => {
    if (isSaving) return;
    setPendingDeleteId(null);
  };

  const confirmDelete = async () => {
    if (!merchantId || !pendingDeleteId || isSaving) return;

    const id = pendingDeleteId;
    setIsSaving(true);

    try {
      await deleteSavedAnswer(merchantId, id);
      setAnswers(current =>
        current.filter(answer => answer.id !== id)
      );
      setPendingDeleteId(null);
      toast.success(t.saved_answers_deleted);
    } catch (error) {
      console.error('Delete saved answer failed:', error);
      toast.error(t.saved_answers_status_deleteFailed);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    if (!merchantId || isSaving) return;

    const previousAnswers = answers;

    setAnswers(current =>
      current.map(answer => (answer.id === id ? { ...answer, active } : answer))
    );

    try {
      const updatedAnswer = await updateSavedAnswer(merchantId, id, { active });
      setAnswers(current =>
        sortSavedAnswers(
          current.map(answer =>
            answer.id === id ? updatedAnswer : answer
          )
        )
      );
    } catch (error) {
      console.error('Toggle saved answer failed:', error);
      setAnswers(previousAnswers);
      toast.error(t.saved_answers_status_updateFailed);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-28" dir={dir}>
      <div className="mb-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              {t.saved_answers_title}
            </h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t.saved_answers_subtitle}
            </p>
          </div>

          <Button
            type="button"
            onClick={openAddSheet}
            disabled={loadingAnswers || isSaving}
            className="h-11 shrink-0 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600 active:scale-95"
          >
            <Plus className="ml-2 h-4 w-4" />
            {t.saved_answers_addReply}
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder={t.saved_answers_searchPlaceholder}
            className="h-12 rounded-2xl pr-10"
          />
        </div>
      </div>

      {loadingAnswers ? (
        <div className="rounded-3xl border bg-card p-10 text-center shadow-sm">
          <BookOpen className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" />
          <p className="text-lg font-semibold text-muted-foreground">
            {t.saved_answers_status_loading}
          </p>
        </div>
      ) : filteredAnswers.length === 0 ? (
        <div className="rounded-3xl border bg-card p-10 text-center shadow-sm">
          <BookOpen className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" />
          <p className="text-lg font-semibold text-muted-foreground">
            {t.saved_answers_noAnswers}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t.saved_answers_noAnswersDesc}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAnswers.map(answer => (
            <div
              key={answer.id}
              className="overflow-hidden rounded-3xl border bg-card shadow-sm transition hover:shadow-md"
            >
              <div className="border-b p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="rounded-full border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700"
                  >
                    {getCategoryLabel(answer.category)}
                  </Badge>

                  <Badge
                    variant="outline"
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                  >
                    {getLanguageLabel(answer.language)}
                  </Badge>

                  <Badge
                    variant="outline"
                    className={
                      answer.active
                        ? 'rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700'
                        : 'rounded-full border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600'
                    }
                  >
                    {answer.active ? t.saved_answers_active : t.saved_answers_inactive}
                  </Badge>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                    <MessageSquareText className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="line-clamp-2 text-lg font-extrabold">
                      {answer.question_pattern}
                    </h2>
                    <p className="mt-2 line-clamp-4 text-sm leading-7 text-muted-foreground">
                      {answer.answer_text}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-2">
                  <FawriToggle
                    checked={answer.active}
                    onChange={checked => handleToggleActive(answer.id, checked)}
                  />
                  <span className="text-sm text-muted-foreground">
                    {answer.active ? t.saved_answers_active : t.saved_answers_inactive}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-xl"
                    onClick={() => openEditSheet(answer)}
                    disabled={isSaving}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>

                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="h-10 w-10 rounded-xl"
                    onClick={() => requestDelete(answer.id)}
                    disabled={isSaving}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingDeleteId && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-[2px]"
          dir={dir}
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              cancelDelete();
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-3xl border bg-background p-6 shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="saved-answer-delete-title"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <Trash2 className="h-5 w-5" />
              </div>

              <h2
                id="saved-answer-delete-title"
                className="min-w-0 flex-1 text-lg font-extrabold"
              >
                {t.saved_answers_deleteConfirm}
              </h2>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 rounded-xl"
                onClick={cancelDelete}
                disabled={isSaving}
              >
                {t.saved_answers_cancel}
              </Button>

              <Button
                type="button"
                variant="destructive"
                className="h-11 flex-1 rounded-xl"
                onClick={confirmDelete}
                disabled={isSaving}
              >
                {t.saved_answers_deleteAction}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isSheetOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-6 backdrop-blur-[2px] md:items-center md:px-4 md:py-6">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] bg-background shadow-2xl md:max-h-[calc(100dvh-4rem)]">
            <div className="shrink-0 border-b bg-background px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                    <Sparkles className="h-5 w-5" />
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-xl font-extrabold">
                      {editingId ? t.saved_answers_editReply : t.saved_answers_addSavedReply}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {t.saved_answers_modalSubtitle}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-2xl border bg-card text-muted-foreground shadow-sm transition hover:bg-muted"
                  onClick={closeSheet}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label className="mb-1 block text-sm font-semibold">
                      {t.saved_answers_category}
                    </Label>
                    <select
                      value={form.category}
                      onChange={event => updateForm('category', event.target.value)}
                      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
                    >
                      {categories.map(category => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label className="mb-1 block text-sm font-semibold">
                      {t.saved_answers_language}
                    </Label>
                    <select
                      value={form.language}
                      onChange={event =>
                        updateForm('language', event.target.value as Language)
                      }
                      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
                    >
                      {languages.map(language => (
                        <option key={language.value} value={language.value}>
                          {language.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <Label className="mb-1 block text-sm font-semibold">
                    {t.saved_answers_questionPattern}
                  </Label>
                  <Input
                    required
                    value={form.question_pattern}
                    onChange={event => updateForm('question_pattern', event.target.value)}
                    placeholder={t.saved_answers_questionPlaceholder}
                    className="h-11 rounded-xl"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.saved_answers_questionHelp}
                  </p>
                </div>

                <div>
                  <Label className="mb-1 block text-sm font-semibold">
                    {t.saved_answers_answerText}
                  </Label>
                  <Textarea
                    required
                    rows={5}
                    value={form.answer_text}
                    onChange={event => updateForm('answer_text', event.target.value)}
                    placeholder={t.saved_answers_answerPlaceholder}
                    className="rounded-xl"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-2xl border bg-muted/20 p-4">
                  <div>
                    <p className="text-sm font-bold">{t.saved_answers_enableReply}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t.saved_answers_enableReplyDesc}
                    </p>
                  </div>

                  <FawriToggle
                    checked={form.active}
                    onChange={checked => updateForm('active', checked)}
                  />
                </div>
              </div>

              <div className="shrink-0 border-t bg-background px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeSheet}
                    className="h-11 flex-1 rounded-xl"
                  >
                    {t.saved_answers_cancel}
                  </Button>

                  <Button
                    type="submit"
                    disabled={isSaving}
                    className="h-11 flex-1 rounded-xl bg-orange-500 font-bold text-white hover:bg-orange-600"
                  >
                    {editingId ? t.saved_answers_saveChanges : t.saved_answers_saveReply}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}