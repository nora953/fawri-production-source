import crypto from "node:crypto";

const DEFAULT_GRAPH_VERSION = "v22.0";

type JsonRecord = Record<string, unknown>;

export type WhatsAppIncomingTextMessage = {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  from: string;
  messageId: string;
  timestamp?: string;
  contactName?: string;
  text: string;
};

export type WhatsAppSendTextResult =
  | {
      ok: true;
      status: number;
      messageId?: string;
    }
  | {
      ok: false;
      status: number;
      errorCode?: string | number;
      errorMessage: string;
    };

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getGraphVersion(): string {
  const configured = String(process.env.META_GRAPH_VERSION || "").trim();
  return configured || DEFAULT_GRAPH_VERSION;
}

/**
 * Parse a WhatsApp Business Platform webhook payload into the small,
 * channel-neutral subset Fawri needs for text-message processing.
 *
 * Non-WhatsApp payloads, status-only updates, unsupported message kinds,
 * and malformed entries are ignored instead of throwing. This keeps the
 * webhook boundary defensive and makes retries safer.
 */
export function parseWhatsAppWebhookPayload(
  body: unknown,
): WhatsAppIncomingTextMessage[] {
  if (!isRecord(body) || body.object !== "whatsapp_business_account") {
    return [];
  }

  const result: WhatsAppIncomingTextMessage[] = [];

  for (const rawEntry of asArray(body.entry)) {
    if (!isRecord(rawEntry)) continue;

    const wabaId = asString(rawEntry.id);

    for (const rawChange of asArray(rawEntry.changes)) {
      if (!isRecord(rawChange)) continue;
      if (rawChange.field && rawChange.field !== "messages") continue;

      const value = rawChange.value;
      if (!isRecord(value)) continue;

      const metadata = isRecord(value.metadata) ? value.metadata : {};
      const phoneNumberId = asString(metadata.phone_number_id);
      const displayPhoneNumber = asString(metadata.display_phone_number) || undefined;

      if (!phoneNumberId) continue;

      const contactNamesByWaId = new Map<string, string>();

      for (const rawContact of asArray(value.contacts)) {
        if (!isRecord(rawContact)) continue;

        const waId = asString(rawContact.wa_id);
        const profile = isRecord(rawContact.profile) ? rawContact.profile : {};
        const name = asString(profile.name);

        if (waId && name) {
          contactNamesByWaId.set(waId, name);
        }
      }

      for (const rawMessage of asArray(value.messages)) {
        if (!isRecord(rawMessage)) continue;
        if (rawMessage.type !== "text") continue;

        const from = asString(rawMessage.from);
        const messageId = asString(rawMessage.id);
        const timestamp = asString(rawMessage.timestamp) || undefined;
        const textObject = isRecord(rawMessage.text) ? rawMessage.text : {};
        const text = asString(textObject.body).trim();

        if (!from || !messageId || !text) continue;

        result.push({
          wabaId,
          phoneNumberId,
          displayPhoneNumber,
          from,
          messageId,
          timestamp,
          contactName: contactNamesByWaId.get(from),
          text,
        });
      }
    }
  }

  return result;
}

/**
 * Verify Meta's X-Hub-Signature-256 value against the exact raw request body.
 * The caller must provide the unmodified bytes received from Meta.
 */
export function verifyMetaWebhookSignature(input: {
  rawBody: Buffer | string;
  signatureHeader: string | undefined;
  appSecret: string;
}): boolean {
  const signatureHeader = String(input.signatureHeader || "").trim();
  const appSecret = String(input.appSecret || "").trim();

  if (!signatureHeader || !appSecret) return false;
  if (!signatureHeader.startsWith("sha256=")) return false;

  const suppliedHex = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;

  const expectedHex = crypto
    .createHmac("sha256", appSecret)
    .update(input.rawBody)
    .digest("hex");

  const supplied = Buffer.from(suppliedHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");

  return (
    supplied.length === expected.length &&
    crypto.timingSafeEqual(supplied, expected)
  );
}

/**
 * Send one plain-text WhatsApp message using a merchant-specific Cloud API
 * phone-number id and access token. Tokens are accepted as arguments so this
 * service never owns or persists credentials.
 */
export async function sendWhatsAppText(input: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
}): Promise<WhatsAppSendTextResult> {
  const phoneNumberId = String(input.phoneNumberId || "").trim();
  const accessToken = String(input.accessToken || "").trim();
  const to = String(input.to || "").replace(/\D/g, "");
  const text = String(input.text || "").trim();

  if (!phoneNumberId || !accessToken || !to || !text) {
    return {
      ok: false,
      status: 0,
      errorMessage: "WhatsApp send parameters are incomplete",
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${getGraphVersion()}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: {
            preview_url: false,
            body: text,
          },
        }),
      },
    );

    const payload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const error =
        isRecord(payload) && isRecord(payload.error) ? payload.error : {};

      return {
        ok: false,
        status: response.status,
        errorCode:
          typeof error.code === "number" || typeof error.code === "string"
            ? error.code
            : undefined,
        errorMessage:
          asString(error.message) || "WhatsApp Cloud API request failed",
      };
    }

    let messageId: string | undefined;

    if (isRecord(payload)) {
      const firstMessage = asArray(payload.messages)[0];
      if (isRecord(firstMessage)) {
        messageId = asString(firstMessage.id) || undefined;
      }
    }

    return {
      ok: true,
      status: response.status,
      messageId,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      errorMessage:
        error instanceof Error
          ? error.message
          : "WhatsApp Cloud API request failed",
    };
  }
}
