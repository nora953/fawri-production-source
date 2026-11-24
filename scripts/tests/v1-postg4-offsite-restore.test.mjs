import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sealIsolatedDump } from "../lib/v1-isolated-neon-dump-safety.mjs";
import { verifyOffsiteArchive, dockerRestoreArgs } from "../v1-postg4-offsite-restore.mjs";
const pass = "synthetic fixture passphrase only";
const sha = b => createHash("sha256").update(b).digest("hex");
function fixture() {
 const plain = Buffer.from("PGDMP synthetic test data; not a restore fixture");
 const cipher = sealIsolatedDump(plain, pass);
 const hash = sha(cipher);
 const manifest = {
 format:"fawri-postg4-worker-rls-pg18-aes256gcm-v1",
 source_project:"crimson-cherry-65705041",source_branch:"br-holy-waterfall-b993zglb",
 source_database:"fawri",target_scope:"EXACT_OWNER1_POS_OFF_WORKER_RLS2_POST_G4",
 public_tables:102,rls_tables:84,rls_policies:83,restored_ledger:54,held_g4_schema_files:6,
 owner_accounts:1,usable_owners:1,global_roles_not_in_pg_dump:true,secrets_in_artifact:false,
 custom_archive_bytes:plain.length,custom_archive_sha256:sha(plain),
 encrypted_bytes:cipher.length,encrypted_sha256:hash,
 };
 return {plain,cipher,hash,manifest};
}
test("independent hash and authenticated archive verified",()=>{
 const {plain,cipher,hash,manifest}=fixture();
 assert.deepEqual(verifyOffsiteArchive(manifest,cipher,pass,hash),plain);
});
test("wrong scope, missing independent hash, mismatch and wrong passphrase denied",()=>{
 const {cipher,hash,manifest}=fixture();
 for(const bad of [{...manifest,source_branch:"wrong"},{...manifest,public_tables:101},{...manifest,custom_archive_sha256:"0".repeat(64)},{...manifest,encrypted_bytes:0}]) {
 assert.throws(()=>verifyOffsiteArchive(bad,cipher,pass,hash));
 }
 assert.throws(()=>verifyOffsiteArchive(manifest,cipher,pass,""));
 assert.throws(()=>verifyOffsiteArchive(manifest,cipher,pass,"0".repeat(64)));
 assert.throws(()=>verifyOffsiteArchive(manifest,cipher,"wrong passphrase longer than 24 characters",hash));
});
test("tampered ciphertext rejected even if substituted hash supplied",()=>{
 const {cipher,manifest}=fixture();
 cipher[cipher.length-1]^=1;
 assert.throws(()=>verifyOffsiteArchive({...manifest,encrypted_sha256:sha(cipher)},cipher,pass,sha(cipher)));
});
test("docker restore is ephemeral, network isolated, with no host volumes or env forwarding",()=>{
 const a=dockerRestoreArgs();
 assert.ok(a.includes("--rm")&&a.includes("--network=none")&&a.includes("--pull=never"));
 assert.ok(a.includes("--cap-drop=ALL")&&a.includes("--user=postgres"));
 assert.ok(!a.some(x=>["-v","--volume","--mount","-e","--env","--privileged"].includes(x)));
 assert.match(a.at(-1),/pg_restore --dbname=fawri_ci --no-owner --no-acl/);
});
