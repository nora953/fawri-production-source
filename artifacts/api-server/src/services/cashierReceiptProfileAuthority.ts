import {
  operationalDatabasePool,
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
} from "./operationalPostgresAuthority";
import { CashierStaffAuthorityError } from "./postgresCashierStaffAuthority";

type ReceiptProfileRow = {
  store_name: string;
};

function normalizedStoreName(value: unknown): string {
  const storeName = String(value ?? "").normalize("NFKC").trim();
  if (
    !storeName ||
    storeName.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(storeName)
  ) {
    throw new CashierStaffAuthorityError(
      "CASHIER_RECEIPT_PROFILE_INVALID",
      "cashier receipt store profile is invalid",
      500,
    );
  }
  return storeName;
}

export async function getCashierReceiptProfileAuthoritative(input: {
  merchantId: string;
}): Promise<{ store_name: string }> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new CashierStaffAuthorityError(
      "CASHIER_RECEIPT_PROFILE_POSTGRES_REQUIRED",
      "cashier receipt profile requires PostgreSQL operational authority",
      503,
    );
  }

  const pool = await operationalDatabasePool();
  const rows = await operationalQueryRows<ReceiptProfileRow>(
    pool,
    `SELECT store_name
       FROM merchants
      WHERE id = $1
      LIMIT 1`,
    [input.merchantId],
  );
  const row = rows[0];
  if (!row) {
    throw new CashierStaffAuthorityError(
      "CASHIER_RECEIPT_PROFILE_NOT_FOUND",
      "cashier receipt store profile was not found",
      404,
    );
  }

  return { store_name: normalizedStoreName(row.store_name) };
}
