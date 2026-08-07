# Fawri release go/no-go checklist

A release is **NO-GO** unless every mandatory item is checked for the exact commit being deployed and linked to executed evidence. Static review alone is not a green CI result.

## CI and build

- [ ] Exact release SHA has completed GitHub runner results for server typecheck/build/tests.
- [ ] Frontend typecheck/build/tests completed.
- [ ] Database schema generation is reproducible and disposable apply/smoke passed.
- [ ] Migration safety and domain contract tests completed.
- [ ] Browser operational-storage audit completed with no active LocalStorage/SessionStorage authority.
- [ ] Secret scan, workflow policy, frozen lockfile, and dependency review completed.
- [ ] CI logs and uploaded artifacts passed token/PII scanning.

## Security

- [ ] Auth/session, tenant isolation, admin escalation, webhook signature, idempotency, queue/DLQ, and one-time refund tests passed after integration.
- [ ] Production secrets exist only in the approved secret manager and are rotated from development values.
- [ ] Branch protection and required checks are enabled for the integration target.
- [ ] No unresolved high/critical dependency or code-scanning finding exists.

## Data, backup, and rollback

- [ ] Final migration plan is generated from the exact integrated schema and reviewed.
- [ ] A fresh PostgreSQL backup and object-storage inventory exist for the cutover window.
- [ ] A restore drill succeeded and verified schema, bounded row counts, constraints, and object hashes.
- [ ] Rollback owner, trigger conditions, commands, and maximum decision time are written.
- [ ] Rollback does not depend on an untested destructive downgrade.

## Monitoring and operations

- [ ] Health/readiness/metrics router is mounted by the integration coordinator and access-restricted.
- [ ] Queue, oldest-job, DLQ, webhook-signature, login-abuse, migration, error-rate, and restore-drill alerts are configured and test-fired.
- [ ] On-call primary, backup, incident channel, support owner, and escalation paths are staffed for the release window.
- [ ] Dashboards show current release SHA and deployment time without customer identifiers.

## Privacy and legal readiness

- [ ] Privacy notice, data-retention schedule, deletion process, and subprocessor list are approved by the responsible owner/counsel.
- [ ] User consent text and channel-specific messaging permissions are approved and recorded.
- [ ] Logs, metrics, backups, support images, and AI/training data have documented retention and access rules.
- [ ] No legal approval is inferred from passing CI; named approval evidence is attached.

## Automatic NO-GO conditions

- Missing or cancelled required runner checks on the release SHA.
- Failed or unverified restore drill.
- Migration source-hash mismatch, unreconciled schema request, or rollback uncertainty.
- Any cross-tenant access, session-role confusion, duplicate charge/reply, signature bypass, or secret/PII exposure.
- Queue starvation, growing DLQ, absent alert routing, or unavailable incident ownership.
- Missing privacy/consent/legal approval required for the launched channel or data use.
