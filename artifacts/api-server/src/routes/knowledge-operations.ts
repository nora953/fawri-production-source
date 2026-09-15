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

router.get("/learned-answers", async (_req: Request, res: Response): Promise<void> => {
  const merchantId = getMerchantIdFromSession(res);
  try {
    const answers = await getPostgresKnowledgeManagementRuntime().listLearnedAnswers(merchantId);
    res.json({ ok: true, answers });
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
