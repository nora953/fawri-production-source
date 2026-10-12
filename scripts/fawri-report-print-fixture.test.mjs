import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

// Reproduce only the print-fixture charset failure. No DB/browser/React/network.
const moneySource=readFileSync(new URL('../artifacts/fawri/src/lib/moneyUi.ts',import.meta.url),'utf8');
const moneyCode=stripTypeScriptTypes(moneySource,{mode:'transform'}).replace(/^import[\s\S]*?;\s*$/gm,'').replace(/^export\s+/gm,'');
const money=vm.runInNewContext(`(()=>{${moneyCode};return formatMerchantMoneyMinor;})()`,{},{timeout:2000});
const source=readFileSync(new URL('../artifacts/fawri/src/pages/dashboard/ReportsPage.tsx',import.meta.url),'utf8');
function body(name){const start=source.indexOf('function '+name+'('),end=source.indexOf('\n}',start)+2;assert.ok(start>0&&end>start);return source.slice(start,end);}
const code=stripTypeScriptTypes(body('arabicDigitText')+'\n'+body('formatArabicIqd'),{mode:'transform'});
function formatted(fragment){return vm.runInNewContext(`(()=>{${fragment};return formatArabicIqd;})()`,{formatMerchantMoneyMinor:money},{timeout:2000})(697910);}
test('original Arabic report formatter preserves revenue in correct UTF-8 source',()=>{
  assert.equal(formatted(code),'٦٩٧,٩١٠\u00a0د.ع');
});
test('misdecoding raw regex range while preserving escaped strings reproduces fixture-only blank revenue',()=>{
  const wrongRange=new TextDecoder('windows-1252').decode(new TextEncoder().encode('[٠-٩]'));
  assert.equal(formatted(code.replace('[٠-٩]',wrongRange)),'\u00a0د.ع');
  const harness=readFileSync(new URL('./fawri-report-print-audit.mjs',import.meta.url),'utf8');
  assert.ok(harness.includes('application/javascript; charset=utf-8'));
  assert.ok(harness.includes('<meta charset="utf-8">'));
  assert.ok(readFileSync(new URL('../artifacts/fawri/index.html',import.meta.url),'utf8').includes('charset="UTF-8"'));
});
