import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// Actual date-query function bodies, isolated from React and HTTP. Each child
// uses an explicit browser-like local timezone; no database or provider I/O.
const source = readFileSync(new URL('../artifacts/fawri/src/components/reports/ReportToolbar.tsx', import.meta.url), 'utf8');
function body(name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\n}', start) + 2;
  assert.ok(start >= 0 && end > start, `Missing calendar function ${name}`);
  return source.slice(start, end);
}
const code = stripTypeScriptTypes(['startOfLocalDay','localDateStart','localDateEndExclusive','reportRangeQuery'].map(body).join('\n'), { mode: 'transform' });
function child(tz, custom, fixed = '2026-03-09T12:00:00Z', range = 'custom') {
  const script = `const vm=require('node:vm');const NativeDate=Date;
    class FixedDate extends NativeDate{constructor(...args){super(...(args.length?args:[${JSON.stringify(fixed)}]));}}
    const run=vm.runInNewContext(${JSON.stringify(`(()=>{${code}\nreturn reportRangeQuery;})()`)},{Date:FixedDate,URLSearchParams});
    const query=run(${JSON.stringify(range)},${JSON.stringify(custom)});console.log(JSON.stringify(Object.fromEntries(new URLSearchParams(query.replace(/^\\?/,'')))));`;
  const r = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
}
test('Baghdad custom leap-day report includes full selected date with exclusive next-midnight end', () => {
  assert.deepEqual(child('Asia/Baghdad', {from:'2024-02-29',to:'2024-02-29'}), {from:'2024-02-28T21:00:00.000Z',to:'2024-02-29T21:00:00.000Z'});
});
test('DST spring-forward custom day spans 23 hours', () => {
  const r=child('America/New_York',{from:'2026-03-08',to:'2026-03-08'});
  assert.deepEqual(r,{from:'2026-03-08T05:00:00.000Z',to:'2026-03-09T04:00:00.000Z'});
});
test('DST fall-back custom day spans 25 hours', () => {
  assert.deepEqual(child('America/New_York',{from:'2026-11-01',to:'2026-11-01'}),{from:'2026-11-01T04:00:00.000Z',to:'2026-11-02T05:00:00.000Z'});
});
test('seven-day preset includes today plus six previous local dates across DST', () => {
  assert.deepEqual(child('America/New_York',null,'2026-03-09T12:00:00Z','7d'),{from:'2026-03-03T05:00:00.000Z'});
});
test('custom month-end advances to next year midnight', () => {
  assert.deepEqual(child('Asia/Baghdad',{from:'2026-12-31',to:'2026-12-31'}),{from:'2026-12-30T21:00:00.000Z',to:'2026-12-31T21:00:00.000Z'});
});
test('all-time preset imposes no unintended date restriction', () => {
  assert.deepEqual(child('Asia/Baghdad',null,'2026-03-09T12:00:00Z','all'),{});
});
