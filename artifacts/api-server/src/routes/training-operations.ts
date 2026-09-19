import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "../middleware/authSession.js";
import {
  approveMerchantTrainingRequest,
  createMerchantTrainingRequest,
  listMerchantTrainingRequestsPage,
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

function readTrainingPage(req: Request): {
  limit: number;
  beforeUpdatedAt?: string;
  beforeId?: string;
  search?: string;
  status?: "pending_merchant_reply" | "pending_review" | "approved" | "rejected";
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
  ) return null;

  if (
    (req.query.q !== undefined && typeof req.query.q !== "string") ||
    (req.query.status !== undefined && typeof req.query.status !== "string")
  ) return null;

  const search = readString(req.query.q, 500);
  const rawStatus = readString(req.query.status, 40);
  const status =
    rawStatus === "pending_merchant_reply" ||
    rawStatus === "pending_review" ||
    rawStatus === "approved" ||
    rawStatus === "rejected"
      ? rawStatus
      : undefined;
  if (rawStatus && !status) return null;

  return {
    limit,
    ...(beforeUpdatedAt ? { beforeUpdatedAt } : {}),
    ...(beforeId ? { beforeId } : {}),
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
  };
}

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const merchantId = getMerchantIdFromSession(res);
  const pageInput = readTrainingPage(req);
  if (!pageInput) {
    res.status(400).json({
      ok: false,
      code: "INVALID_TRAINING_REQUEST_PAGE",
      error: "invalid training request page",
    });
    return;
  }
  try {
    const page = await listMerchantTrainingRequestsPage({
      merchantId,
      ...pageInput,
    });
    res.json({
      ok: true,
      requests: page.requests,
      nextCursor: page.nextCursor,
    });
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
