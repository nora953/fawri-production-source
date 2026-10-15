import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createServer} from 'node:http';
import {stripTypeScriptTypes} from 'node:module';

export const root=new URL('../../../',import.meta.url);
export const read=p=>fs.readFileSync(new URL(p,root),'utf8');
export function queue(dir,clock){
  const source=stripTypeScriptTypes(read('artifacts/api-server/src/services/durableJobQueue.ts'),{mode:'transform'})
    .replace(/^import[^;]+;\s*$/gm,'').replace(/^export\s+/gm,'');
  return vm.runInNewContext(`(()=>{${source};return {enqueueDurableJob,listDurableJobs,startDurableJobWorker,requeueDeadLetterJob};})()`,{
    fs,path,crypto,process,structuredClone,console,setInterval,clearInterval,
    Date:clock||Date,getFawriDataFilePath:name=>path.join(dir,name),
  });
}
if(process.argv[2]==='child'){
  const dir=process.argv[3],q=queue(dir);
  q.enqueueDurableJob({type:'audit',dedupeKey:'owned-synthetic',payload:{},maxAttempts:3});
  let resume;
  const gate=new Promise(ok=>{resume=ok;});
  const worker=q.startDurableJobWorker({workerId:'child',pollIntervalMs:60000,visibilityTimeoutMs:60000,
    handlers:{audit:async()=>{
      fs.appendFileSync(path.join(dir,'effects.txt'),'synthetic-effect\n');
      process.send({type:'started'});
      await gate;return {done:true};
    }}});
  const server=createServer((req,res)=>res.end('synthetic'));
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const raw=read('artifacts/api-server/src/index.ts');
  const a=raw.indexOf('function shutdown('),b=raw.indexOf('\n  process.once("SIGTERM"',a);
  if(a<0||b<a)throw Error('shutdown extraction boundary changed');
  const body=stripTypeScriptTypes(raw.slice(a,b),{mode:'transform'});
  const shutdown=vm.runInNewContext(`(()=>{let shuttingDown=false;${body};return shutdown;})()`,{
    process,server,setTimeout,clearTimeout,metaWebhookWorker:worker,
    merchantMediaCleanupReconciler:null,earlyWarningMonitor:null,
    runtime:{dispose(){fs.appendFileSync(path.join(dir,'events.txt'),'dispose\n');}},
    logger:{info(){},error(){}},
  });
  process.once('SIGTERM',()=>shutdown('SIGTERM'));
  process.on('message',message=>{
    if(message==='resume')resume();
    if(message==='stop-resume'){worker.stop();resume();}
  });
  await worker.runOnce();
  worker.stop();process.send({type:'completed'});
  server.close(()=>process.exit(0));
}
