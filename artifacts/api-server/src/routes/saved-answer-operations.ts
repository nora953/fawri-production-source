import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "./auth.js";
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

const router = Router();
router.use(requireMerchantSession);

router.get("/", (_req: Request, res: Response): void => {
  const merchantId = getMerchantIdFromSession(res);
  res.json({ ok: true, answers: listMerchantSavedAnswers(merchantId) });
});

router.post("/", (req: Request, res: Response): void => {
  const merchantId = getMerchantIdFromSession(res);
  const questionPattern = readString(req.body?.questionPattern ?? req.body?.question_pattern, 500);
  const answerText = readString(req.body?.answerText ?? req.body?.answer_text, 2_000);
  const language = readLanguage(req.body?.language);

  if (!questionPattern || !answerText || !language) {
    res.status(400).json({
      ok: false,
      code: "INVALID_SAVED_ANSWER",
      error: "questionPattern, answerText, and language are required",
    });
    return;
  }

  try {
    const answer = createMerchantSavedAnswer({
      merchantId,
      category: readString(req.body?.category, 100) || "custom",
      questionPattern,
      answerText,
      language: language || undefined,
      active: req.body?.active !== false,
    });
    res.status(201).json({ ok: true, answer });
  } catch (error) {
    sendKnowledgeError(res, error);
  }
});

router.patch("/:id", (req: Request, res: Response): void => {
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

  try {
    const answer = updateMerchantSavedAnswer({
      merchantId,
      id: readString(req.params.id, 160),
      expectedVersion,
      category:
        req.body?.category === undefined
          ? undefined
          : readString(req.body.category, 100),
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

router.delete("/:id", (req: Request, res: Response): void => {
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
    const answer = deleteMerchantSavedAnswer({
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
