export type WorkbookSheet = {
  name: string;
  rows: Array<Array<string | number | null | undefined>>;
  columnWidths?: number[];
  headerRow?: number;
  autoFilter?: boolean;
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

function applyNumberFormatting(
  worksheet: Record<string, unknown>,
  XLSX: typeof import('xlsx'),
): void {
  const range = worksheet['!ref'];
  if (typeof range !== 'string') return;
  const decoded = XLSX.utils.decode_range(range);
  for (let row = decoded.s.r; row <= decoded.e.r; row += 1) {
    for (let column = decoded.s.c; column <= decoded.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = worksheet[address] as { t?: string; z?: string } | undefined;
      if (cell?.t === 'n') cell.z = '#,##0';
    }
  }
}

export async function downloadWorkbook(
  fileBase: string,
  sheets: WorkbookSheet[],
): Promise<void> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    applyNumberFormatting(worksheet as Record<string, unknown>, XLSX);

    if (sheet.columnWidths?.length) {
      worksheet['!cols'] = sheet.columnWidths.map(width => ({ wch: width }));
    }

    if (sheet.autoFilter && sheet.headerRow !== undefined && sheet.rows[sheet.headerRow]) {
      const lastColumn = Math.max(0, sheet.rows[sheet.headerRow].length - 1);
      worksheet['!autofilter'] = {
        ref: XLSX.utils.encode_range({
          s: { r: sheet.headerRow, c: 0 },
          e: { r: Math.max(sheet.headerRow, sheet.rows.length - 1), c: lastColumn },
        }),
      };
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  }

  XLSX.writeFile(workbook, `${safeFilePart(fileBase)}.xlsx`, {
    compression: true,
  });
}
