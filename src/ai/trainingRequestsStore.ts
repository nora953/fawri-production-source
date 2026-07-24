import fs from "fs/promises";
import path from "path";
import { AgentIntent, LanguageCode, TrainingRequest } from "./agentTypes";
import { makeId, normalizeText } from "./textUtils";
import { saveMerchantApprovedAnswer } from "./learnedAnswersStore";

type TrainingRequestsDb = {
  requests: TrainingRequest[];
};

const TRAINING_REQUESTS_FILE =
  process.env.TRAINING_REQUESTS_FILE ||
  path.join(process.cwd(), "data", "training-requests.json");

let cache: TrainingRequestsDb | null = null;

async function ensureDataDir() {
  await fs.mkdir(path.dirname(TRAINING_REQUESTS_FILE), { recursive: true });
}

async function loadDb(): Promise<TrainingRequestsDb> {
  if (cache) return cache;

  try {
    const raw = await fs.readFile(TRAINING_REQUESTS_FILE, "utf8");
    cache = JSON.parse(raw) as TrainingRequestsDb;

    if (!Array.isArray(cache.requests)) {
      cache = { requests: [] };
    }

    return cache;
  } catch {
    cache = { requests: [] };
    return cache;
  }
}

async function saveDb(db: TrainingRequestsDb) {
  await ensureDataDir();

  const tmpFile = `${TRAINING_REQUESTS_FILE}.tmp`;

  await fs.writeFile(tmpFile, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmpFile, TRAINING_REQUESTS_FILE);

  cache = db;
}

export async function createTrainingRequest(input: {
  merchantId: string;
  customerId: string;
  customerMessage: string;
  detectedIntent: AgentIntent;
  detectedLanguage: LanguageCode;
  reason: string;
  suggestedReply?: string | null;
}): Promise<TrainingRequest> {
  const db = await loadDb();

  const normalizedMessage = normalizeText(input.customerMessage);
  const now = new Date().toISOString();

  const existingPending = db.requests.find((request) => {
    return (
      request.merchantId === input.merchantId &&
      request.normalizedMessage === normalizedMessage &&
      request.status !== "approved" &&
      request.status !== "rejected"
    );
  });

  if (existingPending) {
    existingPending.updatedAt = now;

    if (input.suggestedReply && !existingPending.suggestedReply) {
      existingPending.suggestedReply = input.suggestedReply;
    }

    await saveDb(db);
    return existingPending;
  }

  const request: TrainingRequest = {
    id: makeId("training"),
    merchantId: input.merchantId,
    customerId: input.customerId,
    customerMessage: input.customerMessage,
    normalizedMessage,
    detectedIntent: input.detectedIntent,
    detectedLanguage: input.detectedLanguage,
    reason: input.reason,
    suggestedReply: input.suggestedReply ?? null,
    status: input.suggestedReply ? "pending_review" : "pending_merchant_reply",
    createdAt: now,
    updatedAt: now,
  };

  db.requests.push(request);

  await saveDb(db);

  return request;
}

export async function listTrainingRequests(input: {
  merchantId: string;
  status?:
    | "pending_merchant_reply"
    | "pending_review"
    | "approved"
    | "rejected";
}): Promise<TrainingRequest[]> {
  const db = await loadDb();

  return db.requests
    .filter((request) => {
      if (request.merchantId !== input.merchantId) return false;
      if (input.status && request.status !== input.status) return false;
      return true;
    })
    .sort((a, b) => {
      return b.createdAt.localeCompare(a.createdAt);
    });
}

export async function getTrainingRequest(
  requestId: string,
): Promise<TrainingRequest | null> {
  const db = await loadDb();

  return db.requests.find((request) => request.id === requestId) ?? null;
}

export async function attachSuggestedReply(input: {
  requestId: string;
  suggestedReply: string;
}): Promise<TrainingRequest | null> {
  const db = await loadDb();

  const request = db.requests.find((item) => item.id === input.requestId);

  if (!request) return null;

  request.suggestedReply = input.suggestedReply.trim();
  request.status = "pending_review";
  request.updatedAt = new Date().toISOString();

  await saveDb(db);

  return request;
}

export async function approveTrainingRequest(input: {
  requestId: string;
  idealReply: string;
  keywords?: string[];
}): Promise<TrainingRequest | null> {
  const db = await loadDb();

  const request = db.requests.find((item) => item.id === input.requestId);

  if (!request) return null;

  await saveMerchantApprovedAnswer({
    merchantId: request.merchantId,
    intent: request.detectedIntent,
    language: request.detectedLanguage,
    customerMessage: request.customerMessage,
    idealReply: input.idealReply,
    keywords: input.keywords ?? [],
  });

  request.status = "approved";
  request.suggestedReply = input.idealReply;
  request.updatedAt = new Date().toISOString();

  await saveDb(db);

  return request;
}

export async function rejectTrainingRequest(input: {
  requestId: string;
}): Promise<TrainingRequest | null> {
  const db = await loadDb();

  const request = db.requests.find((item) => item.id === input.requestId);

  if (!request) return null;

  request.status = "rejected";
  request.updatedAt = new Date().toISOString();

  await saveDb(db);

  return request;
}
