# P0 SQL migration static review — 2026-10-18

Reviewed GitHub branch `fix/p0-provider-receipt-order-discovery-20261015` SQL files 0028–0033 directly, without executing them.

| Migration | Defined capability | Static security evidence |
| --- | --- | --- |
| 0028 | `fawri_resolve_meta_page_merchants` | SECURITY DEFINER; REVOKE ALL ON FUNCTION FROM PUBLIC; bounded input max 100 IDs |
| 0029 | `fawri_admit_verified_payment_receipt` | SECURITY DEFINER; REVOKE ALL ON FUNCTION FROM PUBLIC; creates verified receipt table, enables RLS and revokes PUBLIC table rights |
| 0030 | `fawri_read_verified_payment_receipts` | SECURITY DEFINER; REVOKE ALL ON FUNCTION FROM PUBLIC |
| 0031 | `fawri_review_verified_payment_receipt` | SECURITY DEFINER; REVOKE ALL ON FUNCTION FROM PUBLIC |
| 0032 | `fawri_authorize_verified_receipt_replay` | SECURITY DEFINER; REVOKE ALL ON FUNCTION FROM PUBLIC; calls function from 0031 |
| 0033 | `fawri_resolve_confirmed_payment_order` | SECURITY DEFINER; REVOKE ALL ON FUNCTION FROM PUBLIC |

These are source-level observations only; they do not demonstrate deployed ownership, grants, RLS effectiveness, or safe runtime execution. Execute in journal order after an isolated-branch preflight and explicit migration review. Do not grant PUBLIC or direct receipt-table access to runtime. Existing clone has 28 applied migrations ending at 0027. P0 remains NO-GO. No SQL or Railway changes made in this batch.
