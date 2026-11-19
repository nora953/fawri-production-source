import crypto from "node:crypto";
import { withAuthenticationTransaction } from "./authenticationPostgresAuthority";
import { isE164Phone } from "./authAccountRepository";
import { operationalPostgresAuthorityRequired } from "./operationalPostgresAuthority";

/**
 * Server-only, pre-launch candidate for trial abuse prevention. NOT mounted.
 * An account is not entitled to a trial merely because Google was verified.
 *
 * Only a phone ALREADY VERIFIED by the trusted account authority is accepted
 * here; unverified self-reported phone, email, name and IP must NEVER reserve
 * a unique trial identity. The WhatsApp-only provider verification cutover,
 * alternative business evidence, risk scoring, admin review and activation
 * require separate acceptance before this service is permitted in production.
 *
 * A successful reservation only adds to a manual-review queue. It does not
 * grant a trial, subscription, reply quota or any merchant permissions.
 */
export type TrialPhoneReviewReservation = Readonly<{
  claimId: string;
  status: "pending_review" | "approved" | "denied" | "activated";
  created: boolean;
  trialActivated: false;
}>;

function fail(code: string): never { throw new Error(code); }

function gate(): string {
  if (process.env.FAWRI_TRIAL_EVIDENCE_LEDGER_ENABLED !== "1" ||
      process.env.FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY !== "required" ||
      !operationalPostgresAuthorityRequired()) fail("TRIAL_EVIDENCE_LEDGER_NOT_READY");
  const secret = String(process.env.FAWRI_TRIAL_EVIDENCE_HMAC_SECRET || "");
  if (Buffer.byteLength(secret, "utf8") < 32) fail("TRIAL_EVIDENCE_LEDGER_NOT_READY");
  return secret;
}

function digest(secret: string, scope: string, identifier: string): string {
  return crypto.createHmac("sha256", secret)
    .update(scope + ":" + identifier).digest("base64url");
}

type PhoneAccountRow = {
  id: string;
  phone: string | null;
  phone_verified: boolean;
  account_status: "pending_review" | "approved" | "rejected" | "suspended";
  state: "active" | "suspended" | "closed";
  trial_status: "eligible" | "not_started" | "active" | "expired" | "already_used" | "ineligible";
  trial_started_at: Date | null;
};

export async function reserveVerifiedPhoneForTrialReview(
  merchantId: string,
): Promise<TrialPhoneReviewReservation> {
  const secret = gate();
  if (typeof merchantId !== "string" || merchantId.length < 5 ||
      merchantId.length > 180 || /[\s\u0000-\u001f\u007f]/.test(merchantId)) {
    return fail("TRIAL_MERCHANT_ID_INVALID");
  }
  return withAuthenticationTransaction(async client => {
    // The merchant and its account must be the same tenant ID. Database is
    // the only authority for the verified phone and prior trial status.
    const result = await client.query<PhoneAccountRow>(
      "SELECT a.id, a.phone, a.phone_verified, a.state, " +
      "m.account_status, m.trial_status, m.trial_started_at " +
      "FROM public.accounts a " +
      "JOIN public.merchants m ON m.id=a.id AND m.account_id=a.id " +
      "WHERE a.id=$1 AND a.kind='merchant' " +
      "FOR UPDATE OF a,m",
      [merchantId],
    );
    const row = result.rows[0];
    if (!row || row.state !== "active" ||
        (row.account_status !== "approved" && row.account_status !== "pending_review")) {
      return fail("TRIAL_MERCHANT_NOT_ELIGIBLE");
    }
    if (row.trial_started_at || ["active", "expired", "already_used"].includes(row.trial_status)) {
      return fail("TRIAL_ALREADY_USED");
    }
    if (!row.phone_verified || !row.phone || !isE164Phone(row.phone)) {
      return fail("TRIAL_TRUSTED_PHONE_VERIFICATION_REQUIRED");
    }

    const merchantHash = digest(secret, "trial-merchant-id:v1", row.id);
    const evidenceHash = digest(secret, "trial-evidence:verified-phone:v1", row.phone);
    const claimId = crypto.randomUUID();
    const created = await client.query<{ id: string }>(
      "INSERT INTO public.merchant_trial_claims (id,merchant_id,merchant_hash) " +
      "VALUES ($1,$2,$3) ON CONFLICT (merchant_hash) DO NOTHING RETURNING id",
      [claimId, merchantId, merchantHash],
    );
    const reservedClaim = created.rows[0]?.id ||
      (await client.query<{ id: string }>(
        "SELECT id FROM public.merchant_trial_claims " +
        "WHERE merchant_hash=$1 FOR UPDATE", [merchantHash],
      )).rows[0]?.id;
    if (!reservedClaim) return fail("TRIAL_CLAIM_UNAVAILABLE");

    // A global evidence UNIQUE index, not application memory/IP/cookies,
    // serializes concurrent attempts across different Google accounts.
    const evidence = await client.query<{ claim_id: string }>(
      "INSERT INTO public.merchant_trial_evidence " +
      "(id,claim_id,evidence_kind,evidence_hash) " +
      "VALUES ($1,$2,'verified_phone',$3) " +
      "ON CONFLICT (evidence_hash) DO NOTHING RETURNING claim_id",
      [crypto.randomUUID(), reservedClaim, evidenceHash],
    );
    if (!evidence.rows[0]) {
      const prior = await client.query<{ claim_id: string }>(
        "SELECT claim_id FROM public.merchant_trial_evidence " +
        "WHERE evidence_hash=$1", [evidenceHash],
      );
      if (prior.rows[0]?.claim_id !== reservedClaim) {
        return fail("TRIAL_EVIDENCE_ALREADY_CLAIMED");
      }
    }
    const claim = await client.query<{
      decision: TrialPhoneReviewReservation["status"];
    }>(
      "SELECT decision FROM public.merchant_trial_claims WHERE id=$1", [reservedClaim],
    );
    const status = claim.rows[0]?.decision;
    if (!status) return fail("TRIAL_CLAIM_UNAVAILABLE");
    // IMPORTANT: Leave merchant.trial_status and subscription entitlements
    // unchanged even if this source-level evidence reservation succeeds.
    return {
      claimId: reservedClaim,
      status,
      created: created.rows.length === 1,
      trialActivated: false,
    };
  });
}
