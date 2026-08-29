import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n';
import {
  createSavedAnswer,
  deleteSavedAnswer,
  listSavedAnswers,
  SavedAnswersAuthorityError,
  updateSavedAnswer,
  type MerchantSavedAnswer,
  type SavedAnswerInput,
  type SavedAnswerLanguage,
} from '@/lib/savedAnswersAuthority';
import { SAVED_ANSWERS_AUTHORITY_COPY } from '@/lib/translations/features/pages/dashboard/SavedAnswersAuthority';

type LoadStatus = 'loading' | 'ready' | 'unavailable';

type SavedAnswerForm = SavedAnswerInput;

const emptyForm: SavedAnswerForm = {
  category: 'custom',
  question_pattern: '',
  answer_text: '',
  language: 'ar',
  active: true,
};

function sortSavedAnswers(answers: MerchantSavedAnswer[]) {
  return [...answers].sort(
    (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
  );
}

function FawriToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
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

export default function CanonicalSavedAnswersPage() {
  const { t, lang, dir } = useI18n();
  const currentLang: SavedAnswerLanguage = lang === 'ku' || lang === 'en' ? lang : 'ar';
  const authorityCopy = SAVED_ANSWERS_AUTHORITY_COPY[currentLang];
  const [answers, setAnswers] = useState<MerchantSavedAnswer[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SavedAnswerForm>({
    ...emptyForm,
    language: currentLang,
  });
  const loadRequestIdRef = useRef(0);

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

  const loadAnswers = useCallback(async (showLoading = false) => {
    const requestId = ++loadRequestIdRef.current;
    if (showLoading) setLoadStatus('loading');

    try {
      const nextAnswers = await listSavedAnswers();
      if (requestId !== loadRequestIdRef.current) return;
      setAnswers(nextAnswers);
      setLoadStatus('ready');
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;
      console.error('Load saved answers failed:', error);
      setLoadStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    void loadAnswers(true);
    return () => {
      loadRequestIdRef.current += 1;
    };
  }, [loadAnswers]);

  const filteredAnswers = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return answers;
    return answers.filter(answer =>
      answer.question_pattern.toLowerCase().includes(search) ||
      answer.answer_text.toLowerCase().includes(search) ||
      answer.category.toLowerCase().includes(search),
    );
  }, [answers, searchTerm]);

  const mutationsAllowed = loadStatus === 'ready' && !isSaving;

  const getCategoryLabel = (category: string) =>
    categories.find(item => item.value === category)?.label || t.saved_answers_custom;

  const getLanguageLabel = (language: string) =>
    languages.find(item => item.value === language)?.label || language;

  const updateForm = (field: keyof SavedAnswerForm, value: string | boolean) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const openAddSheet = () => {
    if (!mutationsAllowed) return;
    setEditingId(null);
    setForm({ ...emptyForm, language: currentLang });
    setIsSheetOpen(true);
  };

  const openEditSheet = (answer: MerchantSavedAnswer) => {
    if (!mutationsAllowed) return;
    setEditingId(answer.id);
    setForm({
      category: answer.category || 'custom',
      question_pattern: answer.question_pattern,
      answer_text: answer.answer_text,
      language: answer.language,
      active: answer.active,
    });
    setIsSheetOpen(true);
  };

  const closeSheet = () => {
    if (isSaving) return;
    setIsSheetOpen(false);
    setEditingId(null);
    setForm({ ...emptyForm, language: currentLang });
  };

  const refreshAfterConflict = async (error: unknown) => {
    if (
      error instanceof SavedAnswersAuthorityError &&
      error.status === 409 &&
      error.code === 'VERSION_CONFLICT'
    ) {
      toast.error(authorityCopy.conflict);
      await loadAnswers();
      return true;
    }
    return false;
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mutationsAllowed) return;

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
        const current = answers.find(answer => answer.id === editingId);
        if (!current) {
          await loadAnswers();
          return;
        }
        const updated = await updateSavedAnswer(current, form);
        setAnswers(existing =>
          sortSavedAnswers(existing.map(answer => (answer.id === updated.id ? updated : answer))),
        );
        toast.success(t.saved_answers_updated);
      } else {
        const created = await createSavedAnswer(form);
        setAnswers(existing => sortSavedAnswers([created, ...existing]));
        toast.success(t.saved_answers_added);
      }
      setIsSheetOpen(false);
      setEditingId(null);
      setForm({ ...emptyForm, language: currentLang });
    } catch (error) {
      console.error('Save saved answer failed:', error);
      const conflictHandled = await refreshAfterConflict(error);
      if (!conflictHandled) {
        toast.error(
          editingId
            ? t.saved_answers_status_updateFailed
            : t.saved_answers_status_saveFailed,
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId || !mutationsAllowed) return;
    const current = answers.find(answer => answer.id === pendingDeleteId);
    if (!current) {
      setPendingDeleteId(null);
      await loadAnswers();
      return;
    }

    setIsSaving(true);
    try {
      await deleteSavedAnswer(current);
      setAnswers(existing => existing.filter(answer => answer.id !== current.id));
      setPendingDeleteId(null);
      toast.success(t.saved_answers_deleted);
    } catch (error) {
      console.error('Delete saved answer failed:', error);
      const conflictHandled = await refreshAfterConflict(error);
      if (!conflictHandled) toast.error(t.saved_answers_status_deleteFailed);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (answer: MerchantSavedAnswer, active: boolean) => {
    if (!mutationsAllowed) return;
    setIsSaving(true);
    try {
      const updated = await updateSavedAnswer(answer, { active });
      setAnswers(existing =>
        sortSavedAnswers(existing.map(item => (item.id === updated.id ? updated : item))),
      );
    } catch (error) {
      console.error('Toggle saved answer failed:', error);
      const conflictHandled = await refreshAfterConflict(error);
      if (!conflictHandled) toast.error(t.saved_answers_status_updateFailed);
    } finally {
      setIsSaving(false);
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
            disabled={!mutationsAllowed}
            className="h-11 shrink-0 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600 active:scale-95"
          >
            <Plus className="me-2 h-4 w-4" />
            {t.saved_answers_addReply}
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder={t.saved_answers_searchPlaceholder}
            className="h-12 rounded-2xl pe-10"
          />
        </div>
      </div>

      {loadStatus === 'unavailable' && answers.length > 0 ? (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm font-medium leading-6">{authorityCopy.staleBody}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadAnswers()}>
            <RefreshCw className="me-2 h-4 w-4" />
            {authorityCopy.retry}
          </Button>
        </div>
      ) : null}

      {loadStatus === 'loading' ? (
        <div className="rounded-3xl border bg-card p-10 text-center shadow-sm">
          <BookOpen className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" />
          <p className="text-lg font-semibold text-muted-foreground">
            {t.saved_answers_status_loading}
          </p>
        </div>
      ) : loadStatus === 'unavailable' && answers.length === 0 ? (
        <div className="rounded-3xl border border-destructive/30 bg-card p-10 text-center shadow-sm">
          <AlertTriangle className="mx-auto mb-4 h-14 w-14 text-destructive/60" />
          <h2 className="text-lg font-extrabold">{authorityCopy.unavailableTitle}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
            {authorityCopy.unavailableBody}
          </p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => void loadAnswers(true)}>
            <RefreshCw className="me-2 h-4 w-4" />
            {authorityCopy.retry}
          </Button>
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
            <div key={answer.id} className="overflow-hidden rounded-3xl border bg-card shadow-sm">
              <div className="border-b p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{getCategoryLabel(answer.category)}</Badge>
                  <Badge variant="outline">{getLanguageLabel(answer.language)}</Badge>
                  <Badge variant="outline">
                    {answer.active ? t.saved_answers_active : t.saved_answers_inactive}
                  </Badge>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                    <MessageSquareText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="line-clamp-2 text-lg font-extrabold">{answer.question_pattern}</h2>
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
                    disabled={!mutationsAllowed}
                    onChange={checked => void handleToggleActive(answer, checked)}
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
                    disabled={!mutationsAllowed}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="h-10 w-10 rounded-xl"
                    onClick={() => setPendingDeleteId(answer.id)}
                    disabled={!mutationsAllowed}
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
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 px-4 py-6" dir={dir}>
          <div className="w-full max-w-md rounded-3xl border bg-background p-6 shadow-2xl" role="alertdialog" aria-modal="true">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <h2 className="min-w-0 flex-1 text-lg font-extrabold">
                {t.saved_answers_deleteConfirm}
              </h2>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 rounded-xl"
                onClick={() => setPendingDeleteId(null)}
                disabled={isSaving}
              >
                {t.saved_answers_cancel}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="h-11 flex-1 rounded-xl"
                onClick={() => void confirmDelete()}
                disabled={isSaving}
              >
                {t.saved_answers_deleteAction}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isSheetOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-6 md:items-center md:px-4 md:py-6">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] bg-background shadow-2xl md:max-h-[calc(100dvh-4rem)]">
            <div className="shrink-0 border-b px-5 py-4">
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
                <Button type="button" variant="outline" size="icon" onClick={closeSheet} disabled={isSaving}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label className="mb-1 block text-sm font-semibold">{t.saved_answers_category}</Label>
                    <select
                      value={form.category}
                      onChange={event => updateForm('category', event.target.value)}
                      disabled={isSaving}
                      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                    >
                      {categories.map(category => (
                        <option key={category.value} value={category.value}>{category.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="mb-1 block text-sm font-semibold">{t.saved_answers_language}</Label>
                    <select
                      value={form.language}
                      onChange={event => updateForm('language', event.target.value as SavedAnswerLanguage)}
                      disabled={isSaving}
                      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                    >
                      {languages.map(language => (
                        <option key={language.value} value={language.value}>{language.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <Label className="mb-1 block text-sm font-semibold">{t.saved_answers_questionPattern}</Label>
                  <Input
                    required
                    value={form.question_pattern}
                    onChange={event => updateForm('question_pattern', event.target.value)}
                    placeholder={t.saved_answers_questionPlaceholder}
                    disabled={isSaving}
                    className="h-11 rounded-xl"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{t.saved_answers_questionHelp}</p>
                </div>

                <div>
                  <Label className="mb-1 block text-sm font-semibold">{t.saved_answers_answerText}</Label>
                  <Textarea
                    required
                    rows={5}
                    value={form.answer_text}
                    onChange={event => updateForm('answer_text', event.target.value)}
                    placeholder={t.saved_answers_answerPlaceholder}
                    disabled={isSaving}
                    className="rounded-xl"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-2xl border bg-muted/20 p-4">
                  <div>
                    <p className="text-sm font-bold">{t.saved_answers_enableReply}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{t.saved_answers_enableReplyDesc}</p>
                  </div>
                  <FawriToggle checked={form.active} disabled={isSaving} onChange={checked => updateForm('active', checked)} />
                </div>
              </div>

              <div className="shrink-0 border-t px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={closeSheet} disabled={isSaving} className="h-11 flex-1 rounded-xl">
                    {t.saved_answers_cancel}
                  </Button>
                  <Button type="submit" disabled={isSaving} className="h-11 flex-1 rounded-xl bg-orange-500 font-bold text-white hover:bg-orange-600">
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
