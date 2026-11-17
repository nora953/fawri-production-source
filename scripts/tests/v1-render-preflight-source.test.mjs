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
