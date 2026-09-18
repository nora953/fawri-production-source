import crypto from "node:crypto";
import { resolveCashierLocationForBranch } from "./cashierLocationBindingAuthority";
import {
  CashierStaffAuthorityError,
  listCashierStationsAuthoritative,
  type CashierStationView,
} from "./postgresCashierStaffAuthority";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

type StationConfigurationRow = {
  id: string;
  name: string;
  location_id: string;
  branch_key: string;
  branch_label: string | null;
  status: string;
  offline_inventory_authority: boolean;
};

export type CashierStationConfigurationView = CashierStationView & {
  configuration_etag: string;
};

export type CashierStationConfigurationUpdateResult = {
  id: string;
  configuration_etag: string;
};

function assertPostgresAuthority(): void {
  if (!operationalPostgresAuthorityRequired()) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_POSTGRES_REQUIRED",
      "cashier station configuration requires PostgreSQL operational authority",
      503,
    );
  }
}

function identifier(value: unknown, field: string, maxLength = 200): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_INPUT_INVALID",
      `${field} is invalid`,
      400,
      { field },
    );
  }
  return normalized;
}

function optionalLabel(value: unknown, field: string, maxLength: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return identifier(value, field, maxLength);
}

function expectedEtag(value: unknown): string {
  const normalized = String(value ?? "").normalize("NFKC").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_INPUT_INVALID",
      "expected_configuration_etag is invalid",
      400,
      { field: "expected_configuration_etag" },
    );
  }
  return normalized;
}

function etagForConfiguration(input: {
  name: string;
  location_id: string;
  branch_key: string;
  branch_label?: string | null;
  status: string;
  offline_inventory_authority: boolean;
}): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        input.name,
        input.location_id,
        input.branch_key,
        input.branch_label ?? null,
        input.status,
        Boolean(input.offline_inventory_authority),
      ]),
      "utf8",
    )
    .digest("hex");
}

export function cashierStationConfigurationEtag(
  station: Pick<
    CashierStationView,
    "name" | "location_id" | "branch_key" | "branch_label" | "status" | "offline_inventory_authority"
  >,
): string {
  return etagForConfiguration(station);
}

