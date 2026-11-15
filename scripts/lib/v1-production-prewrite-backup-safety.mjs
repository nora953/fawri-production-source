/**
 * FAWRI P0-HOSTED-RECOVERY: exact first-commercial PREWRITE target guard.
 * No SQL write or secret logging. The real backup needs an additional,
 * owner-controlled GitHub Actions opt-in and independent offsite read-back.
 */
export const FIRST_PREWRITE_TARGET = Object.freeze({
  project_id: "crimson-cherry-65705041",
  branch_id: "br-holy-waterfall-b993zglb",
  database: "fawri",
  endpoint_host: "ep-polished-poetry-b9jpvn4r.c-7.eu-central-1.aws.neon.tech",
  owner_login: "fawri_owner",
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function validateProductionPrewriteBackupUrl(value, env = process.env) {
  if (env.GITHUB_ACTIONS !== "true" ||
      env.GITHUB_REPOSITORY !== "nora953/fawri-production-source" ||
      env.GITHUB_REF !== "refs/heads/fix/p0-provider-receipt-order-discovery-20261015" ||
      env.GITHUB_EVENT_NAME !== "push" ||
      env.FAWRI_V1_PREWRITE_EXPORT_ENABLED !== "1") {
    fail("V1_PREWRITE_EXPORT_NOT_AUTHORIZED");
  }
  let url;
  try { url = new URL(value ?? ""); }
  catch { fail("V1_PREWRITE_EXPORT_URL_MISSING"); }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    fail("V1_PREWRITE_EXPORT_PROTOCOL_DENIED");
  }
  if (url.hostname !== FIRST_PREWRITE_TARGET.endpoint_host ||
      !["", "5432"].includes(url.port) ||
      decodeURIComponent(url.username) !== FIRST_PREWRITE_TARGET.owner_login ||
      decodeURIComponent(url.pathname) !== "/" + FIRST_PREWRITE_TARGET.database ||
      !url.password || url.hash) {
    fail("V1_PREWRITE_EXPORT_TARGET_NOT_PINNED");
  }
  const params = [...url.searchParams.keys()];
  // Neon may append channel_binding=require to direct (non-pooler) URLs.
  // Permit only that strict SCRAM channel-binding value, never a downgrade.
  if (!params.includes("sslmode") ||
      params.length !== new Set(params).size ||
      params.some(p => !["sslmode", "channel_binding"].includes(p)) ||
      !["require", "verify-full"].includes(url.searchParams.get("sslmode")) ||
      (url.searchParams.has("channel_binding") &&
        url.searchParams.get("channel_binding") !== "require")) {
    fail("V1_PREWRITE_EXPORT_TLS_OPTIONS_DENIED");
  }
  return Object.freeze({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: FIRST_PREWRITE_TARGET.owner_login,
    database: FIRST_PREWRITE_TARGET.database,
    password: decodeURIComponent(url.password),
  });
}

export function assertProductionPrewriteCatalog(catalog) {
  if (!catalog ||
      catalog.db !== FIRST_PREWRITE_TARGET.database ||
      catalog.actor !== FIRST_PREWRITE_TARGET.owner_login ||
      Number(catalog.major) !== 18 ||
      Number(catalog.runtime_roles) !== 0 ||
      Number(catalog.public_relations) !== 0 ||
      Number(catalog.migration_relations) !== 0) {
    fail("V1_PREWRITE_EXPORT_NOT_EMPTY_SAFE_PREIMAGE");
  }
  return true;
}
