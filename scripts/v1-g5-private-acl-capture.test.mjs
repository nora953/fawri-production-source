import test from "node:test";
import assert from "node:assert/strict";
import {sealCatalog,openCatalog,privateClientEnv} from "./v1-g5-private-acl-capture.mjs";
const pass="synthetic-fixture-password-not-live";
const catalog=()=>({
 format:"fawri-g5-postg4-acl-catalog-v1",database:"fawri",server_major:18,read_only:true,captured_at:"2026-11-25T00:00:00Z",
 roles:["fawri_restricted_runtime","fawri_auth_issuer","fawri_operator_issuer","fawri_owner","fawri_fixture_writer"].map(rolname=>({rolname,rolcanlogin:true,rolsuper:false,rolinherit:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,rolbypassrls:false})),
 membership_edges:Array.from({length:5},(_,i)=>({role:"fixture"+i,member:"fawri_owner"})),
 schemas:[],relations:Array.from({length:102},(_,i)=>({schema:"public",kind:"r",name:"fixture_"+i,rls:i<84})),
 column_acls:Array.from({length:25},()=>({})),routines:[],types:[],default_acls:[{},{}],
 policy_roles:Array.from({length:83},()=>({})),extensions:[],
});
test("authenticated round trip and randomized encryption; does not claim parity",()=>{
 const c=catalog(),a=sealCatalog(c,pass),b=sealCatalog(c,pass);
 assert.notDeepEqual(a,b);assert.equal(a.includes(Buffer.from("fixture_0")),false);
 const o=openCatalog(a,pass);assert.deepEqual(o.catalog,c);
 assert.equal(o.archive_acl_parity_verified,false);assert.equal(o.restore_accepted,false);
 assert.equal(o.referenced_archive_cipher_sha256,"6d29bc341de17dea0f1bb7851a3fe35367d68fbaf3743683499db094152e7a6e");
});
test("wrong key, corruption and truncation fail closed",()=>{
 const a=sealCatalog(catalog(),pass);assert.throws(()=>openCatalog(a,pass+"wrong"));
 const b=Buffer.from(a);b[b.length-1]^=1;assert.throws(()=>openCatalog(b,pass));
 assert.throws(()=>openCatalog(a.subarray(0,20),pass));assert.throws(()=>sealCatalog(catalog(),"short"));
});
test("schema drift and unsafe runtime roles fail closed",()=>{
 const c=catalog();c.relations.pop();assert.throws(()=>sealCatalog(c,pass));
 const d=catalog();d.roles[0].rolbypassrls=true;assert.throws(()=>sealCatalog(d,pass));
 const e=catalog();e.membership_edges[0].member="fawri_auth_issuer";assert.throws(()=>sealCatalog(e,pass));
});
test("private connection admission never connects and rejects CI or wrong target",()=>{
 const target=new URL("postgresql://ep-polished-poetry-b9jpvn4r.c-7.eu-central-1.aws.neon.tech/fawri?sslmode=verify-full");
 target.username="fawri_owner";target.password="synthetic-only";
 const url=target.toString();
 const env={FAWRI_G5_PRIVATE_ACL_CAPTURE_APPROVED:"1",FAWRI_G5_PRIVATE_OWNER_URL:url,PGSERVICE:"unsafe"};
 const p=privateClientEnv(env);assert.equal(p.PGSSLMODE,"verify-full");assert.equal(p.PGCHANNELBINDING,"require");assert.equal(p.PGSERVICE,undefined);
 for(const bad of [{CI:"true"},{GITHUB_ACTIONS:"true"},{FAWRI_G5_PRIVATE_ACL_CAPTURE_APPROVED:"0"},{FAWRI_G5_PRIVATE_OWNER_URL:url.replace("verify-full","require")},{FAWRI_G5_PRIVATE_OWNER_URL:url.replace("fawri_owner","other")},{FAWRI_G5_PRIVATE_OWNER_URL:url.replace("neon.tech","example.com")}])assert.throws(()=>privateClientEnv({...env,...bad}));
});
