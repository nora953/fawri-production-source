# Lane handoff — <lane-name>

## Identity

- Repository: `nora953/fawri-production-source`
- Branch: `<assigned branch>`
- Coordination base: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Starting remote SHA: `<sha>`
- Final remote SHA: `<sha>`
- Assistant/worker identifier: `<identifier if available>`

## Scope completed

Describe only behavior that is implemented and supported by evidence.

## Files changed

List every changed path. Confirm that each path is inside the lane allowlist. Explain any exception; exceptions require coordinator review.

## Behavior and security boundaries

- Tenant isolation:
- Authentication/authorization:
- Idempotency/concurrency:
- Fail-closed behavior:
- Data retention/deletion:
- Secret/PII handling:

## Tests and checks

For each command/check, record:

- command/check name;
- execution environment;
- exit status/conclusion;
- key result;
- log/run identifier when available.

Do not write `passed` for checks that were not executed.

## Shared integration requests

For each requested shared-file change, provide:

- shared path;
- exact import/export/mount/script/type/translation change;
- reason;
- dependency ordering;
- test that proves the integration.

## Database/schema requests

List tables, columns, enums, indexes, unique constraints, checks, foreign keys, deletion behavior, and migration order. Do not omit tenant-composite constraints.

## Workflow requests

List required CI path filters, commands, services, artifacts, timeouts, permissions, and expected failure behavior.

## Known risks and deferred work

State concrete risks. Do not hide blockers behind phrases such as “later” or “should be fine.”

## Rollback

Describe how to disable or revert the lane without data loss. Note any irreversible side effect; normally there should be none before production cutover.

## External systems and real data

- Real database contacted: `no/yes + details`
- Replit Agent used: `no/yes + details`
- Real Meta/API called: `no/yes + details`
- Real customer/merchant data used: `no/yes + details`
- Credentials accessed: `no/yes + details`

## Ready for coordinator review

- [ ] Remote HEAD was rechecked before final push.
- [ ] No force push was used.
- [ ] No forbidden file was modified.
- [ ] Tests/checks are documented accurately.
- [ ] Shared integration requests are explicit.
- [ ] Schema/workflow requests are explicit.
- [ ] Secrets and customer payloads are absent from commits and artifacts.
- [ ] Branch is not merged into `main`.
