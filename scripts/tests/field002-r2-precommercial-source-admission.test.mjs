import assert from "node:assert/strict";
import test from "node:test";
import {
  FIELD002_R2_PROJECT_ID, FIELD002_R2_BRANCHES,
  assertField002FirstCommercialSourcePolicy,
  assertField002KnownNeonLineage,
} from "../lib/field002-r2-precommercial-source-admission.mjs";

const known=FIELD002_R2_BRANCHES;
const safe=()=>({
  intent:"first_commercial_launch",
  project_id:FIELD002_R2_PROJECT_ID,
  target_branch_id:known.production,
  source_mode:"fresh_schema_migrations_only",
  source_branch_id:null,
  source_backup_id:null,
  data_import_requested:false,
  restore_requested:false,
});

test("FIELD002-R2 accepts only fresh-schema-only source policy, NOT deployment authority",()=>{
  const result=assertField002FirstCommercialSourcePolicy(safe());
  assert.equal(result.decision,"SCHEMA_ONLY_SOURCE_POLICY_COMPATIBLE");
  assert.equal(result.requiresIndependentHostedVerification,true);
  assert.equal(result.deploymentAuthorized,false);
  assert.equal(result.field002Closed,false);
});

test("FIELD002-R2 blocks archived staging backups and every old or clean branch source",()=>{
  for(const source of [
    ...known.archived,known.staging,known.oldRehearsal,known.cleanRehearsal,
    known.production,"br-synthetic-unknown","",12,{},undefined
  ]){
    assert.throws(
      ()=>assertField002FirstCommercialSourcePolicy({...safe(),source_branch_id:source}),
      /FIELD002_R2_(?:ARCHIVED_SOURCE_QUARANTINED|PRECOMMERCIAL_DATA_SOURCE_FORBIDDEN)/,
      String(source)
    );
  }
});

test("FIELD002-R2 refuses restored artifact, data-copy and misleading commercial recovery modes",()=>{
  for(const candidate of [
    {...safe(),source_backup_id:"backup-pre-cleanup"},
    {...safe(),source_backup_id:""},
    {...safe(),source_mode:"clone"},
    {...safe(),source_mode:"backup_and_restore"},
    {...safe(),data_import_requested:true},
    {...safe(),restore_requested:true},
  ]){
    assert.throws(()=>assertField002FirstCommercialSourcePolicy(candidate),
      /FIELD002_R2_PRECOMMERCIAL_DATA_SOURCE_FORBIDDEN/);
  }
  for(const candidate of [
    null,undefined,[],{...safe(),approved:true},
    (({source_branch_id,...rest})=>rest)(safe()),
    {...safe(),intent:"merchant_recovery"},
    {...safe(),intent:"first_commercial_launch",target_branch_id:known.staging},
    {...safe(),project_id:"different-project"},
    Object.create(null),
  ]){
    assert.throws(()=>assertField002FirstCommercialSourcePolicy(candidate),
      /FIELD002_R2_(?:SOURCE_MANIFEST_MALFORMED|RELEASE_TARGET_UNVERIFIED)/);
  }
});

const branch=(id, parent_id, state="ready", isDefault=false)=>({
  id,parent_id,current_state:state,default:isDefault,primary:isDefault,
});
const inventory=()=>[
  branch(known.production,undefined,"ready",true),
  branch(known.staging,known.production),
  branch(known.oldRehearsal,known.staging),
  branch(known.cleanRehearsal,known.staging),
  branch(known.archived[0],known.staging,"archived"),
  branch(known.archived[1],known.staging,"archived"),
  branch(known.archived[2],known.archived[1],"archived"),
];

test("FIELD002-R2 verifies pinned Neon lineage and three archived sources; never authorizes release",()=>{
  const value=assertField002KnownNeonLineage(inventory());
  assert.equal(value.archivedSourcesQuarantined,3);
  assert.equal(value.deploymentAuthorized,false);
  assert.equal(value.field002Closed,false);
});

test("FIELD002-R2 rejects unarchived snapshots, moved default/parents, missing or duplicate metadata",()=>{
  const cases=[
    inventory().map(x=>x.id===known.archived[0]?{...x,current_state:"ready"}:x),
    inventory().map(x=>x.id===known.production?{...x,default:false}:x),
    inventory().map(x=>x.id===known.cleanRehearsal?{...x,parent_id:known.production}:x),
    inventory().filter(x=>x.id!==known.archived[2]),
    [...inventory(),inventory()[0]],
    [...inventory(),{...branch("br-new",known.staging),default:true}],
    null,[],[null]
  ];
  for(const item of cases){
    assert.throws(()=>assertField002KnownNeonLineage(item),
      /FIELD002_R2_(?:BRANCH_INVENTORY_INVALID|BRANCH_LINEAGE_CHANGED|ARCHIVED_BRANCH_STATE_CHANGED)/);
  }
});
