# Production Meta credential KMS/HSM readiness

## Scope

This document covers the remaining owner-controlled work required to bind the existing Meta credential envelope encryption to a real production KMS/HSM provider. It does not select a provider, contain credentials, activate production traffic, or authorize a real Meta send.

## Current credential authority

The authoritative Meta credential value is stored only as a versioned AES-256-GCM envelope containing `key_id`, IV, ciphertext, and authentication tag. Encryption uses the provider's `current()` key. Decryption resolves the envelope's exact `key_id` through `resolve(keyId)`, so rotation can retain old decrypt keys while new writes move to a new current key.

The provider contract is intentionally provider-neutral. The repository includes an environment-backed provider for non-production/dev/test use, but that provider now reports `production_eligible: false` and cannot satisfy the production readiness proof.

Production readiness requires an external provider to explicitly report:

- a stable provider identity;
- availability;
- `production_eligible: true`;
- the current write `key_id`;
- the set of key IDs still valid for decrypt during rotation;
- successful resolution of the declared current key to the exact same `key_id`.

Any missing readiness proof, unavailable external provider, wrong resolved `key_id`, retired/unknown key, invalid key material, or corrupt envelope fails closed. No token or plaintext is emitted by the vault error paths.

## What is already closed in code

- AES-256-GCM authenticated envelope encryption.
- Provider-neutral `current()` / `resolve(keyId)` abstraction.
- Explicit production-readiness metadata contract.
- Environment provider is not valid production KMS/HSM proof.
- Exact resolved-key-ID check before decrypt.
- Rotation contract: old envelopes may decrypt through retained old keys while new writes use the current key.
- Unknown retired keys fail closed.
- Corrupt envelopes fail closed.
- Focused tests use random synthetic keys/tokens only.
- No cloud provider SDK, production call, production credential, or real Meta send is introduced.

## Owner inputs required before a real provider can be bound

### 1. Provider choice

The Owner must select the production KMS/HSM technology/provider and the production account/project/tenant in which it will run. The repository must not infer AWS, GCP, Azure, a dedicated HSM, or any other vendor.

### 2. Key identity and provider configuration

The Owner must supply the provider-specific configuration needed to locate the external key service and identify:

- the current write key identity mapped to repository `key_id`;
- any historical key identities that must remain decryptable during rotation;
- the production environment/account/project/tenant/region/endpoint identifiers required by the selected provider.

No raw encryption key should be committed to the repository.

### 3. Permissions

The Owner must identify the production workload principal and approve the least-privilege permissions needed by the chosen adapter. At minimum the adapter must be able to obtain or unwrap the authorized 32-byte data key for the exact requested `key_id` and resolve the current write key. Create, rotate, disable, delete, export, or administrative permissions must not be granted unless the selected rotation design explicitly requires them.

The exact permission names cannot be decided until the provider is chosen.

### 4. Rotation policy

The Owner must decide:

- normal rotation cadence;
- how a new current key is promoted;
- how long old keys remain decryptable;
- the retirement condition for an old `key_id`;
- rollback overlap window;
- emergency-compromise rotation procedure;
- who is authorized to retire or destroy old keys.

Repository behavior assumes a safe overlap period: new writes use `current()`, while old envelopes continue to decrypt only while their historical `key_id` remains resolvable.

### 5. Production secret/identity injection mechanism

The Owner must choose how the production workload authenticates to the selected KMS/HSM without committing credentials. Examples of mechanisms are provider-managed workload identity, runtime-injected short-lived credentials, or a platform secret mount; the repository does not select one here.

The chosen mechanism must define who can update it, how it is rotated, and how production startup fails when it is absent.

## Decisions that cannot be made technically without the Owner

- Which KMS/HSM provider is authoritative.
- Which production account/project/tenant and region/endpoint are authoritative.
- The real key identifiers and current-key promotion mechanism.
- The workload principal and exact provider permissions.
- Rotation cadence, decrypt overlap, retirement, rollback, and emergency rotation policy.
- The production credential/workload-identity injection mechanism.
- Whether the selected provider returns raw data keys, unwraps envelope data keys, or requires a provider-specific adapter design around the current synchronous key-provider contract.
- Production activation timing and change approval.

## Activation boundary

This change is readiness only. A real provider adapter must be implemented after Owner decisions, must expose the provider-neutral readiness contract, and must pass the same fail-closed tests plus provider-specific integration tests against a disposable/non-production provider environment. Production activation remains a separate approved change.
