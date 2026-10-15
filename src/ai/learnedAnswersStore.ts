import fs from "fs/promises";
import path from "path";
import {
  AgentIntent,
  KnowledgeSource,
  LanguageCode,
  LearnedAnswer,
} from "./agentTypes";
import {
  keywordScore,
  makeId,
  normalizeText,
  similarityScore,
} from "./textUtils";

type LearnedAnswerDb = {
  answers: LearnedAnswer[];
};

const LEARNED_ANSWERS_FILE =
  process.env.LEARNED_ANSWERS_FILE ||
  path.join(process.cwd(), "data", "learned-answers.json");

let cache: LearnedAnswerDb | null = null;

async function ensureDataDir() {
  await fs.mkdir(path.dirname(LEARNED_ANSWERS_FILE), { recursive: true });
}

async function loadDb(): Promise<LearnedAnswerDb> {
  if (cache) return cache;

  try {
    const raw = await fs.readFile(LEARNED_ANSWERS_FILE, "utf8");
    cache = JSON.parse(raw) as LearnedAnswerDb;

    if (!Array.isArray(cache.answers)) {
      cache = { answers: [] };
    }

    return cache;
  } catch {
    cache = { answers: [] };
    return cache;
  }
}

async function saveDb(db: LearnedAnswerDb) {
  await ensureDataDir();

  const tmpFile = `${LEARNED_ANSWERS_FILE}.tmp`;

  await fs.writeFile(tmpFile, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmpFile, LEARNED_ANSWERS_FILE);

  cache = db;
}

export async function listLearnedAnswers(
  merchantId: string,
): Promise<LearnedAnswer[]> {
  const db = await loadDb();

  return db.answers.filter((answer) => {
    return answer.merchantId === merchantId || answer.merchantId === "global";
  });
}

export async function findBestLearnedAnswer(params: {
  merchantId: string;
  message: string;
  language: LanguageCode;
  intent?: AgentIntent;
  minScore?: number;
}): Promise<{
  answer: LearnedAnswer | null;
  score: number;
}> {
  const minScore = params.minScore ?? 0.62;
  const answers = await listLearnedAnswers(params.merchantId);

  let bestAnswer: LearnedAnswer | null = null;
  let bestScore = 0;

  for (const answer of answers) {
    if (!answer.safeToAutoReply) continue;

    if (answer.language !== params.language && answer.language !== "unknown") {
      continue;
    }

    if (params.intent && answer.intent !== params.intent) {
      continue;
    }

    const exampleScores = answer.examples.map((example) =>
      similarityScore(params.message, example),
    );

    const bestExampleScore =
      exampleScores.length > 0 ? Math.max(...exampleScores) : 0;

    const bestKeywordScore = keywordScore(params.message, answer.keywords);

    const normalizedMessage = normalizeText(params.message);
    const hasExactExample = answer.examples.some((example) => {
      return normalizedMessage === normalizeText(example);
    });

    const hasIncludedExample = answer.examples.some((example) => {
      const normalizedExample = normalizeText(example);
      return (
        normalizedExample.length >= 4 &&
        normalizedMessage.includes(normalizedExample)
      );
    });

    let finalScore = Math.max(bestExampleScore, bestKeywordScore);

    if (hasIncludedExample) {
      finalScore = Math.max(finalScore, 0.82);
    }

    if (hasExactExample) {
      finalScore = 1;
    }

    finalScore = finalScore * answer.confidence;

    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestAnswer = answer;
    }
  }

  if (bestScore < minScore) {
    return {
      answer: null,
      score: bestScore,
    };
  }

  return {
    answer: bestAnswer,
    score: bestScore,
  };
}

export async function saveLearnedAnswer(input: {
  merchantId: string;
  intent: AgentIntent;
  language: LanguageCode;
  examples: string[];
  keywords: string[];
  reply: string;
  source: KnowledgeSource;
  confidence?: number;
  safeToAutoReply?: boolean;
  requiresHumanApproval?: boolean;
  conditions?: Record<string, string | number | boolean | null>;
}): Promise<LearnedAnswer> {
  const db = await loadDb();
  const now = new Date().toISOString();

  const answer: LearnedAnswer = {
    id: makeId("learned"),
    merchantId: input.merchantId,
    intent: input.intent,
    language: input.language,
    examples: uniqueCleanList(input.examples),
    keywords: uniqueCleanList(input.keywords),
    reply: input.reply.trim(),
    source: input.source,
    confidence: input.confidence ?? 0.9,
    safeToAutoReply: input.safeToAutoReply ?? true,
    requiresHumanApproval: input.requiresHumanApproval ?? false,
    conditions: input.conditions ?? {},
    createdAt: now,
    updatedAt: now,
  };

  db.answers.push(answer);

  await saveDb(db);

  return answer;
}

export async function saveMerchantApprovedAnswer(input: {
  merchantId: string;
  intent: AgentIntent;
  language: LanguageCode;
  customerMessage: string;
  idealReply: string;
  keywords?: string[];
}): Promise<LearnedAnswer> {
  return saveLearnedAnswer({
    merchantId: input.merchantId,
    intent: input.intent,
    language: input.language,
    examples: [input.customerMessage],
    keywords: input.keywords ?? [],
    reply: input.idealReply,
    source: "merchant_approved",
    confidence: 0.96,
    safeToAutoReply: true,
    requiresHumanApproval: false,
  });
}

export async function saveOpenAiGeneratedAnswer(input: {
  merchantId: string;
  intent: AgentIntent;
  language: LanguageCode;
  customerMessage: string;
  generatedReply: string;
  keywords?: string[];
  approvedByMerchant?: boolean;
}): Promise<LearnedAnswer> {
  const approved = input.approvedByMerchant === true;

  return saveLearnedAnswer({
    merchantId: input.merchantId,
    intent: input.intent,
    language: input.language,
    examples: [input.customerMessage],
    keywords: input.keywords ?? [],
    reply: input.generatedReply,
    source: "openai_generated",
    confidence: approved ? 0.92 : 0.72,
    safeToAutoReply: approved,
    requiresHumanApproval: !approved,
  });
}

export async function addExampleToLearnedAnswer(params: {
  answerId: string;
  newExample: string;
}): Promise<LearnedAnswer | null> {
  const db = await loadDb();

  const answer = db.answers.find((item) => item.id === params.answerId);

  if (!answer) return null;

  answer.examples = uniqueCleanList([...answer.examples, params.newExample]);
  answer.updatedAt = new Date().toISOString();

  await saveDb(db);

  return answer;
}

export async function approveLearnedAnswer(params: {
  answerId: string;
}): Promise<LearnedAnswer | null> {
  const db = await loadDb();

  const answer = db.answers.find((item) => item.id === params.answerId);

  if (!answer) return null;

  answer.safeToAutoReply = true;
  answer.requiresHumanApproval = false;
  answer.confidence = Math.max(answer.confidence, 0.9);
  answer.updatedAt = new Date().toISOString();

  await saveDb(db);

  return answer;
}

export async function rejectLearnedAnswer(params: {
  answerId: string;
}): Promise<LearnedAnswer | null> {
  const db = await loadDb();

  const answer = db.answers.find((item) => item.id === params.answerId);

  if (!answer) return null;

  answer.safeToAutoReply = false;
  answer.requiresHumanApproval = false;
  answer.updatedAt = new Date().toISOString();

  await saveDb(db);

  return answer;
}

function uniqueCleanList(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const cleaned = item.trim();
    const key = normalizeText(cleaned);

    if (!cleaned || seen.has(key)) continue;

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}
