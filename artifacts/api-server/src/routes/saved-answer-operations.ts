import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "../middleware/authSession.js";
import {
  createMerchantSavedAnswer,
  deleteMerchantSavedAnswer,
  listMerchantSavedAnswers,
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

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const merchantId = getMerchantIdFromSession(res);
  try {
    const answers = await listMerchantSavedAnswers(merchantId);
    res.json({ ok: true, answers });
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
