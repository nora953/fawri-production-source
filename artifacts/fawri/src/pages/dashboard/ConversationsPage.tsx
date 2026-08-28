import { COMMON_UI_LABELS } from '@/lib/translations/commonUi';
import {
  CONVERSATIONS_PAGE_AUTHORITY_COPY,
  CONVERSATIONS_PAGE_SAVE_ANSWER_COPY,
} from '@/lib/translations/features/pages/dashboard/ConversationsPage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Conversation } from '@/lib/types';
import {
  buildConversationSavedAnswerSeed,
  createConversationSavedAnswer,
  type ConversationSavedAnswerSeed,
  type KnowledgeLanguage,
} from '@/lib/conversationSavedAnswer';
import { PlatformIcon } from '@/components/PlatformIcon';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, UserIcon, Bot, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

type SaveAnswerDraft = ConversationSavedAnswerSeed & {
  category: string;
  language: KnowledgeLanguage;
  active: boolean;
};

type SaveAnswerCopy = {
  title: string;
  subtitle: string;
  question: string;
  answer: string;
  category: string;
  language: string;
  active: string;
  cancel: string;
  save: string;
  saving: string;
  required: string;
  success: string;
  failure: string;
  source: string;
  noSource: string;
};

type ConversationLoadStatus = 'loading' | 'ready' | 'unavailable';

const SAVE_ANSWER_COPY: Record<KnowledgeLanguage, SaveAnswerCopy> = CONVERSATIONS_PAGE_SAVE_ANSWER_COPY;

function requestedConversationId(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('conversation')?.trim() || '';
}

function makeIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `manual-reply:${crypto.randomUUID()}`;
  }
  return `manual-reply:${Date.now()}:${Math.random().toString(36).slice(2)}:${Math.random().toString(36).slice(2)}`;
}

