import { createOperatorDirectoryAuthority } from "./operatorDirectoryPostgresAuthority";

// The server selects execution credentials; request data never selects a pool.
const authority = createOperatorDirectoryAuthority({ capability: "receiptExecution" });
export const withReceiptOperatorExecutionTransaction = authority.transaction;
export const closeReceiptOperatorExecutionPool = authority.close;
