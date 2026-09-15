import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "../middleware/authSession.js";
import {
  approveMerchantTrainingRequest,
  createMerchantTrainingRequest,
  listMerchantTrainingRequests,
  proposeMerchantTrainingReply,
  rejectMerchantTrainingRequest,
} from "../services/trainingRuntime.js";
import {
  readExpectedVersion,
  readLanguage,
  readString,
  sendKnowledgeError,
} from "./knowledge-route-utils.js";

const router = Router();
router.use(requireMerchantSession);

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const merchantId = getMerchantIdFromSession(res);
  try {
    const requests = await listMerchantTrainingRequests(merchantId);
    res.json({ ok: true, requests });
  } catch (error) {
    sendKnowledgeError(res, error);
  }
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const merchantId = getMerchantIdFromSession(res);
  const customerText = readString(req.body?.customerText, 2_000);
  const reason = readString(req.body?.reason, 300) || "merchant_created_training_request";
  const language =
    req.body?.detectedLanguage === undefined
      ? undefined
      : readLanguage(req.body.detectedLanguage);
  if (!customerText || (req.body?.detectedLanguage !== undefined && !language)) {
    res.status(400).json({
      ok: false,
      code: "INVALID_TRAINING_REQUEST",
      error: "customerText is required and detectedLanguage must be ar, ku, or en",
    });
    return;
  }

  try {
    const request = await createMerchantTrainingRequest({
      merchantId,
      customerText,
      detectedIntent: readString(req.body?.detectedIntent, 100) || "unknown",
      detectedLanguage: language || undefined,
      reason,
    });
    res.status(201).json({ ok: true, request });
  } catch (error) {
    sendKnowledgeError(res, error);
  }
});

router.post("/:id/propose", async (req: Request, res: Response): Promise<void> => {
  const merchantId = getMerchantIdFromSession(res);
  const expectedVersion = readExpectedVersion(req);
  const suggestedReply = readString(req.body?.suggestedReply, 2_000);
  const source = "merchant_draft" as const;
  if (!expectedVersion || !suggestedReply) {
    res.status(expectedVersion ? 400 : 428).json({
      ok: false,
      code: expectedVersion ? "SUGGESTED_REPLY_REQUIRED" : "EXPECTED_VERSION_REQUIRED",
      error: expectedVersion ? "suggestedReply is required" : "expectedVersion or If-Match is required",
    });
    return;
  }

  try {
    const request = await proposeMerchantTrainingReply({
      merchantId,
      id: readString(req.params.id, 160),
      expectedVersion,
      suggestedReply,
      source,
    });
    res.json({ ok: true, request });
  } catch (error) {
    sendKnowledgeError(res, error);
  }
});

router.post("/:id/approve", async (req: Request, res: Response): Promise<void> => {
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
    const result = await approveMerchantTrainingRequest({
      merchantId,
      id: readString(req.params.id, 160),
      expectedVersion,
      approvedAnswer:
        req.body?.approvedAnswer === undefined
          ? undefined
          : readString(req.body.approvedAnswer, 2_000),
      keywords: Array.isArray(req.body?.keywords)
        ? req.body.keywords.map((item: unknown) => readString(item, 160))
        : [],
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    sendKnowledgeError(res, error);
  }
});

router.post("/:id/reject", async (req: Request, res: Response): Promise<void> => {
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
    const request = await rejectMerchantTrainingRequest({
      merchantId,
      id: readString(req.params.id, 160),
      expectedVersion,
      reason: readString(req.body?.reason, 300),
    });
    res.json({ ok: true, request });
  } catch (error) {
    sendKnowledgeError(res, error);
  }
});

export default router;