export default function ConversationsPage() {
  const { t, dir, isRTL, lang } = useI18n();
  const knowledgeLanguage: KnowledgeLanguage = lang === 'ku' || lang === 'en' ? lang : 'ar';
  const saveAnswerCopy = SAVE_ANSWER_COPY[knowledgeLanguage];
  const authorityCopy = CONVERSATIONS_PAGE_AUTHORITY_COPY[knowledgeLanguage];

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadStatus, setLoadStatus] = useState<ConversationLoadStatus>('loading');
  const linkedConversationIdRef = useRef(requestedConversationId());
  const loadRequestIdRef = useRef(0);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [saveAnswerDraft, setSaveAnswerDraft] = useState<SaveAnswerDraft | null>(null);
  const [savingAnswer, setSavingAnswer] = useState(false);

  const getStatusLabel = (status: Conversation['status']) => {
    const statusLabels: Record<Conversation['status'], string> = {
      auto_replying: t.conversations_auto_replying,
      manual: t.conversations_manual,
      needs_reply: t.conversations_needs_reply,
      needs_training: t.conversations_needs_training,
      order_ready: t.conversations_order_ready,
    };

    return statusLabels[status];
  };

  const loadConversations = async (showLoading = false) => {
    const requestId = ++loadRequestIdRef.current;
    if (showLoading && conversations.length === 0) {
      setLoadStatus('loading');
    }

    try {
      const response = await fetch('/api/conversations', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok || !Array.isArray(data.conversations)) {
        throw new Error(data?.error || 'Could not load conversations');
      }
      if (requestId !== loadRequestIdRef.current) return;

      const apiConversations = data.conversations as Conversation[];
      setConversations(apiConversations);
      setLoadStatus('ready');
      setActiveConvId(currentActiveId => {
        const linkedConversationId = linkedConversationIdRef.current;
        linkedConversationIdRef.current = '';
        if (
          linkedConversationId &&
          apiConversations.some(conversation => conversation.id === linkedConversationId)
        ) {
          return linkedConversationId;
        }
        if (
          currentActiveId &&
          apiConversations.some(conversation => conversation.id === currentActiveId)
        ) {
          return currentActiveId;
        }
        return null;
      });
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;
      console.error('Failed to load conversations:', error);
      setLoadStatus('unavailable');
    }
  };

  useEffect(() => {
    void loadConversations(true);

    const interval = window.setInterval(() => {
      void loadConversations();
    }, 5000);

    return () => window.clearInterval(interval);
    // Polling deliberately uses the mounted server-authority reader; language copy
    // is selected only while rendering and does not affect the authority request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeConv = useMemo(
    () => conversations.find(conversation => conversation.id === activeConvId),
    [conversations, activeConvId]
  );

  const replaceConversation = (conversation: Conversation) => {
    setConversations(current =>
      current.map(item => (item.id === conversation.id ? conversation : item))
    );
  };

  const runConversationAction = async (
    action: 'takeover' | 'return-to-fawri'
  ) => {
    if (!activeConv || pendingAction) return;
    const actionKey = `${action}:${activeConv.id}`;
    setPendingAction(actionKey);
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(activeConv.id)}/${action}`,
        { method: 'POST', headers: { Accept: 'application/json' } }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.conversation) {
        throw new Error(data?.error || 'Conversation update failed');
      }
      replaceConversation(data.conversation as Conversation);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Conversation update failed'
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleTakeOver = () => void runConversationAction('takeover');

  const handleReturnToFawri = () =>
    void runConversationAction('return-to-fawri');

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();

    const text = replyText.trim();
    if (!activeConv || !text || pendingAction) return;

    const actionKey = `send:${activeConv.id}`;
    setPendingAction(actionKey);
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(activeConv.id)}/messages`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Idempotency-Key': makeIdempotencyKey(),
          },
          body: JSON.stringify({ text }),
        }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.conversation || !data.message) {
        throw new Error(data?.error || 'Manual reply delivery failed');
      }

      replaceConversation(data.conversation as Conversation);
      setReplyText('');
      toast.success(t.conversations_manualReplySaved);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Manual reply delivery failed'
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleSaveAsAnswer = (merchantMessageId: string) => {
    if (!activeConv || savingAnswer) return;

    const seed = buildConversationSavedAnswerSeed(
      activeConv.messages,
      merchantMessageId,
    );
    if (!seed) {
      toast.error(saveAnswerCopy.failure);
      return;
    }

    setSaveAnswerDraft({
      ...seed,
      category: 'custom',
      language: knowledgeLanguage,
      active: true,
    });
  };

  const handleSaveAnswerSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!saveAnswerDraft || savingAnswer) return;

    const questionPattern = saveAnswerDraft.questionPattern.trim();
    const answerText = saveAnswerDraft.answerText.trim();
    if (!questionPattern || !answerText) {
      toast.error(saveAnswerCopy.required);
      return;
    }

    setSavingAnswer(true);
    try {
      await createConversationSavedAnswer({
        questionPattern,
        answerText,
        category: saveAnswerDraft.category,
        language: saveAnswerDraft.language,
        active: saveAnswerDraft.active,
      });
      setSaveAnswerDraft(null);
      toast.success(saveAnswerCopy.success);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      toast.error(detail ? `${saveAnswerCopy.failure} ${detail}` : saveAnswerCopy.failure);
    } finally {
      setSavingAnswer(false);
    }
  };

  const actionPending = Boolean(pendingAction);
  const authorityUnavailableWithData =
    loadStatus === 'unavailable' && conversations.length > 0;

  return (
    <div className="min-h-screen bg-background p-4 pb-28" dir={dir}>
      <div className="flex h-[calc(100dvh-8rem)] overflow-hidden rounded-3xl border bg-card shadow-sm md:h-[calc(100dvh-6rem)]">
        <div
          className={`w-full flex-col border-border md:flex md:w-1/3 ${
            isRTL ? 'md:border-l' : 'md:border-r'
          } ${activeConvId ? 'hidden md:flex' : 'flex'}`}
        >
          <div className="border-b p-4">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl font-extrabold tracking-tight">
                {t.conversations_title}
              </h1>
              {authorityUnavailableWithData ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadConversations(true)}
                >
                  {authorityCopy.retry}
                </Button>
              ) : null}
            </div>
            {authorityUnavailableWithData ? (
              <p className="mt-2 text-xs font-medium text-destructive">
                {authorityCopy.staleBody}
              </p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadStatus === 'loading' ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <MessageSquare className="mb-4 h-16 w-16 opacity-20" />
                <p className="text-sm font-semibold">{authorityCopy.loading}</p>
              </div>
            ) : loadStatus === 'unavailable' && conversations.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <MessageSquare className="mb-4 h-16 w-16 opacity-20" />
                <p className="text-lg font-semibold text-foreground">
                  {authorityCopy.unavailableTitle}
                </p>
                <p className="mt-2 max-w-xs text-sm leading-6">
                  {authorityCopy.unavailableBody}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={() => void loadConversations(true)}
                >
                  {authorityCopy.retry}
                </Button>
              </div>
            ) : loadStatus === 'ready' && conversations.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <MessageSquare className="mb-4 h-16 w-16 opacity-20" />
                <p className="text-lg font-semibold">{t.conversations_noConversations}</p>
                <p className="mt-2 max-w-xs text-sm leading-6">
                  {t.conversations_noConversationsDesc}
                </p>
              </div>
            ) : (
              conversations.map(conversation => {
                const lastMessage =
                  conversation.messages[conversation.messages.length - 1]?.text || '';

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setActiveConvId(conversation.id)}
                    className={`w-full border-b p-4 text-start transition-colors hover:bg-accent ${
                      activeConvId === conversation.id ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-3">
                      <PlatformIcon
                        platform={conversation.platform}
                        className="h-8 w-8 rounded-full"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">
                          {conversation.customer_name}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {conversation.customer_handle}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex items-end justify-between gap-3">
                      <p className="max-w-[70%] truncate text-sm text-muted-foreground">
                        {lastMessage}
                      </p>

                      <Badge
                        variant={
                          conversation.status === 'auto_replying'
                            ? 'default'
                            : conversation.status === 'manual'
                              ? 'secondary'
                              : 'outline'
                        }
                        className="shrink-0 text-[10px]"
                      >
                        {getStatusLabel(conversation.status)}
                      </Badge>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div
          className={`w-full flex-col md:flex md:w-2/3 ${
            !activeConvId ? 'hidden md:flex' : 'flex'
          }`}
        >
          {activeConv ? (
            <>
              <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-card p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    className="rounded-xl p-2 text-muted-foreground hover:bg-accent md:hidden"
                    onClick={() => setActiveConvId(null)}
                    aria-label={t.conversations_back}
                  >
                    {isRTL ? '→' : '←'}
                  </button>

                  <PlatformIcon
                    platform={activeConv.platform}
                    className="h-8 w-8 rounded-full"
                  />

                  <div className="min-w-0">
                    <div className="truncate font-bold">
                      {activeConv.customer_name}
                    </div>
                    <Badge variant="outline" className="mt-1 text-xs font-normal">
                      {getStatusLabel(activeConv.status)}
                    </Badge>
                  </div>
                </div>

                <div className="shrink-0">
                  {activeConv.assigned_to_human ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReturnToFawri}
                      disabled={actionPending}
                    >
                      {t.return_to_fawri}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleTakeOver}
                      disabled={actionPending}
                    >
                      {t.take_over}
                    </Button>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-muted/20 p-4">
                {activeConv.messages.map(message => {
                  const isCustomer = message.sender === 'customer';
                  const isFawri = message.sender === 'fawri';

                  return (
                    <div
                      key={message.id}
                      className={`flex flex-col ${
                        isCustomer ? 'items-start' : 'items-end'
                      }`}
                    >
                      <div className="flex max-w-[85%] items-end gap-2">
                        {isCustomer && (
                          <div className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                            <UserIcon className="h-3.5 w-3.5 text-secondary-foreground" />
                          </div>
                        )}

                        <div
                          className={`rounded-2xl p-3 ${
                            isCustomer
                              ? 'rounded-bl-none border bg-card text-card-foreground'
                              : isFawri
                                ? 'rounded-br-none bg-primary text-primary-foreground'
                                : 'rounded-br-none bg-secondary text-secondary-foreground'
                          }`}
                        >
                          <p className="whitespace-pre-wrap text-sm leading-6">
                            {message.text}
                          </p>
                        </div>

                        {!isCustomer && isFawri && (
                          <div className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20">
                            <Bot className="h-3.5 w-3.5 text-primary" />
                          </div>
                        )}
                      </div>

                      {message.sender === 'merchant' && (
                        <button
                          type="button"
                          onClick={() => handleSaveAsAnswer(message.id)}
                          disabled={savingAnswer}
                          className="mt-1 px-8 text-[10px] text-muted-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {t.save_as_answer}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {activeConv.assigned_to_human ? (
                <div className="shrink-0 border-t bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                  <form onSubmit={handleSend} className="flex gap-2">
                    <Input
                      value={replyText}
                      onChange={event => setReplyText(event.target.value)}
                      placeholder={t.conversations_typeMessage}
                      className="h-12 flex-1 rounded-xl"
                      disabled={actionPending}
                    />

                    <Button
                      type="submit"
                      size="icon"
                      className="h-12 w-12 shrink-0 rounded-xl"
                      disabled={actionPending || !replyText.trim()}
                    >
                      <Send className="h-5 w-5" />
                    </Button>
                  </form>
                </div>
              ) : (
                <div className="shrink-0 border-t bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center text-sm leading-6 text-muted-foreground">
                  {t.conversations_manualReplyInfo}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-muted-foreground">
              <MessageSquare className="mb-4 h-16 w-16 opacity-20" />
              {loadStatus === 'loading' ? (
                <p className="text-sm font-semibold">{authorityCopy.loading}</p>
              ) : loadStatus === 'unavailable' && conversations.length === 0 ? (
                <>
                  <p className="text-lg font-semibold text-foreground">
                    {authorityCopy.unavailableTitle}
                  </p>
                  <p className="mt-2 max-w-sm text-sm leading-6">
                    {authorityCopy.unavailableBody}
                  </p>
                </>
              ) : conversations.length > 0 ? (
                <>
                  <p className="text-lg font-semibold text-foreground">
                    {authorityCopy.selectTitle}
                  </p>
                  <p className="mt-2 max-w-sm text-sm leading-6">
                    {authorityCopy.selectBody}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold">{t.conversations_noConversations}</p>
                  <p className="mt-2 max-w-xs text-sm leading-6">
                    {t.conversations_noConversationsDesc}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {saveAnswerDraft ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={saveAnswerCopy.title}
          dir={dir}
        >
          <form
            onSubmit={handleSaveAnswerSubmit}
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border bg-card p-5 shadow-2xl sm:max-w-xl sm:rounded-3xl sm:p-6"
          >
            <div className="mb-5">
              <h2 className="text-xl font-extrabold">{saveAnswerCopy.title}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {saveAnswerCopy.subtitle}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {saveAnswerDraft.customerQuestionMessageId
                  ? saveAnswerCopy.source
                  : saveAnswerCopy.noSource}
              </p>
            </div>

            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-semibold">{saveAnswerCopy.question}</span>
                <Textarea
                  value={saveAnswerDraft.questionPattern}
                  onChange={event =>
                    setSaveAnswerDraft(current =>
                      current
                        ? { ...current, questionPattern: event.target.value }
                        : current
                    )
                  }
                  rows={3}
                  maxLength={500}
                  disabled={savingAnswer}
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold">{saveAnswerCopy.answer}</span>
                <Textarea
                  value={saveAnswerDraft.answerText}
                  onChange={event =>
                    setSaveAnswerDraft(current =>
                      current ? { ...current, answerText: event.target.value } : current
                    )
                  }
                  rows={5}
                  maxLength={2000}
                  disabled={savingAnswer}
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold">{saveAnswerCopy.category}</span>
                <Input
                  value={saveAnswerDraft.category}
                  onChange={event =>
                    setSaveAnswerDraft(current =>
                      current ? { ...current, category: event.target.value } : current
                    )
                  }
                  maxLength={100}
                  disabled={savingAnswer}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold">{saveAnswerCopy.language}</span>
                <select
                  value={saveAnswerDraft.language}
                  onChange={event =>
                    setSaveAnswerDraft(current =>
                      current
                        ? {
                            ...current,
                            language: event.target.value as KnowledgeLanguage,
                          }
                        : current
                    )
                  }
                  disabled={savingAnswer}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="ar">{COMMON_UI_LABELS.languageNames.ar}</option>
                  <option value="ku">{COMMON_UI_LABELS.languageNames.ku}</option>
                  <option value="en">{COMMON_UI_LABELS.languageNames.en}</option>
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-xl border p-3">
                <input
                  type="checkbox"
                  checked={saveAnswerDraft.active}
                  onChange={event =>
                    setSaveAnswerDraft(current =>
                      current ? { ...current, active: event.target.checked } : current
                    )
                  }
                  disabled={savingAnswer}
                  className="h-4 w-4"
                />
                <span className="text-sm font-semibold">{saveAnswerCopy.active}</span>
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSaveAnswerDraft(null)}
                disabled={savingAnswer}
              >
                {saveAnswerCopy.cancel}
              </Button>
              <Button
                type="submit"
                disabled={
                  savingAnswer ||
                  !saveAnswerDraft.questionPattern.trim() ||
                  !saveAnswerDraft.answerText.trim()
                }
              >
                {savingAnswer ? saveAnswerCopy.saving : saveAnswerCopy.save}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
