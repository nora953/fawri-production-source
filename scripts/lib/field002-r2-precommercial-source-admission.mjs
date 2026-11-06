/**
 * FIELD002-R2 first-commercial-launch *source policy*, NOT a production
 * deployment approval, backup validator or live Neon SQL acceptance.
 *
 * This prevents sanctioned schema-first bootstrap plans from claiming that
 * historical staging branches/archives are safe data sources just because
 * their current notifications table has zero rows.
 */
export const FIELD002_R2_PROJECT_ID = "round-fire-18493605";

export const FIELD002_R2_BRANCHES = Object.freeze({
  production: "br-shiny-lab-b1vxj4wn",
  staging: "br-falling-dust-b1km4gix",
  cleanRehearsal: "br-polished-mouse-b1proel7",
  oldRehearsal: "br-young-hill-b1x9vhlz",
  archived: Object.freeze([
    "br-square-night-b1l1x9zk",
    "br-snowy-voice-b1bovtwi",
    "br-billowing-leaf-b14yamgu",
  ]),
});

const EXPECTED_KEYS = Object.freeze([
  "intent",
  "project_id",
  "target_branch_id",
  "source_mode",
  "source_branch_id",
  "source_backup_id",
  "data_import_requested",
  "restore_requested",
]);

function reject(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function record(value) {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Require an explicitly empty/new *schema-only* first-launch data source.
 * This deliberately refuses all Neon branch copies, archived snapshots,
 * staging backups, and arbitrary/unknown source identifiers, including a
 * clean rehearsal clone. Legitimate merchant recovery after launch is a
 * distinct authorization path and must never be silently reclassified here.
 *
 * Does not accept host counts/owner assertions as independently verified
 * evidence. Live SQL, backups, storage, actual deployment and approvals are
 * separate mandatory gates. On pass, deploymentAuthorized remains false.
 */
export function assertField002FirstCommercialSourcePolicy(candidate) {
  if (!record(candidate) ||
      Object.keys(candidate).sort().join("\u0000") !== [...EXPECTED_KEYS].sort().join("\u0000")) {
    reject("FIELD002_R2_SOURCE_MANIFEST_MALFORMED");
  }
  if (candidate.intent !== "first_commercial_launch" ||
      candidate.project_id !== FIELD002_R2_PROJECT_ID ||
      candidate.target_branch_id !== FIELD002_R2_BRANCHES.production) {
    reject("FIELD002_R2_RELEASE_TARGET_UNVERIFIED");
  }
  const branchId = candidate.source_branch_id;
  const backupId = candidate.source_backup_id;
  if (typeof branchId === "string" && FIELD002_R2_BRANCHES.archived.includes(branchId)) {
    reject("FIELD002_R2_ARCHIVED_SOURCE_QUARANTINED");
  }
  if (branchId !== null || backupId !== null ||
      candidate.data_import_requested !== false ||
      candidate.restore_requested !== false ||
      candidate.source_mode !== "fresh_schema_migrations_only") {
    reject("FIELD002_R2_PRECOMMERCIAL_DATA_SOURCE_FORBIDDEN");
  }
  // Passing this source *policy* does not prove that actual hosted PostgreSQL
  // starts empty or that any external deploy will invoke this function.
  return Object.freeze({
    decision: "SCHEMA_ONLY_SOURCE_POLICY_COMPATIBLE",
    requiresIndependentHostedVerification: true,
    deploymentAuthorized: false,
    field002Closed: false,
  });
}

/**
 * Inspect metadata supplied by a live Neon branch-list call (never credentials
 * or table rows) and fail if the known staging lineage or archived statuses
 * are unexpectedly different. This does not query Neon or unarchive branches.
 */
export function assertField002KnownNeonLineage(branches) {
  if (!Array.isArray(branches) || !branches.every(record)) {
    reject("FIELD002_R2_BRANCH_INVENTORY_INVALID");
  }
  const byId = new Map();
  for (const b of branches) {
    if (typeof b.id !== "string" || byId.has(b.id)) {
      reject("FIELD002_R2_BRANCH_INVENTORY_INVALID");
    }
    byId.set(b.id, b);
  }
  const known = FIELD002_R2_BRANCHES;
  const production = byId.get(known.production);
  const staging = byId.get(known.staging);
  const clean = byId.get(known.cleanRehearsal);
  const old = byId.get(known.oldRehearsal);
  if (!production || production.default !== true || production.primary !== true ||
      production.parent_id != null || production.current_state !== "ready" ||
      !staging || staging.parent_id !== known.production ||
      staging.default !== false || staging.primary !== false ||
      staging.current_state !== "ready" ||
      !clean || clean.parent_id !== known.staging ||
      clean.default !== false || clean.primary !== false ||
      clean.current_state !== "ready" ||
      !old || old.parent_id !== known.staging ||
      old.default !== false || old.primary !== false ||
      old.current_state !== "ready") {
    reject("FIELD002_R2_BRANCH_LINEAGE_CHANGED");
  }
  const expectedArchivedParent = new Map([
    [known.archived[0], known.staging],
    [known.archived[1], known.staging],
    [known.archived[2], known.archived[1]],
  ]);
  for (const [id, parent] of expectedArchivedParent) {
    const b = byId.get(id);
    if (!b || b.current_state !== "archived" || b.parent_id !== parent ||
        b.default !== false || b.primary !== false) {
      reject("FIELD002_R2_ARCHIVED_BRANCH_STATE_CHANGED");
    }
  }
  for (const b of branches) {
    if (b.id !== known.production && (b.default === true || b.primary === true)) {
      reject("FIELD002_R2_BRANCH_LINEAGE_CHANGED");
    }
  }
  return Object.freeze({
    decision: "KNOWN_BRANCH_LINEAGE_OBSERVED",
    archivedSourcesQuarantined: known.archived.length,
    deploymentAuthorized: false,
    field002Closed: false,
  });
}
