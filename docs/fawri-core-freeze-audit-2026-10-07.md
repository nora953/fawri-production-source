# Fawri Core freeze audit — 2026-10-07

## Decision

**Fawri Core Frozen — Ready for External Integrations**

Source of truth: `main` after the final Phase 16 accessibility fix.

Severity at freeze:
- BLOCKER: 0
- HIGH: 0
- MEDIUM: 0

This decision freezes the provider-neutral Fawri Core. It does not claim that production credentials, hosted-provider configuration, payment certification, Meta cutover, AI-provider activation, or production backup/PITR infrastructure are already provisioned.

## Final audit matrix

| Phase | Area | Freeze result |
| --- | --- | --- |
| 1 | Architecture and boundaries | PASS — Core readiness is separated from Meta/OpenAI/provider activation. |
| 2 | PostgreSQL schema, migrations, RLS | PASS — committed migration chain and tenant isolation are covered by integration gates. |
| 3 | Merchant and cashier golden journeys | PASS — modern PostgreSQL-only clean-deployment journey is enforced. |
| 4 | Authentication, authorization, security | PASS — fail-closed authority paths and final security/supply-chain gate are green. |
| 5 | Localization | PASS — AR/KU/EN paths audited; Arabic system copy is region-neutral. |
| 6 | Translation architecture | PASS — translation structure and source contracts are included in quality gates. |
| 7 | UX and accessibility | PASS — localized overlay labels, validation/OTP associations, POS controls, checkout/password dialogs, and cashier-management modal keyboard focus behavior are guarded. |
| 8 | Performance | PASS — pre-release HTTP regression gate exists with bounded baseline thresholds. |
| 9 | Failure and recovery | PASS — PostgreSQL outage/recovery, queue retry/lease/dedupe, cashier sync, and offline grace behavior are covered. |
| 10 | Observability | PASS — protected metrics, bounded telemetry, readiness behavior, and incident persistence are covered. |
| 11 | Privacy and data governance | PASS — merchant deletion/anonymization and sensitive cashier/provider data cleanup are covered. |
| 12 | Production configuration | PASS — provider-neutral production requirements and documentation are synchronized. |
| 13 | External integration boundaries | PASS — Meta/AI/payment boundaries fail closed; unavailable production adapters are not represented as ready. |
| 14 | Clean deployment | PASS — frozen install, build, empty PostgreSQL, committed migrations, and golden journey are exercised together. |
| 15 | Backup, restore, rollback | PASS for Core policy and disposable drill — safe rollback boundaries are documented and regression-guarded. Hosted production backup/PITR evidence remains deployment work. |
| 16 | Final regression | PASS — final cashier-management accessibility finding was fixed and the PR head passed all eight triggered required workflows before squash merge. |

## Cashier subscription invariants

- Cashier licensing is separate from bot/provider activation.
- A new station seat requires an active cashier subscription and available licensed capacity.
- Pairing and pairing redemption require active entitlement; grace is not accepted for new pairing.
- Existing licensed cashier runtime may use the defined grace/offline policy without turning grace into permission to add a new station.
- Mid-cycle seat billing and common renewal-date behavior remain part of the cashier subscription lifecycle contract.

## Evidence boundaries

The final accessibility PR head passed eight triggered workflows before merge:
- Final quality gates
- Final security and supply chain
- Foundation integration final gate
- Clean deployment golden gate
- Staging container contract
- Cashier subscription lifecycle
- Cashier dashboard surface regression
- Browser storage authority audit

GitHub does not automatically rerun these pull-request-triggered workflows on the squash-merge SHA. This report therefore does not claim a post-squash run that did not occur; it records the green PR-head evidence that branch protection accepted for merge.

Earlier audit phases additionally established dedicated PostgreSQL outage/recovery, pre-release performance, backup/restore, observability, privacy/deletion, localization, and provider-boundary evidence.

## External launch work — not Core defects

Before public production launch, complete the deployment-specific items that cannot truthfully be frozen into provider-neutral Core:

1. Provision production Meta credentials/provider storage and explicitly enable Meta cutover only after verification.
2. Provision the selected AI provider credentials/model configuration and run provider-specific acceptance checks.
3. Integrate and certify the selected production payment gateway. FastPay remains deliberately unavailable until a real production-ready adapter exists.
4. Provision hosted PostgreSQL/object-storage backups, PITR where supported, retention, encryption/access controls, alert ownership, and a measured production-like restore drill.
5. Set and approve production RPO/RTO from business requirements and hosting capabilities.
6. Configure production domain/TLS/secrets and the external observability/alert receiver, then execute the launch runbook.

These items may block **production launch**, but they do not reopen the provider-neutral Fawri Core unless integration work reveals a genuine Core regression.

## Change policy after freeze

After this freeze, avoid opportunistic Core refactors. New changes should be limited to:
- external integration adapters and deployment wiring;
- confirmed defects or security fixes;
- explicitly approved product requirements.

Any change that touches frozen Core behavior must pass the relevant regression gates before merge.
