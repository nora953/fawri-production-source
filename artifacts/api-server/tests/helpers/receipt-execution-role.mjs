import {assertDisposablePostgres} from '../../../../scripts/lib/disposable-postgres-test-guard.mjs';

// Disposable execution fixture only; mirror the reviewed billing DML exercised
// by the actual operator-pool test, without auth/audit/inbox CRUD privileges.
export async function grantReceiptExecutionFixture(admin,role) {
  await assertDisposablePostgres();
  if(!/^[a-z][a-z0-9_]{1,62}$/.test(role))throw Error('invalid disposable execution role');
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text) TO ${role}`);
  await admin.query(`GRANT SELECT,UPDATE ON merchants,saas_billing_orders,cashier_billing_orders TO ${role}`);
  await admin.query(`GRANT SELECT,INSERT,UPDATE ON saas_billing_events,cashier_billing_events,subscriptions,merchant_cashier_subscriptions TO ${role}`);
  await admin.query(`GRANT SELECT,INSERT ON saas_entitlement_applications,cashier_entitlement_applications TO ${role}`);
  await admin.query(`GRANT SELECT ON subscription_reply_batches TO ${role}`);
  await admin.query(`GRANT SELECT,UPDATE ON cashier_station_seat_assignments TO ${role}`);
  await admin.query(`GRANT INSERT ON audit_events,cashier_entitlement_audit_events TO ${role}`);
}
