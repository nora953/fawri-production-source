import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

// Actual reportWorkbook producer + locked SheetJS ZIP writer. DOM/download is
// inert; Python standard-library ZIP/XML parser independently inspects bytes.
// No application/DB/provider imports, output files or real browser required.
const requireFrontend = createRequire(resolve('artifacts/fawri/package.json'));
const XLSX = requireFrontend('xlsx');
let code = stripTypeScriptTypes(readFileSync('artifacts/fawri/src/lib/reportWorkbook.ts', 'utf8'), { mode: 'transform' }).replace(/^export\s+/gm, '');
assert.equal((code.match(/await import\('xlsx'\)/g) || []).length, 1, 'source downloader dependency shape changed');
code = code.replace("await import('xlsx')", 'auditXlsx');
let blob, clicked = false, removed = false, filename, revoked = false;
const anchor = { click: () => { clicked = true; }, remove: () => { removed = true; } };
const api = vm.runInNewContext(`(()=>{${code}\nreturn { downloadWorkbook };})()`, {
  auditXlsx: XLSX, Blob, Uint8Array, ArrayBuffer, TextEncoder,
  URL: { createObjectURL: value => { blob = value; return 'blob:synthetic-workbook'; }, revokeObjectURL: () => { revoked = true; } },
  document: { createElement: tag => { assert.equal(tag, 'a'); return anchor; }, body: { appendChild: value => assert.equal(value, anchor) } },
  setTimeout: callback => callback(),
}, { timeout: 2000 });
const sheet = {
  name: 'تقرير-ڕاپۆرت', rtlText: true, headerRow: 4, autoFilter: true,
  rows: [['Synthetic'], ['Period', '12/10/2026'], ['Source', 'Synthetic'], [], ['Label', 'Amount', 'Text'], ['منتج & <test>', 0, '=1+1'], ['ڕاپۆرت', -1500, 'Line\nTwo']],
  columnWidths: [24, 18, 24], mergeRows: [0], ltrCells: [{ row: 1, column: 1 }],
};
await api.downloadWorkbook('Audit:/ unsafe name', [sheet]);
filename = anchor.download;
assert.ok(clicked && removed && revoked, 'download lifecycle did not complete');
assert.equal(filename, 'Audit-unsafe-name.xlsx');
assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
const bytes = Buffer.from(await blob.arrayBuffer());
const python = String.raw`
import io,zipfile,xml.etree.ElementTree as E,json,sys
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert z.testzip() is None
parts=set(z.namelist())
required={'[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/styles.xml','xl/worksheets/sheet1.xml'}
assert required.issubset(parts),sorted(parts)
for name in parts:
 if name.endswith(('.xml','.rels')): E.fromstring(z.read(name))
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
w=E.fromstring(z.read('xl/workbook.xml'))
assert w.find('s:sheets/s:sheet',ns).get('name')=='تقرير-ڕاپۆرت'
s=E.fromstring(z.read('xl/worksheets/sheet1.xml'))
assert s.find('s:sheetViews/s:sheetView',ns).get('rightToLeft')=='1'
assert s.find('s:autoFilter',ns).get('ref')=='A5:C7'
assert s.find('s:mergeCells/s:mergeCell',ns).get('ref')=='A1:C1'
cells={c.get('r'):c for c in s.findall('s:sheetData/s:row/s:c',ns)}
assert cells['B6'].find('s:v',ns).text=='0'
assert cells['B7'].find('s:v',ns).text=='-1500'
assert cells['A6'].find('s:is/s:t',ns).text=='منتج & <test>'
assert cells['C6'].get('t')=='inlineStr' and cells['C6'].find('s:is/s:t',ns).text=='=1+1'
assert not s.findall('.//s:f',ns)
print(json.dumps({'zip_crc':'PASS','all_xml':'PASS','sheet_rtl':'PASS','filter_merge':'PASS','text_numeric_formula':'PASS','parts':len(parts)}))
`;
const independent = spawnSync('python3', ['-c', python], { input: bytes, encoding: 'utf8', timeout: 15000 });
assert.equal(independent.status, 0, independent.stderr);
const parsed = XLSX.read(bytes, { type: 'buffer', cellStyles: true });
assert.equal(parsed.SheetNames[0], sheet.name);
const data = parsed.Sheets[sheet.name];
assert.equal(data.B6.v, 0); assert.equal(data.B7.v, -1500);
assert.equal(data.C6.v, '=1+1'); assert.equal(data.C6.f, undefined);
console.log('AUDIT_WORKBOOK_PACKAGE_RESULT ' + JSON.stringify({ source: process.env.GITHUB_SHA || 'local', sheetjs: XLSX.version,
  status: 'PASS', bytes: bytes.length, independentParser: JSON.parse(independent.stdout), actualReader: 'PASS',
  limits: 'Synthetic package/consumer only; not browser download, Excel/LibreOffice render, PDF or application totals.' }));
