import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { getCurrentMerchant, getConversations, saveConversations } from '@/lib/store';
import { Conversation, Message } from '@/lib/types';
import { PlatformIcon } from '@/components/PlatformIcon';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, UserIcon, Bot, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export default function ConversationsPage() {
  const { t, dir, isRTL } = useI18n();

  const merchant = getCurrentMerchant();
  const merchantId = merchant?.id || '';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

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

  const loadConversations = async () => {
    if (!merchantId) return;

    try {
      const response = await fetch(
        `/api/conversations?merchantId=${encodeURIComponent(merchantId)}`
      );

      const data = await response.json().catch(() => null);

      if (data?.ok && Array.isArray(data.conversations)) {
        const apiConversations = data.conversations as Conversation[];

        setConversations(apiConversations);

        setActiveConvId(currentActiveId => {
          if (
            currentActiveId &&
            apiConversations.some(conversation => conversation.id === currentActiveId)
          ) {
            return currentActiveId;
          }

          return null;
        });

        return;
      }

      setConversations(getConversations(merchantId));
    } catch (error) {
      console.error('Failed to load conversations:', error);
      setConversations(getConversations(merchantId));
    }
  };

  useEffect(() => {
    loadConversations();

    const interval = window.setInterval(() => {
      loadConversations();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [merchantId]);

  const activeConv = useMemo(
    () => conversations.find(conversation => conversation.id === activeConvId),
    [conversations, activeConvId]
  );

  if (!merchant) return null;

  const handleTakeOver = () => {
    if (!activeConv) return;

    const updated = conversations.map(conversation =>
      conversation.id === activeConv.id
        ? { ...conversation, assigned_to_human: true, status: 'manual' as const }
        : conversation
    );

    setConversations(updated);
    saveConversations(updated);
  };

  const handleReturnToFawri = () => {
    if (!activeConv) return;

    const updated = conversations.map(conversation =>
      conversation.id === activeConv.id
        ? {
            ...conversation,
            assigned_to_human: false,
            status: 'auto_replying' as const,
          }
        : conversation
    );

    setConversations(updated);
    saveConversations(updated);
  };

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault();

    if (!activeConv || !replyText.trim()) return;

    const newMessage: Message = {
      id: `m-${Date.now()}`,
      conversation_id: activeConv.id,
      sender: 'merchant',
      text: replyText.trim(),
      created_at: new Date().toISOString(),
      counted_as_auto_reply: false,
    };

    const updated = conversations.map(conversation => {
      if (conversation.id === activeConv.id) {
        return {
          ...conversation,
          messages: [...conversation.messages, newMessage],
          updated_at: new Date().toISOString(),
        };
      }

      return conversation;
    });

    setConversations(updated);
    saveConversations(updated);
    setReplyText('');

    toast.info(t.conversations_manualReplySaved);
  };

  const handleSaveAsAnswer = () => {
    toast.success(t.conversations_comingSoon);
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-28" dir={dir}>
      <div className="flex h-[calc(100dvh-8rem)] overflow-hidden rounded-3xl border bg-card shadow-sm md:h-[calc(100dvh-6rem)]">
        <div
          className={`w-full flex-col border-border md:flex md:w-1/3 ${
            isRTL ? 'md:border-l' : 'md:border-r'
          } ${activeConvId ? 'hidden md:flex' : 'flex'}`}
        >
          <div className="border-b p-4">
            <h1 className="text-2xl font-extrabold tracking-tight">
              {t.conversations_title}
            </h1>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
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
                    <Button variant="outline" size="sm" onClick={handleReturnToFawri}>
                      {t.return_to_fawri}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={handleTakeOver}>
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

                      {!isCustomer && message.sender === 'merchant' && (
                        <button
                          type="button"
                          onClick={handleSaveAsAnswer}
                          className="mt-1 px-8 text-[10px] text-muted-foreground hover:text-primary"
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
                    />

                    <Button
                      type="submit"
                      size="icon"
                      className="h-12 w-12 shrink-0 rounded-xl"
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
              <p className="text-lg font-semibold">{t.conversations_noConversations}</p>
              <p className="mt-2 max-w-xs text-sm leading-6">
                {t.conversations_noConversationsDesc}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}