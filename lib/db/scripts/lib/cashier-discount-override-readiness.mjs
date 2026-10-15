export const CASHIER_DISCOUNT_OVERRIDE_MIGRATION_WHEN = 1787715600000;

export const CASHIER_DISCOUNT_POLICY_COLUMNS = [
  'merchant_id','staff_id','enabled','max_percentage_bps','max_amount_minor',
  'can_approve_override','version','created_at','updated_at',
];

export const CASHIER_DISCOUNT_OVERRIDE_COLUMNS = [
  'id','merchant_id','station_id','operator_staff_id','approver_staff_id',
  'operation_id','manual_discount_minor','manual_discount_reason','expires_at',
  'consumed_at','created_at',
];

export const CASHIER_DISCOUNT_OVERRIDE_REQUIRED_CONSTRAINTS = [
  'cashier_discount_percentage_range',
  'cashier_discount_amount_nonnegative',
  'cashier_discount_policy_version_positive',
  'cashier_discount_policy_staff_merchant_fk',
  'merchant_cashier_discount_override_merchant_operation_unique',
  'cashier_discount_override_amount_positive',
  'cashier_discount_override_reason_nonempty',
  'cashier_discount_override_not_self_approved',
  'cashier_discount_override_expiry_check',
  'cashier_discount_override_consumed_time_check',
  'cashier_discount_override_station_merchant_fk',
  'cashier_discount_override_operator_merchant_fk',
  'cashier_discount_override_approver_merchant_fk',
];

function setIncludesAll(values, required) {
  const set = new Set(values || []);
  return required.every(value => set.has(value));
}

export function evaluateCashierDiscountOverrideReadiness(facts) {
  const migrationRecorded = facts.migration_recorded === true;
  const permissionReady = facts.permission_constraint_supports_discount === true;
  const policyTablePresent = facts.policy_table_present === true;
  const overrideTablePresent = facts.override_table_present === true;
  const policyColumnsReady = setIncludesAll(
    facts.policy_columns,
    CASHIER_DISCOUNT_POLICY_COLUMNS,
  );
  const overrideColumnsReady = setIncludesAll(
    facts.override_columns,
    CASHIER_DISCOUNT_OVERRIDE_COLUMNS,
  );
  const constraintsReady = setIncludesAll(
    facts.constraint_names,
    CASHIER_DISCOUNT_OVERRIDE_REQUIRED_CONSTRAINTS,
  );

  const ready =
    migrationRecorded &&
    permissionReady &&
    policyTablePresent &&
    overrideTablePresent &&
    policyColumnsReady &&
    overrideColumnsReady &&
    constraintsReady;

  return {
    ok: ready,
    migration_recorded: migrationRecorded,
    staff_permission_constraint_supports_discount: permissionReady,
    policy_table_present: policyTablePresent,
    policy_required_columns_ready: policyColumnsReady,
    override_table_present: overrideTablePresent,
    override_required_columns_ready: overrideColumnsReady,
    required_constraints_ready: constraintsReady,
  };
}
