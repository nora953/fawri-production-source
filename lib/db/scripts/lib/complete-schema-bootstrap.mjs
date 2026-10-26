import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const dbRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// Structural fresh-schema harness only; canonical migration tests remain the
// authority for full historical authentication/RLS cutover acceptance.
export function bootstrapCompleteSchemaSql(schemaSql){
 const read=p=>fs.readFileSync(path.join(dbRoot,p),'utf8');
 const legacy=read('migration-stages/0024/manual.sql');
 const auth=read('drizzle/0039_role_bound_authentication_runtime.sql');
 const marker=auth.slice(0,auth.indexOf('CREATE OR REPLACE FUNCTION'));
 assert.ok(marker.includes('CREATE FUNCTION public.fawri_authentication_runtime()'));
 const scopes=read('drizzle/0040_transaction_scoped_tenant_authority.sql');
 const stream=read('drizzle/0052_cashier_stream_receipt_storage.sql');
 const role=stream.match(/DO \$\$ BEGIN[\s\S]*?END \$\$;/)?.[0];assert.ok(role);
 let authority=stream.slice(stream.indexOf('CREATE FUNCTION public.fawri_sequence_stream_guard()'));
 authority=authority.replace(role,'').replace(/^CREATE POLICY sequence_retirement_owner_(?:read|update).*;\n/gm,'');
 const first=schemaSql.search(/^(CREATE|ALTER) POLICY /m);assert.ok(first>=0,'complete schema has policies');
 return (schemaSql.slice(0,first)+legacy+'\n'+marker+'\n'+scopes+'\n'+role+'\n'+schemaSql.slice(first)+'\n'+authority).replaceAll('--> statement-breakpoint','');
}
