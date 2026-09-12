import { readFile, writeFile } from 'node:fs/promises';

const LOCAL = 'artifacts/fawri/src/lib/cashierCompensationAuthority.ts';
const SERVER = 'artifacts/api-server/src/services/postgresCashierCompensationSyncAuthority.ts';

async function load(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

async function save(path, content) {
  await writeFile(new URL(`../${path}`, import.meta.url), content, 'utf8');
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`[${label}] expected source checkpoint was not found`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`[${label}] checkpoint is ambiguous; refusing to edit`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function hardenLocal(source) {
  if (source.includes("from './cashierSaleAccounting';") && source.includes('discountAwareReturnRefundMinor(')) {
    return source;
  }

  source = replaceOnce(
    source,
    "import type { IndexedDbCashierConfig } from './cashierIndexedDbAuthority';\n",
    "import type { IndexedDbCashierConfig } from './cashierIndexedDbAuthority';\nimport {\n  allocateCashierSaleNetByLine,\n  cashierRefundForAllocatedLine,\n} from './cashierSaleAccounting';\n",
    'local accounting import',
  );

  const helperAnchor = `function returnedQuantityForLine(sale: CashierSaleSnapshot, lineId: string): number {\n  let total = 0;\n  for (const returnSnapshot of sale.returns || []) {\n    for (const line of returnSnapshot.lines || []) {\n      if (line.original_line_id !== lineId) continue;\n      total = safeAdd(total, line.quantity, 'returned quantity');\n    }\n  }\n  return total;\n}\n`;
  const helperReplacement = `${helperAnchor}\nfunction saleAllocatedNetByLine(sale: CashierSaleSnapshot): Map<string, number> {\n  try {\n    return new Map(\n      allocateCashierSaleNetByLine(sale.lines, sale.total_minor).map(item => [\n        item.line_id,\n        item.allocated_net_minor,\n      ]),\n    );\n  } catch {\n    throw new CashierCompensationError(\n      'CASHIER_COMPENSATION_SALE_PRICING_INVALID',\n      'Original sale pricing cannot be reconciled safely',\n    );\n  }\n}\n\nfunction discountAwareReturnRefundMinor(input: {\n  allocatedNetByLine: Map<string, number>;\n  line: CashierSaleLineSnapshot;\n  alreadyReturned: number;\n  returnQuantity: number;\n}): number {\n  const allocatedNetMinor = input.allocatedNetByLine.get(input.line.line_id);\n  if (allocatedNetMinor === undefined) {\n    throw new CashierCompensationError(\n      'CASHIER_COMPENSATION_SALE_PRICING_INVALID',\n      'Original sale line pricing allocation is missing',\n    );\n  }\n  try {\n    return cashierRefundForAllocatedLine({\n      allocatedNetMinor,\n      soldQuantity: input.line.quantity,\n      returnedBeforeQuantity: input.alreadyReturned,\n      returnQuantity: input.returnQuantity,\n    });\n  } catch {\n    throw new CashierCompensationError(\n      'CASHIER_COMPENSATION_SALE_PRICING_INVALID',\n      'Return refund cannot be reconciled with the amount originally paid',\n    );\n  }\n}\n`;
  source = replaceOnce(source, helperAnchor, helperReplacement, 'local accounting helper');

  const saleCheck = `      if (sale.payment_status !== 'paid') {\n        throw new CashierCompensationError(\n          'CASHIER_RETURN_PAYMENT_NOT_PAID',\n          'Only a paid sale can be returned; pending sales must be voided',\n        );\n      }\n\n      const originalMovements =`;
  const saleCheckReplacement = `      if (sale.payment_status !== 'paid') {\n        throw new CashierCompensationError(\n          'CASHIER_RETURN_PAYMENT_NOT_PAID',\n          'Only a paid sale can be returned; pending sales must be voided',\n        );\n      }\n      const allocatedNetByLine = saleAllocatedNetByLine(sale);\n\n      const originalMovements =`;
  source = replaceOnce(source, saleCheck, saleCheckReplacement, 'local allocation checkpoint');

  const oldRefund = `        const refundMinor = safeMultiply(\n          line.effective_unit_price_minor,\n          requestLine.quantity,\n          'return line refund',\n        );`;
  const newRefund = `        const refundMinor = discountAwareReturnRefundMinor({\n          allocatedNetByLine,\n          line,\n          alreadyReturned,\n          returnQuantity: requestLine.quantity,\n        });`;
  source = replaceOnce(source, oldRefund, newRefund, 'local return refund');
  return source;
}

function hardenServer(source) {
  if (source.includes('cashierRefundForAllocatedLine') && source.includes('saleAllocatedNetByLine(originalSale)')) {
    return source;
  }

  source = replaceOnce(
    source,
    'import { CashierSyncError } from "./postgresCashierSyncAuthority";\n',
    'import { CashierSyncError } from "./postgresCashierSyncAuthority";\nimport {\n  allocateCashierSaleNetByLine,\n  cashierRefundForAllocatedLine,\n} from "./cashierSaleAccounting";\n',
    'server accounting import',
  );

  const oldParseRefund = `  const refund = nonNegativeInteger(raw.refund_minor, "return.line.refund_minor");\n  if (refund !== safeMultiply(effective, quantity, "return.line.refund_minor")) {\n    throw new CashierSyncError(\n      "CASHIER_SYNC_INVALID",\n      "return line refund is inconsistent",\n      400,\n    );\n  }`;
  const newParseRefund = `  const refund = nonNegativeInteger(raw.refund_minor, "return.line.refund_minor");`;
  source = replaceOnce(source, oldParseRefund, newParseRefund, 'server static return parser');

  const lineHelperAnchor = `function originalLineById(sale: OriginalSale, lineId: string): OriginalSaleLine {\n  const line = sale.lines.find((item) => item.line_id === lineId);\n  if (!line) {\n    throw new CashierSyncError(\n      "CASHIER_RETURN_LINE_NOT_FOUND",\n      "return line does not belong to the original sale",\n      409,\n      { original_line_id: lineId },\n    );\n  }\n  return line;\n}\n`;
  const lineHelperReplacement = `${lineHelperAnchor}\nfunction saleAllocatedNetByLine(sale: OriginalSale): Map<string, number> {\n  try {\n    return new Map(\n      allocateCashierSaleNetByLine(sale.lines, sale.total_minor).map((item) => [\n        item.line_id,\n        item.allocated_net_minor,\n      ]),\n    );\n  } catch {\n    throw new CashierSyncError(\n      "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",\n      "original cashier sale pricing cannot be reconciled safely",\n      409,\n    );\n  }\n}\n`;
  source = replaceOnce(source, lineHelperAnchor, lineHelperReplacement, 'server allocation helper');

  const returnPrelude = `  let expectedRefundTotal = 0;\n  let mutationCount = 0;\n  for (const requested of snapshot.lines) {`;
  const returnPreludeReplacement = `  const allocatedNetByLine = saleAllocatedNetByLine(originalSale);\n  let expectedRefundTotal = 0;\n  let mutationCount = 0;\n  for (const requested of snapshot.lines) {`;
  source = replaceOnce(source, returnPrelude, returnPreludeReplacement, 'server return allocation');

  const oldExpected = `    const expectedRefund = safeMultiply(\n      line.effective_unit_price_minor,\n      requested.quantity,\n      "return refund",\n    );`;
  const newExpected = `    const allocatedNetMinor = allocatedNetByLine.get(line.line_id);\n    if (allocatedNetMinor === undefined) {\n      throw new CashierSyncError(\n        "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",\n        "original cashier sale line pricing allocation is missing",\n        409,\n      );\n    }\n    let expectedRefund: number;\n    try {\n      expectedRefund = cashierRefundForAllocatedLine({\n        allocatedNetMinor,\n        soldQuantity: line.quantity,\n        returnedBeforeQuantity: alreadyReturned,\n        returnQuantity: requested.quantity,\n      });\n    } catch {\n      throw new CashierSyncError(\n        "CASHIER_COMPENSATION_ORIGINAL_SALE_CORRUPT",\n        "return refund cannot be reconciled with the amount originally paid",\n        409,\n      );\n    }`;
  source = replaceOnce(source, oldExpected, newExpected, 'server return refund');

  source = replaceOnce(
    source,
    '        "return refund does not match original sale price",',
    '        "return refund does not match the amount originally paid",',
    'server refund mismatch message',
  );
  return source;
}

const localBefore = await load(LOCAL);
const serverBefore = await load(SERVER);
const localAfter = hardenLocal(localBefore);
const serverAfter = hardenServer(serverBefore);

await save(LOCAL, localAfter);
await save(SERVER, serverAfter);

console.log('Cashier discounted-compensation hardening applied safely.');
console.log(`Updated: ${LOCAL}`);
console.log(`Updated: ${SERVER}`);
