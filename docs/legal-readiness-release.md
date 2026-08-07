# Legal and privacy readiness boundary

This document is an engineering gate, not legal advice or legal approval.

Before launch, the product owner must identify the responsible legal approver and record approval for: privacy notice, terms, messaging consent, Meta/channel platform terms, retention and deletion periods, backup retention, support-image handling, AI/training use, subprocessors, cross-border processing if applicable, and incident-notification obligations.

Engineering must provide evidence that consent/version timestamps are retained, deletion propagates to operational stores and scheduled backup expiry, access is role/tenant constrained, and logs/metrics exclude message content and direct identifiers by default. The release remains NO-GO when a required approval is absent or ambiguous.
