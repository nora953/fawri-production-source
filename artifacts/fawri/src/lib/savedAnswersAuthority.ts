export type SavedAnswerLanguage = 'ar' | 'ku' | 'en';

export type MerchantSavedAnswer = {
  id: string;
  category: string;
  question_pattern: string;
  answer_text: string;
  language: SavedAnswerLanguage;
  active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export type SavedAnswerInput = {
  category: string;
  question_pattern: string;
  answer_text: string;
  language: SavedAnswerLanguage;
  active: boolean;
};

type AuthorityBody = {
  ok?: boolean;
  answers?: unknown[];
  answer?: unknown;
  current?: unknown;
  code?: string;
  error?: string;
};

export class SavedAnswersAuthorityError extends Error {
  readonly code: string;
  readonly status: number;
  readonly current: MerchantSavedAnswer | null;

  constructor(input: {
    message: string;
    code?: string;
    status: number;
    current?: MerchantSavedAnswer | null;
  }) {
    super(input.message);
    this.name = 'SavedAnswersAuthorityError';
    this.code = input.code || 'SAVED_ANSWERS_AUTHORITY_UNAVAILABLE';
    this.status = input.status;
    this.current = input.current || null;
  }
}

const API_PATH = '/api/knowledge/saved-answers';

function isLanguage(value: unknown): value is SavedAnswerLanguage {
  return value === 'ar' || value === 'ku' || value === 'en';
}

function normalizeCanonicalSavedAnswer(value: unknown): MerchantSavedAnswer | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const answer = value as Record<string, unknown>;
  if (
    typeof answer.id !== 'string' ||
    !answer.id ||
    typeof answer.category !== 'string' ||
    typeof answer.questionPattern !== 'string' ||
    typeof answer.answerText !== 'string' ||
    !isLanguage(answer.language) ||
    typeof answer.active !== 'boolean' ||
    typeof answer.version !== 'number' ||
    !Number.isInteger(answer.version) ||
    answer.version <= 0 ||
    typeof answer.createdAt !== 'string' ||
    typeof answer.updatedAt !== 'string'
  ) {
    return null;
  }

  return {
    id: answer.id,
    category: answer.category,
    question_pattern: answer.questionPattern,
    answer_text: answer.answerText,
    language: answer.language,
    active: answer.active,
    version: answer.version,
    created_at: answer.createdAt,
    updated_at: answer.updatedAt,
  };
}

async function readBody(response: Response): Promise<AuthorityBody | null> {
  return response.json().catch(() => null) as Promise<AuthorityBody | null>;
}

function makeAuthorityError(
  response: Response,
  body: AuthorityBody | null,
): SavedAnswersAuthorityError {
  const current = normalizeCanonicalSavedAnswer(body?.current);
  return new SavedAnswersAuthorityError({
    status: response.status,
    code: typeof body?.code === 'string' ? body.code : undefined,
    message:
      typeof body?.error === 'string' && body.error.trim()
        ? body.error
        : 'Saved answers authority request failed',
    current,
  });
}

function requestInit(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  return {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers,
  };
}

export async function listSavedAnswers(
  fetchImpl: typeof fetch = fetch,
): Promise<MerchantSavedAnswer[]> {
  const response = await fetchImpl(API_PATH, requestInit());
  const body = await readBody(response);
  if (!response.ok || body?.ok !== true || !Array.isArray(body.answers)) {
    throw makeAuthorityError(response, body);
  }

  const answers = body.answers.map(normalizeCanonicalSavedAnswer);
  if (answers.some(answer => answer === null)) {
    throw new SavedAnswersAuthorityError({
      status: response.status,
      code: 'SAVED_ANSWERS_RESPONSE_INVALID',
      message: 'Saved answers authority returned an invalid response',
    });
  }

  return (answers as MerchantSavedAnswer[]).sort(
    (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
  );
}

export async function createSavedAnswer(
  input: SavedAnswerInput,
  fetchImpl: typeof fetch = fetch,
): Promise<MerchantSavedAnswer> {
  const response = await fetchImpl(
    API_PATH,
    requestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: input.category.trim() || 'custom',
        questionPattern: input.question_pattern.trim(),
        answerText: input.answer_text.trim(),
        language: input.language,
        active: input.active,
      }),
    }),
  );
  const body = await readBody(response);
  const answer = normalizeCanonicalSavedAnswer(body?.answer);
  if (!response.ok || body?.ok !== true || !answer) {
    throw makeAuthorityError(response, body);
  }
  return answer;
}

export async function updateSavedAnswer(
  answer: MerchantSavedAnswer,
  patch: Partial<SavedAnswerInput>,
  fetchImpl: typeof fetch = fetch,
): Promise<MerchantSavedAnswer> {
  const response = await fetchImpl(
    `${API_PATH}/${encodeURIComponent(answer.id)}`,
    requestInit({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: answer.version,
        ...(patch.category === undefined
          ? {}
          : { category: patch.category.trim() }),
        ...(patch.question_pattern === undefined
          ? {}
          : { questionPattern: patch.question_pattern.trim() }),
        ...(patch.answer_text === undefined
          ? {}
          : { answerText: patch.answer_text.trim() }),
        ...(patch.language === undefined ? {} : { language: patch.language }),
        ...(patch.active === undefined ? {} : { active: patch.active }),
      }),
    }),
  );
  const body = await readBody(response);
  const updated = normalizeCanonicalSavedAnswer(body?.answer);
  if (!response.ok || body?.ok !== true || !updated) {
    throw makeAuthorityError(response, body);
  }
  return updated;
}

export async function deleteSavedAnswer(
  answer: MerchantSavedAnswer,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(
    `${API_PATH}/${encodeURIComponent(answer.id)}`,
    requestInit({
      method: 'DELETE',
      headers: { 'If-Match': String(answer.version) },
    }),
  );
  const body = await readBody(response);
  if (!response.ok || body?.ok !== true) {
    throw makeAuthorityError(response, body);
  }
}
