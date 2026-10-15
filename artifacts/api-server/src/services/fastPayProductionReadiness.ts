export const FASTPAY_STORE_ID_ENV = "FAWRI_FASTPAY_STORE_ID";
export const FASTPAY_STORE_PASSWORD_ENV = "FAWRI_FASTPAY_STORE_PASSWORD";
export const FASTPAY_VALIDATION_URL_ENV = "FAWRI_FASTPAY_VALIDATION_URL";
export const FASTPAY_IPN_URL_ENV = "FAWRI_FASTPAY_IPN_URL";
export const FASTPAY_RETURN_URL_ENV = "FAWRI_FASTPAY_RETURN_URL";

export type FastPayProductionReadinessBlocker =
  | "merchant_credentials_required"
  | "validation_api_url_required"
  | "ipn_url_required"
  | "return_url_required"
  | "https_required"
  | "production_adapter_pending";

export type FastPayProductionReadiness = {
  provider: "fastpay";
  merchant_credentials_configured: boolean;
  validation_api_configured: boolean;
  ipn_url_configured: boolean;
  return_url_configured: boolean;
  configuration_complete: boolean;
  adapter_implemented: false;
  production_ready: false;
  blockers: FastPayProductionReadinessBlocker[];
};

function configuredSecret(name: string): boolean {
  return String(process.env[name] || "").trim().length >= 8;
}

function configuredHttpsUrl(name: string): {
  configured: boolean;
  secure: boolean;
} {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return { configured: false, secure: false };
  try {
    const parsed = new URL(raw);
    return {
      configured: true,
      secure: parsed.protocol === "https:" && Boolean(parsed.hostname),
    };
  } catch {
    return { configured: true, secure: false };
  }
}

export function getFastPayProductionReadiness(): FastPayProductionReadiness {
  const storeId = configuredSecret(FASTPAY_STORE_ID_ENV);
  const storePassword = configuredSecret(FASTPAY_STORE_PASSWORD_ENV);
  const validation = configuredHttpsUrl(FASTPAY_VALIDATION_URL_ENV);
  const ipn = configuredHttpsUrl(FASTPAY_IPN_URL_ENV);
  const returnUrl = configuredHttpsUrl(FASTPAY_RETURN_URL_ENV);

  const merchantCredentialsConfigured = storeId && storePassword;
  const blockers: FastPayProductionReadinessBlocker[] = [];

  if (!merchantCredentialsConfigured) blockers.push("merchant_credentials_required");
  if (!validation.configured) blockers.push("validation_api_url_required");
  if (!ipn.configured) blockers.push("ipn_url_required");
  if (!returnUrl.configured) blockers.push("return_url_required");

  if (
    (validation.configured && !validation.secure) ||
    (ipn.configured && !ipn.secure) ||
    (returnUrl.configured && !returnUrl.secure)
  ) {
    blockers.push("https_required");
  }

  const configurationComplete =
    merchantCredentialsConfigured &&
    validation.configured &&
    validation.secure &&
    ipn.configured &&
    ipn.secure &&
    returnUrl.configured &&
    returnUrl.secure;

  // Deliberately false until the official merchant integration guide is available
  // and Fawri has an implementation that initiates payment, validates the settled
  // transaction server-side, and authenticates IPN callbacks.
  blockers.push("production_adapter_pending");

  return {
    provider: "fastpay",
    merchant_credentials_configured: merchantCredentialsConfigured,
    validation_api_configured: validation.configured && validation.secure,
    ipn_url_configured: ipn.configured && ipn.secure,
    return_url_configured: returnUrl.configured && returnUrl.secure,
    configuration_complete: configurationComplete,
    adapter_implemented: false,
    production_ready: false,
    blockers: [...new Set(blockers)],
  };
}
