import { createOperatorDirectoryAuthority } from "./operatorDirectoryPostgresAuthority";

// Review-only credentials cannot issue directory authority or apply payments.
const authority = createOperatorDirectoryAuthority({ capability: "receiptReview" });
export const withReceiptOperatorReviewTransaction = authority.transaction;
export const closeReceiptOperatorReviewPool = authority.close;