async function stationConfigurationRow(
  target: OperationalQueryTarget,
  merchantId: string,
  stationId: string,
  forUpdate = false,
): Promise<StationConfigurationRow | null> {
  const rows = await operationalQueryRows<StationConfigurationRow>(
    target,
    `SELECT id, name, location_id, branch_key, branch_label, status, offline_inventory_authority
       FROM merchant_cashier_stations
      WHERE merchant_id = $1 AND id = $2
      LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    [merchantId, stationId],
  );
  return rows[0] || null;
}

function configurationRowEtag(row: StationConfigurationRow): string {
  return etagForConfiguration(row);
}

function translateConfigurationDatabaseError(error: unknown): never {
  const candidate = error as { code?: unknown; constraint?: unknown };
  if (
    String(candidate?.code || "") === "23505" &&
    String(candidate?.constraint || "").includes(
      "merchant_cashier_stations_offline_location_unique",
    )
  ) {
    throw new CashierStaffAuthorityError(
      "CASHIER_OFFLINE_BRANCH_AUTHORITY_EXISTS",
      "another active cashier station already owns offline inventory authority for this branch",
      409,
    );
  }
  throw error;
}

export async function listCashierStationConfigurationsAuthoritative(
  merchantIdValue: unknown,
): Promise<CashierStationConfigurationView[]> {
  const stations = await listCashierStationsAuthoritative(merchantIdValue);
  return stations.map((station) => ({
    ...station,
    configuration_etag: cashierStationConfigurationEtag(station),
  }));
}

export async function updateCashierStationConfigurationAuthoritative(input: {
  merchantId: unknown;
  stationId: unknown;
  expectedConfigurationEtag: unknown;
  name?: unknown;
  branchKey?: unknown;
  branchLabel?: unknown;
  offlineInventoryAuthority?: unknown;
}): Promise<CashierStationConfigurationUpdateResult> {
  assertPostgresAuthority();
  const merchantId = identifier(input.merchantId, "merchant_id");
  const stationId = identifier(input.stationId, "station_id");
  const expectedConfigurationEtag = expectedEtag(input.expectedConfigurationEtag);
  const name =
    input.name === undefined ? undefined : identifier(input.name, "name", 120);
  const branchKey =
    input.branchKey === undefined
      ? undefined
      : identifier(input.branchKey, "branch_key", 120);
  const branchLabel =
    input.branchLabel === undefined
      ? undefined
      : optionalLabel(input.branchLabel, "branch_label", 120);
  const offlineInventoryAuthority =
    input.offlineInventoryAuthority === undefined
      ? undefined
      : input.offlineInventoryAuthority;

  if (
    name === undefined &&
    branchKey === undefined &&
    branchLabel === undefined &&
    offlineInventoryAuthority === undefined
  ) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STATION_PATCH_REQUIRED",
      "cashier station configuration update is empty",
      400,
    );
  }
  if (
    offlineInventoryAuthority !== undefined &&
    typeof offlineInventoryAuthority !== "boolean"
  ) {
    throw new CashierStaffAuthorityError(
      "CASHIER_STAFF_INPUT_INVALID",
      "offline_inventory_authority must be a boolean",
      400,
      { field: "offline_inventory_authority" },
    );
  }

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const current = await stationConfigurationRow(
      client,
      merchantId,
      stationId,
      true,
    );
    if (!current) {
      throw new CashierStaffAuthorityError(
        "CASHIER_STATION_NOT_FOUND",
        "cashier station was not found",
        404,
      );
    }
    if (current.status === "revoked") {
      throw new CashierStaffAuthorityError(
        "CASHIER_STATION_REVOKED",
        "revoked cashier stations cannot be edited",
        409,
      );
    }

    const currentEtag = configurationRowEtag(current);
    if (currentEtag !== expectedConfigurationEtag) {
      throw new CashierStaffAuthorityError(
        "CASHIER_STATION_VERSION_CONFLICT",
        "cashier station configuration changed before this update",
        409,
        { current_configuration_etag: currentEtag },
      );
    }
    if (
      current.status !== "active" &&
      offlineInventoryAuthority === true
    ) {
      throw new CashierStaffAuthorityError(
        "CASHIER_STATION_INACTIVE",
        "offline inventory authority requires an active cashier station",
        409,
      );
    }

    const targetLocation =
      branchKey === undefined
        ? null
        : await resolveCashierLocationForBranch(client, {
            merchantId,
            branchKey,
            branchLabel:
              branchLabel === undefined ? current.branch_label : branchLabel,
          });

    const values: unknown[] = [merchantId, stationId];
    const sets = ["updated_at = now()"];
    const add = (field: string, value: unknown) => {
      values.push(value);
      sets.push(`${field} = $${values.length}`);
    };
    if (name !== undefined) add("name", name);
    if (branchKey !== undefined && targetLocation) {
      add("branch_key", branchKey);
      add("location_id", targetLocation.id);
    }
    if (branchLabel !== undefined) add("branch_label", branchLabel);
    if (offlineInventoryAuthority !== undefined) {
      add("offline_inventory_authority", offlineInventoryAuthority);
    }

    const rows = await operationalQueryRows<StationConfigurationRow>(
      client,
      `UPDATE merchant_cashier_stations
          SET ${sets.join(", ")}
        WHERE merchant_id = $1 AND id = $2
        RETURNING id, name, location_id, branch_key, branch_label, status,
                  offline_inventory_authority`,
      values,
    );
    if (rows.length !== 1) {
      throw new CashierStaffAuthorityError(
        "CASHIER_STATION_NOT_FOUND",
        "cashier station was not found",
        404,
      );
    }
    return {
      id: rows[0].id,
      configuration_etag: configurationRowEtag(rows[0]),
    };
  }).catch(translateConfigurationDatabaseError);
}
