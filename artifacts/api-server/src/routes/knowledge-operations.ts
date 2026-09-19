import { Router, type Request, type Response } from "express";
import savedAnswerOperationsRouter from "./saved-answer-operations.js";
import trainingOperationsRouter from "./training-operations.js";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "../middleware/authSession.js";
import { getKnowledgeDecisionEngine } from "../services/ai/knowledgeDecisionEngine.js";
import { getPostgresKnowledgeManagementRuntime } from "../services/knowledge/postgresKnowledgeManagementRuntime.js";
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
  const limit = Number(req.query.limit);
  try {
    const events = await getPostgresKnowledgeManagementRuntime().listAuditEvents(
      merchantId,
      Number.isInteger(limit) ? limit : 100,
    );
    res.json({ ok: true, events });
  } catch (error) {
    sendKnowledgeError(res, error);
  }
});

router.use("/saved-answers", savedAnswerOperationsRouter);
router.use("/training-requests", trainingOperationsRouter);

export default router;
