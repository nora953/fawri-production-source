// Read-only audit generator. Does not import or execute application modules.
// Requires the explicitly selected Playwright Babel bundle used by this run.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.argv[2];
const inputs = process.argv[3];
const output = process.argv[4];
const {babelParse} = require(process.env.FAWRI_INVENTORY_BABEL_BUNDLE);
const input = JSON.parse(fs.readFileSync(path.join(inputs, 'input.json'), 'utf8'));
const modules = new Map(), routerKeys = new Set(), aliases = new Map();
const registrations = [], uses = [], parseFailures = [], startupCandidates = [];
const sha = text => crypto.createHash('sha1').update('blob ' + Buffer.byteLength(text) + '\0').update(text).digest('hex');
function read(entry) {
  const override = path.join(inputs, entry.path);
  const text = fs.readFileSync(fs.existsSync(override) ? override : path.join(root, entry.path), 'utf8');
  if (sha(text) !== entry.sha) throw Error('Git blob mismatch: ' + entry.path);
  return text;
}
function walk(node, fn, parents = []) {
  if (!node || typeof node !== 'object') return;
  if (node.type) fn(node, parents);
  for (const [key, value] of Object.entries(node)) {
    if (['loc','start','end','extra','comments','tokens','leadingComments','trailingComments','innerComments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, fn, [...parents, node]));
    else if (value && typeof value === 'object') walk(value, fn, [...parents, node]);
  }
}
const unwrap = n => n && ['TSAsExpression','TSTypeAssertion','TSNonNullExpression','ParenthesizedExpression'].includes(n.type) ? unwrap(n.expression) : n;
const str = n => n?.type === 'StringLiteral' ? n.value : n?.type === 'TemplateLiteral' && n.expressions.length === 0 ? n.quasis[0].value.cooked : null;
const prop = n => n?.type === 'Identifier' ? n.name : str(n);
function target(from, spec) {
  if (!spec.startsWith('.')) return null;
  const p = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec.replace(/\.(js|mjs)$/, '')));
  return [p,p+'.ts',p+'.tsx',p+'/index.ts'].find(p => input.apiEntries.some(e => e.path === p)) || null;
}
function summarize(m, n) { return m.text.slice(n.start,n.end).replace(/\s+/g,' ').slice(0,200); }
function localKey(file, name) { return file + '#' + name; }
for (const entry of input.apiEntries) {
  const text = read(entry);
  if (!/\.[cm]?tsx?$/.test(entry.path) || entry.path.endsWith('.d.ts')) continue;
  let ast;
  try { ast = babelParse(text, entry.path, true); }
  catch (error) { parseFailures.push({path:entry.path,error:error.message}); continue; }
  const m = {path:entry.path,sha:entry.sha,text,ast,imports:new Map(),exports:new Map(),stars:[],factories:new Map(),calls:[]};
  modules.set(entry.path,m);
  for (const node of ast.program.body) {
    if (node.type === 'ImportDeclaration' && node.importKind !== 'type') {
      for (const s of node.specifiers) if (s.importKind !== 'type') m.imports.set(s.local.name,{file:target(entry.path,node.source.value),name:s.type==='ImportDefaultSpecifier'?'default':s.type==='ImportNamespaceSpecifier'?'*':prop(s.imported)});
    }
    if (node.type === 'ExportAllDeclaration') m.stars.push(target(entry.path,node.source.value));
    if (node.type === 'ExportDefaultDeclaration') {
      const d=unwrap(node.declaration);
      m.exports.set('default',d.type==='Identifier'?{local:d.name}:d.id?{local:d.id.name}:null);
    }
    if (node.type === 'ExportNamedDeclaration' && node.exportKind !== 'type') {
      const d=node.declaration;
      if (d?.type === 'VariableDeclaration') for(const v of d.declarations) if(v.id.type==='Identifier') m.exports.set(v.id.name,{local:v.id.name});
      else if(d?.id) m.exports.set(d.id.name,{local:d.id.name});
      // Function exports need a separate branch (not the inner declaration loop).
      if(d?.type==='FunctionDeclaration' && d.id) m.exports.set(d.id.name,{local:d.id.name});
      for(const s of node.specifiers) m.exports.set(prop(s.exported),node.source?{file:target(entry.path,node.source.value),name:prop(s.local)}:{local:prop(s.local)});
    }
  }
  walk(ast,(n,parents)=>{
    if(n.type==='VariableDeclarator' && n.id.type==='Identifier') {
      const init=unwrap(n.init);
      if(init?.type==='CallExpression') {
        const name=init.callee.type==='Identifier'?init.callee.name:prop(init.callee.property);
        if(name==='Router' || (entry.path.endsWith('/app.ts') && n.id.name==='app')) routerKeys.add(localKey(entry.path,n.id.name));
        else m.factories.set(n.id.name,{callee:init.callee});
      }
    }
    if(n.type==='ReturnStatement' && unwrap(n.argument)?.type==='Identifier') {
      const f=[...parents].reverse().find(p=>p.type==='FunctionDeclaration');
      if(f?.id) m.factories.set('return:'+f.id.name,{local:unwrap(n.argument).name});
    }
    if(n.type!=='CallExpression') return;
    m.calls.push(n);
    if(n.callee.type==='Identifier' && /^(start|bootstrap|reconcile|schedule)/.test(n.callee.name)) startupCandidates.push({path:entry.path,line:n.loc.start.line,callee:n.callee.name,context:'STATIC_CALL_CANDIDATE_NOT_RUNTIME_REACHABILITY'});
    const cal=unwrap(n.callee); if(cal?.type!=='MemberExpression') return;
    const method=prop(cal.property);
    if(!['get','post','put','patch','delete','head','options','all','use'].includes(method))return;
    let receiver=unwrap(cal.object), routePath=n.arguments[0], args=n.arguments.slice(1);
    if(receiver?.type==='CallExpression' && receiver.callee.type==='MemberExpression' && prop(receiver.callee.property)==='route') {
      routePath=receiver.arguments[0];args=n.arguments;receiver=unwrap(receiver.callee.object);
    }
    if(receiver?.type!=='Identifier')return;
    let variants=null;
    if(routePath?.type==='TemplateLiteral' && routePath.expressions.length===1 && routePath.expressions[0].type==='Identifier') {
      const variable=routePath.expressions[0].name;
      const loop=[...parents].reverse().find(p=>p.type==='ForOfStatement' && p.left?.declarations?.[0]?.id?.name===variable);
      const values=unwrap(loop?.right);
      if(values?.type==='ArrayExpression' && values.elements.every(v=>str(v)!==null)) variants=values.elements.map(v=>routePath.quasis[0].value.cooked+str(v)+routePath.quasis[1].value.cooked);
    }
    const item={file:entry.path,line:n.loc.start.line,receiver:receiver.name,method,path:str(routePath),variants,pathExpression:routePath?summarize(m,routePath):null,args,node:n};
    if(method==='use') {if(item.path===null)item.args=n.arguments;uses.push(item);} else registrations.push(item);
  });
}
function binding(file,name,seen=new Set()) {
  const key=localKey(file,name);if(seen.has(key))return key;seen.add(key);
  const m=modules.get(file);if(!m)return key;
  const imp=m.imports.get(name);if(imp?.file)return exported(imp.file,imp.name,seen);
  const fac=m.factories.get(name);
  if(fac?.callee?.type==='Identifier') {
    const imp=m.imports.get(fac.callee.name);
    if(imp?.file)return factory(imp.file,imp.name,seen) || key;
    return factory(file,fac.callee.name,seen) || key;
  }
  return key;
}
function exported(file,name,seen=new Set()) {
  const m=modules.get(file);if(!m)return localKey(file,name);
  const ex=m.exports.get(name);
  if(ex?.file)return exported(ex.file,ex.name,seen);
  if(ex?.local)return binding(file,ex.local,seen);
  for(const star of m.stars) {
    if(!star || seen.has('export:'+star+':'+name))continue;
    const next=new Set(seen);next.add('export:'+star+':'+name);
    const value=exported(star,name,next);
    if(value!==localKey(star,name))return value;
    if(modules.get(star)?.exports.has(name))return value;
  }
  return localKey(file,name);
}
function factory(file,name,seen) {
  const m=modules.get(file);if(!m)return null;
  const ex=m.exports.get(name);const local=ex?.local||name;
  const ret=m.factories.get('return:'+local);return ret?binding(file,ret.local,seen):null;
}
function argRouter(file,node) {
  node=unwrap(node);
  if(node?.type==='Identifier')return binding(file,node.name);
  if(node?.type==='CallExpression' && node.callee.type==='Identifier') {
    const imp=modules.get(file).imports.get(node.callee.name);
    return imp?.file?factory(imp.file,imp.name,new Set()):factory(file,node.callee.name,new Set());
  }
  return null;
}
const mounts=[],guards=[];
for(const u of uses) {
  const parent=binding(u.file,u.receiver);if(!routerKeys.has(parent))continue;
  for(const arg of u.args) {
    const child=argRouter(u.file,arg);
    if(child && routerKeys.has(child))mounts.push({parent,child,prefix:u.path||'',file:u.file,line:u.line});
    else guards.push({router:parent,prefix:u.path||'',file:u.file,line:u.line,expression:summarize(modules.get(u.file),arg),note:'ORDER_AND_CONDITIONS_MUST_BE_REVIEWED_NOT_AUTOMATIC_AUTHORIZATION'});
  }
}
const paths=new Map([[localKey('artifacts/api-server/src/app.ts','app'),[{prefix:'',chain:[]}]]]);
for(let i=0;i<30;i++) {
  let changed=false;
  for(const mount of mounts) for(const p of paths.get(mount.parent)||[]) {
    if(p.chain.some(x=>x.child===mount.child))continue;
    const prefix=(p.prefix+'/'+mount.prefix).replace(/\/+/g,'/').replace(/\/$/,'');
    const chain=[...p.chain,mount];const list=paths.get(mount.child)||[];
    if(!list.some(x=>x.prefix===prefix && JSON.stringify(x.chain)===JSON.stringify(chain))) {list.push({prefix,chain});paths.set(mount.child,list);changed=true;}
  }
  if(!changed)break;
}
function details(m,node) {
  const calls=new Set(),permissions=new Set(),responseKeys=new Set(),imports=new Map();let responseSpreads=false;
  walk(node,n=>{
    if(n.type==='CallExpression' && n.callee.type==='Identifier') {
      const name=n.callee.name;calls.add(name);
      const im=m.imports.get(name);if(im?.file)imports.set(name,{local:name,module:im.file,export:im.name});
      if(/require|permission|authorize|assert|enforce|allowed/i.test(name))for(const arg of n.arguments){const s=str(arg);if(s!==null)permissions.add(s);}
    }
    if(n.type==='CallExpression' && n.callee.type==='MemberExpression' && prop(n.callee.property)==='json') {
      const data=unwrap(n.arguments[0]);
      if(data?.type==='ObjectExpression') for(const p of data.properties) {
        if(p.type==='SpreadElement')responseSpreads=true;else if(prop(p.key)!==null)responseKeys.add(prop(p.key));
      }else responseSpreads=true;
    }
  });
  return {authorizationCallCandidates:[...calls].filter(x=>/require|permission|authorize|assert|enforce|allowed/i.test(x)).sort(),permissionLiteralCandidates:[...permissions].sort(),directImportedCallCandidates:[...imports.values()].sort((a,b)=>a.local.localeCompare(b.local)),responseTopLevelKeyCandidates:[...responseKeys].sort(),opaqueOrSpreadResponse:responseSpreads};
}
const tests=[];
for(const entry of input.testEntries) {
  const text=read(entry);if(!/\.[cm]?[jt]sx?$/.test(entry.path) || entry.path.endsWith('.d.ts'))continue;
  try {
    const ast=babelParse(text,entry.path,true),strings=[];
    walk(ast,n=>{let s=n.type==='StringLiteral'?n.value:n.type==='TemplateLiteral'?n.quasis.map(q=>q.value.cooked).join('__EXPR__'):null;
      if(s && (s.startsWith('/') || s.includes('/api/')))strings.push({value:s,line:n.loc.start.line});});
    tests.push({path:entry.path,sha:entry.sha,strings});
  }catch(error){parseFailures.push({path:entry.path,error:error.message});}
}
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const routes=[],unresolved=[];
for(const r of registrations) {
  const owner=binding(r.file,r.receiver);if(!routerKeys.has(owner))continue;
  const mounted=paths.get(owner)||[];
  if((r.path===null && !r.variants) || !mounted.length) {unresolved.push({file:r.file,line:r.line,method:r.method,pathExpression:r.pathExpression,router:owner,mountResolved:mounted.length>0,reason:r.path===null?'NON_LITERAL_PATH':'NO_APP_MOUNT_RESOLVED'});continue;}
  const m=modules.get(r.file),d=details(m,r.node);
  d.authorizationCallCandidates=[...new Set([...d.authorizationCallCandidates,...r.args.map(unwrap).filter(n=>n?.type==='Identifier'&&/require|permission|authorize|assert|enforce|allowed/i.test(n.name)).map(n=>n.name)])].sort();
  for(const declaredPath of r.variants||[r.path]) for(const mountedPath of mounted) {
    if(!declaredPath.startsWith('/') && declaredPath!=='*')continue;
    const fullPath=(mountedPath.prefix+'/'+declaredPath).replace(/\/+/g,'/').replace(/\/$/,'')||'/';
    const rx=new RegExp(esc(fullPath).replace(/:[A-Za-z0-9_]+/g,'[^/?\\s]+')+'(?=[/?#\\s]|$)');
    const relative=(declaredPath.replace(/\/$/,'')||'/');
    const relativeRx=relative.length>5?new RegExp('^'+esc(relative).replace(/:[A-Za-z0-9_]+/g,'[^/?\\s]+')+'(?=[/?#\\s]|$)'):null;
    const refs=[];
    for(const t of tests){const exact=t.strings.filter(s=>rx.test(s.value));const relative=t.strings.filter(s=>relativeRx?.test(s.value));const hits=[...exact,...relative];if(hits.length)refs.push({path:t.path,sourceBlobSha:t.sha,lines:[...new Set(hits.map(h=>h.line))],matchKind:exact.length?'FULL_PATH_LITERAL':'RELATIVE_PATH_REQUIRES_TEST_HELPER_MOUNT_REVIEW',status:'LITERAL_TEST_REFERENCE_ONLY_NOT_CASE_OR_RUNTIME_ACCEPTANCE'});}
    const proofRefs=input.proofInventory.rows.filter(p=>refs.some(t=>t.path===p.test_path)).map(p=>({gate:p.requirement_id,evidence:p.evidence_uri,scope:p.limits,status:p.status}));
    routes.push({sourceAnchor:r.file+':'+r.line,sourceBlobSha:m.sha,method:r.method.toUpperCase(),path:fullPath,declaredPathExpression:r.pathExpression,finiteLoopExpanded:!!r.variants,router:owner,mountChain:mountedPath.chain,handlerExpressions:r.args.map(n=>summarize(m,n)),...d,testSourceReferences:refs,existingProofIndexCandidates:proofRefs,reconciliationStatus:refs.length?'TEST_REFERENCE_REQUIRES_ASSERTION_AND_PROOF_REVIEW':'NO_LITERAL_TEST_REFERENCE_NOT_PROOF_OF_UNTESTED_ROUTE'});
  }
}
for(const route of routes) route.mountChain=route.mountChain.map(m=>mounts.indexOf(m));
const counts={verifiedApiSourceBlobs:input.apiEntries.length,parsedApiModules:modules.size,verifiedApiTestBlobs:input.testEntries.length,parsedTestModules:tests.length,routerIdentities:routerKeys.size,resolvedMountEdges:mounts.length,literalMountedRegistrationRows:routes.length,uniqueMethodPaths:new Set(routes.map(r=>r.method+' '+r.path)).size,nonliteralOrUnresolvedRegistrationRows:unresolved.length,parseFailures:parseFailures.length,registrationRowsWithLiteralTestReference:routes.filter(r=>r.testSourceReferences.length).length,registrationRowsWithoutLiteralTestReference:routes.filter(r=>!r.testSourceReferences.length).length};
const out={schemaVersion:1,date:'2026-10-27',gate:'P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX',source:input.source,status:'CURRENT_SOURCE_AST_CATALOG_NOT_FULL_AUTHORIZATION_ACCEPTANCE',applicationExecuted:false,newRuntimeTestsExecuted:false,newCiClaimed:false,completeP0Inventory:false,gateClosed:false,overallPercentage:null,release:'NO-GO',parser:{implementation:'Playwright bundled Babel parse, read-only AST; no application imports',playwrightVersion:require(path.join(path.dirname(process.env.FAWRI_INVENTORY_BABEL_BUNDLE),'../../package.json')).version,node:process.version},counts,limits:['Routes are source registration/mount rows, not unique accepted business cases or a P0 denominator.','Static mounts preserve import aliases and prefixes but do not evaluate middleware ordering, conditional next/retirement guards, runtime environment, overlapping handlers or dynamic imports.','Authorization names, permission literals and response keys are source candidates; opaque payloads and helper provenance require manual review.','Literal references in test source do not prove assertions, current CI execution, actor matrix completeness or accepted runtime coverage. No literal hit does not establish an untested route.','Existing proof index references retain their original bounded acceptance; matching a test file does not extend proof to every route in the file.','Startup list contains static call candidates, including calls inside functions and legacy/gated paths; it is not a live job inventory.','Nested fields, dynamic SQL/exports and external producers remain unresolved unless supported by separately reviewed evidence.'],sourceInputs:input.apiEntries.map(e=>({path:e.path,sha:e.sha})),testInputs:input.testEntries.map(e=>({path:e.path,sha:e.sha})),globalAndRouterMiddlewareCandidates:guards,routes,unresolvedRouteRegistrations:unresolved,startupCallCandidates:startupCandidates,parseFailures};
out.routerMountEdges=mounts;
out.reproduction={arguments:['repositoryRoot','inputDirectory','outputJson'],inputFile:'input.json',inputShape:'{source,apiEntries:[{path,sha}],testEntries:[{path,sha}],proofInventory:{rows}}; use sourceInputs/testInputs and the original proof index at source.',overrides:'Optional mirrored relative paths under inputDirectory; every read must match its Git blob SHA. No worktree content is accepted just because it exists.',parserEnvironment:'FAWRI_INVENTORY_BABEL_BUNDLE: absolute path to trusted Playwright lib/transform/babelBundle.js; no app dependencies imported.',mountChainInterpretation:'Every route.mountChain entry indexes routerMountEdges; preserve order. Static path only, not effective middleware execution.'};
fs.writeFileSync(output,JSON.stringify(out,null,1)+'\n');
console.log(JSON.stringify(counts));
if(parseFailures.length)process.exitCode=1;
