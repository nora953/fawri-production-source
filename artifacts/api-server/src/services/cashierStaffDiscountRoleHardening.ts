import {
  operationalQueryRows,
  withMerchantOperationalTransaction,
  type OperationalTransactionClient,
} from './operationalPostgresAuthority';

type StaffRoleRow = Record<string, unknown> & {
  id: string;
  role: string;
};

type ChangedRow = Record<string, unknown> & {
  changed: string;
};

function schemaMissing(error: unknown): boolean {
  return String((error as { code?: unknown })?.code || '') === '42P01';
}

async function clearStoredOverrideFlagIfAvailable(
  client: OperationalTransactionClient,
  merchantId: string,
  staffId: string,
): Promise<boolean> {
  await client.query('SAVEPOINT cashier_discount_role_hardening_policy');
  try {
    const changed = await operationalQueryRows<ChangedRow>(
      client,
      `UPDATE merchant_cashier_staff_discount_policies
          SET can_approve_override = FALSE,
              version = version + 1,
              updated_at = now()
        WHERE merchant_id = $1
          AND staff_id = $2
          AND can_approve_override = TRUE
        RETURNING staff_id AS changed`,
      [merchantId, staffId],
    );
    await client.query('RELEASE SAVEPOINT cashier_discount_role_hardening_policy');
    return changed.length > 0;
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT cashier_discount_role_hardening_policy');
    await client.query('RELEASE SAVEPOINT cashier_discount_role_hardening_policy');
    if (schemaMissing(error)) return false;
    throw error;
  }
}

export async function enforceCashierDiscountOverrideRoleInvariant(input: {
  merchantId: string;
  staffId: string;
}): Promise<boolean> {
  const merchantId = String(input.merchantId || '').trim();
  const staffId = String(input.staffId || '').trim();
  if (!merchantId || !staffId) return false;

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const staffRows = await operationalQueryRows<StaffRoleRow>(
      client,
      `SELECT id, role
         FROM merchant_cashier_staff
        WHERE merchant_id = $1 AND id = $2
        LIMIT 1
        FOR UPDATE`,
      [merchantId, staffId],
    );
    const staff = staffRows[0];
    if (!staff || staff.role === 'manager') return false;

    const removedPermissions = await operationalQueryRows<ChangedRow>(
      client,
      `DELETE FROM merchant_cashier_staff_permissions
        WHERE merchant_id = $1
          AND staff_id = $2
          AND permission = 'sale.discount_override'
        RETURNING permission AS changed`,
      [merchantId, staffId],
    );

    const cleanedSessions = await operationalQueryRows<ChangedRow>(
      client,
      `UPDATE cashier_operator_sessions
          SET permission_snapshot = COALESCE(permission_snapshot, '[]'::jsonb)
                                    - 'sale.discount_override'
        WHERE merchant_id = $1
          AND staff_id = $2
          AND status = 'active'
          AND COALESCE(permission_snapshot, '[]'::jsonb) ? 'sale.discount_override'
        RETURNING id AS changed`,
      [merchantId, staffId],
    );

    const policyChanged = await clearStoredOverrideFlagIfAvailable(
      client,
      merchantId,
      staffId,
    );

    return removedPermissions.length > 0 || cleanedSessions.length > 0 || policyChanged;
  });
}
