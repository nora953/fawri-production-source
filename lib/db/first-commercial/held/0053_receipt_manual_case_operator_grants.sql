-- P0 R-OWN-5 HELD, FIRST-COMMERCIAL SOURCE-ONLY (post-0053).
-- NOT canonical Drizzle source, NOT approved for any hosted SQL execution.
-- Requires independently attested first-commercial operator LOGIN and 0053,
-- verified backup, rollback and separate release authorization.
-- NO table/sequence SELECT/INSERT/UPDATE/DELETE; NO role membership.
-- NO refund, entitlement, receipt ownership mutation or provider finalization.
GRANT USAGE ON SCHEMA public TO fawri_operator_issuer;
GRANT EXECUTE ON FUNCTION public.fawri_open_unmatched_verified_receipt_case(text,text,text,text,text) TO fawri_operator_issuer;
GRANT EXECUTE ON FUNCTION public.fawri_escalate_verified_receipt_manual_case(text,text,text,text,text,text,text) TO fawri_operator_issuer;
GRANT EXECUTE ON FUNCTION public.fawri_list_verified_receipt_manual_cases(text,text,text,integer,timestamptz,text,text,text) TO fawri_operator_issuer;
GRANT EXECUTE ON FUNCTION public.fawri_read_verified_receipt_manual_case_history(text,text,text,text,integer,bigint,text,text) TO fawri_operator_issuer;
GRANT EXECUTE ON FUNCTION public.fawri_acknowledge_receipt_dispute_second_review(text,text,text,text,text,text) TO fawri_operator_issuer;
