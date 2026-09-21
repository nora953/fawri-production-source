export type WorkbookMergeRange = {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
};

export type WorkbookSheet = {
  name: string;
  rows: Array<Array<string | number | null | undefined>>;
  columnWidths?: number[];
  rowHeights?: number[];
  headerRow?: number;
  autoFilter?: boolean;
  mergeRows?: number[];
  mergeRanges?: WorkbookMergeRange[];
  rtlText?: boolean;
  ltrCells?: Array<{ row: number; column: number }>;
  ltrDataColumns?: number[];
};

type ZipContainer = unknown;

type SheetJsZip = {
  utils: {
    cfb_new(): ZipContainer;
    cfb_add(container: ZipContainer, name: string, content: Uint8Array, options?: { unsafe?: boolean }): unknown;
  };
  write(
    container: ZipContainer,
    options: { fileType: 'zip'; compression: boolean },
  ): Uint8Array | number[];
};

function safeFilePart(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'report';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function cellRef(row: number, column: number): string {
  return `${columnName(column)}${row + 1}`;
}

function mergeRef(range: WorkbookMergeRange): string {
  return `${cellRef(range.startRow, range.startColumn)}:${cellRef(range.endRow, range.endColumn)}`;
}

function sheetColumnCount(sheet: WorkbookSheet): number {
  return Math.max(
    sheet.columnWidths?.length || 0,
    sheet.rows.reduce((max, row) => Math.max(max, row.length), 0),
    1,
  );
}

function allMergeRanges(sheet: WorkbookSheet): WorkbookMergeRange[] {
  const lastColumn = sheetColumnCount(sheet) - 1;
  const result = [...(sheet.mergeRanges || [])];
  for (const row of sheet.mergeRows || []) {
    result.push({
      startRow: row,
      startColumn: 0,
      endRow: row,
      endColumn: lastColumn,
    });
  }
  return result;
}

function styleIdForCell(
  sheet: WorkbookSheet,
  row: number,
  column: number,
  value: string | number | null | undefined,
): number {
  const explicitLtr = sheet.ltrCells?.some(cell => cell.row === row && cell.column === column);
  if (explicitLtr) return 9;

  if (row === 0) return 1;
  if (row === 1 || row === 2) return column === 0 ? 2 : 3;
  if (row === 3) return 4;
  if (row === sheet.headerRow) return 5;
  if (sheet.headerRow !== undefined && row > sheet.headerRow) {
    if (sheet.ltrDataColumns?.includes(column)) return 10;
    return typeof value === 'number' ? 7 : 6;
  }
  if (sheet.headerRow !== undefined && row > 4 && row < sheet.headerRow) {
    return 8;
  }
  return 0;
}

function cellXml(
  reference: string,
  styleId: number,
  value: string | number | null | undefined,
): string {
  const style = styleId ? ` s="${styleId}"` : '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}"${style}><v>${value}</v></c>`;
  }
  if (value === null || value === undefined || value === '') {
    return styleId ? `<c r="${reference}"${style}/>` : '';
  }
  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

function stylesXml(rtlText: boolean): string {
  const labelAlignment = rtlText
    ? '<alignment horizontal="right" vertical="center" readingOrder="2"/>'
    : '<alignment horizontal="left" vertical="center"/>';
  const centered = rtlText
    ? '<alignment horizontal="center" vertical="center" readingOrder="2"/>'
    : '<alignment horizontal="center" vertical="center"/>';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FF000000"/></left>
      <right style="thin"><color rgb="FF000000"/></right>
      <top style="thin"><color rgb="FF000000"/></top>
      <bottom style="thin"><color rgb="FF000000"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="11">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">${centered}</xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">${labelAlignment}</xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">${centered}</xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">${centered}</xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">${centered}</xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">${centered}</xf>
    <xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">${centered}</xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" readingOrder="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function worksheetXml(sheet: WorkbookSheet): string {
  const columnCount = sheetColumnCount(sheet);
  const lastColumn = columnCount - 1;
  const rowCount = Math.max(sheet.rows.length, 1);
  const merges = allMergeRanges(sheet);
  const rowXml: string[] = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = sheet.rows[rowIndex] || [];
    const height = sheet.rowHeights?.[rowIndex];
    const cells: string[] = [];

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const value = row[columnIndex];
      const styleId = styleIdForCell(sheet, rowIndex, columnIndex, value);
      const xml = cellXml(cellRef(rowIndex, columnIndex), styleId, value);
      if (xml) cells.push(xml);
    }

    const heightAttributes = height
      ? ` ht="${height}" customHeight="1"`
      : '';
    rowXml.push(`<row r="${rowIndex + 1}"${heightAttributes}>${cells.join('')}</row>`);
  }

  const cols = (sheet.columnWidths || [])
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join('');

  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map(range => `<mergeCell ref="${mergeRef(range)}"/>`).join('')}</mergeCells>`
    : '';

  const autoFilterXml =
    sheet.autoFilter && sheet.headerRow !== undefined
      ? `<autoFilter ref="${cellRef(sheet.headerRow, 0)}:${cellRef(Math.max(sheet.headerRow, rowCount - 1), lastColumn)}"/>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${cellRef(rowCount - 1, lastColumn)}"/>
  <sheetViews><sheetView workbookViewId="0" showGridLines="1"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  ${cols ? `<cols>${cols}</cols>` : ''}
  <sheetData>${rowXml.join('')}</sheetData>
  ${autoFilterXml}
  ${mergeXml}
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;
}

function workbookXml(sheets: WorkbookSheet[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>
  <sheets>
    ${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}
  </sheets>
</workbook>`;
}

function workbookRelationshipsXml(sheetCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function rootRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function contentTypesXml(sheetCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets}
</Types>`;
}

function addUtf8File(
  CFB: SheetJsZip,
  container: ZipContainer,
  path: string,
  content: string,
): void {
  CFB.utils.cfb_add(container, path, new TextEncoder().encode(content), { unsafe: true });
}

function downloadBytes(fileName: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadWorkbook(
  fileBase: string,
  sheets: WorkbookSheet[],
): Promise<void> {
  if (sheets.length === 0) return;

  const XLSX = await import('xlsx');
  const CFB = (XLSX as unknown as { CFB: SheetJsZip }).CFB;
  if (!CFB?.utils?.cfb_new || !CFB?.utils?.cfb_add || !CFB?.write) {
    throw new Error('XLSX ZIP container support is unavailable.');
  }

  const container = CFB.utils.cfb_new();
  const rtlText = sheets.every(sheet => Boolean(sheet.rtlText));

  addUtf8File(CFB, container, '[Content_Types].xml', contentTypesXml(sheets.length));
  addUtf8File(CFB, container, '_rels/.rels', rootRelationshipsXml());
  addUtf8File(CFB, container, 'xl/workbook.xml', workbookXml(sheets));
  addUtf8File(CFB, container, 'xl/_rels/workbook.xml.rels', workbookRelationshipsXml(sheets.length));
  addUtf8File(CFB, container, 'xl/styles.xml', stylesXml(rtlText));

  sheets.forEach((sheet, index) => {
    addUtf8File(CFB, container, `xl/worksheets/sheet${index + 1}.xml`, worksheetXml(sheet));
  });

  const output = CFB.write(container, {
    fileType: 'zip',
    compression: true,
  });
  const bytes = output instanceof Uint8Array ? output : new Uint8Array(output);
  downloadBytes(`${safeFilePart(fileBase)}.xlsx`, bytes);
}
