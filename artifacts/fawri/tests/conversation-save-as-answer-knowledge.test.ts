import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { Message } from '../src/lib/types';
import {
  buildConversationSavedAnswerSeed,
  createConversationSavedAnswer,
} from '../src/lib/conversationSavedAnswer';

function message(
  id: string,
  conversationId: string,
  sender: Message['sender'],
  text: string,
): Message {
  return {
    id,
    conversation_id: conversationId,
    sender,
    text,
    created_at: '2026-08-09T12:00:00.000Z',
    counted_as_auto_reply: sender === 'fawri',
  };
}

test('save-as-answer seed accepts only an explicit merchant-authored message', () => {
  const messages = [
    message('customer-1', 'conversation-1', 'customer', 'Do you deliver?'),
    message('fawri-1', 'conversation-1', 'fawri', 'Generated response'),
    message('merchant-1', 'conversation-1', 'merchant', 'Yes, we deliver.'),
  ];

  assert.equal(buildConversationSavedAnswerSeed(messages, 'customer-1'), null);
  assert.equal(buildConversationSavedAnswerSeed(messages, 'fawri-1'), null);
  assert.deepEqual(buildConversationSavedAnswerSeed(messages, 'merchant-1'), {
    merchantMessageId: 'merchant-1',
    customerQuestionMessageId: 'customer-1',
    questionPattern: 'Do you deliver?',
    answerText: 'Yes, we deliver.',
  });
});

test('question selection is nearest earlier customer message from the same conversation only', () => {
  const messages = [
    message('customer-old', 'conversation-1', 'customer', 'Old same-conversation question'),
    message('customer-other', 'conversation-2', 'customer', 'Unrelated conversation question'),
    message('fawri-1', 'conversation-1', 'fawri', 'Generated response'),
    message('customer-nearest', 'conversation-1', 'customer', 'Nearest same-conversation question'),
    message('merchant-1', 'conversation-1', 'merchant', 'Merchant approved answer'),
    message('customer-later', 'conversation-1', 'customer', 'Later customer message'),
  ];

  const seed = buildConversationSavedAnswerSeed(messages, 'merchant-1');
  assert.equal(seed?.customerQuestionMessageId, 'customer-nearest');
  assert.equal(seed?.questionPattern, 'Nearest same-conversation question');
  assert.equal(seed?.answerText, 'Merchant approved answer');
});

test('missing earlier same-conversation customer message leaves question blank for merchant review', () => {
  const messages = [
    message('customer-other', 'conversation-2', 'customer', 'Do not use this'),
    message('merchant-1', 'conversation-1', 'merchant', 'Approved answer'),
  ];

  assert.deepEqual(buildConversationSavedAnswerSeed(messages, 'merchant-1'), {
    merchantMessageId: 'merchant-1',
    questionPattern: '',
    answerText: 'Approved answer',
  });
});

