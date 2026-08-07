# CI security review

## Controls implemented

- Workflows use top-level `contents: read`; no workflow has persistent `contents: write`.
- Checkout disables credential persistence.
- Obsolete per-domain workflows are replaced by one application/data matrix, one supply-chain workflow, and one disposable restore drill.
- Concurrency is keyed by workflow and source branch, with `cancel-in-progress: true`, so an obsolete run is cancelled and the newest commit remains eligible.
- Push execution is limited to `hardening/**` and the quality lane; domain branches are validated through pull requests, avoiding push-plus-PR duplicate runs.
- Dependency installation uses `--frozen-lockfile --ignore-scripts`.
- Pull requests run GitHub dependency review and fail on high-severity dependency changes.
- The repository scanner reports only rule, path, and line; it never prints matched secret text.
- CI commands run through a redaction wrapper that buffers output, redacts tokens/PII before printing, and fails if sensitive output was detected.
- Generated CI artifacts are scanned before upload. Actual database dumps and object contents are never uploaded by the drill.

## Limitations

The local scanner is defense in depth, not a replacement for organization-level GitHub secret scanning, push protection, branch protection, dependency update automation, artifact access policy, or a SIEM. Those settings cannot be proven from repository files and must be verified by the repository owner.

Action tags (`@v4`) remain mutable upstream references. A future security hardening pass should pin every third-party action to a reviewed full commit SHA and schedule controlled updates.
