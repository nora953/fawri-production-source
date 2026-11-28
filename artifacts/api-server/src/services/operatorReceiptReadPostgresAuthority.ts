import { createOperatorDirectoryAuthority } from "./operatorDirectoryPostgresAuthority";

// A receipt-only role needs the reader capability, not directory issuance.
// Production credentials, identity checks and transaction lifecycle stay shared.
const authority = createOperatorDirectoryAuthority({ capability: "receiptRead" });
export const withReceiptOperatorReadTransaction = authority.transaction;
export const closeReceiptOperatorReadPool = authority.close;
