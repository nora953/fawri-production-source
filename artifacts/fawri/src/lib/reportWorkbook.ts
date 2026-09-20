export type WorkbookSheet = {
  name: string;
  rows: Array<Array<string | number | null | undefined>>;
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

export async function downloadWorkbook(
  fileBase: string,
  sheets: WorkbookSheet[],
): Promise<void> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(workbook, `${safeFilePart(fileBase)}.xlsx`, {
    compression: true,
  });
}
