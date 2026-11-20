import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
const root=path.resolve(import.meta.dirname,'../..');
const yaml=fs.readFileSync(path.join(root,'render.yaml'),'utf8');
const docker=fs.readFileSync(path.join(root,'Dockerfile.staging'),'utf8');
const source=fs.readFileSync(path.join(root,'scripts/lib/field002-r2-precommercial-source-admission.mjs'),'utf8');
test('commercial UI build is V1 manual and POS-off before Vite runs',()=>{
 assert.match(docker,/FROM node:22-bookworm-slim AS build[\s\S]*ENV FAWRI_V1_MANUAL_COMMERCE=1[\s\S]*pnpm --filter @workspace\/fawri build/);
 assert.match(docker,/pnpm --filter @workspace\/api-server build/);
});
test('Render reuses bootstrap password pepper and does not regenerate it',()=>{
 assert.match(yaml,/- key: FAWRI_PASSWORD_SALT\s+sync: false/);
 assert.doesNotMatch(yaml,/- key: FAWRI_PASSWORD_SALT\s+generateValue: true/);
 assert.match(yaml,/- key: FAWRI_AUTH_SECURITY_SECRET\s+generateValue: true/);
 assert.match(yaml,/- key: FAWRI_OBSERVABILITY_BEARER_TOKEN\s+generateValue: true/);
});
test('Render manifest references only new commercial target with no restore',()=>{
 const value=yaml.match(/- key: FAWRI_FIRST_COMMERCIAL_SOURCE_MANIFEST_JSON\s+value: '([^']+)'/);
 assert.ok(value);
 const record=JSON.parse(value[1]);
 assert.equal(record.project_id,'crimson-cherry-65705041');
 assert.equal(record.target_branch_id,'br-holy-waterfall-b993zglb');
 assert.equal(record.source_mode,'fresh_schema_migrations_only');
 assert.equal(record.source_branch_id,null);
 assert.equal(record.source_backup_id,null);
 assert.equal(record.data_import_requested,false);
 assert.equal(record.restore_requested,false);
 assert.match(source,/FIELD002_R2_FIRST_COMMERCIAL_BRANCH_ID = "br-holy-waterfall-b993zglb"/);
});
test('no automatic paid deploy and no public app entry until review',()=>{
 assert.match(yaml,/autoDeployTrigger: off/);
 assert.match(yaml,/maintenanceMode:\s+enabled: true/);
 assert.match(yaml,/FAWRI_DEPLOYMENT_MODE\s+value: production/);
 assert.match(yaml,/FAWRI_V1_MANUAL_COMMERCE\s+value: "1"/);
 assert.match(yaml,/FAWRI_META_CUTOVER_READY\s+value: "0"/);
 assert.match(yaml,/FAWRI_DATA_DIR\s+value: \/var\/data\/fawri/);
});

test('G3 Render health must require PostgreSQL and actual mounted catalog media',()=>{
 const app=fs.readFileSync(path.join(root,'artifacts/api-server/src/app.ts'),'utf8');
 const entry=fs.readFileSync(path.join(root,'artifacts/api-server/src/index.ts'),'utf8');
 const mountCheck=fs.readFileSync(path.join(root,
  'artifacts/api-server/src/services/hostedV1CatalogMediaReadiness.ts'),'utf8');
 assert.match(yaml,/healthCheckPath: \/readyz/);
 assert.doesNotMatch(yaml,/healthCheckPath: \/healthz/);
 assert.match(app,/app.get\("\/readyz", async/);
 assert.match(app,/createReadinessSnapshot\(\[/);
 assert.match(app,/withAuthenticationTransaction\(async client/);
 assert.match(app,/withOperatorDirectoryTransaction\(async client/);
 // G4 provider proof remains independently required in the existing /ops gate.
 assert.match(app,/createProductionOtpReadinessCheck\(\)/);
 assert.match(yaml,/mountPath: \/var\/data/);
 assert.match(yaml,/- key: FAWRI_PERSISTENT_MEDIA_MOUNT_PATH\s+value: \/var\/data/);
 assert.match(app,/createPostgresAuthorityReadinessCheck\(\)/);
 assert.match(app,/createHostedV1CatalogMediaReadinessCheck\(\)/);
 assert.match(entry,/assertProductionRuntimeConfiguration\(process\.env\);[\s\S]*?assertHostedV1CatalogMediaMount\(process\.env\);[\s\S]*?startupStage = "database_rls"/);
 assert.match(mountCheck,/\/proc\/self\/mountinfo/);
 assert.match(mountCheck,/mountedWritableFilesystemPresent\(probe\.readMountInfo\(\), mount\)/);
 assert.match(mountCheck,/FAWRI_PERSISTENT_MEDIA_MOUNT_PATH/);
});

test('V1 merchant deletion retries stay enabled while Meta transport stays disabled',()=>{
 const entry=fs.readFileSync(path.join(root,'artifacts/api-server/src/index.ts'),'utf8');
 const cleanup=fs.readFileSync(path.join(root,
  'artifacts/api-server/src/services/merchantPhysicalMediaCleanup.ts'),'utf8');
 assert.match(yaml,/- key: FAWRI_DISABLE_JOB_WORKERS\s+value: "0"/);
 assert.match(yaml,/- key: FAWRI_META_CUTOVER_READY\s+value: "0"/);
 assert.match(yaml,/- key: FAWRI_META_REPLY_TRANSPORT\s+value: disabled/);
 assert.match(entry,/if \(!workersExplicitlyDisabled\) \{[\s\S]*?startMerchantPhysicalMediaCleanupReconciler\(\)/);
 assert.match(entry,/const metaCutoverReady = !manualCommercialRelease\(\) && process\.env\.FAWRI_META_CUTOVER_READY === "1"/);
 assert.match(entry,/if \(!workersExplicitlyDisabled && metaCutoverReady\)/);
 assert.match(cleanup,/if \(!manualCommercialRelease\(\)\) \{\s+await reconcileOrphanSupportImagesPostgres\(\)/);
});

test('G3 actual write/fsync/read acceptance runs once before listener, never on each Render health poll',()=>{
 const entry=fs.readFileSync(path.join(root,'artifacts/api-server/src/index.ts'),'utf8');
 const app=fs.readFileSync(path.join(root,'artifacts/api-server/src/app.ts'),'utf8');
 const mount=fs.readFileSync(path.join(root,
  'artifacts/api-server/src/services/hostedV1CatalogMediaReadiness.ts'),'utf8');
 assert.match(entry,/assertHostedV1CatalogMediaMount\(process\.env\);[\s\S]*?assertHostedV1CatalogMediaIoReady\(process\.env\);[\s\S]*?startupStage = "database_rls"/);
 assert.match(mount,/fs\.openSync\(probePath, "wx", 0o600\)/);
 assert.match(mount,/fs\.writeSync\(fileDescriptor, proof\)/);
 assert.match(mount,/fs\.fsyncSync\(fileDescriptor\)/);
 assert.match(mount,/fs\.readFileSync\(probePath\)/);
 assert.match(mount,/crypto\.timingSafeEqual\(proof, readBack\)/);
 assert.match(mount,/fs\.rmSync\(probePath/);
 assert.doesNotMatch(app,/assertHostedV1CatalogMediaIoReady/);
});
