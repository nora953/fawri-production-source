/** Real, isolated PG18 integration for the G5 recurring reader preflight.
 * Uses a private Unix socket in a disposable CI Docker container only.
 * No real connection URLs, credentials, providers or application data.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { READER_PREFLIGHT_SQL, dumpArguments, sealRecurringDump } from "./v1-recurring-encrypted-db-backup.mjs";
import { openIsolatedDump } from "./lib/v1-isolated-neon-dump-safety.mjs";
const name="fawri-g5-recurring-fixture-"+process.pid;
const run=(args,input)=> {
 const r=spawnSync("docker",args,{input,timeout:90000,maxBuffer:8*1024*1024,env:{PATH:process.env.PATH,HOME:process.env.HOME}});
 assert.equal(r.error,undefined);
 assert.equal(r.status,0, "disposable docker command failed");
 return r.stdout;
};
const sql=(query,role="postgres",db="fawri",readOnly=false)=>run(["exec","-i","-e","PGOPTIONS="+(readOnly?"-c default_transaction_read_only=on":""),name,"psql","-X","-Atq","-v","ON_ERROR_STOP=1","-U",role,"-d",db],query).toString().trim();
const reader="fawri_v1_recurring_backup_reader";
const preflight=()=>sql(READER_PREFLIGHT_SQL,reader,"fawri",true);
assert.equal(process.env.GITHUB_ACTIONS,"true");
assert.equal(process.env.FAWRI_G5_DISPOSABLE_READER_DRILL,"1");
try {
 run(["run","--detach","--name",name,"--network","none","-e","POSTGRES_HOST_AUTH_METHOD=trust","postgres:18-alpine"]);
 let ready=false;
 for(let i=0;i<30;i++){
  const r=spawnSync("docker",["exec",name,"pg_isready","-h","127.0.0.1","-U","postgres"],{timeout:3000});
  if(r.status===0 && spawnSync("docker",["exec",name,"psql","-X","-U","postgres","-d","postgres","-Atq","-c","SELECT 1"],{timeout:3000}).status===0){ready=true;break;}
  spawnSync("sleep",["1"]);
 }
 assert.ok(ready);
 sql("CREATE DATABASE fawri;","postgres","postgres");
 sql("CREATE ROLE "+reader+" LOGIN NOINHERIT BYPASSRLS; CREATE TABLE public.orders(id int PRIMARY KEY, merchant text NOT NULL); INSERT INTO public.orders VALUES (1,'fixture-a'),(2,'fixture-b'); ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY; ALTER TABLE public.orders FORCE ROW LEVEL SECURITY; CREATE POLICY deny_ordinary_reader ON public.orders FOR SELECT USING (false); GRANT USAGE ON SCHEMA public TO "+reader+"; GRANT SELECT ON public.orders TO "+reader+";");
 assert.equal(preflight(),"G5_READER_ACCEPTED");
 assert.equal(sql("SELECT count(*) FROM public.orders;",reader,"fawri",true),"2");
 sql("ALTER ROLE "+reader+" NOBYPASSRLS;");
 assert.equal(preflight(),"G5_READER_DENIED");
 assert.equal(sql("SELECT count(*) FROM public.orders;",reader,"fawri",true),"0");
 const deniedDump=spawnSync("docker",["exec",name,"pg_dump","-U",reader,...dumpArguments()],{timeout:20000});
 assert.notEqual(deniedDump.status,0,"RLS-filtered export must fail rather than silently omit data");
 sql("ALTER ROLE "+reader+" BYPASSRLS; GRANT UPDATE(merchant) ON public.orders TO "+reader+";");
 assert.equal(preflight(),"G5_READER_DENIED");
 sql("REVOKE UPDATE(merchant) ON public.orders FROM "+reader+"; CREATE FUNCTION public.fixture_write() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';");
 assert.equal(preflight(),"G5_READER_DENIED");
 sql("REVOKE EXECUTE ON FUNCTION public.fixture_write() FROM PUBLIC;");
 assert.equal(preflight(),"G5_READER_ACCEPTED");
 const raw=run(["exec","-e","PGOPTIONS=-c default_transaction_read_only=on",name,"pg_dump","-U",reader,...dumpArguments()]);
 const pass="synthetic isolated fixture backup passphrase";
 const {encrypted,manifest}=sealRecurringDump(raw,pass,new Date().toISOString());
 assert.equal(manifest.offsite_verified,false);
 const plain=openIsolatedDump(encrypted,pass);
 sql("CREATE DATABASE fawri_restore_fixture;","postgres","postgres");
 run(["exec","-i",name,"pg_restore","-U","postgres","-d","fawri_restore_fixture","--no-owner","--no-acl","--single-transaction","--exit-on-error"],plain);
 assert.equal(sql("SELECT string_agg(merchant,',' ORDER BY id) FROM public.orders;","postgres","fawri_restore_fixture"),"fixture-a,fixture-b");
 raw.fill(0);plain.fill(0);
 console.log("G5_NONEMPTY_RLS_FIXTURE_RESTORED; PRODUCTION_NOT_CONNECTED");
} finally {
 spawnSync("docker",["rm","-f",name],{stdio:"ignore",timeout:20000});
}
