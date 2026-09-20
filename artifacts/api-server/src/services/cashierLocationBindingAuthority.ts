import crypto from "node:crypto";
import {
  operationalQueryRows,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

export type CashierLocationBinding = {
  id: string;
  merchant_id: string;
  name: string;
  legacy_branch_key?: string;
  is_default: boolean;
};

type LocationRow = {
  id: string;
  merchant_id: string;
  name: string;
  legacy_branch_key: string | null;
  is_default: boolean;
};

function deterministicLocationId(merchantId: string, branchKey: string): string {
  return `location_${crypto
    .createHash("sha256")
    .update(`${merchantId}\0${branchKey}`)
    .digest("hex")
    .slice(0, 40)}`;
}

function toBinding(row: LocationRow): CashierLocationBinding {
  return {
    id: row.id,
    merchant_id: row.merchant_id,
    name: row.name,
    ...(row.legacy_branch_key
      ? { legacy_branch_key: row.legacy_branch_key }
      : {}),
    is_default: Boolean(row.is_default),
  };
}

async function findById(
  target: OperationalQueryTarget,
  merchantId: string,
  locationId: string,
): Promise<LocationRow | null> {
  const rows = await operationalQueryRows<LocationRow>(
    target,
    `SELECT id, merchant_id, name, legacy_branch_key, is_default
       FROM merchant_locations
      WHERE merchant_id = $1
        AND id = $2
      LIMIT 1
      FOR UPDATE`,
    [merchantId, locationId],
  );
  return rows[0] || null;
}

async function findByLegacyBranch(
  target: OperationalQueryTarget,
  merchantId: string,
  branchKey: string,
): Promise<LocationRow | null> {
  const rows = await operationalQueryRows<LocationRow>(
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

async function findDefault(
  target: OperationalQueryTarget,
  merchantId: string,
): Promise<LocationRow | null> {
  const rows = await operationalQueryRows<LocationRow>(
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

async function merchantHasLocations(
  target: OperationalQueryTarget,
  merchantId: string,
): Promise<boolean> {
  const rows = await operationalQueryRows<{ present: boolean }>(
    target,
    `SELECT EXISTS (
       SELECT 1 FROM merchant_locations WHERE merchant_id = $1
     ) AS present`,
    [merchantId],
  );
  return Boolean(rows[0]?.present);
}

async function createLocation(
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
       id, merchant_id, name, legacy_branch_key, is_default,
       operational_status, online_fulfillment_enabled,
       accept_online_orders_while_closed, merchant_priority,
       created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,'open',FALSE,FALSE,0,now(),now())
     ON CONFLICT DO NOTHING`,
    [
      deterministicLocationId(input.merchantId, input.branchKey),
      input.merchantId,
      input.branchLabel || (input.isDefault ? "Main Location" : input.branchKey),
      input.branchKey,
      input.isDefault,
    ],
  );
}

export async function resolveCashierLocationById(
  target: OperationalQueryTarget,
  input: {
    merchantId: string;
    locationId: string;
  },
): Promise<CashierLocationBinding | null> {
  const location = await findById(target, input.merchantId, input.locationId);
  return location ? toBinding(location) : null;
}

export async function resolveCashierLocationForBranch(
  target: OperationalQueryTarget,
  input: {
    merchantId: string;
    branchKey: string;
    branchLabel?: string | null;
  },
): Promise<CashierLocationBinding> {
  let location = await findByLegacyBranch(
    target,
    input.merchantId,
    input.branchKey,
  );
  if (location) return toBinding(location);

  if (input.branchKey === "main") {
    const defaultLocation = await findDefault(target, input.merchantId);
    if (defaultLocation) return toBinding(defaultLocation);
  }

  const isDefault = !(await merchantHasLocations(target, input.merchantId));
  await createLocation(target, {
    ...input,
    isDefault,
  });

  location = await findByLegacyBranch(
    target,
    input.merchantId,
    input.branchKey,
  );
  if (!location) {
    throw new Error("cashier merchant location could not be resolved");
  }
  return toBinding(location);
}
