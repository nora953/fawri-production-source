import {
  buildValidatedMigrationPlan as buildBaseValidatedMigrationPlan,
  canonicalJson,
  loadLatestSnapshot,
  migrationPlanVersion,
  repositoryRoot,
  validateAgainstSnapshot,
} from "./postgresql-migration-plan.mjs";
import { addOperationalOverlayWriteReadiness } from "./postgresql-migration-write-readiness.mjs";

export {
  canonicalJson,
  loadLatestSnapshot,
  migrationPlanVersion,
  repositoryRoot,
  validateAgainstSnapshot,
};

export function buildValidatedMigrationPlan(options) {
  const result = buildBaseValidatedMigrationPlan(options);
  addOperationalOverlayWriteReadiness(result.report);
  return result;
}
