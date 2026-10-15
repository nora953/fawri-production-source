import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "../middleware/authSession";
import { ManualConversationError } from "../services/manualConversationRuntime";
import {
  getMerchantOperationalDecisionAuthoritative,
} from "../services/merchantOperationalAccess";
import { reviewMerchantCorrectionAuthoritative } from "../services/merchantCorrectionReview";
import {
  completeManualReplyAuthoritative,
  failManualReplyAuthoritative,
  getServerConversationAuthoritative,
  listServerConversationsAuthoritative,
  prepareManualReplyAuthoritative,
  returnConversationToFawriAuthoritative,
  takeOverConversationAuthoritative,
} from "../services/postgresManualConversationAuthority";

const router = Router();
const GRAPH_VERSION = "v22.0";
const GRAPH_BASE_URL = String(
  process.env.META_GRAPH_BASE_URL || "https://graph.facebook.com",
).replace(/\/$/, "");

type MetaSendResponse = {
  error?: { code?: unknown; message?: unknown };
  message_id?: unknown;
};

function param(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return typeof value === "string" ? value.trim() : "";
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ManualConversationError) {
    res.setHeader("Cache-Control", "no-store");
    res.status(error.status).json({
      ok: false,
      code: error.code,
      error: error.message,
    });
    return;
  }
  console.error("Conversation operation failed", {
    code: "CONVERSATION_OPERATION_FAILED",
  });
  res.setHeader("Cache-Control", "no-store");
  res.status(500).json({
    ok: false,
    code: "CONVERSATION_OPERATION_FAILED",
    error: "conversation operation failed",
  });
}

function idempotencyKey(req: Request): string {
  return String(req.get("Idempotency-Key") || "").trim();
}

router.get(
  "/conversations",
  requireMerchantSession,
  async (_req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const conversations = await listServerConversationsAuthoritative(merchantId);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        merchant_id: merchantId,
        count: conversations.length,
        conversations,
      });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get(
  "/conversations/:merchantId",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      if (param(req.params.merchantId) !== merchantId) {
        res.status(403).json({
          ok: false,
          code: "MERCHANT_ACCESS_FORBIDDEN",
          error: "merchant access is forbidden",
        });
        return;
      }
      const conversations = await listServerConversationsAuthoritative(merchantId);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        merchant_id: merchantId,
        count: conversations.length,
        conversations,
      });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get(
  "/conversation/:conversationId",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const conversation = await getServerConversationAuthoritative(
        merchantId,
        param(req.params.conversationId),
      );
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, conversation });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/conversations/:conversationId/takeover",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const conversation = await takeOverConversationAuthoritative(
        merchantId,
        param(req.params.conversationId),
      );
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, conversation });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/conversations/:conversationId/return-to-fawri",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const conversation = await returnConversationToFawriAuthoritative(
        merchantId,
        param(req.params.conversationId),
      );
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, conversation });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/conversations/:conversationId/messages",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const conversationId = param(req.params.conversationId);
    const requestKey = idempotencyKey(req);
    const messageText = String(req.body?.text || "").trim();

    try {
      const prepared = await prepareManualReplyAuthoritative({
        merchantId,
        conversationId,
        idempotencyKey: requestKey,
        messageText,
      });
      if (prepared.deduplicated && prepared.existingMessage) {
        res.setHeader("Cache-Control", "no-store");
        res.json({
          ok: true,
          deduplicated: true,
          message: prepared.existingMessage,
          conversation: await getServerConversationAuthoritative(
            merchantId,
            conversationId,
          ),
        });
        return;
      }

      // Preparation may outlive the merchant session state by a few milliseconds.
      // Re-read canonical operational access at the provider boundary so a newly
      // rejected/suspended merchant cannot send through a prepared request.
      const access = await getMerchantOperationalDecisionAuthoritative(merchantId);
      if (!access.allowed) {
        await failManualReplyAuthoritative({
          merchantId,
          conversationId,
          idempotencyKey: requestKey,
          errorCode: access.code,
          uncertain: false,
        });
        throw new ManualConversationError(
          access.code,
          access.error,
          access.statusCode,
        );
      }

      let response: globalThis.Response;
      try {
        response = await fetch(
          `${GRAPH_BASE_URL}/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(prepared.pageAccessToken || "")}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { id: prepared.customerId },
              message: { text: messageText },
            }),
          },
        );
      } catch {
        await failManualReplyAuthoritative({
          merchantId,
          conversationId,
          idempotencyKey: requestKey,
          errorCode: "META_MANUAL_REPLY_TRANSPORT_UNCERTAIN",
          uncertain: true,
        });
        throw new ManualConversationError(
          "MANUAL_REPLY_OUTCOME_UNCERTAIN",
          "manual reply delivery outcome is uncertain",
          502,
        );
      }

      const result = (await response.json().catch(() => null)) as
        | MetaSendResponse
        | null;
      if (!response.ok) {
        await failManualReplyAuthoritative({
          merchantId,
          conversationId,
          idempotencyKey: requestKey,
          errorCode: String(
            result?.error?.code || `META_HTTP_${response.status}`,
          ),
          uncertain: false,
        });
        throw new ManualConversationError(
          "MANUAL_REPLY_DELIVERY_FAILED",
          "Meta rejected the manual reply",
          502,
        );
      }

      let message;
      try {
        message = await completeManualReplyAuthoritative({
          merchantId,
          conversationId,
          idempotencyKey: requestKey,
          messageText,
          externalMessageId: String(result?.message_id || "").trim(),
        });
      } catch {
        try {
          await failManualReplyAuthoritative({
            merchantId,
            conversationId,
            idempotencyKey: requestKey,
            errorCode: "MANUAL_REPLY_COMMIT_UNCERTAIN",
            uncertain: true,
          });
        } catch {
          console.error("Could not mark manual reply as uncertain", {
            code: "MANUAL_REPLY_COMMIT_UNCERTAIN",
          });
        }
        throw new ManualConversationError(
          "MANUAL_REPLY_OUTCOME_UNCERTAIN",
          "Meta accepted the reply but local confirmation failed",
          502,
        );
      }

      res.setHeader("Cache-Control", "no-store");
      res.status(201).json({
        ok: true,
        deduplicated: false,
        message,
        conversation: await getServerConversationAuthoritative(
          merchantId,
          conversationId,
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  },
);


router.post(
  "/conversations/:conversationId/messages/:messageId/correction-review",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    const decision = req.body?.decision;
    if (decision !== "approve" && decision !== "dismiss") {
      res.status(400).json({
        ok: false,
        code: "CORRECTION_REVIEW_DECISION_INVALID",
        error: "correction review decision must be approve or dismiss",
      });
      return;
    }

    try {
      const merchantId = getMerchantIdFromSession(res);
      const conversationId = param(req.params.conversationId);
      const messageId = param(req.params.messageId);
      const result = await reviewMerchantCorrectionAuthoritative({
        merchantId,
        conversationId,
        messageId,
        decision,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        result,
        conversation: await getServerConversationAuthoritative(
          merchantId,
          conversationId,
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  },
);

export default router;
