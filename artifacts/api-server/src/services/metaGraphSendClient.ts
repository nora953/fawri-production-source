export const DEFAULT_META_GRAPH_BASE_URL = "https://graph.facebook.com";
export const DEFAULT_META_GRAPH_VERSION = "v22.0";
export const DEFAULT_META_SEND_TIMEOUT_MS = 15_000;

export type MetaGraphTextSendOutcome =
  | {
      status: "sent";
      providerMessageId: string;
      recipientId: string;
    }
  | {
      status: "confirmed_failed";
      code: string;
      httpStatus: number;
    }
  | {
      status: "uncertain";
      code: string;
      httpStatus?: number;
    };

type MetaGraphSendBody = {
  recipient_id?: unknown;
  message_id?: unknown;
  error?: {
    code?: unknown;
    error_subcode?: unknown;
  };
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function safeId(value: unknown, name: string): string {
  const result = text(value);
  if (!result || result.length > 200 || /[\s/?#]/.test(result)) {
    throw Object.assign(new Error(`${name} is invalid`), {
      code: "META_GRAPH_SEND_INPUT_INVALID",
    });
  }
  return result;
}

function safeMessage(value: unknown): string {
  const result = text(value);
  if (!result || result.length > 2_000) {
    throw Object.assign(new Error("Meta message text is invalid"), {
      code: "META_GRAPH_SEND_INPUT_INVALID",
    });
  }
  return result;
}

function safeToken(value: unknown): string {
  const result = text(value);
  if (!result || result.length > 8_192) {
    throw Object.assign(new Error("Meta page credential is unavailable"), {
      code: "META_PAGE_TOKEN_UNAVAILABLE",
    });
  }
  return result;
}

function graphBaseUrl(value: unknown): string {
  const raw = text(value) || DEFAULT_META_GRAPH_BASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw Object.assign(new Error("Meta Graph base URL is invalid"), {
      code: "META_GRAPH_CONFIGURATION_INVALID",
    });
  }
  const localHttp =
    parsed.protocol === "http:" &&
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
  if (parsed.protocol !== "https:" && !localHttp) {
    throw Object.assign(new Error("Meta Graph base URL must use HTTPS"), {
      code: "META_GRAPH_CONFIGURATION_INVALID",
    });
  }
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function graphVersion(value: unknown): string {
  const result = text(value) || DEFAULT_META_GRAPH_VERSION;
  if (!/^v\d{1,3}\.\d{1,3}$/.test(result)) {
    throw Object.assign(new Error("Meta Graph version is invalid"), {
      code: "META_GRAPH_CONFIGURATION_INVALID",
    });
  }
  return result;
}

function timeoutMs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 60_000) {
    return DEFAULT_META_SEND_TIMEOUT_MS;
  }
  return parsed;
}

function providerFailureCode(body: MetaGraphSendBody | null, status: number): string {
  const code = Number(body?.error?.code);
  const subcode = Number(body?.error?.error_subcode);
  const codePart = Number.isInteger(code) && code > 0 ? `_${code}` : "";
  const subcodePart =
    Number.isInteger(subcode) && subcode > 0 ? `_${subcode}` : "";
  return `META_GRAPH_HTTP_${status}${codePart}${subcodePart}`.slice(0, 160);
}

function responseIsConfirmedFailure(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429;
}

export async function sendMetaGraphTextMessage(input: {
  pageId: string;
  recipientId: string;
  messageText: string;
  pageAccessToken: string;
  graphBaseUrl?: string;
  graphVersion?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<MetaGraphTextSendOutcome> {
  const pageId = safeId(input.pageId, "Meta page id");
  const recipientId = safeId(input.recipientId, "Meta recipient id");
  const messageText = safeMessage(input.messageText);
  const token = safeToken(input.pageAccessToken);
  const baseUrl = graphBaseUrl(
    input.graphBaseUrl ?? process.env.META_GRAPH_BASE_URL,
  );
  const version = graphVersion(
    input.graphVersion ?? process.env.META_GRAPH_VERSION,
  );
  const requestTimeoutMs = timeoutMs(
    input.timeoutMs ?? process.env.META_GRAPH_SEND_TIMEOUT_MS,
  );
  const fetchImpl = input.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  timer.unref?.();

  let response: Response;
  try {
    response = await fetchImpl(
      `${baseUrl}/${encodeURIComponent(version)}/${encodeURIComponent(pageId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          messaging_type: "RESPONSE",
          message: { text: messageText },
        }),
        signal: controller.signal,
      },
    );
  } catch {
    return {
      status: "uncertain",
      code: "META_GRAPH_TRANSPORT_UNCERTAIN",
    };
  } finally {
    clearTimeout(timer);
  }

  const body = (await response.json().catch(() => null)) as MetaGraphSendBody | null;
  const providerMessageId = text(body?.message_id);
  if (response.ok && providerMessageId) {
    return {
      status: "sent",
      providerMessageId,
      recipientId: text(body?.recipient_id) || recipientId,
    };
  }

  if (responseIsConfirmedFailure(response.status)) {
    return {
      status: "confirmed_failed",
      code: providerFailureCode(body, response.status),
      httpStatus: response.status,
    };
  }

  return {
    status: "uncertain",
    code: response.ok
      ? "META_GRAPH_SUCCESS_WITHOUT_MESSAGE_ID"
      : providerFailureCode(body, response.status),
    httpStatus: response.status,
  };
}
