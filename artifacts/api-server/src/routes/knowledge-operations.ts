import { Router, type Request, type Response } from "express";
import savedAnswerOperationsRouter from "./saved-answer-operations.js";
import trainingOperationsRouter from "./training-operations.js";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "../middleware/authSession.js";
import { getKnowledgeDecisionEngine } from "../services/ai/knowledgeDecisionEngine.js";
import { getPostgresKnowledgeManagementRuntime } from "../services/knowledge/postgresKnowledgeManagementRuntime.js";
import { PostgresFawriEncyclopediaResolver } from "../services/knowledge/fawriEncyclopedia.js";
import {
  getMerchantResponseStyleAuthoritative,
  MerchantResponseStyleError,
  updateMerchantResponseStyleAuthoritative,
} from "../services/merchantResponseStyle.js";
import { readLanguage, readString, sendKnowledgeError } from "./knowledge-route-utils.js";
import "../services/knowledge/knowledgeLifecycle.js";

const router = Router();
router.use(requireMerchantSession);

function readLearnedAnswerPage(req: Request): {
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

function readKnowledgeAuditPage(req: Request): {
  limit: number;
  beforeCreatedAt?: string;
  beforeId?: string;
} | null {
  const rawLimit = readString(req.query.limit, 12);
  const limit = rawLimit ? Number(rawLimit) : 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return null;

  const beforeCreatedAt = readString(req.query.beforeCreatedAt, 80);
  const beforeId = readString(req.query.beforeId, 160);
  if (Boolean(beforeCreatedAt) !== Boolean(beforeId)) return null;
  if (
    beforeCreatedAt &&
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(beforeCreatedAt)
  ) {
    return null;
  }

  return {
    limit,
    ...(beforeCreatedAt ? { beforeCreatedAt } : {}),
    ...(beforeId ? { beforeId } : {}),
  };
}


router.get("/runtime", (_req: Request, res: Response): void => {
  const engine = getKnowledgeDecisionEngine();
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true,
    engine: {
      id: engine.engineId,
      authority: engine.authorityId,
      legacyFallbackEnabled: engine.legacyFallbackEnabled,
      liveAiTransportEnabled: engine.liveAiTransportEnabled,
      precedence: [
        "database_fact",
        "approved_saved_answer",
        "semantic_retrieval",
        "fawri_encyclopedia",
        "constrained_ai_fallback",
        "handoff_or_no_answer",
      ],
      supportedLanguages: ["ar", "ku", "en"],
      generatedKnowledgeRequiresApproval: true,
      merchantPolicyAuthority: "postgresql_server_only",
      semanticAuthority: "postgresql_tenant_filtered_vectors",
      customerContentLogging: "digest_and_length_only",
    },
  });
});

function sendResponseStyleError(
  res: Response,
  error: unknown,
): void {
  res.setHeader("Cache-Control", "no-store");
  if (error instanceof MerchantResponseStyleError) {
    res.status(error.status).json({
      ok: false,
      code: error.code,
      error: error.message,
      ...(error.current ? { current: error.current } : {}),
    });
    return;
  }
  sendKnowledgeError(res, error);
}

router.get("/response-style", async (_req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = getMerchantIdFromSession(res);
    const style = await getMerchantResponseStyleAuthoritative(merchantId);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, style });
  } catch (error) {
    sendResponseStyleError(res, error);
  }
});

router.patch("/response-style", async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = getMerchantIdFromSession(res);
    const style = await updateMerchantResponseStyleAuthoritative({
      merchantId,
      expectedVersion: req.body?.expectedVersion,
      patch: req.body?.style,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, style });
  } catch (error) {
    sendResponseStyleError(res, error);
  }
});

router.post("/decision", async (req: Request, res: Response): Promise<void> => {
  const merchantId = getMerchantIdFromSession(res);
  const customerText = readString(req.body?.customerText, 2_000);
  const languageHint =
    req.body?.languageHint === undefined
      ? undefined
      : readLanguage(req.body.languageHint);
  if (!customerText || (req.body?.languageHint !== undefined && !languageHint)) {
    res.status(400).json({
      ok: false,
      code: "INVALID_DECISION_INPUT",
      error: "customerText is required and languageHint must be ar, ku, or en",
    });
    return;
  }

  try {
    const decision = await getKnowledgeDecisionEngine().decide({
      merchantId,
      customerText,
      languageHint: languageHint || undefined,
      requestId: readString(req.body?.requestId, 160) || undefined,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, decision });
  } catch (error) {
    sendKnowledgeError(res, error);
  }
});

router.get("/encyclopedia", async (req: Request, res: Response): Promise<void> => {
  const merchantId = getMerchantIdFromSession(res);
  const language = readLanguage(req.query.language);
  if (!language) {
    res.status(400).json({
      ok: false,
      code: "INVALID_ENCYCLOPEDIA_LANGUAGE",
      error: "language must be ar, ku, or en",
    });
    return;
  }

  try {
    const articles = await new PostgresFawriEncyclopediaResolver().listForMerchant({
      merchantId,
      language,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, articles });
  } catch (error) {
    sendKnowledgeError(res, error);
  }
});

router.get("/learned-answers", async (req: Request, res: Response): Promise<void> => {
  const merchantId = getMerchantIdFromSession(res);
  const pageInput = readLearnedAnswerPage(req);
  if (!pageInput) {
    res.status(400).json({
      ok: false,
      code: "INVALID_LEARNED_ANSWER_PAGE",
      error: "invalid learned answer page",
    });
    return;
  }

  try {
    const page = await getPostgresKnowledgeManagementRuntime().listLearnedAnswersPage(
      merchantId,
      pageInput,
    );
    res.json({
      ok: true,
      answers: page.answers,
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    sendKnowledgeError(res, error);
  }
});

router.get("/audit", async (req: Request, res: Response): Promise<void> => {
  const merchantId = getMerchantIdFromSession(res);
  const pageInput = readKnowledgeAuditPage(req);
  if (!pageInput) {
    res.status(400).json({
      ok: false,
      code: "INVALID_KNOWLEDGE_AUDIT_PAGE",
      error: "invalid knowledge audit page",
    });
    return;
  }

  try {
    const page = await getPostgresKnowledgeManagementRuntime().listAuditEventsPage(
      merchantId,
      pageInput,
    );
    res.json({
      ok: true,
      events: page.events,
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    sendKnowledgeError(res, error);
  }
});

router.use("/saved-answers", savedAnswerOperationsRouter);
router.use("/training-requests", trainingOperationsRouter);

export default router;
