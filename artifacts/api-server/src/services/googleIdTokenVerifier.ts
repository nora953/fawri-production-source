import crypto from "node:crypto";

/**
 * Only an offline cryptographic *identity proof*. Never create accounts, issue
 * sessions, link an existing merchant, or grant a free trial from this function.
 * That requires a separate audited OIDC CSRF/nonce, binding and entitlement flow.
 * Do not use email to identify/link accounts: Google sub is the stable key.
 */
const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const MAX_ID_TOKEN_LENGTH = 8192;
const MAX_JWKS_LENGTH = 65536;
const MAX_TOKEN_AGE_SECONDS = 7200;
const CLOCK_SKEW_SECONDS = 60;

export type VerifiedGoogleIdentity = Readonly<{
  issuer: "https://accounts.google.com";
  subject: string;
  audience: string;
}>;

type GoogleJwk = {
  kid: string;
  kty: "RSA";
  n: string;
  e: string;
  alg?: string;
  use?: string;
};

let cachedKeys: { expiresAt: number; keys: GoogleJwk[] } | null = null;

function refused(): never {
  // Never log or echo a token or the Google profile from this boundary.
  throw new Error("GOOGLE_ID_TOKEN_REJECTED");
}

function decodePart(part: string): Record<string, unknown> {
  if (part.length < 2 || part.length > 6144 || !/^[A-Za-z0-9_-]+$/.test(part)) refused();
  try {
    const raw = Buffer.from(part, "base64url");
    if (raw.toString("base64url") !== part) refused();
    const parsed: unknown = JSON.parse(raw.toString("utf8"));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") refused();
    return parsed as Record<string, unknown>;
  } catch {
    return refused();
  }
}

function signingKey(value: unknown): value is GoogleJwk {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const key = value as Record<string, unknown>;
  return (
    key.kty === "RSA" &&
    typeof key.kid === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(key.kid) &&
    (key.alg === undefined || key.alg === "RS256") &&
    (key.use === undefined || key.use === "sig") &&
    typeof key.n === "string" && /^[A-Za-z0-9_-]{300,2048}$/.test(key.n) &&
    typeof key.e === "string" && /^[A-Za-z0-9_-]{2,8}$/.test(key.e)
  );
}

async function loadGoogleKeys(now: number): Promise<GoogleJwk[]> {
  if (cachedKeys && cachedKeys.expiresAt > now) return cachedKeys.keys;

  // Hard-coded Google key URL. No caller-supplied JWKS URL, redirects or headers.
  const response = await fetch(GOOGLE_JWKS, {
    method: "GET",
    redirect: "error",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(3000),
  });
  if (response.status !== 200) refused();
  const declaredLength = Number(response.headers.get("content-length") || "0");
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_JWKS_LENGTH) refused();
  const body = await response.text();
  if (body.length > MAX_JWKS_LENGTH) refused();

  let payload: unknown;
  try { payload = JSON.parse(body); } catch { refused(); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) refused();
  const keys = (payload as {keys?: unknown}).keys;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 10 || !keys.every(signingKey)) refused();
  const ids = new Set(keys.map((key: GoogleJwk) => key.kid));
  if (ids.size !== keys.length) refused();
  const cacheControl = response.headers.get("cache-control") || "";
  const match = /(?:^|,)\s*max-age=(\d+)(?:,|$)/i.exec(cacheControl);
  const ttl = Math.min(Number(match?.[1] || 300), 3600);
  cachedKeys = { keys, expiresAt: now + Math.max(30, ttl) * 1000 };
  return keys;
}

/**
 * Verifies an RS256 signature against Google's rotating JWKS and validates
 * identity claims before returning the stable subject. The expected client ID
 * MUST come from the server's trusted deployment config, not request input.
 *
 * This alone is NOT sufficient for login: route-level CSRF/nonce/replay
 * validation and atomic DB account binding remain required before activation.
 */
export async function verifyGoogleIdTokenSignature(
  idToken: string,
  expectedClientId: string,
): Promise<VerifiedGoogleIdentity> {
  if (
    typeof idToken !== "string" ||
    idToken.length > MAX_ID_TOKEN_LENGTH ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(idToken) ||
    typeof expectedClientId !== "string" ||
    !/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(expectedClientId)
  ) refused();

  const [encodedHeader, encodedPayload, encodedSignature] = idToken.split(".");
  const header = decodePart(encodedHeader);
  const claims = decodePart(encodedPayload);
  if (
    header.alg !== "RS256" ||
    typeof header.kid !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(header.kid) ||
    (header.typ !== undefined && header.typ !== "JWT") ||
    !GOOGLE_ISSUERS.has(String(claims.iss)) ||
    claims.aud !== expectedClientId ||
    (claims.azp !== undefined && claims.azp !== expectedClientId) ||
    typeof claims.sub !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(claims.sub)
  ) refused();

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    typeof claims.iat !== "number" || !Number.isSafeInteger(claims.iat) ||
    typeof claims.exp !== "number" || !Number.isSafeInteger(claims.exp) ||
    claims.iat > nowSeconds + CLOCK_SKEW_SECONDS ||
    claims.iat < nowSeconds - MAX_TOKEN_AGE_SECONDS ||
    claims.exp <= nowSeconds ||
    claims.exp - claims.iat > MAX_TOKEN_AGE_SECONDS ||
    (claims.nbf !== undefined && (
      typeof claims.nbf !== "number" || !Number.isSafeInteger(claims.nbf) ||
      claims.nbf > nowSeconds + CLOCK_SKEW_SECONDS
    ))
  ) refused();

  // An unknown kid must fail closed. A new login cannot choose a key or URL.
  let keys: GoogleJwk[];
  try {
    keys = await loadGoogleKeys(Date.now());
    if (!keys.some(key => key.kid === header.kid)) {
      cachedKeys = null; // Rotation: refresh once, but never accept arbitrary keys.
      keys = await loadGoogleKeys(Date.now());
    }
  } catch {
    refused();
  }
  const jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) refused();
  let signature: Buffer;
  try {
    signature = Buffer.from(encodedSignature, "base64url");
    if (signature.toString("base64url") !== encodedSignature || signature.length < 256) refused();
    const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
    if (publicKey.asymmetricKeyType !== "rsa" ||
        (publicKey.asymmetricKeyDetails?.modulusLength || 0) < 2048) refused();
    if (!crypto.verify(
      "RSA-SHA256",
      Buffer.from(encodedHeader + "." + encodedPayload, "ascii"),
      publicKey,
      signature,
    )) refused();
  } catch {
    refused();
  }
  return Object.freeze({
    issuer: "https://accounts.google.com",
    subject: claims.sub,
    audience: expectedClientId,
  });
}
