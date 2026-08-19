import type { OtpPurpose } from "./authSecurityStore";

export type OtpDeliveryResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

function deliveryChannel(): string {
  return String(process.env.OTP_DELIVERY_CHANNEL || "").trim().toLowerCase();
}

function normalizeRecipient(phone: string): string {
  const configuredTestNumber = String(process.env.WHATSAPP_TEST_TO || "").replace(/\D/g, "");
  return configuredTestNumber || String(phone || "").replace(/\D/g, "");
}

function buildMessage(code: string, purpose: OtpPurpose): string {
  if (purpose === "admin_device_verification") {
    return `Fawri verification code: ${code}\nUse this code to verify a new owner administrator device. It expires in 10 minutes.`;
  }
  if (purpose === "admin_recovery") {
    return `Fawri verification code: ${code}\nUse this code only to verify the new phone during owner emergency recovery. It expires in 10 minutes.`;
  }
  if (purpose === "password_reset") {
    return `Fawri verification code: ${code}\nUse this code to reset your password. It expires in 10 minutes.`;
  }
  return `Fawri verification code: ${code}\nUse this code to verify your account. It expires in 10 minutes.`;
}

export async function deliverAuthOtp(
  phone: string,
  code: string,
  purpose: OtpPurpose,
): Promise<OtpDeliveryResult> {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.AUTH_ALLOW_DEV_OTP_BYPASS === "true"
  ) {
    return { ok: true };
  }

  if (deliveryChannel() !== "whatsapp") {
    return {
      ok: false,
      code: "OTP_DELIVERY_NOT_CONFIGURED",
      message: "OTP delivery is not configured",
    };
  }

  const token = String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const recipient = normalizeRecipient(phone);
  if (!token || !phoneNumberId || !recipient) {
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
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient,
          type: "text",
          text: { preview_url: false, body: buildMessage(code, purpose) },
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
    return { ok: true };
  } catch {
    return {
      ok: false,
      code: "OTP_DELIVERY_FAILED",
      message: "Unable to deliver the verification code",
    };
  }
}
