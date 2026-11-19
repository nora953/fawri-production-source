import crypto from "node:crypto";
import { withAuthenticationTransaction } from "./authenticationPostgresAuthority";
import { hashPassword } from "./authPasswordService";
import { verifyGoogleIdTokenSignature } from "./googleIdTokenVerifier";
import { consumeGoogleOidcChallenge } from "./googleOidcChallengeAuthority";
import { normalizeMerchantRegionalProfile } from "./merchantRegionalRuntime";
import { operationalPostgresAuthorityRequired, operationalQueryRows } from "./operationalPostgresAuthority";
import type { RequestedPlan } from "./authAccountRepository";

/**
 * Source-only Google merchant account admission; NOT mounted on an API route.
 * A future route MUST consume a single-use server-issued OIDC nonce and
 * enforce CSRF, origin, rate limits and fraud checks before invoking this.
 * A Google ID token is an account credential, NOT a free-trial entitlement.
 * Requires a separately approved HELD PG18 migration on the target database.
 */
type Registration = Readonly<{
  idToken: string;
  expectedNonce: string;
  challengeId: string;
  csrfProofFromCookie: string;
  ownerName: string;
  storeName: string;
  activityType: string;
  countryCode: string;
  timezone?: string;
  currencyCode?: string;
  language: "ar" | "en" | "ku";
  requestedPlan?: RequestedPlan;
}>;

export type GoogleMerchantAdmission = Readonly<{
  accountId: string;
  created: boolean;
  trialActivated: false;
}>;

function validatedText(value: unknown, max: number): string {
  const valueText = typeof value === "string" ? value.normalize("NFKC").trim() : "";
  if (!valueText || valueText.length > max || /[\u0000-\u001f\u007f]/.test(valueText)) {
    throw new Error("GOOGLE_MERCHANT_PROFILE_INVALID");
  }
  return valueText;
}

function disabled(): never {
  throw new Error("GOOGLE_MERCHANT_ADMISSION_NOT_READY");
}

export async function admitPendingGoogleMerchant(input: Registration): Promise<GoogleMerchantAdmission> {
  // Render has no declared opt-in; this function is not routed or reachable.
  if (process.env.FAWRI_GOOGLE_MERCHANT_ADMISSION_ENABLED !== "1" ||
      !operationalPostgresAuthorityRequired() ||
      process.env.FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY !== "required") disabled();
  const clientId = String(process.env.FAWRI_GOOGLE_OAUTH_CLIENT_ID || "");
  if (!clientId || !input || !input.expectedNonce) disabled();

  const ownerName = validatedText(input.ownerName, 160);
  const storeName = validatedText(input.storeName, 160);
  const activityType = validatedText(input.activityType, 120);
  if (!["ar", "en", "ku"].includes(input.language)) {
    throw new Error("GOOGLE_MERCHANT_PROFILE_INVALID");
  }
  if (input.requestedPlan !== undefined &&
      input.requestedPlan !== "silver" &&
      input.requestedPlan !== "gold" &&
      input.requestedPlan !== "diamond") {
    throw new Error("GOOGLE_MERCHANT_PLAN_INVALID");
  }

  // International merchant admission never silently defaults to Iraq.
  const region = normalizeMerchantRegionalProfile({
    country_code: input.countryCode,
    timezone: input.timezone,
    currency_code: input.currencyCode,
  });

  // Client-submitted email and sub are NEVER accepted here. The future route
  // MUST pass csrfProofFromCookie from an HttpOnly cookie, not the request body.
  const identity = await verifyGoogleIdTokenSignature(
    input.idToken, clientId, input.expectedNonce,
  );
  const consumed = await consumeGoogleOidcChallenge({
    challengeId: input.challengeId,
    nonce: input.expectedNonce,
    csrfProof: input.csrfProofFromCookie,
  });
  if (!consumed) throw new Error("GOOGLE_OIDC_CHALLENGE_INVALID");

  return withAuthenticationTransaction(async client => {
    const existing = await operationalQueryRows<{
      id: string;
      state: "active" | "suspended" | "closed";
      status: "pending_review" | "approved" | "rejected" | "suspended";
    }>(
      client,
      "SELECT a.id, a.state, m.account_status AS status " +
      "FROM public.accounts AS a " +
      "JOIN public.merchants AS m ON m.id = a.id AND m.account_id = a.id " +
      "WHERE a.kind = 'merchant' AND a.google_issuer = $1 AND a.google_subject = $2 " +
      "LIMIT 1 FOR UPDATE OF a",
      [identity.issuer, identity.subject],
    );
    if (existing[0]) {
      if (existing[0].state !== "active" ||
          existing[0].status === "rejected" ||
          existing[0].status === "suspended") {
        throw new Error("GOOGLE_MERCHANT_ACCOUNT_UNAVAILABLE");
      }
      return { accountId: existing[0].id, created: false, trialActivated: false };
    }

    const accountId = "merchant-" + crypto.randomUUID();
    // Original accounts.password_hash NOT NULL: use a strong random unusable
    // password, store only its scrypt hash; never return password material.
    const passwordHash = hashPassword(crypto.randomBytes(48).toString("base64url"));
    await client.query(
      "INSERT INTO public.accounts (" +
      "id, kind, phone, password_hash, state, language, phone_verified, google_issuer, google_subject" +
      ") VALUES ($1, 'merchant', NULL, $2, 'active', $3, false, $4, $5)",
      [accountId, passwordHash, input.language, identity.issuer, identity.subject],
    );
    await client.query(
      "INSERT INTO public.merchants (" +
      "id, account_id, profile_kind, owner_name, store_name, activity_type, " +
      "country_code, timezone, currency_code, status, account_status, " +
      "onboarding_status, trial_status, signup_source, requested_plan" +
      ") VALUES (" +
      "$1, $1, 'merchant', $2, $3, $4, $5, $6, $7, " +
      "'pending_activation', 'pending_review', 'pending_review', " +
      "'ineligible', 'direct', $8)",
      [
        accountId, ownerName, storeName, activityType,
        region.country_code, region.timezone, region.currency_code,
        input.requestedPlan ?? null,
      ],
    );
    // No session, no OTP, no subscription, no free trial is granted.
    // Separate auditable single-business trial adjudication is mandatory.
    return { accountId, created: true, trialActivated: false };
  });
}