test('conversation page exposes save-as-answer only for merchant messages and requires editable review before submit', async () => {
  const source = await readFile(
    new URL('../src/pages/dashboard/ConversationsPage.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /message\.sender === 'merchant'/);
  assert.match(source, /handleSaveAsAnswer\(message\.id\)/);
  assert.match(source, /value=\{saveAnswerDraft\.questionPattern\}/);
  assert.match(source, /questionPattern: event\.target\.value/);
  assert.match(source, /value=\{saveAnswerDraft\.answerText\}/);
  assert.match(source, /answerText: event\.target\.value/);
  assert.match(source, /value=\{saveAnswerDraft\.language\}/);
  assert.match(source, /checked=\{saveAnswerDraft\.active\}/);
  assert.match(source, /disabled=\{savingAnswer\}/);
  assert.match(source, /createConversationSavedAnswer\(/);
  assert.doesNotMatch(source, /fetch\(['"]\/api\/saved-answers/);
  assert.doesNotMatch(source, /merchant_id\s*:/);
});

test('conversation page asks before adopting a merchant correction and exposes both choices', async () => {
  const pageSource = await readFile(
    new URL('../src/pages/dashboard/ConversationsPage.tsx', import.meta.url),
    'utf8',
  );
  const copySource = await readFile(
    new URL('../src/lib/translations/features/pages/dashboard/ConversationsPage.ts', import.meta.url),
    'utf8',
  );

  assert.match(pageSource, /CONVERSATIONS_PAGE_CORRECTION_COPY/);
  assert.match(pageSource, /handleCorrectionReview/);
  assert.match(pageSource, /correction-review/);
  assert.match(pageSource, /'approve'/);
  assert.match(pageSource, /'dismiss'/);
  assert.match(copySource, /CONVERSATIONS_PAGE_CORRECTION_COPY/);
  assert.match(copySource, /Adopt this correction in Fawri/);
});

test('backend correction review is explicit, tenant-scoped, and excludes operational facts', async () => {
  const authoritySource = await readFile(
    new URL('../../api-server/src/services/postgresManualConversationAuthority.ts', import.meta.url),
    'utf8',
  );
  const routeSource = await readFile(
    new URL('../../api-server/src/routes/conversation-operations.ts', import.meta.url),
    'utf8',
  );
  const reviewSource = await readFile(
    new URL('../../api-server/src/services/merchantCorrectionReview.ts', import.meta.url),
    'utf8',
  );
  const knowledgeSource = await readFile(
    new URL('../../api-server/src/services/knowledge/postgresKnowledgeManagementRuntime.ts', import.meta.url),
    'utf8',
  );

  assert.match(authoritySource, /correction_review/);
  assert.match(authoritySource, /approved_saved_answer/);
  assert.match(authoritySource, /semantic_retrieval/);
  assert.match(authoritySource, /ai_fallback/);
  assert.match(authoritySource, /isAuthoritativeFactQuestion/);
  assert.match(routeSource, /correction-review/);
  assert.match(routeSource, /reviewMerchantCorrectionAuthoritative/);
  assert.match(reviewSource, /merchant_id=\$1/);
  assert.match(reviewSource, /conversation_id=\$2/);
  assert.match(reviewSource, /applyMerchantCorrection/);
  assert.match(reviewSource, /CORRECTION_REVIEW_REQUIRES_SOURCE_UPDATE/);
  assert.match(knowledgeSource, /merchant_correction_created/);
  assert.match(knowledgeSource, /merchant_correction_updated/);
  assert.match(knowledgeSource, /safe_to_auto_reply=FALSE/);
});

test('canonical create uses only approved knowledge fields and returns the server answer', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const canonicalAnswer = {
    id: 'saved-answer-1',
    category: 'delivery',
    questionPattern: 'Do you deliver?',
    answerText: 'Yes, we deliver.',
    language: 'en' as const,
    active: true,
    version: 1,
  };

  const fetchImpl: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({ ok: true, answer: canonicalAnswer }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await createConversationSavedAnswer(
    {
      questionPattern: '  Do you deliver?  ',
      answerText: '  Yes, we deliver.  ',
      category: 'delivery',
      language: 'en',
      active: true,
    },
    fetchImpl,
  );

  assert.equal(capturedUrl, '/api/knowledge/saved-answers');
  assert.equal(capturedInit?.method, 'POST');
  assert.equal(capturedInit?.credentials, 'same-origin');
  const body = JSON.parse(String(capturedInit?.body));
  assert.deepEqual(body, {
    questionPattern: 'Do you deliver?',
    answerText: 'Yes, we deliver.',
    category: 'delivery',
    language: 'en',
    active: true,
  });
  assert.equal('merchant_id' in body, false);
  assert.equal('merchantId' in body, false);
  assert.equal('customer_handle' in body, false);
  assert.equal('customer_name' in body, false);
  assert.equal('messages' in body, false);
  assert.deepEqual(result, canonicalAnswer);
});

test('server failure and malformed success both fail closed', async () => {
  const failedFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: false, code: 'CONFLICT', error: 'Conflict' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });

  await assert.rejects(
    createConversationSavedAnswer(
      {
        questionPattern: 'Question',
        answerText: 'Answer',
        category: 'custom',
        language: 'ar',
        active: true,
      },
      failedFetch,
    ),
    /Conflict/,
  );

  const malformedFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, answer: { id: 'incomplete' } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });

  await assert.rejects(
    createConversationSavedAnswer(
      {
        questionPattern: 'Question',
        answerText: 'Answer',
        category: 'custom',
        language: 'ar',
        active: true,
      },
      malformedFetch,
    ),
  );
});
