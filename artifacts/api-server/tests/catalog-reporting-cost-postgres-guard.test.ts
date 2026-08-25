import assert from "node:assert/strict";
import test from "node:test";

import { createCatalogProductAuthoritative } from "../src/services/postgresCatalogAuthority";
import { OPERATIONAL_POSTGRES_AUTHORITY_ENV } from "../src/services/operationalPostgresAuthority";

async function expectPostgresRequired(input: Record<string, unknown>): Promise<void> {
  await assert.rejects(
    () =>
      createCatalogProductAuthoritative({
        merchantId: "merchant-reporting-cost-guard",
        idempotencyKey: "guard-idempotency-key",
        input: input as never,
      }),
    (error: unknown) => {
      assert.equal(
        (error as { code?: string })?.code,
        "CATALOG_COMMERCE_POSTGRES_REQUIRED",
      );
      return true;
    },
  );
}

test("merchant reporting costs never fall back to the legacy catalog authority", async () => {
  const previous = process.env[OPERATIONAL_POSTGRES_AUTHORITY_ENV];
  delete process.env[OPERATIONAL_POSTGRES_AUTHORITY_ENV];
  try {
    await expectPostgresRequired({ cost_iqd: 5_000 });
    await expectPostgresRequired({
      variants: [
        {
          id: "variant-1",
          name: "Variant",
          options: { Size: "M" },
          cost_iqd: 4_000,
        },
      ],
    });
  } finally {
    if (previous === undefined) delete process.env[OPERATIONAL_POSTGRES_AUTHORITY_ENV];
    else process.env[OPERATIONAL_POSTGRES_AUTHORITY_ENV] = previous;
  }
});
