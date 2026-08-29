import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createSavedAnswer,
  deleteSavedAnswer,
  listSavedAnswers,
  SavedAnswersAuthorityError,
  updateSavedAnswer,
  type MerchantSavedAnswer,
} from '../src/lib/savedAnswersAuthority';

const canonicalAnswer = {
  id: 'saved-1',
  merchantId: 'server-derived-merchant',
  category: 'custom',
  questionPattern: 'Where do you deliver?',
  answerText: 'We deliver across Baghdad.',
  language: 'en',
  source: 'merchant_approved',
  active: true,
  version: 3,
  createdAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z',
};

const uiAnswer: MerchantSavedAnswer = {
  id: canonicalAnswer.id,
  category: canonicalAnswer.category,
  question_pattern: canonicalAnswer.questionPattern,
  answer_text: canonicalAnswer.answerText,
  language: canonicalAnswer.language,
  active: canonicalAnswer.active,
  version: canonicalAnswer.version,
  created_at: canonicalAnswer.createdAt,
  updated_at: canonicalAnswer.updatedAt,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('saved answers list is session-derived canonical authority with truthful parsing', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return jsonResponse({ ok: true, answers: [canonicalAnswer] });
  }) as typeof fetch;

  const answers = await listSavedAnswers(fetchImpl);
  assert.deepEqual(answers, [uiAnswer]);
  assert.equal(String(calls[0]?.input), '/api/knowledge/saved-answers');
  assert.equal(calls[0]?.init?.credentials, 'same-origin');
  assert.equal(calls[0]?.init?.cache, 'no-store');
  assert.equal(String(calls[0]?.input).includes('merchantId='), false);

  const invalidFetch = (async () =>
    jsonResponse({ ok: true, answers: [{ ...canonicalAnswer, version: 0 }] })) as typeof fetch;
  await assert.rejects(
    () => listSavedAnswers(invalidFetch),
    (error: unknown) =>
      error instanceof SavedAnswersAuthorityError &&
      error.code === 'SAVED_ANSWERS_RESPONSE_INVALID',
  );
});

test('saved answers create, update, and delete use canonical versioned mutations', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    if (init?.method === 'DELETE') {
      return jsonResponse({ ok: true, deletedId: canonicalAnswer.id });
    }
    return jsonResponse({ ok: true, answer: { ...canonicalAnswer, version: 4 } });
  }) as typeof fetch;

  await createSavedAnswer(
    {
      category: 'custom',
      question_pattern: 'Question',
      answer_text: 'Answer',
      language: 'en',
      active: true,
    },
    fetchImpl,
  );
  await updateSavedAnswer(uiAnswer, { active: false }, fetchImpl);
  await deleteSavedAnswer(uiAnswer, fetchImpl);

  const createCall = calls[0];
  assert.equal(String(createCall.input), '/api/knowledge/saved-answers');
  assert.equal(createCall.init?.method, 'POST');
  const createBody = JSON.parse(String(createCall.init?.body));
  assert.equal(createBody.merchantId, undefined);
  assert.equal(createBody.questionPattern, 'Question');

  const updateCall = calls[1];
  assert.equal(String(updateCall.input), '/api/knowledge/saved-answers/saved-1');
  assert.equal(updateCall.init?.method, 'PATCH');
  const updateBody = JSON.parse(String(updateCall.init?.body));
  assert.equal(updateBody.expectedVersion, 3);
  assert.equal(updateBody.active, false);
  assert.equal(updateBody.merchantId, undefined);

  const deleteCall = calls[2];
  assert.equal(deleteCall.init?.method, 'DELETE');
  assert.equal(new Headers(deleteCall.init?.headers).get('If-Match'), '3');
});

test('saved answers conflicts and authority failures fail closed', async () => {
  const conflictFetch = (async () =>
    jsonResponse(
      {
        ok: false,
        code: 'VERSION_CONFLICT',
        error: 'saved answer version conflict',
        current: canonicalAnswer,
      },
      409,
    )) as typeof fetch;

  await assert.rejects(
    () => updateSavedAnswer(uiAnswer, { active: false }, conflictFetch),
    (error: unknown) =>
      error instanceof SavedAnswersAuthorityError &&
      error.status === 409 &&
      error.code === 'VERSION_CONFLICT' &&
      error.current?.version === 3,
  );

  const unavailableFetch = (async () =>
    jsonResponse(
      { ok: false, code: 'KNOWLEDGE_POSTGRES_UNAVAILABLE', error: 'unavailable' },
      503,
    )) as typeof fetch;
  await assert.rejects(
    () => listSavedAnswers(unavailableFetch),
    (error: unknown) =>
      error instanceof SavedAnswersAuthorityError && error.status === 503,
  );
});

test('merchant saved answers route no longer depends on retired local authority', async () => {
  const root = new URL('../', import.meta.url);
  const [wrapper, canonicalPage, app, copy] = await Promise.all([
    readFile(new URL('src/pages/dashboard/SavedAnswersPage.tsx', root), 'utf8'),
    readFile(new URL('src/pages/dashboard/CanonicalSavedAnswersPage.tsx', root), 'utf8'),
    readFile(new URL('../api-server/src/app.ts', root), 'utf8'),
    readFile(
      new URL('src/lib/translations/features/pages/dashboard/SavedAnswersAuthority.ts', root),
      'utf8',
    ),
  ]);

  assert.match(wrapper, /CanonicalSavedAnswersPage/);
  assert.doesNotMatch(wrapper, /getCurrentMerchant|\/api\/saved-answers/);
  assert.match(canonicalPage, /listSavedAnswers\(\)/);
  assert.match(canonicalPage, /mutationsAllowed\s*=\s*loadStatus\s*===\s*'ready'/);
  assert.match(canonicalPage, /loadStatus\s*===\s*'unavailable'/);
  assert.doesNotMatch(canonicalPage, /getCurrentMerchant|merchantId=/);

  assert.match(app, /app\.use\("\/api\/knowledge", knowledgeOperationsRouter\)/);
  assert.match(app, /req\.path\s*===\s*"\/api\/saved-answers"/);
  assert.match(app, /res\.status\(410\)/);

  assert.match(copy, /ar:\s*\{/);
  assert.match(copy, /ku:\s*\{/);
  assert.match(copy, /en:\s*\{/);
});
