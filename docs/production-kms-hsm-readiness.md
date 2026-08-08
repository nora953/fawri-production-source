# Production Meta credential AWS KMS readiness

## Owner decision and implemented architecture

AWS KMS is the selected production KMS provider for Fawri Meta credentials.

The implementation uses exactly **one production AWS KMS symmetric customer-managed key**. Fawri does not create one KMS key per merchant or customer. Meta tokens remain inside the existing version-1 AES-256-GCM application envelope; AWS KMS protects application data-encryption keys (DEKs), not each token operation.

Startup is asynchronous. When `FAWRI_META_CREDENTIAL_PROVIDER=aws-kms`, `runtimeProviderBootstrap` unwraps every configured current/historical DEK through AWS KMS before the application is loaded, requires AWS-specific readiness proof, injects the resulting cached provider into the Meta channel runtime, and disposes/zeroizes it during shutdown. Application startup fails closed if bootstrap/readiness fails.

After bootstrap, `MetaCredentialKeyProvider.current()` and `resolve(keyId)` remain synchronous and are served from process memory. No KMS network call occurs per Meta token encrypt/decrypt operation.

## Envelope and backward compatibility

The Meta credential envelope remains unchanged:

- `version: 1`
- `algorithm: aes-256-gcm`
- logical `key_id`
- base64 IV
- base64 ciphertext
- base64 authentication tag

AWS KMS sits below this envelope. Existing envelopes remain readable while their logical `key_id` remains present in the configured wrapped-DEK manifest and can be unwrapped by the same approved KMS key. New writes use only the configured current logical DEK.

An unknown/retired historical `key_id` fails closed with no substitution.

## Fixed AWS KMS EncryptionContext

Every KMS `Decrypt` and `GenerateDataKey` operation for Meta credential DEKs uses exactly:

```json
{
  "application": "fawri",
  "purpose": "meta-credential-dek",
  "version": "1"
}
```

The encryption context is intentionally non-sensitive and must not contain merchant/customer identifiers, Meta tokens, messages, phone numbers, or other customer data.

## Exact production configuration contract

### `NODE_ENV`

- Purpose: identifies production process semantics used by runtime-provider bootstrap.
- Production value: `production`.
- Classification: non-secret.
- Validation/use: `runtimeProviderBootstrap.ts`.
- Failure behavior: when `NODE_ENV=production`, omission of the Meta credential provider selection is rejected before application load.

### `FAWRI_META_CREDENTIAL_PROVIDER`

- Purpose: selects the Meta credential key provider.
- Production value: exactly `aws-kms`.
- Classification: non-secret.
- Validation/use: `runtimeProviderBootstrap.ts`.
- Failure behavior: missing in production -> `META_CREDENTIAL_PROVIDER_REQUIRED`; unknown value -> `META_CREDENTIAL_PROVIDER_CONFIG_INVALID`; no downgrade to the environment provider.

### `FAWRI_META_AWS_REGION`

- Purpose: AWS region used by the KMS client.
- Required: yes when AWS KMS is selected.
- Format: the exact region encoded in the configured KMS key ARN.
- Classification: non-secret.
- Validation/use: `awsKmsMetaCredentialKeyProvider.ts`.
- Failure behavior: missing or different from the key ARN region -> `META_CREDENTIAL_AWS_KMS_CONFIG_INVALID` before a KMS call.

### `FAWRI_META_AWS_KMS_KEY_ARN`

- Purpose: exact identity of the single approved production KMS key.
- Required: yes when AWS KMS is selected.
- Format: full KMS key ARN, not alias/name shorthand.
- Classification: non-secret resource identifier.
- Validation/use: `awsKmsMetaCredentialKeyProvider.ts`.
- Failure behavior: malformed ARN -> `META_CREDENTIAL_AWS_KMS_CONFIG_INVALID`; returned KMS `KeyId` must exactly equal this ARN or bootstrap fails with `META_CREDENTIAL_AWS_KMS_KEY_ID_MISMATCH`.

### `FAWRI_META_AWS_CURRENT_DEK_ID`

- Purpose: logical application DEK id used for all new Meta credential envelopes.
- Required: yes when AWS KMS is selected.
- Format: 1-128 characters from `[A-Za-z0-9._:-]`.
- Classification: non-secret identifier.
- Validation/use: `awsKmsMetaCredentialKeyProvider.ts`.
- Failure behavior: invalid or absent from the wrapped-DEK manifest -> `META_CREDENTIAL_AWS_KMS_CONFIG_INVALID`.

### `FAWRI_META_AWS_KMS_WRAPPED_DEKS_JSON`

- Purpose: maps current/historical logical DEK ids to base64 AWS KMS `CiphertextBlob` values.
- Required: yes when AWS KMS is selected.
- Format: JSON object; every value is canonical base64 ciphertext.
- Classification: encrypted/sensitive operational configuration, but not plaintext key material.
- Validation/use: `awsKmsMetaCredentialKeyProvider.ts`.
- Failure behavior: malformed JSON, malformed ciphertext, invalid/duplicate normalized ids, missing current id, or any DEK that cannot be unwrapped causes startup to fail closed.

Example shape only:

```json
{
  "meta-dek-current": "<base64-kms-ciphertext-blob>",
  "meta-dek-previous": "<base64-kms-ciphertext-blob>"
}
```

No production ARN, production credential, plaintext DEK, or wrapped production DEK is committed in the repository.

### AWS credential mechanism

The application defines no Fawri-specific AWS access-key environment variables. The AWS SDK default credential provider chain is used. Production should supply workload identity/role credentials through the deployment platform. Long-lived static credentials must not be committed to source.

