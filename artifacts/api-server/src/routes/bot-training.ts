import fs from "fs";
import path from "path";
import { Router, type Request, type Response } from "express";
import { registerMerchantBotTrainingDeletion } from "../services/merchantBotTraining";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "./auth";

type TrainingStatus =
  | "pending_merchant_reply"
  | "pending_review"
  | "approved"
  | "rejected";

type TrainingRequest = {
  id: string;
  merchantId: string;
  customerId: string;
  customerMessage: string;
  normalizedMessage: string;
  detectedIntent: string;
  detectedLanguage: string;
  reason: string;
  suggestedReply?: string | null;
  status: TrainingStatus;
  createdAt: string;
  updatedAt: string;
};

type TrainingRequestsDb = {
  requests: TrainingRequest[];
};

type LearnedAnswer = {
  id: string;
  merchantId: string;
  intent: string;
  language: string;
  examples: string[];
  keywords: string[];
  reply: string;
  source: "merchant_approved" | "openai_generated";
  confidence: number;
  safeToAutoReply: boolean;
  requiresHumanApproval: boolean;
  conditions: Record<string, string | number | boolean | null>;
  trainingRequestId?: string;
  createdAt: string;
  updatedAt: string;
};

type LearnedAnswersDb = {
  answers: LearnedAnswer[];
};

const router = Router();

router.use(requireMerchantSession);

router.get("/requests", (_req: Request, res: Response): void => {
  const merchantId = getMerchantIdFromSession(res);
  const db = readTrainingRequestsDb();

  const requests = db.requests
    .filter((item) => item.merchantId === merchantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({
    ok: true,
    merchantId,
    requests,
  });
});

router.post("/requests/:id/approve", (req: Request, res: Response): void => {
  approveOrUpdateTrainingReply(req, res);
});

router.put("/requests/:id/reply", (req: Request, res: Response): void => {
  approveOrUpdateTrainingReply(req, res);
});

router.patch("/requests/:id/reply", (req: Request, res: Response): void => {
  approveOrUpdateTrainingReply(req, res);
});

router.post("/requests/:id/reject", (req: Request, res: Response): void => {
  const requestId = String(req.params.id || "").trim();
  const merchantId = getMerchantIdFromSession(res);

  const trainingDb = readTrainingRequestsDb();
  const request = trainingDb.requests.find(
    (item) => item.id === requestId && item.merchantId === merchantId,
  );

  if (!request) {
    sendError(res, 404, "training request not found for this merchant");
    return;
  }

  const now = new Date().toISOString();

  request.status = "rejected";
  request.updatedAt = now;

  writeTrainingRequestsDb(trainingDb);

  const learnedDb = readLearnedAnswersDb();
  const learnedIndex = findLearnedAnswerIndex(learnedDb, request);

  if (learnedIndex >= 0) {
    learnedDb.answers[learnedIndex] = {
      ...learnedDb.answers[learnedIndex],
      safeToAutoReply: false,
      requiresHumanApproval: true,
      updatedAt: now,
    };

    writeLearnedAnswersDb(learnedDb);
  }

  res.json({
    ok: true,
    merchantId,
    request,
  });
});

function approveOrUpdateTrainingReply(req: Request, res: Response): void {
  const requestId = String(req.params.id || "").trim();
  const merchantId = getMerchantIdFromSession(res);
  const idealReply = String(req.body?.idealReply || "").trim();

  const keywords = Array.isArray(req.body?.keywords)
    ? req.body.keywords.map(String)
    : [];

  if (!idealReply) {
    sendError(res, 400, "idealReply is required");
    return;
  }

  const trainingDb = readTrainingRequestsDb();
  const request = trainingDb.requests.find(
    (item) => item.id === requestId && item.merchantId === merchantId,
  );

  if (!request) {
    sendError(res, 404, "training request not found for this merchant");
    return;
  }

  const now = new Date().toISOString();

  request.status = "approved";
  request.suggestedReply = idealReply;
  request.updatedAt = now;

  writeTrainingRequestsDb(trainingDb);

  const learnedDb = readLearnedAnswersDb();
  const learnedIndex = findLearnedAnswerIndex(learnedDb, request);
  const mergedKeywords = uniqueCleanList([
    ...keywords,
    ...buildKeywordsFromMessage(request.customerMessage),
  ]);

  let learnedAnswer: LearnedAnswer;

  if (learnedIndex >= 0) {
    const current = learnedDb.answers[learnedIndex];

    learnedAnswer = {
      ...current,
      merchantId: request.merchantId,
      intent: request.detectedIntent,
      language: request.detectedLanguage,
      examples: uniqueCleanList([
        ...(current.examples || []),
        request.customerMessage,
      ]),
      keywords: uniqueCleanList([
        ...(current.keywords || []),
        ...mergedKeywords,
      ]),
      reply: idealReply,
      source: "merchant_approved",
      confidence: 0.96,
      safeToAutoReply: true,
      requiresHumanApproval: false,
      conditions: current.conditions || {},
      trainingRequestId: request.id,
      updatedAt: now,
    };

    learnedDb.answers[learnedIndex] = learnedAnswer;
  } else {
    learnedAnswer = {
      id: makeId("learned"),
      merchantId: request.merchantId,
      intent: request.detectedIntent,
      language: request.detectedLanguage,
      examples: [request.customerMessage],
      keywords: mergedKeywords,
      reply: idealReply,
      source: "merchant_approved",
      confidence: 0.96,
      safeToAutoReply: true,
      requiresHumanApproval: false,
      conditions: {},
      trainingRequestId: request.id,
      createdAt: now,
      updatedAt: now,
    };

    learnedDb.answers.push(learnedAnswer);
  }

  writeLearnedAnswersDb(learnedDb);

  res.json({
    ok: true,
    merchantId,
    request,
    learnedAnswer,
    mode:
      learnedIndex >= 0
        ? "updated_existing_learned_answer"
        : "created_new_learned_answer",
  });
}

function findLearnedAnswerIndex(
  learnedDb: LearnedAnswersDb,
  request: TrainingRequest,
): number {
  const normalizedRequestMessage = normalizeText(request.customerMessage);
  const normalizedIntent = normalizeText(request.detectedIntent);
  const normalizedLanguage = normalizeText(request.detectedLanguage);

  return learnedDb.answers.findIndex((answer) => {
    if (answer.merchantId !== request.merchantId) {
      return false;
    }

    if (answer.trainingRequestId && answer.trainingRequestId === request.id) {
      return true;
    }

    const sameIntent = normalizeText(answer.intent) === normalizedIntent;
    const sameLanguage = normalizeText(answer.language) === normalizedLanguage;

    const hasSameExample = Array.isArray(answer.examples)
      ? answer.examples.some(
          (example) => normalizeText(example) === normalizedRequestMessage,
        )
      : false;

    return sameIntent && sameLanguage && hasSameExample;
  });
}

function readTrainingRequestsDb(): TrainingRequestsDb {
  const filePath = getDataFilePath("training-requests.json");

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as TrainingRequestsDb;

    if (!Array.isArray(data.requests)) {
      return { requests: [] };
    }

    return data;
  } catch {
    return { requests: [] };
  }
}

