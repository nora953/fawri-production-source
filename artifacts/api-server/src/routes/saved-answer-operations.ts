import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "../middleware/authSession.js";
import {
  createMerchantSavedAnswer,
  deleteMerchantSavedAnswer,
  listMerchantSavedAnswersPage,
  updateMerchantSavedAnswer,
} from "../services/savedAnswerRuntime.js";
import {
  readExpectedVersion,
  readLanguage,
  readString,
  sendKnowledgeError,
} from "./knowledge-route-utils.js";
import {
  isSavedAnswerCategory,
  type SavedAnswerCategory,
} from "../services/knowledge/types.js";

const router = Router();
router.use(requireMerchantSession);

function readSavedAnswerCategory(value: unknown): SavedAnswerCategory | null {
  const candidate = readString(value, 100);
  return isSavedAnswerCategory(candidate) ? candidate : null;
}

function readSavedAnswerPage(req: Request): {
  limit: number;
  beforeUpdatedAt?: string;
  beforeId?: string;
} | null {
  const rawLimit = readString(req.query.limit, 12);
  const limit = rawLimit ? Number(rawLimit) : 500;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return null;

  const beforeUpdatedAt = readString(req.query.beforeUpdatedAt, 80);
  const beforeId = readString(req.query.beforeId, 160);
  if (Boolean(beforeUpdatedAt) !== Boolean(beforeId)) return null;
  if (
    beforeUpdatedAt &&
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(beforeUpdatedAt)
  ) {
    return null;
  }

  return {
    limit,
    ...(beforeUpdatedAt ? { beforeUpdatedAt } : {}),
    ...(beforeId ? { beforeId } : {}),
  };
}

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const merchantId = getMerchantIdFromSession(res);
  const pageInput = readSavedAnswerPage(req);
  if (!pageInput) {
    res.status(400).json({
      ok: false,
      code: "INVALID_SAVED_ANSWER_PAGE",
      error: "invalid saved answer page",
    });
    return;
  }

  try {
    const page = await listMerchantSavedAnswersPage({
      merchantId,
      ...pageInput,
    });
    res.json({
      ok: true,
      answers: page.answers,
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    sendKnowledgeError(res, error);
  }
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const merchantId = getMerchantIdFromSession(res);
  const questionPattern = readString(req.body?.questionPattern ?? req.body?.question_pattern, 500);
  const answerText = readString(req.body?.answerText ?? req.body?.answer_text, 2_000);
  const language = readLanguage(req.body?.language);
  const category =
    req.body?.category === undefined
      ? "custom"
      : readSavedAnswerCategory(req.body.category);

  if (!category) {
    res.status(400).json({
      ok: false,
      code: "INVALID_SAVED_ANSWER_CATEGORY",
      error: "invalid saved answer category",
    });
    return;
  }
  if (!questionPattern || !answerText || !language) {
    res.status(400).json({
      ok: false,
      code: "INVALID_SAVED_ANSWER",
      error: "questionPattern, answerText, and language are required",
    });
    return;
  }

  try {
    const answer = await createMerchantSavedAnswer({
      merchantId,
      category,
      questionPattern,
      answerText,
      language,
      active: req.body?.active !== false,
    });
    res.status(201).json({ ok: true, answer });
  } catch (error) {
    sendKnowledgeError(res, error);
  }
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const merchantId = getMerchantIdFromSession(res);
  const expectedVersion = readExpectedVersion(req);
  if (!expectedVersion) {
    res.status(428).json({
      ok: false,
      code: "EXPECTED_VERSION_REQUIRED",
      error: "expectedVersion or If-Match is required",
    });
    return;
  }

  const language =
    req.body?.language === undefined ? undefined : readLanguage(req.body.language);
  if (req.body?.language !== undefined && !language) {
    res.status(400).json({ ok: false, code: "INVALID_LANGUAGE", error: "invalid language" });
    return;
  }
  let category: SavedAnswerCategory | undefined;
  if (req.body?.category !== undefined) {
    const parsedCategory = readSavedAnswerCategory(req.body.category);
    if (!parsedCategory) {
      res.status(400).json({
        ok: false,
        code: "INVALID_SAVED_ANSWER_CATEGORY",
        error: "invalid saved answer category",
      });
      return;
    }
    category = parsedCategory;
  }

  try {
    const answer = await updateMerchantSavedAnswer({
      merchantId,
      id: readString(req.params.id, 160),
      expectedVersion,
      category,
      questionPattern:
        req.body?.questionPattern === undefined && req.body?.question_pattern === undefined
          ? undefined
          : readString(req.body?.questionPattern ?? req.body?.question_pattern, 500),
      answerText:
        req.body?.answerText === undefined && req.body?.answer_text === undefined
          ? undefined
          : readString(req.body?.answerText ?? req.body?.answer_text, 2_000),
      language: language || undefined,
      active:
        req.body?.active === undefined ? undefined : req.body.active === true,
    });
    res.json({ ok: true, answer });
  } catch (error) {
    sendKnowledgeError(res, error);
  }
});

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const merchantId = getMerchantIdFromSession(res);
  const expectedVersion = readExpectedVersion(req);
  if (!expectedVersion) {
    res.status(428).json({
      ok: false,
      code: "EXPECTED_VERSION_REQUIRED",
      error: "expectedVersion or If-Match is required",
    });
    return;
  }

  try {
    const answer = await deleteMerchantSavedAnswer({
      merchantId,
      id: readString(req.params.id, 160),
      expectedVersion,
    });
    res.json({ ok: true, deletedId: answer.id });
  } catch (error) {
    sendKnowledgeError(res, error);
  }
});

export default router;