Legacy `FAWRI_META_TOKEN_KEY_ID` / `FAWRI_META_TOKEN_KEY_BASE64` are environment-provider inputs only. That provider is not production-eligible, and production startup with no explicit AWS KMS selection now fails before application load even if those legacy variables are present.

## AWS KMS key requirements

The approved production key must be:

- one AWS KMS customer-managed key;
- symmetric (`SYMMETRIC_DEFAULT`);
- key usage `ENCRYPT_DECRYPT`;
- in exactly the same AWS region configured by `FAWRI_META_AWS_REGION`;
- identified to Fawri by its full key ARN.

The application does not create KMS keys or aliases and does not administer key policy from this repository.

## IAM / key-policy least privilege

### Runtime workload principal

The runtime adapter actually calls only KMS `Decrypt`.

Required permission on the one approved KMS key:

- `kms:Decrypt`

The runtime does **not** require `kms:Encrypt`, `kms:GenerateDataKey`, `kms:DescribeKey`, key creation, alias management, disabling/deletion, or policy administration.

Where policy conditions are used, restrict `kms:Decrypt` to the fixed encryption-context values:

- `application=fawri`
- `purpose=meta-credential-dek`
- `version=1`

### Rotation/operator principal

The included rotation helper calls only KMS `GenerateDataKey` with `KeySpec=AES_256`.

Required permission on the same approved key:

- `kms:GenerateDataKey`

It does not require normal key administration permissions. A separate permission decision is required only if an operator intentionally performs additional AWS operations outside this helper.

## Bootstrap and failure behavior

Bootstrap fails closed before the application is loaded when any of these occur:

- production provider selection is missing or invalid;
- region/key/current-DEK/manifest configuration is missing or malformed;
- configured region differs from the key ARN region;
- wrapped ciphertext is malformed;
- KMS access is denied;
- KMS/network service is unavailable;
- encryption context does not authenticate;
- KMS returns a different key identity;
- KMS returns plaintext not exactly 32 bytes;
- the current logical DEK is absent;
- any configured historical DEK cannot be unwrapped.

Foreign AWS/network exceptions are converted to sanitized adapter errors. Startup logging receives only a safe error code and a generic message; wrapped DEKs, plaintext DEKs, Meta tokens, and raw AWS exception text are not emitted.

There is no production fallback from a failed AWS KMS bootstrap to local/environment key material.

## Plaintext DEK memory handling

- KMS-returned plaintext is accepted only when exactly 32 bytes.
- The provider copies valid DEKs into process-memory buffers.
- SDK-returned plaintext buffers are zeroized immediately after copying.
- Wrapped-ciphertext working buffers are cleared after use.
- Partial caches are zeroized if bootstrap fails.
- `dispose()` zeroizes every cached DEK and clears the cache.
- The default KMS client is destroyed after bootstrap because normal token operations use the in-memory provider.

## Rotation and historical reads

Safe rotation under the same one KMS key:

1. A rotation/operator principal uses the included `GenerateDataKey` helper with `AES_256` and the fixed encryption context.
2. Only the logical DEK id and wrapped `CiphertextBlob` are retained; plaintext is zeroized and never returned.
3. Add the new wrapped DEK to `FAWRI_META_AWS_KMS_WRAPPED_DEKS_JSON` while retaining every historical logical DEK still needed to read existing envelopes.
4. Promote the new id via `FAWRI_META_AWS_CURRENT_DEK_ID`.
5. Redeploy/restart; bootstrap unwraps and validates the full manifest before traffic is accepted.
6. New envelopes use the new logical `key_id`; existing envelopes resolve historical ids.
7. Remove a historical logical DEK only after the owner-approved retention/overlap window. Removal intentionally makes envelopes using that id unreadable rather than substituting another key.

No merchant/customer receives a dedicated KMS CMK.

## CI-safe activation preflight

`.github/workflows/meta-credential-kms-readiness.yml` runs for this activation branch and uses no real AWS credentials/calls. It performs:

- frozen dependency install with scripts disabled;
- API-server TypeScript typecheck;
- Meta credential vault tests;
- AWS KMS adapter tests;
- activation-specific fail-closed/configuration/error-sanitization tests;
- Meta channel tenant/isolation envelope tests;
- production runtime-provider startup wiring tests;
- API-server build.

The fake-client tests cover successful bootstrap, invalid wrapped DEKs, KMS denial/unavailability, wrong key identity, invalid plaintext size, current/historical/retired DEKs, v1 envelope compatibility, readiness, zeroization, and leak resistance.

## Controlled real AWS activation boundary

A real smoke test is permitted only after all repository preflight checks pass and an approved execution environment already provides all of the following unambiguously:

- approved AWS account and region;
- exact approved KMS key ARN;
- runtime/rotation identity with only the required permissions;
- approved wrapped disposable test DEK material or an approved operation for generating disposable test material;
- no production customer credential/data requirement;
- a reversible/non-mutating or disposable verification path;
- output/log handling that cannot expose secrets.

If any item is absent, do not fabricate values and do not paste AWS secrets into source/chat.

## External inputs still required for real activation

Repository code cannot supply or approve:

- actual production AWS account;
- actual production region;
- actual production KMS key ARN;
- runtime IAM/workload identity and key-policy binding;
- rotation/operator IAM identity if rotation is to be performed;
- initial production wrapped-DEK manifest;
- production current logical DEK id;
- historical-DEK retention/retirement policy;
- production rollout/change approval.

Until those cloud/owner inputs exist in an approved execution environment, repository readiness can be proven but a real AWS KMS smoke test remains externally blocked.
