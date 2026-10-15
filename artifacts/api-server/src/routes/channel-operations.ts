import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "../middleware/authSession";
import {
  getMerchantOperationalDecisionAuthoritative,
} from "../services/merchantOperationalAccess";
import {
  listMetaChannelsAuthoritative,
  markMetaChannelErrorAuthoritative,
  requestMetaChannelDisconnectAuthoritative,
} from "../services/postgresMetaChannelAuthority";
import { enqueueDurableJobAuthoritative } from "../services/postgresDurableJobQueue";

const router = Router();

function text(value: unknown): string {
  return String(value || "").trim();
}
function sendError(
  res: Response,
  status: number,
  code: string,
  error: string,
  details: Record<string, unknown> = {},
): Response {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ ok: false, code, error, ...details });
}
async function requireOperationalMerchant(res: Response): Promise<string | null> {
  const merchantId = getMerchantIdFromSession(res);
  const decision = await getMerchantOperationalDecisionAuthoritative(merchantId);
  if (decision.allowed) return merchantId;
  sendError(res, decision.statusCode, decision.code, decision.error);
  return null;
}

router.get(
  "/channels",
  requireMerchantSession,
  async (_req: Request, res: Response) => {
    const merchantId = await requireOperationalMerchant(res);
    if (!merchantId) return;
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      ok: true,
      channels: await listMetaChannelsAuthoritative(merchantId),
    });
  },
);

router.post(
  "/channels/meta/:platform/:pageId/disconnect",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    const merchantId = await requireOperationalMerchant(res);
    if (!merchantId) return;
    const platform = text(req.params.platform);
    const pageId = text(req.params.pageId);
    const expectedVersion = Number(req.body?.expected_version);
    if (platform !== "messenger" && platform !== "instagram") {
      return sendError(res, 400, "META_CHANNEL_PLATFORM_INVALID", "invalid Meta channel platform");
    }
    if (!pageId || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return sendError(
        res,
        400,
        "META_CHANNEL_DISCONNECT_INVALID",
        "page ID and expected version are required",
      );
    }

    let channel: Awaited<ReturnType<typeof requestMetaChannelDisconnectAuthoritative>> | null = null;
    try {
      channel = await requestMetaChannelDisconnectAuthoritative({
        merchantId,
        platform,
        pageId,
        expectedVersion,
      });
      const queued = await enqueueDurableJobAuthoritative({
        type: "meta.channel.disconnect",
        dedupeKey: `meta-channel-disconnect:${channel.id}:${channel.connection_version}`,
        merchantId,
        priority: 20,
        maxAttempts: 5,
        payload: {
          merchant_id: merchantId,
          platform,
          page_id: pageId,
          channel_id: channel.id,
          connection_version: channel.connection_version,
        },
      });
      res.setHeader("Cache-Control", "no-store");
      return res.status(202).json({
        ok: true,
        channel,
        job_id: queued.job.id,
        deduplicated: queued.deduplicated,
      });
    } catch (error) {
      if (channel) {
        try {
          await markMetaChannelErrorAuthoritative({
            merchantId,
            platform,
            pageId,
            code: "META_CHANNEL_QUEUE_UNAVAILABLE",
          });
        } catch {
          // Return the queue failure without exposing storage details.
        }
      }
      const record = error as { code?: unknown; current?: unknown };
      const code = text(record.code) || "META_CHANNEL_DISCONNECT_FAILED";
      if (code === "META_CHANNEL_NOT_FOUND") {
        return sendError(res, 404, code, "Meta channel was not found");
      }
      if (code === "META_CHANNEL_VERSION_CONFLICT") {
        return sendError(res, 409, code, "Meta channel version conflict", {
          current: record.current,
        });
      }
      return sendError(res, 503, code, "Meta channel disconnect is unavailable");
    }
  },
);

export default router;
