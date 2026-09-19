import crypto from "node:crypto";
import {
  operationalQueryRows,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

type LocationBindingRow = {
  id: string;
  merchant_id: string;
  name: string;
  legacy_branch_key: string | null;
  is_default: boolean;
};

async function defaultLocation(
  target: OperationalQueryTarget,
  merchantId: string,
): Promise<LocationBindingRow | null> {
  const rows = await operationalQueryRows<LocationBindingRow>(
    target,
    `SELECT id, merchant_id, name, legacy_branch_key, is_default
       FROM merchant_locations
      WHERE merchant_id = $1
        AND is_default = TRUE
      LIMIT 1
      FOR UPDATE`,
    [merchantId],
  );
  return rows[0] || null;
}

async function locationByLegacyBranch(
  target: OperationalQueryTarget,
  merchantId: string,
  branchKey: string,
): Promise<LocationBindingRow | null> {
  const rows = await operationalQueryRows<LocationBindingRow>(
    target,
    `SELECT id, merchant_id, name, legacy_branch_key, is_default
       FROM merchant_locations
      WHERE merchant_id = $1
        AND legacy_branch_key = $2
      LIMIT 1
      FOR UPDATE`,
    [merchantId, branchKey],
  );
  return rows[0] || null;
}

async function createLocationIfMissing(
  target: OperationalQueryTarget,
  input: {
    merchantId: string;
    branchKey: string;
    branchLabel?: string | null;
    isDefault: boolean;
  },
): Promise<void> {
  await target.query(
    `INSERT INTO merchant_locations (
       id,
       merchant_id,
       name,
       legacy_branch_key,
       status,
       is_default,
       operational_status,
       online_fulfillment_enabled,
       accept_online_orders_when_closed,
       version,
       created_at,
       updated_at
     ) VALUES (
       $1,$2,$3,$4,'active',$5,'open',$6,TRUE,1,now(),now()
     )
     ON CONFLICT DO NOTHING`,
    [
      `merchant_location_${crypto.randomUUID()}`,
      input.merchantId,
      input.branchLabel || (input.isDefault ? "Main Location" : input.branchKey),
      input.branchKey,
      input.isDefault,
      input.isDefault,
    ],
  );
}

export async function resolveCashierLocationForBranch(
  target: OperationalQueryTarget,
  input: {
    merchantId: string;
    branchKey: string;
    branchLabel?: string | null;
  },
): Promise<LocationBindingRow> {
  if (input.branchKey === "main") {
    let location = await defaultLocation(target, input.merchantId);
    if (!location) {
      await createLocationIfMissing(target, {
        ...input,
        isDefault: true,
      });
      location = await defaultLocation(target, input.merchantId);
    }
    if (!location) {
      throw new Error("default merchant location could not be resolved");
    }
    if (location.legacy_branch_key !== "main") {
      await target.query(
        `UPDATE merchant_locations
            SET legacy_branch_key = 'main',
                updated_at = now()
          WHERE merchant_id = $1
            AND id = $2`,
        [input.merchantId, location.id],
      );
      location = {
        ...location,
        legacy_branch_key: "main",
      };
    }
    return location;
  }

  let defaultMerchantLocation = await defaultLocation(
    target,
    input.merchantId,
  );
  if (!defaultMerchantLocation) {
    await createLocationIfMissing(target, {
      merchantId: input.merchantId,
      branchKey: "main",
      branchLabel: "Main Location",
      isDefault: true,
    });
    defaultMerchantLocation = await defaultLocation(target, input.merchantId);
  }
  if (!defaultMerchantLocation) {
    throw new Error("default merchant location could not be resolved");
  }
  if (defaultMerchantLocation.legacy_branch_key !== "main") {
    await target.query(
      `UPDATE merchant_locations
          SET legacy_branch_key = 'main',
              updated_at = now()
        WHERE merchant_id = $1
          AND id = $2`,
      [input.merchantId, defaultMerchantLocation.id],
    );
  }

  let location = await locationByLegacyBranch(
    target,
    input.merchantId,
    input.branchKey,
  );
  if (!location) {
    await createLocationIfMissing(target, {
      ...input,
      isDefault: false,
    });
    location = await locationByLegacyBranch(
      target,
      input.merchantId,
      input.branchKey,
    );
  }
  if (!location) {
    throw new Error("merchant branch location could not be resolved");
  }
  return location;
}
