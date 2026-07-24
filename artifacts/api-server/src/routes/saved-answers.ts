import { Router, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { registerMerchantSavedAnswersDeletion } from "../services/merchantSavedAnswers";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "./auth";

type SavedAnswerCategory =
  | "delivery"
  | "payment"
  | "return_exchange"
  | "product"
  | "warranty"
  | "custom";

type Lang = "ar" | "ku" | "en";

type SavedAnswer = {
  id: string;
  merchant_id: string;
  category: SavedAnswerCategory;
  question_pattern: string;
  answer_text: string;
  product_id?: string;
  language: Lang;
  approved: boolean;
  active: boolean;
  created_at: string;
};

type SavedAnswersDb = {
  answers: SavedAnswer[];
};

const router = Router();

const VALID_CATEGORIES = new Set<SavedAnswerCategory>([
  "delivery",
  "payment",
  "return_exchange",
  "product",
  "warranty",
  "custom",
]);

const VALID_LANGUAGES = new Set<Lang>(["ar", "ku", "en"]);

function getDataDir(): string {
  const cwd = process.cwd();

  const candidates = [
    path.resolve(cwd, "data"),
    path.resolve(cwd, "../../data"),
    path.resolve(cwd, "../data"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  fs.mkdirSync(candidates[0], { recursive: true });
  return candidates[0];
}

function getDbPath(): string {
  return path.join(getDataDir(), "saved-answers.json");
}

function readDb(): SavedAnswersDb {
  const filePath = getDbPath();

  if (!fs.existsSync(filePath)) {
    return { answers: [] };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<SavedAnswersDb>;

    if (!Array.isArray(parsed.answers)) {
      return { answers: [] };
    }

    return {
      answers: parsed.answers.filter(isSavedAnswer),
    };
  } catch {
    return { answers: [] };
  }
}

function writeDb(db: SavedAnswersDb): void {
  const filePath = getDbPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(db, null, 2), "utf8");
}

function isSavedAnswer(value: unknown): value is SavedAnswer {
  if (!value || typeof value !== "object") return false;

  const item = value as Partial<SavedAnswer>;

  return (
    typeof item.id === "string" &&
    typeof item.merchant_id === "string" &&
    typeof item.question_pattern === "string" &&
    typeof item.answer_text === "string" &&
    typeof item.category === "string" &&
    VALID_CATEGORIES.has(item.category as SavedAnswerCategory) &&
    typeof item.language === "string" &&
    VALID_LANGUAGES.has(item.language as Lang) &&
    typeof item.approved === "boolean" &&
    typeof item.active === "boolean" &&
    typeof item.created_at === "string"
  );
}

function getStringValue(value: unknown): string {
  if (Array.isArray(value)) return getStringValue(value[0]);
  return String(value || "").trim();
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function normalizeCategory(value: unknown): SavedAnswerCategory {
  const category = getStringValue(value) as SavedAnswerCategory;
  return VALID_CATEGORIES.has(category) ? category : "custom";
}

function normalizeLanguage(value: unknown): Lang {
  const language = getStringValue(value) as Lang;
  return VALID_LANGUAGES.has(language) ? language : "ar";
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function sendError(res: Response, statusCode: number, error: string): void {
  res.status(statusCode).json({
    ok: false,
    error,
  });
}

router.use(requireMerchantSession);

router.get("/", (_req: Request, res: Response): void => {
  const merchantId = getMerchantIdFromSession(res);
  const db = readDb();
  const answers = db.answers.filter(
    (answer) => answer.merchant_id === merchantId,
  );

  res.json({
    ok: true,
    answers,
  });
});

router.post("/", (req: Request, res: Response): void => {
  const merchantId = getMerchantIdFromSession(res);

  const questionPattern = getStringValue(req.body?.question_pattern);
  const answerText = getStringValue(req.body?.answer_text);

  if (!questionPattern) {
    sendError(res, 400, "question_pattern is required");
    return;
  }

  if (!answerText) {
    sendError(res, 400, "answer_text is required");
    return;
  }

  const now = new Date().toISOString();

  const answer: SavedAnswer = {
    id: makeId("saved"),
    merchant_id: merchantId,
    category: normalizeCategory(req.body?.category),
    question_pattern: questionPattern,
    answer_text: answerText,
    product_id: getStringValue(req.body?.product_id) || undefined,
    language: normalizeLanguage(req.body?.language),
    approved: toBoolean(req.body?.approved, true),
    active: toBoolean(req.body?.active, true),
    created_at: now,
  };

  const db = readDb();
  db.answers.push(answer);
  writeDb(db);

  res.status(201).json({
    ok: true,
    answer,
  });
});

router.put("/:id", (req: Request, res: Response): void => {
  const merchantId = getMerchantIdFromSession(res);
  const answerId = getStringValue(req.params.id);

  if (!answerId) {
    sendError(res, 400, "answer id is required");
    return;
  }

  const db = readDb();
  const index = db.answers.findIndex(
    (answer) => answer.id === answerId && answer.merchant_id === merchantId,
  );

  if (index < 0) {
    sendError(res, 404, "saved answer not found for this merchant");
    return;
  }

  const current = db.answers[index];

  const updated: SavedAnswer = {
    ...current,
    category:
      req.body?.category === undefined
        ? current.category
        : normalizeCategory(req.body.category),
    question_pattern:
      req.body?.question_pattern === undefined
        ? current.question_pattern
        : getStringValue(req.body.question_pattern),
    answer_text:
      req.body?.answer_text === undefined
        ? current.answer_text
        : getStringValue(req.body.answer_text),
    product_id:
      req.body?.product_id === undefined
        ? current.product_id
        : getStringValue(req.body.product_id) || undefined,
    language:
      req.body?.language === undefined
        ? current.language
        : normalizeLanguage(req.body.language),
    approved:
      req.body?.approved === undefined
        ? current.approved
        : toBoolean(req.body.approved, current.approved),
    active:
      req.body?.active === undefined
        ? current.active
        : toBoolean(req.body.active, current.active),
  };

  if (!updated.question_pattern) {
    sendError(res, 400, "question_pattern is required");
    return;
  }

  if (!updated.answer_text) {
    sendError(res, 400, "answer_text is required");
    return;
  }

  db.answers[index] = updated;
  writeDb(db);

  res.json({
    ok: true,
    answer: updated,
  });
});

router.delete("/:id", (req: Request, res: Response): void => {
  const merchantId = getMerchantIdFromSession(res);
  const answerId = getStringValue(req.params.id);

  if (!answerId) {
    sendError(res, 400, "answer id is required");
    return;
  }

  const db = readDb();
  const beforeCount = db.answers.length;

  db.answers = db.answers.filter(
    (answer) => !(answer.id === answerId && answer.merchant_id === merchantId),
  );

  if (db.answers.length === beforeCount) {
    sendError(res, 404, "saved answer not found for this merchant");
    return;
  }

  writeDb(db);

  res.json({
    ok: true,
  });
});

registerMerchantSavedAnswersDeletion((merchantId) => {
  const db = readDb();
  const beforeCount = db.answers.length;

  db.answers = db.answers.filter(
    (answer) => answer.merchant_id !== merchantId,
  );

  const deletedCount = beforeCount - db.answers.length;

  if (deletedCount > 0) {
    writeDb(db);
  }

  return deletedCount;
});

export default router;
