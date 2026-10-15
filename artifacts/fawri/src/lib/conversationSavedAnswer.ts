import type { Message } from './types';

export type KnowledgeLanguage = 'ar' | 'ku' | 'en';

export type ConversationSavedAnswerSeed = {
  merchantMessageId: string;
  customerQuestionMessageId?: string;
  questionPattern: string;
  answerText: string;
};

export type CreateConversationSavedAnswerInput = {
  questionPattern: string;
  answerText: string;
  category: string;
  language: KnowledgeLanguage;
  active: boolean;
};

export type CanonicalSavedAnswer = {
  id: string;
  category: string;
  questionPattern: string;
  answerText: string;
  language: KnowledgeLanguage;
  active: boolean;
  version: number;
};

export function buildConversationSavedAnswerSeed(
  messages: Message[],
  merchantMessageId: string,
): ConversationSavedAnswerSeed | null {
  const selectedIndex = messages.findIndex(message => message.id === merchantMessageId);
  if (selectedIndex < 0) return null;

  const selected = messages[selectedIndex];
  if (selected.sender !== 'merchant') return null;

  const answerText = selected.text.trim();
  if (!answerText) return null;

  for (let index = selectedIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (
      candidate.sender === 'customer' &&
      candidate.conversation_id === selected.conversation_id &&
      candidate.text.trim()
    ) {
      return {
        merchantMessageId: selected.id,
        customerQuestionMessageId: candidate.id,
        questionPattern: candidate.text.trim(),
        answerText,
      };
    }
  }

  return {
    merchantMessageId: selected.id,
    questionPattern: '',
    answerText,
  };
}

function isKnowledgeLanguage(value: unknown): value is KnowledgeLanguage {
  return value === 'ar' || value === 'ku' || value === 'en';
}

function isCanonicalSavedAnswer(value: unknown): value is CanonicalSavedAnswer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const answer = value as Record<string, unknown>;
  return (
    typeof answer.id === 'string' &&
    answer.id.length > 0 &&
    typeof answer.category === 'string' &&
    typeof answer.questionPattern === 'string' &&
    typeof answer.answerText === 'string' &&
    isKnowledgeLanguage(answer.language) &&
    typeof answer.active === 'boolean' &&
    typeof answer.version === 'number' &&
    Number.isInteger(answer.version) &&
    answer.version > 0
  );
}

export async function createConversationSavedAnswer(
  input: CreateConversationSavedAnswerInput,
  fetchImpl: typeof fetch = fetch,
): Promise<CanonicalSavedAnswer> {
  const response = await fetchImpl('/api/knowledge/saved-answers', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      questionPattern: input.questionPattern.trim(),
      answerText: input.answerText.trim(),
      category: input.category.trim() || 'custom',
      language: input.language,
      active: input.active,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok || !isCanonicalSavedAnswer(body.answer)) {
    const errorMessage =
      body && typeof body.error === 'string' && body.error.trim()
        ? body.error
        : 'Could not save answer';
    throw new Error(errorMessage);
  }

  return body.answer;
}
