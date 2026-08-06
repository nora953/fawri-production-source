import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "./auth";
import {
  completeManualReply,
  failManualReply,
  getServerConversation,
  listServerConversations,
  ManualConversationError,
  prepareManualReply,
  returnConversationToFawri,
  takeOverConversation,
} from "../services/manualConversationRuntime";

const router = Router();
const GRAPH_VERSION = "v22.0";
const GRAPH_BASE_URL = String(
  process.env.META_GRAPH_BASE_URL || "https://graph.facebook.com",
).replace(/\/$/, "");

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
  console.error("Conversation operation failed:", error);
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
  (_req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const conversations = listServerConversations(merchantId);
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
  (req: Request, res: Response) => {
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
      const conversations = listServerConversations(merchantId);
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
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const conversation = getServerConversation(
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
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const conversation = takeOverConversation(
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
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const conversation = returnConversationToFawri(
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
      const prepared = prepareManualReply({
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
          conversation: getServerConversation(merchantId, conversationId),
        });
        return;
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
      } catch (error) {
        failManualReply({
          merchantId,
          conversationId,
          idempotencyKey: requestKey,
          errorCode: "META_MANUAL_REPLY_TRANSPORT_UNCERTAIN",
          uncertain: true,
        });
        throw new ManualConversationError(
          "MANUAL_REPLY_OUTCOME_UNCERTAIN",
          `manual reply delivery outcome is uncertain: ${String(error)}`,
          502,
        );
      }

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        failManualReply({
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
          String(result?.error?.message || "Meta rejected the manual reply"),
          502,
        );
      }

      let message;
      try {
        message = completeManualReply({
          merchantId,
          conversationId,
          idempotencyKey: requestKey,
          messageText,
          externalMessageId: String(result?.message_id || "").trim(),
        });
      } catch (error) {
        try {
          failManualReply({
            merchantId,
            conversationId,
            idempotencyKey: requestKey,
            errorCode: "MANUAL_REPLY_COMMIT_UNCERTAIN",
            uncertain: true,
          });
        } catch (markError) {
          console.error("Could not mark manual reply as uncertain:", markError);
        }
        throw new ManualConversationError(
          "MANUAL_REPLY_OUTCOME_UNCERTAIN",
          `Meta accepted the reply but local confirmation failed: ${String(error)}`,
          502,
        );
      }

      res.setHeader("Cache-Control", "no-store");
      res.status(201).json({
        ok: true,
        deduplicated: false,
        message,
        conversation: getServerConversation(merchantId, conversationId),
      });
    } catch (error) {
      sendError(res, error);
    }
  },
);

export default router;
