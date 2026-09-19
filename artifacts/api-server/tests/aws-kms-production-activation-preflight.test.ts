import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrapAwsKmsMetaCredentialKeyProvider,
  readAwsKmsMetaCredentialConfigFromEnvironment,
  type AwsKmsMetaCredentialConfig,
} from "../src/services/awsKmsMetaCredentialKeyProvider";
import { initializeRuntimeProviders } from "../src/services/runtimeProviderBootstrap";

const KMS_KEY_ARN =
  "arn:aws:kms:us-east-1:123456789012:key/11111111-2222-3333-4444-555555555555";

function errorCode(error: unknown): unknown {
  return (error as { code?: unknown } | undefined)?.code;
}

function config(): AwsKmsMetaCredentialConfig {
  return {
    region: "us-east-1",
    kmsKeyArn: KMS_KEY_ARN,
    currentDekId: "dek-current",
    wrappedDeks: {
      "dek-current": Buffer.from("kms-ciphertext:dek-current").toString("base64"),
    },
  };
}

test("production startup requires an explicit AWS KMS Meta credential provider selection", async () => {
  let bootstrapCalled = false;
  let metaConfigured = false;

  await assert.rejects(
    () =>
      initializeRuntimeProviders({
        env: {
          NODE_ENV: "production",
          FAWRI_META_TOKEN_KEY_ID: "legacy-environment-key",
          FAWRI_META_TOKEN_KEY_BASE64: Buffer.alloc(32, 7).toString("base64"),
        } as NodeJS.ProcessEnv,
        dependencies: {
          bootstrapAwsKms: async () => {
            bootstrapCalled = true;
            throw new Error("must not be called");
          },
          configureMetaCredentialProvider: () => {
            metaConfigured = true;
          },
        },
      }),
    (error: unknown) => errorCode(error) === "META_CREDENTIAL_PROVIDER_REQUIRED",
  );

  assert.equal(bootstrapCalled, false);
  assert.equal(metaConfigured, false);
});

test("AWS KMS region must exactly match the region encoded in the selected key ARN", () => {
  assert.throws(
    () =>
      readAwsKmsMetaCredentialConfigFromEnvironment({
        FAWRI_META_AWS_REGION: "eu-west-1",
        FAWRI_META_AWS_KMS_KEY_ARN: KMS_KEY_ARN,
        FAWRI_META_AWS_CURRENT_DEK_ID: "dek-current",
        FAWRI_META_AWS_KMS_WRAPPED_DEKS_JSON: JSON.stringify({
          "dek-current": Buffer.from("wrapped").toString("base64"),
        }),
      } as NodeJS.ProcessEnv),
    (error: unknown) =>
      errorCode(error) === "META_CREDENTIAL_AWS_KMS_CONFIG_INVALID",
  );
});

test("foreign coded AWS/network errors are sanitized instead of being rethrown verbatim", async () => {
  const secretMarker = "wrapped-dek-secret-material-must-not-leak";
  const client = {
    async send() {
      throw Object.assign(new Error(`Access denied: ${secretMarker}`), {
        code: "AccessDeniedException",
      });
    },
  };

  await assert.rejects(
    () =>
      bootstrapAwsKmsMetaCredentialKeyProvider({
        config: config(),
        client: client as never,
      }),
    (error: unknown) => {
      assert.equal(errorCode(error), "META_CREDENTIAL_AWS_KMS_BOOTSTRAP_FAILED");
      assert.equal(String(error).includes(secretMarker), false);
      assert.equal(String((error as Error).message).includes("Access denied"), false);
      return true;
    },
  );
});
