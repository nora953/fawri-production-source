# Main branch protection

`scripts/main-branch-protection.json` is the reviewed configuration for GitHub's
`PUT /repos/nora953/fawri-production-source/branches/main/protection` API.
Committing this file does not itself change GitHub settings. Apply it only after
the unconditional quality and security workflows have merged, then read back
the effective protection to verify it.

The write payload uses `checks` only. Supplying the deprecated `contexts` field
alongside `checks` is rejected by the API, even when `contexts` is empty.

The policy requires pull requests, eight successful checks from the verified
GitHub Actions app (15368), an up-to-date branch, and resolved review conversations.
It applies to administrators and disallows force pushes and branch deletion.
It does not require a second human reviewer, so the repository owner can merge
their own tested pull requests. Other path-specific checks remain additional
review evidence; they must also pass when applicable.

Both required workflows run for every pull request, including documentation-only
changes. Keep their required job names stable and their pull-request triggers
unfiltered. A skipped workflow can otherwise leave a required check pending.

After applying the policy, verify the effective `strict`, `checks`,
`enforce_admins`, `required_pull_request_reviews`, `allow_force_pushes`,
`allow_deletions`, and `required_conversation_resolution` fields. Do not weaken
the policy to work around failed or pending CI; fix or update the pull request.

API reference: https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection
