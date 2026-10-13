# SEQ-286–287 support expiry SQL preparation

Continue remote31241a304ee5e5017b4af960ec3e683ed55a3f8b/local equivalent b7751e6a. Audit only; no application/original tests/schema repair.

Seven independent audit SQL business cases: unexpired approve/reject; foreign tenant denial; simultaneous opposite decisions; expired consent/preview marker persistence on denied access; canonical lifecycle sweep persists expiration, preserves a live other tenant and repeats idempotently. The two marker cases test existing SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001, not duplicate new findings. SQL runtime NOT_RUN at preparation; access-denial controls distinguish stale audit state from read authorization bypass.

New fixed-file workflow derived from previously executed owned provisioner: fresh attested network-nonePG16, no published ports, readonly source,28committed migrations, no hosted/provider credentials; trap+always teardown. Explicit ESM .mts and direct current DB entrypoint avoid prior rootCJS fixture failure. Existing workflow/original tests unchanged. Local Node24.19.0 syntax PASS and four refusal controls4P/0F/0SKIP. Current source analysis predicts rollback marker loss, but no new SQL PASS until completed job logs inspected. Whole percentage NOT_YET_MEASURABLE,releaseBLOCKED. Next verify actual runtime and reconcile ledgers.
