import type { OtpPurpose } from "./authSecurityStore";
import { productionReleaseGateRequired } from "./productionReleaseReadiness";

export type OtpDeliveryResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

/** Issued by the trusted delivery adapter only. Not a delivery/receipt webhook. */
export type AcceptedWhatsAppAuthTemplate = Readonly<{
  messageId: string;
  templateName: string;
  templateLanguage: string;
}>;
export type TrackedOtpDeliveryResult = OtpDeliveryResult |
  { ok: true; providerReceipt: AcceptedWhatsAppAuthTemplate };


/** A configuration preflight, NOT proof that a real OTP was delivered. */
export function productionOtpDeliveryConfigurationReady(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    String(env.OTP_DELIVERY_CHANNEL || "").trim().toLowerCase() === "whatsapp" &&
    Boolean(String(env.WHATSAPP_ACCESS_TOKEN || "").trim()) &&
    /^\d{5,25}$/.test(String(env.WHATSAPP_PHONE_NUMBER_ID || "").trim()) &&
    /^[a-z0-9_]{1,512}$/.test(String(env.WHATSAPP_AUTH_TEMPLATE_NAME || "").trim()) &&
    /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(String(env.WHATSAPP_AUTH_TEMPLATE_LANGUAGE || "").trim())
  );
}

export function createProductionOtpReadinessCheck(
  env: NodeJS.ProcessEnv = process.env,
): { name: string; check: () => void } {
  return {
    name: "signup_otp_delivery_configuration",
    check() {
      if (productionReleaseGateRequired(env) && !productionOtpDeliveryConfigurationReady(env)) {
        throw new Error("OTP_DELIVERY_NOT_CONFIGURED");
      }
    },
  };
}

function developmentDeliveryAllowed(): boolean {
  return (
    (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") &&
    !productionReleaseGateRequired()
  );
}

export function stagingOtpBypassAllowed(purpose?: OtpPurpose): boolean {
  return (
    purpose === "admin_device_verification" &&
    process.env.NODE_ENV === "production" &&
    process.env.FAWRI_DEPLOYMENT_MODE === "staging" &&
    process.env.FAWRI_STAGING_OTP_BYPASS === "1" &&
    process.env.FAWRI_PRODUCTION_RELEASE_GATE !== "required" &&
    !productionReleaseGateRequired()
  );
}

function normalizeRecipient(phone: string): string {
  const configuredTestNumber = developmentDeliveryAllowed()
    ? String(process.env.WHATSAPP_TEST_TO || "").replace(/\D/g, "")
    : "";
  return configuredTestNumber || String(phone || "").replace(/\D/g, "");
}

/**
 * The Meta-approved AUTHENTICATION/COPY_CODE template must exist on the sender
 * with this exact name/language. This is a CONFIG preflight, not a template
 * approval lookup and not a delivery receipt. The same 6-digit OTP is supplied
 * to the template body and copy-code button; never send a free-form text OTP.
 */
function authenticationTemplate(code: string) {
  return {
    name: String(process.env.WHATSAPP_AUTH_TEMPLATE_NAME || "").trim(),
    language: { code: String(process.env.WHATSAPP_AUTH_TEMPLATE_LANGUAGE || "").trim() },
    components: [
      { type: "body", parameters: [{ type: "text", text: code }] },
      {
        type: "button", sub_type: "url", index: "0",
        parameters: [{ type: "text", text: code }],
      },
    ],
  };
}

/** Internal sender result for binding a challenge to a provider-accepted template.
 * A successful API response is NOT proof of delivery, nor an OTP redemption.
 */
export async function deliverAuthOtpWithProviderReceipt(
  phone: string,
  code: string,
  purpose: OtpPurpose,
): Promise<TrackedOtpDeliveryResult> {
  if (
    (developmentDeliveryAllowed() &&
      process.env.AUTH_ALLOW_DEV_OTP_BYPASS === "true") ||
    stagingOtpBypassAllowed(purpose)
  ) {
    return { ok: true };
  }

  if (!productionOtpDeliveryConfigurationReady()) {
    return {
      ok: false,
      code: "OTP_DELIVERY_NOT_CONFIGURED",
      message: "OTP delivery is not configured",
    };
  }

  const token = String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const recipient = normalizeRecipient(phone);
  // Never forward malformed recipient/code to the external provider.
  if (!/^\d{7,15}$/.test(recipient) || !/^\d{6}$/.test(code)) {
    return {
      ok: false,
      code: "OTP_DELIVERY_NOT_CONFIGURED",
      message: "OTP delivery is not configured",
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient,
          type: "template",
          template: authenticationTemplate(code),
        }),
      },
    );

    if (!response.ok) {
      return {
        ok: false,
        code: "OTP_DELIVERY_FAILED",
        message: "Unable to deliver the verification code",
      };
    }
    // HTTP 2xx only means provider API accepted the request, not that a
    // WhatsApp user has received it. Requiring a message ID avoids 2xx false
    // positives. A trusted phone proof still requires OTP challenge redemption.
    const body: unknown = await response.json();
    const messages = body && typeof body === "object" && "messages" in body
      ? (body as { messages?: unknown }).messages : undefined;
    if (!Array.isArray(messages) || typeof messages[0]?.id !== "string" ||
        !/^wamid\.[A-Za-z0-9._+\/=-]{8,500}$/.test(messages[0].id)) {
      return { ok: false, code: "OTP_DELIVERY_FAILED", message: "Unable to deliver the verification code" };
    }
    return { ok: true, providerReceipt: {
      messageId: messages[0].id,
      templateName: String(process.env.WHATSAPP_AUTH_TEMPLATE_NAME || "").trim(),
      templateLanguage: String(process.env.WHATSAPP_AUTH_TEMPLATE_LANGUAGE || "").trim(),
    } };
  } catch {
    return {
      ok: false,
      code: "OTP_DELIVERY_FAILED",
      message: "Unable to deliver the verification code",
    };
  }
}

/** Existing callers never receive the provider receipt or expose it in HTTP. */
export async function deliverAuthOtp(
  phone: string,
  code: string,
  purpose: OtpPurpose,
): Promise<OtpDeliveryResult> {
  const result = await deliverAuthOtpWithProviderReceipt(phone, code, purpose);
  return result.ok ? { ok: true } : result;
}
