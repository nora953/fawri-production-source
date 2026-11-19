import crypto from "node:crypto";
import { withAuthenticationTransaction } from "./authenticationPostgresAuthority";
import { operationalPostgresAuthorityRequired } from "./operationalPostgresAuthority";

/**
 * OIDC one-use login challenge. NOT exposed by any route.
 *
 * Future route contract:
 * - Begin: rate-limit and origin-check; pass trusted request IP here.
 *   Return challengeId and nonce to the browser for Google Identity Services.
 *   Put csrfProof ONLY in an HttpOnly, Secure, SameSite=Lax cookie scoped to
 *   /api/auth/google. Never echo csrfProof in response JSON or URLs.
 * - Finish: enforce origin and cookie-to-challenge binding, verify signed
 *   Google token nonce, then atomically consume the challenge.
 * - Database migration and owner approval required before any enablement.
 *
 * No SMS, account session, trial activation or production writes are enabled.
 */
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROOF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TTL_MS = 5 * 60 * 1000;

export type IssuedGoogleOidcChallenge = Readonly<{
  challengeId: string;
  nonce: string;
  csrfProof: string; // strictly for a server-set, HttpOnly cookie
  expiresAt: string;
}>;

function unavailable(): never {
  throw new Error("GOOGLE_OIDC_CHALLENGE_NOT_READY");
}

function secret(): string {
  const value = String(process.env.FAWRI_AUTH_SECURITY_SECRET || "");
  if (value.length < 32) unavailable();
  return value;
}

function gated(): string {
  if (process.env.FAWRI_GOOGLE_MERCHANT_ADMISSION_ENABLED !== "1" ||
      process.env.FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY !== "required" ||
      !operationalPostgresAuthorityRequired()) unavailable();
  return secret();
}

function fingerprint(key: string, domain: string, value: string): string {
  return crypto.createHmac("sha256", key)
    .update(domain + ":" + value).digest("base64url");
}

export async function issueGoogleOidcChallenge(ip: string): Promise<IssuedGoogleOidcChallenge> {
  const key = gated();
  if (typeof ip !== "string" || !ip || ip.length > 128) unavailable();
  const challengeId = crypto.randomUUID();
  const nonce = crypto.randomBytes(32).toString("base64url");
  const csrfProof = crypto.randomBytes(32).toString("base64url");
  const ipHash = fingerprint(key, "google-oidc-ip", ip);
  const nonceHash = fingerprint(key, "google-oidc-nonce", challengeId + ":" + nonce);
  const csrfHash = fingerprint(key, "google-oidc-csrf", challengeId + ":" + csrfProof);
  const expiresAt = new Date(Date.now() + TTL_MS);

  await withAuthenticationTransaction(async client => {
    // All attempts sharing an IP serialize before the bounded rate check.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
      ["google-oidc-ip:" + ipHash],
    );
    const rows = await client.query<{ total: string }>(
      "SELECT count(*)::text AS total FROM public.google_oidc_challenges " +
      "WHERE ip_hash=$1 AND created_at > now() - interval '5 minutes'",
      [ipHash],
    );
    if (Number(rows.rows[0]?.total ?? 0) >= 20) {
      throw new Error("GOOGLE_OIDC_RATE_LIMITED");
    }
    await client.query(
      "INSERT INTO public.google_oidc_challenges " +
      "(id,nonce_hash,csrf_hash,ip_hash,expires_at) VALUES ($1,$2,$3,$4,$5)",
      [challengeId, nonceHash, csrfHash, ipHash, expiresAt],
    );
  });
  return { challengeId, nonce, csrfProof, expiresAt: expiresAt.toISOString() };
}

/** One atomic SQL UPDATE; concurrent or replayed consumption succeeds once. */
export async function consumeGoogleOidcChallenge(input: {
  challengeId: string;
  nonce: string;
  csrfProof: string;
}): Promise<boolean> {
  const key = gated();
  if (!input || !ID_PATTERN.test(input.challengeId || "") ||
      !PROOF_PATTERN.test(input.nonce || "") ||
      !PROOF_PATTERN.test(input.csrfProof || "")) return false;
  const nonceHash = fingerprint(key, "google-oidc-nonce", input.challengeId + ":" + input.nonce);
  const csrfHash = fingerprint(key, "google-oidc-csrf", input.challengeId + ":" + input.csrfProof);
  return withAuthenticationTransaction(async client => {
    const result = await client.query<{ id: string }>(
      "UPDATE public.google_oidc_challenges SET used_at=now() " +
      "WHERE id=$1 AND nonce_hash=$2 AND csrf_hash=$3 " +
      "AND used_at IS NULL AND expires_at > now() " +
      "RETURNING id",
      [input.challengeId, nonceHash, csrfHash],
    );
    return result.rows.length === 1;
  });
}
