# Production Meta credential AWS KMS readiness

## Owner decision and architecture

AWS KMS is the selected production KMS provider for Fawri Meta credentials.

The design uses exactly **one production AWS KMS symmetric customer-managed key**. Fawri does not create one KMS key per merchant/customer. Meta page/access tokens remain encrypted with the existing AES-256-GCM Meta credential envelope (version 1). AWS KMS protects application data-encryption keys (DEKs), not each token/message operation.

Startup asynchronously decrypts the configured wrapped AES-256 DEKs through AWS KMS, validates the returned KMS key identity, then keeps only the plaintext 32-byte DEKs in process memory. After bootstrap, the existing synchronous `MetaCredentialKeyProvider.current()` / `resolve(keyId)` contract is satisfied from the in-memory cache, so there is no KMS network call per Meta message or token read.

Rotation is logical-DEK rotation under the same single KMS key: one logical DEK is current for new envelopes, while explicitly retained historical logical DEKs remain available only for decrypting existing version-1 envelopes. Removing a historical logical DEK from the manifest retires it and old envelopes using that `key_id` fail closed.

## Envelope compatibility

The Meta credential envelope format is unchanged:

- `version: 1`
- `algorithm: aes-256-gcm`
- logical `key_id`
- IV
- ciphertext
- authentication tag

AWS KMS is below this envelope layer. Therefore existing v1 envelopes remain readable as long as their logical `key_id` remains present in the wrapped-DEK manifest and can be unwrapped by the configured production KMS key.

## Fixed AWS KMS EncryptionContext

Every KMS `Decrypt` and `GenerateDataKey` operation for this purpose uses exactly this non-sensitive context:

```json
{
  "application": "fawri",
  "purpose": "meta-credential-dek",
  "version": "1"
}
```

The context must not contain merchant IDs, customer IDs, tokens, message content, phone numbers, or any customer data. AWS KMS authentication of the encryption context is relied on: wrapped DEKs created under a different context must fail closed when decrypted with this context.

## Exact production configuration

Production startup requires `FAWRI_META_CREDENTIAL_PROVIDER=aws-kms`. When `NODE_ENV=production`, omitting the provider selection fails closed with `META_CREDENTIAL_PROVIDER_REQUIRED`; legacy environment key variables are not accepted as an implicit production fallback.

The adapter reads:

- `FAWRI_META_AWS_REGION` — AWS region containing the selected KMS key. It must exactly match the region encoded in the configured KMS key ARN.
- `FAWRI_META_AWS_KMS_KEY_ARN` — exact full ARN of the single symmetric customer-managed KMS key. A key ARN is required so returned `Decrypt` / `GenerateDataKey` `KeyId` can be compared exactly.
- `FAWRI_META_AWS_CURRENT_DEK_ID` — logical DEK id used for all new Meta credential envelopes.
- `FAWRI_META_AWS_KMS_WRAPPED_DEKS_JSON` — JSON object mapping logical DEK ids to base64 KMS `CiphertextBlob` values.

Example shape only; values are deliberately non-production placeholders:

```json
{
  "meta-dek-2026-08": "<base64-wrapped-ciphertext>",
  "meta-dek-2026-07": "<base64-wrapped-ciphertext>"
}
```

The current logical DEK id must exist in the manifest. The repository contains no production ARN, production credentials, plaintext DEK, or wrapped production DEK.

AWS credentials are intentionally not represented by a Fawri environment variable. Production should use the normal AWS SDK credential provider chain backed by workload identity / role credentials, not long-lived credentials committed to source.

## Bootstrap fail-closed behavior

Bootstrap fails before production readiness is true when any of the following occurs:

- missing or malformed region/key/current-DEK/manifest configuration;
- malformed wrapped `CiphertextBlob`;
- KMS permission denial;
- KMS/network unavailability;
- encryption-context mismatch / invalid ciphertext;
- returned KMS `KeyId` differs from the exact expected KMS key ARN;
- returned plaintext is not exactly 32 bytes;
- the current logical DEK is absent;
- any configured historical DEK cannot be unwrapped.

Provider readiness is `external`, `provider_id=aws-kms`, and `production_eligible=true` only after all configured DEKs have successfully bootstrapped. The environment provider remains `production_eligible=false`. Production activation must additionally use `assertAwsKmsMetaCredentialProviderReady(...)`; this assertion rejects providers that merely claim AWS readiness metadata unless they were actually created by the AWS KMS adapter bootstrap in the current process.

