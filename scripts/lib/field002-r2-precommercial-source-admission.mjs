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
  // Earlier recovery has a different default FUNCTION ACL than CURRENT original.
  frozenRecovery: "br-empty-mud-b1it6mg9",
  historicalAcl2Recovery: "br-royal-fog-b1v7pdmr",
  historicalAclRehearsal: "br-misty-bonus-b15f66v7",
  nativeResetDrill: "br-summer-bonus-b19rgpfn",
  // 95/95 public+drizzle table-data and 9/9 catalog parity with CURRENT ACL0.
  currentAcl0Recovery: "br-lingering-surf-b19gxt4e",
  archived: Object.freeze(["br-square-night-b1l1x9zk"]),
  // Historical branch identities remain explicitly excluded as data sources;
  // their deletion was separately approved and absence is not inventory drift.
  retired: Object.freeze([
    "br-nameless-base-b1vt822z",
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
  if (typeof branchId === "string" &&
      [...FIELD002_R2_BRANCHES.archived, ...FIELD002_R2_BRANCHES.retired].includes(branchId)) {
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
  const required = [
    [known.production, null, "ready"],
    [known.staging, known.production, "ready"],
    [known.cleanRehearsal, known.staging, "ready"],
    [known.oldRehearsal, known.staging, "ready"],
    [known.frozenRecovery, known.staging, "ready"],
    [known.historicalAcl2Recovery, known.staging, "ready"],
    [known.historicalAclRehearsal, known.historicalAcl2Recovery, "ready"],
    [known.nativeResetDrill, known.historicalAcl2Recovery, "ready"],
    [known.currentAcl0Recovery, known.staging, "ready"],
    [known.archived[0], known.staging, "archived"],
  ];
  for (const retired of known.retired) {
    if (byId.has(retired)) reject("FIELD002_R2_RETIRED_SOURCE_REAPPEARED");
  }
  if (byId.size !== required.length) {
    reject("FIELD002_R2_BRANCH_INVENTORY_CHANGED");
  }
  for (const [id, expectedParent, expectedState] of required) {
    const b = byId.get(id);
    if (!b || (b.parent_id ?? null) !== expectedParent ||
        b.current_state !== expectedState ||
        b.default !== (id === known.production) ||
        b.primary !== (id === known.production)) {
      reject("FIELD002_R2_BRANCH_LINEAGE_CHANGED");
    }
  }
  // Native provider snapshot/reset evidence and fresh ACL0 source capture
  // are independent pinned histories; they must never be interchanged.
  const checkpoints = [
    [known.frozenRecovery, "parent_lsn", "0/473AAE0"],
    [known.historicalAcl2Recovery, "parent_lsn", "0/492E628"],
    [known.historicalAclRehearsal, "parent_lsn", "0/49957D8"],
    [known.nativeResetDrill, "parent_lsn", "0/4A38530"],
    [known.nativeResetDrill, "last_reset_at", "2026-11-07T21:01:06Z"],
    [known.currentAcl0Recovery, "parent_lsn", "0/4B771F8"],
  ];
  for (const [id, field, expected] of checkpoints) {
    if (byId.get(id)?.[field] !== expected) {
      reject("FIELD002_R2_BRANCH_LINEAGE_CHANGED");
    }
  }
  return Object.freeze({
    decision: "KNOWN_BRANCH_LINEAGE_OBSERVED",
    archivedSourcesQuarantined: known.archived.length + known.retired.length,
    stagingRecoveryLineageVerified: true,
    currentAcl0RecoveryLineageVerified: true,
    disposableNativeResetLineageVerified: true,
    deploymentAuthorized: false,
    field002Closed: false,
  });
}
