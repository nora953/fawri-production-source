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
    ...known.archived,...known.retired,known.staging,known.oldRehearsal,known.cleanRehearsal,
    known.frozenRecovery,known.historicalAcl2Recovery,known.historicalAclRehearsal,
    known.currentAcl0Recovery,known.nativeResetDrill,
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

const branch=(id,parent_id,state="ready",isDefault=false)=>({
  id,parent_id,current_state:state,default:isDefault,primary:isDefault,
});
const inventory=()=>[
  branch(known.production,null,"ready",true),
  branch(known.staging,known.production),
  branch(known.oldRehearsal,known.staging),
  branch(known.cleanRehearsal,known.staging),
  {...branch(known.frozenRecovery,known.staging),parent_lsn:"0/473AAE0"},
  {...branch(known.historicalAcl2Recovery,known.staging),parent_lsn:"0/492E628"},
  {...branch(known.historicalAclRehearsal,known.historicalAcl2Recovery),
    parent_lsn:"0/49957D8"},
  {...branch(known.nativeResetDrill,known.historicalAcl2Recovery),
    parent_lsn:"0/4A38530",last_reset_at:"2026-11-07T21:01:06Z"},
  {...branch(known.currentAcl0Recovery,known.staging),parent_lsn:"0/4B771F8"},
  branch(known.archived[0],known.staging,"archived"),
];

test("FIELD002-R2 recognizes current pinned 10-branch live inventory but never authorizes release",()=>{
  const value=assertField002KnownNeonLineage(inventory());
  assert.equal(value.archivedSourcesQuarantined,4);
  assert.equal(value.stagingRecoveryLineageVerified,true);
  assert.equal(value.currentAcl0RecoveryLineageVerified,true);
  assert.equal(value.disposableNativeResetLineageVerified,true);
  assert.equal(value.deploymentAuthorized,false);
  assert.equal(value.field002Closed,false);
});

test("FIELD002-R2 rejects missing, wrong-parent, forged-reset, unarchived or privileged branches",()=>{
  const items=[
    inventory().map(x=>x.id===known.archived[0]?{...x,current_state:"ready"}:x),
    inventory().map(x=>x.id===known.production?{...x,default:false}:x),
    inventory().map(x=>x.id===known.production?{...x,parent_id:known.staging}:x),
    inventory().map(x=>x.id===known.cleanRehearsal?{...x,parent_id:known.production}:x),
    inventory().filter(x=>x.id!==known.archived[0]),
    inventory().filter(x=>x.id!==known.frozenRecovery),
    inventory().filter(x=>x.id!==known.historicalAcl2Recovery),
    inventory().filter(x=>x.id!==known.currentAcl0Recovery),
    inventory().map(x=>x.id===known.currentAcl0Recovery?{...x,parent_id:known.historicalAcl2Recovery}:x),
    inventory().map(x=>x.id===known.currentAcl0Recovery?{...x,parent_lsn:"0/4B771F9"}:x),
    inventory().map(x=>x.id===known.nativeResetDrill?{...x,parent_id:known.staging}:x),
    inventory().map(x=>x.id===known.nativeResetDrill?{...x,last_reset_at:null}:x),
    inventory().map(x=>x.id===known.nativeResetDrill?{...x,current_state:"resetting"}:x),
    inventory().map(x=>x.id===known.frozenRecovery?{...x,parent_lsn:"0/473AAE1"}:x),
    [...inventory(),inventory()[0]],
    [...inventory(),branch("br-unknown-extra",known.staging)],
    [...inventory(),{...branch("br-extra-primary",known.staging),default:true}],
    null,[],[null],
  ];
  for(const item of items){
    assert.throws(()=>assertField002KnownNeonLineage(item),
      /FIELD002_R2_(?:BRANCH_INVENTORY_INVALID|BRANCH_INVENTORY_CHANGED|BRANCH_LINEAGE_CHANGED|ARCHIVED_BRANCH_STATE_CHANGED)/);
  }
});

test("FIELD002-R2 historical deleted identifiers remain excluded but cannot be required as present",()=>{
  for(const retired of known.retired){
    assert.equal(inventory().some(x=>x.id===retired),false);
    assert.throws(()=>assertField002KnownNeonLineage([...inventory(),
      branch(retired,known.staging,"archived")]),/FIELD002_R2_RETIRED_SOURCE_REAPPEARED/);
    assert.throws(()=>assertField002FirstCommercialSourcePolicy({
      ...safe(),source_branch_id:retired,
    }),/FIELD002_R2_ARCHIVED_SOURCE_QUARANTINED/);
  }
});