function writeTrainingRequestsDb(db: TrainingRequestsDb): void {
  const filePath = getDataFilePath("training-requests.json");

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(db, null, 2), "utf8");
}

function readLearnedAnswersDb(): LearnedAnswersDb {
  const filePath = getDataFilePath("learned-answers.json");

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as LearnedAnswersDb;

    if (!Array.isArray(data.answers)) {
      return { answers: [] };
    }

    return data;
  } catch {
    return { answers: [] };
  }
}

function writeLearnedAnswersDb(db: LearnedAnswersDb): void {
  const filePath = getDataFilePath("learned-answers.json");

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(db, null, 2), "utf8");
}

function getDataFilePath(fileName: string): string {
  const candidates = [
    path.resolve(process.cwd(), "data", fileName),
    path.resolve(process.cwd(), "..", "data", fileName),
    path.resolve(process.cwd(), "..", "..", "data", fileName),
    path.resolve("/home/runner/workspace", "data", fileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function sendError(res: Response, statusCode: number, error: string): void {
  res.status(statusCode).json({
    ok: false,
    error,
  });
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ى]/g, "ي")
    .replace(/[^a-z0-9\u0600-\u06FF\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueCleanList(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const cleaned = String(item || "").trim();
    const key = normalizeText(cleaned);

    if (!cleaned || seen.has(key)) continue;

    seen.add(key);
    result.push(cleaned);
  }

  return result.slice(0, 20);
}

function buildKeywordsFromMessage(message: string): string[] {
  return message
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3)
    .slice(0, 8);
}

registerMerchantBotTrainingDeletion((merchantId) => {
  const trainingDb = readTrainingRequestsDb();
  const learnedDb = readLearnedAnswersDb();

  const beforeTraining = trainingDb.requests.length;
  const beforeLearned = learnedDb.answers.length;

  trainingDb.requests = trainingDb.requests.filter(
    (request) => request.merchantId !== merchantId,
  );

  learnedDb.answers = learnedDb.answers.filter(
    (answer) => answer.merchantId !== merchantId,
  );

  const trainingRequests = beforeTraining - trainingDb.requests.length;
  const learnedAnswers = beforeLearned - learnedDb.answers.length;

  if (trainingRequests > 0) {
    writeTrainingRequestsDb(trainingDb);
  }

  if (learnedAnswers > 0) {
    writeLearnedAnswersDb(learnedDb);
  }

  return {
    trainingRequests,
    learnedAnswers,
  };
});

export default router;