## Runtime memory and cleanup

KMS plaintext DEKs are copied only into process-memory buffers used by the synchronous provider. SDK-returned plaintext buffers are zeroized immediately after copying. If bootstrap fails, already cached DEKs are zeroized. `dispose()` zeroizes all cached DEK buffers and makes the provider unavailable.

The default AWS KMS client is destroyed immediately after bootstrap because runtime encryption/decryption uses only the cached DEKs.

No token, plaintext DEK, or AWS exception detail is included in adapter errors or logs. Foreign AWS/network error codes and messages are sanitized into Fawri-owned `META_CREDENTIAL_*` failures rather than being rethrown verbatim.

## Rotation operation

`generateWrappedAwsKmsMetaCredentialDek(...)` performs KMS `GenerateDataKey` with `KeySpec=AES_256`, the same exact KMS key ARN, and the fixed encryption context. It returns only:

- the operator-provided logical DEK id;
- base64 `CiphertextBlob` suitable for adding to the wrapped-DEK manifest.

The plaintext returned by KMS is zeroized in a `finally` path and is never returned or logged.

Safe rotation sequence:

1. Using a rotation/admin principal, generate a new wrapped AES-256 DEK under the same production KMS key.
2. Add its wrapped ciphertext to the manifest while retaining all historical DEKs still needed for existing envelopes.
3. Promote its logical id to `FAWRI_META_AWS_CURRENT_DEK_ID`.
4. Restart/redeploy so bootstrap validates and caches the updated manifest.
5. New envelopes use the new logical `key_id`; old v1 envelopes still resolve historical ids.
6. Retire a historical logical DEK only after the owner-approved decrypt-overlap/retention requirement is met. Removal is intentionally fail-closed.

## IAM least privilege

Use separate runtime and rotation principals where operationally possible.

### Runtime workload principal

Required KMS permission on the single selected KMS key:

- `kms:Decrypt`

Do not grant the runtime principal `kms:GenerateDataKey`, `kms:Encrypt`, key creation, key policy administration, alias administration, scheduling deletion, disabling keys, or other KMS administration unless another separately reviewed runtime requirement exists.

The key policy/IAM policy should additionally restrict `kms:Decrypt` to the fixed encryption-context values (`application=fawri`, `purpose=meta-credential-dek`, `version=1`) where AWS IAM condition support is used.

### Rotation principal / operator

Required for the included rotation operation:

- `kms:GenerateDataKey`

Grant it only on the same selected KMS key and restrict the same encryption context. It does not need key-creation/deletion/policy-administration permissions for normal DEK rotation.

If an operator separately needs to verify/decrypt a generated wrapped DEK, that is a separate permission decision; it is not required by the generation helper itself.

## KMS key count

Production KMS key count for this design: **1 symmetric customer-managed AWS KMS key**.

Multiple logical application DEKs may coexist under that one KMS key for rotation/history. These logical DEKs are not separate AWS KMS keys.

## CI boundary

CI uses injected/fake KMS clients only. It must not receive AWS production credentials and must not make real KMS calls. Focused tests cover success, wrong KMS identity, context mismatch, permission denial, KMS unavailable, malformed ciphertext, invalid plaintext length, current/historical/retired logical DEKs, rotation compatibility, leak resistance, environment-provider ineligibility, AWS-specific readiness, and disposal zeroization.

## Production startup wiring status

The coordinator handoff described by the original adapter lane has now been completed. `runtimeProviderBootstrap.ts` asynchronously bootstraps the selected AWS KMS provider before the application is imported, validates provider readiness, injects the cached provider into the legacy Meta credential runtime, PostgreSQL Meta channel authority, and PostgreSQL durable-job credential path, and disposes it during shutdown. `src/index.ts` fails startup closed when provider bootstrap fails.

Production still requires the real AWS account/KMS/IAM configuration and wrapped-DEK manifest listed below. Repository wiring does not prove that those external resources exist or that the production workload role has the required permissions. The final production release gate therefore requires explicit `aws-kms` selection and complete KMS configuration before Meta OAuth/live sending can activate.

## Remaining AWS-account / Owner blockers

Repository code cannot supply these values:

- actual production AWS account/region;
- actual customer-managed KMS key ARN;
- runtime IAM role/workload identity and key-policy binding;
- rotation IAM role/operator identity;
- initial wrapped production DEK manifest;
- rotation cadence and historical-DEK retirement window;
- production rollout/change approval.
