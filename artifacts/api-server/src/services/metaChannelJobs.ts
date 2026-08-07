import type { DurableJob } from "./durableJobQueue";
import {
  completeMetaChannelDisconnect,
  markMetaChannelError,
  readMetaChannelCredential,
} from "./metaChannelRuntime";
import type { MetaCredentialKeyProvider } from "./metaCredentialVault";

export type MetaGraphFetch = typeof fetch;

function text(value: unknown): string {
  return String(value || "").trim();
}
function jobError(
  code: string,
  message: string,
  retryable: boolean,
  requeueSafe = retryable,
): Error & {
  code: string;
  retryable: boolean;
  requeueSafe: boolean;
  safeMessage: string;
} {
  return Object.assign(new Error(message), {
    code,
    retryable,
    requeueSafe,
    safeMessage: message,
  });
}

export function createMetaChannelDisconnectHandler(options: {
  fetchImpl?: MetaGraphFetch;
  keyProvider?: MetaCredentialKeyProvider;
  graphVersion?: string;
} = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const graphVersion = text(options.graphVersion) || "v22.0";

  return async (job: DurableJob): Promise<Record<string, unknown>> => {
    const merchantId = text(job.payload?.merchant_id || job.merchant_id);
    const pageId = text(job.payload?.page_id);
    const platform = text(job.payload?.platform);
    if (
      !merchantId ||
      !pageId ||
      (platform !== "messenger" && platform !== "instagram")
    ) {
      throw jobError(
        "META_CHANNEL_JOB_INVALID",
        "Meta channel disconnect job identity is invalid",
        false,
        false,
      );
    }

    let token: string;
    try {
      token = readMetaChannelCredential({
        merchantId,
        pageId,
        platform,
        keyProvider: options.keyProvider,
      });
    } catch (error) {
      const code = text((error as { code?: unknown }).code);
      if (code === "META_CHANNEL_CREDENTIAL_UNAVAILABLE") {
        const disconnected = completeMetaChannelDisconnect({
          merchantId,
          pageId,
          platform,
        });
        return {
          channel_id: disconnected.id,
          status: disconnected.status,
          already_disconnected: true,
        };
      }
      throw jobError(
        code || "META_CHANNEL_CREDENTIAL_UNAVAILABLE",
        "Meta channel credential is unavailable",
        true,
      );
    }

    let response: Response;
    try {
      response = await fetchImpl(
        `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pageId)}/subscribed_apps`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
    } catch {
      throw jobError(
        "META_CHANNEL_DISCONNECT_TRANSPORT_FAILED",
        "Meta channel disconnect request failed before a confirmed response",
        true,
      );
    }

    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) {
        throw jobError(
          "META_CHANNEL_DISCONNECT_RETRYABLE",
          `Meta channel disconnect returned ${response.status}`,
          true,
        );
      }
      markMetaChannelError({
        merchantId,
        pageId,
        platform,
        code: "META_CHANNEL_DISCONNECT_REJECTED",
      });
      throw jobError(
        "META_CHANNEL_DISCONNECT_REJECTED",
        `Meta channel disconnect returned ${response.status}`,
        false,
        true,
      );
    }

    const disconnected = completeMetaChannelDisconnect({
      merchantId,
      pageId,
      platform,
    });
    return { channel_id: disconnected.id, status: disconnected.status };
  };
}
