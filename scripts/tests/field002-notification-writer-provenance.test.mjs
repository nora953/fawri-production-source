import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {validatePlanForWrite} from '../../lib/db/scripts/lib/migration-write.mjs';
import {validateCutoverPlanForWrite} from '../../lib/db/scripts/cutover-migration.mjs';

// FIELD002-R2 static source inventory. This does NOT attribute historical
// PostgreSQL rows to a particular deployed writer or external SQL client.
const sourceRoot=fileURLToPath(new URL('../../artifacts/api-server/src/',import.meta.url));

function listSourceFiles(directory) {
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const full=join(directory,entry.name);
    if(entry.isDirectory())return listSourceFiles(full);
    return entry.isFile() && /\.(?:ts|tsx|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

const files=listSourceFiles(sourceRoot).map(full=>({
  path:relative(sourceRoot,full).replaceAll('\\','/'),
  source:readFileSync(full,'utf8'),
})).sort((a,b)=>a.path.localeCompare(b.path));

function at(path) {
  const found=files.find(file=>file.path===path);
  assert.ok(found,'required SQL writer/route absent: '+path);
  return found.source;
}

test('FIELD002-R2 enumerates every literal notification INSERT in current API source',()=>{
  const results=[];
  const orm=[];
  for(const file of files){
    // Include quoted/schema-qualified targets and multiline SQL literals.
    const literal=[...file.source.matchAll(/\bINSERT\s+INTO\s+(?:"?public"?\s*\.\s*)?"?notifications"?\s*\(/gi)];
    if(literal.length)results.push({path:file.path,count:literal.length});
    if(/\.insert\s*\(\s*(?:\w+\.)?notifications\s*\)/i.test(file.source))orm.push(file.path);
  }
  assert.deepEqual(results.map(x=>x.path),[
    'services/postgresMerchantNotificationAuthority.ts',
    'services/postgresOperationalNotificationAuthority.ts',
    'services/postgresSupportAuthority.ts',
    'services/postgresSupportInspectionAuthority.ts',
    'services/postgresSupportLifecycleAuthority.ts',
  ].sort(), 'new or retired notification SQL INSERT site requires R2 review');
  for(const hit of results)assert.equal(hit.count,1,'multiple notification INSERT sites in '+hit.path);
  assert.deepEqual(orm,[],'new notifications ORM writer requires explicit R2 review');
});

test('FIELD002-R2 obsolete support SQL notification entrypoints have no active source references',()=>{
  const obsolete=/\b(?:createInspectionRequestPostgres|refreshSupportLifecyclePostgres)\b/g;
  const refs=files.filter(file=>file.path!=='services/postgresSupportAuthority.ts')
    .flatMap(file=>[...file.source.matchAll(obsolete)].map(match=>({path:file.path,symbol:match[0]})));
  assert.deepEqual(refs,[],'legacy support SQL notification helper regained a caller/import');
  assert.match(at('routes/auth-support-postgres-routes.ts'),/\bcreateInspectionRequestCanonicalPostgres\s*\(/);
  assert.match(at('routes/auth-support-postgres-routes.ts'),/\brefreshSupportLifecyclePostgresCanonical\s*\(/);
  assert.match(at('routes/auth-support-admin-lifecycle-postgres-routes.ts'),/\brefreshSupportLifecyclePostgresCanonical\s*\(/);
  assert.match(at('services/postgresSupportInspectionAuthority.ts'),/\bINSERT\s+INTO\s+notifications\s*\(/i);
  assert.match(at('services/postgresSupportLifecycleAuthority.ts'),/\bINSERT\s+INTO\s+notifications\s*\(/i);
});

test('FIELD002-R2 source audit excludes route and test fixture writers from invented historical provenance',()=>{
  const policy=JSON.parse(readFileSync(new URL('../../docs/final-audit/evidence/P0-FIELD002-APPROVED-NOTIFICATION-POLICY-20261105.json',import.meta.url),'utf8'));
  assert.equal(policy.R2.historicalRows,'PRESERVE_UNCHANGED_DURING_SOURCE_REVIEW');
  assert.equal(policy.R2.missingLinks,'DO_NOT_INVENT_RELATIONS_OR_BACKFILL_WITHOUT_PROVENANCE');
  assert.equal(policy.R2.retention,'SEPARATE_LEGAL_BUSINESS_REVIEW_REQUIRED');
  assert.equal(policy.release.field002,'OPEN');
  assert.equal(policy.release.p0,'NO_GO');
});

test('FIELD002-R2 legacy ID fingerprint compatibility and read-only evidence stay bounded',()=>{
  const legacy=at('routes/authRuntimePart1.ts');
  const writers=at('routes/authRuntimePart3.ts');
  const canonical=at('services/postgresMerchantNotificationAuthority.ts');
  const sql=readFileSync(new URL('../../docs/final-audit/evidence/sql/P0-FIELD002-LEGACY-ID-FINGERPRINT-READONLY-20261105.sql',import.meta.url),'utf8');
  assert.match(legacy,/export function makeId\(prefix: string\): string/);
  assert.match(legacy,/Date\.now\(\)/);
  assert.match(legacy,/Math\.random\(\)\.toString\(36\)\.slice\(2, 8\)/);
  assert.ok(writers.includes('id: makeId("merchant-notification")'));
  assert.ok(canonical.includes('return `notification-'));
  assert.match(canonical,/createHash\("sha256"\)/);
  assert.ok(sql.includes("^merchant-notification-([0-9]{13})-[a-z0-9]{6}$"));
  assert.ok(sql.includes("^notification-[0-9a-f]{64}$"));
  assert.ok(sql.includes('seconds_from_embedded_timestamp <= 5'));
  assert.ok(sql.includes('GROUP BY type'));
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\b/i);
  assert.doesNotMatch(sql,/SELECT\s+(?:\*|id\b|merchant_id\b)/i);
});

test('FIELD002-R2 all generic SQL notification writers require complete source reference pair',()=>{
  const writers=[
    'services/postgresMerchantNotificationAuthority.ts',
    'services/postgresSupportAuthority.ts',
    'services/postgresSupportLifecycleAuthority.ts',
    'services/postgresOperationalNotificationAuthority.ts',
  ];
  for(const file of writers){
    const source=at(file);
    assert.match(source,/assertNotificationTypeWritable\(input\.type\)/,file+' lacks legacy notification write guard');
    assert.match(source,/requireNotificationSourceReference\(input\.sourceEntityType, (?:input\.sourceEntityId|sourceEntityId)\)/,file+' lacks reference guard');
    assert.match(source,/source\.sourceEntityType/,file+' SQL source type not validated');
    assert.match(source,/source\.sourceEntityId/,file+' SQL source id not validated');
    assert.doesNotMatch(source,/input\.sourceEntity(?:Type|Id)\s*\|\|\s*null/,file+' permits future partial or missing source reference');
  }
  assert.match(at('services/postgresSupportInspectionAuthority.ts'),/['"]support_inspection_request['"]\s*,\s*\$4/);
});

test('FIELD002-R1 retired support notification reader cannot bypass canonical projection',()=>{
  const oldAuthority=at('services/postgresSupportAuthority.ts');
  const retired=/\b(?:listMerchantNotificationsPostgres|markMerchantNotificationReadPostgres|markAllMerchantNotificationsReadPostgres)\b/g;
  const refs=files.filter(file=>file.path!=='services/postgresSupportAuthority.ts')
    .flatMap(file=>[...file.source.matchAll(retired)].map(hit=>({path:file.path,name:hit[0]})));
  assert.deepEqual(refs,[],'retired unfiltered notification reader regained an API import/call');
  assert.match(oldAuthority,/\.\.\.record\(row\.variables\)/,'retired loose mapper must be removed or reviewed if refactored');
  const secureRouter=at('routes/auth-security.ts');
  const canonical=at('routes/merchant-notifications-pg.ts');
  const support=at('routes/auth-support-postgres-routes.ts');
  const canonicalMount=secureRouter.indexOf('router.use(merchantNotificationsPgRouter');
  const supportMount=secureRouter.indexOf('router.use(supportPostgresRoutes');
  assert.ok(canonicalMount>=0 && supportMount>canonicalMount,'canonical notification router must precede support routes');
  for(const route of [canonical,support]) {
    assert.match(route,/listMerchantNotificationsPostgresCanonical/);
    assert.match(route,/markMerchantNotificationReadPostgresCanonical/);
    assert.doesNotMatch(route,/\b(?:listMerchantNotificationsPostgres|markMerchantNotificationReadPostgres|markAllMerchantNotificationsReadPostgres)\b/);
  }
  assert.match(canonical,/router\.use\(postgresOnly\)/);
  assert.match(canonical,/requireSecureMerchantSession/);
});

test('FIELD002-R2 live cutover and disposable writer refuse unapproved historical notification imports',()=>{
  const report={
    ok:true,
    write_readiness:{ok:true},
    rows:{notifications:[{id:'synthetic-historical-notification'}]},
    planned_row_count:1,
    source_lineage:[{target_table:'notifications',target_record_id:'synthetic-historical-notification'}],
    source_lineage_sha256:'a'.repeat(64),
  };
  const snapshot={tables:{'public.notifications':{}}};
  for(const validator of [validatePlanForWrite,validateCutoverPlanForWrite]){
    assert.throws(()=>validator(report,snapshot),/FIELD002_R2_NOTIFICATION_IMPORT_REQUIRES_SEPARATE_PROVENANCE_APPROVAL/,validator.name);
    // Malformed notification collections must never bypass cutover admission.
    for(const invalid of [{id:'synthetic'},null,'synthetic',4]){
      assert.throws(()=>validator({...report,rows:{notifications:invalid}},snapshot),
        /FIELD002_R2_NOTIFICATION_IMPORT_REQUIRES_SEPARATE_PROVENANCE_APPROVAL/,validator.name);
    }
  }
});
