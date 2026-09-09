import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  getMerchantIdFromSecureSession,
  requireSecureMerchantSession,
} from '../middleware/authSession';
import {
  getCashierOperatorContext,
  requireCashierOperatorSession,
} from '../middleware/cashierStaffSession';
import {
  CashierDiscountPolicyAuthorityError,
  disabledStoredCashierDiscountPolicy,
  loadCashierDiscountPolicies,
  upsertCashierDiscountPolicy,
} from '../services/cashierDiscountPolicyAuthority';
import {
  CashierDiscountPolicyError,
  normalizeCashierManualDiscountPolicy,
} from '../services/cashierDiscountPolicy';
import {
  operationalQueryRows,
  withMerchantOperationalTransaction,
} from '../services/operationalPostgresAuthority';

const router = Router();

type StaffVersionRow = Record<string, unknown> & {
  id: string;
  version: number | string;
  status: string;
};

type PermissionRow = Record<string, unknown> & {
  permission: string;
};

function merchantId(res: Response): string {
  return getMerchantIdFromSecureSession(res);
}

function sendError(res: Response, error: unknown): void {
  res.setHeader('Cache-Control', 'no-store');
  if (error instanceof CashierDiscountPolicyAuthorityError) {
    res.status(error.status).json({ ok: false, code: error.code, error: error.message });
    return;
  }
  if (error instanceof CashierDiscountPolicyError) {
    res.status(400).json({ ok: false, code: error.code, error: error.message });
    return;
  }
  const candidate = error as { code?: unknown };
  if (String(candidate?.code || '') === '23505') {
    res.status(409).json({ ok: false, code: 'CASHIER_DISCOUNT_POLICY_CONFLICT', error: 'cashier discount policy changed concurrently' });
    return;
  }
  console.error('Cashier discount policy operation failed', {
    name: error instanceof Error ? error.name : 'UnknownError',
  });
  res.status(500).json({
    ok: false,
    code: 'CASHIER_DISCOUNT_POLICY_OPERATION_FAILED',
    error: 'cashier discount policy operation failed',
  });
}

function requireMerchant(req: Request, res: Response, next: NextFunction): void {
  requireSecureMerchantSession(req, res, next);
}

router.get(
  '/cashier/management/discount-policies',
  requireMerchant,
  async (_req, res) => {
    try {
      const id = merchantId(res);
      const result = await withMerchantOperationalTransaction(id, async (client) => {
        const staff = await operationalQueryRows<StaffVersionRow>(
          client,
          `SELECT id, version, status
             FROM merchant_cashier_staff
            WHERE merchant_id = $1 AND status <> 'revoked'
            ORDER BY created_at, id`,
          [id],
        );
        const policies = await loadCashierDiscountPolicies(client, id);
        return staff.map((row) => ({
          staff_id: row.id,
          staff_version: Number(row.version),
          discount_policy: policies.get(row.id) || disabledStoredCashierDiscountPolicy(),
        }));
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, policies: result });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.put(
  '/cashier/management/staff/:staffId/discount-policy',
  requireMerchant,
  async (req, res) => {
    try {
      const id = merchantId(res);
      const staffId = String(req.params.staffId || '').trim();
      const expectedVersion = Number(req.body?.expected_version);
      if (!staffId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
        res.status(400).json({
          ok: false,
          code: 'CASHIER_DISCOUNT_POLICY_INPUT_INVALID',
          error: 'staff_id and expected_version are required',
        });
        return;
      }
      const policy = normalizeCashierManualDiscountPolicy(req.body?.discount_policy);
      const result = await withMerchantOperationalTransaction(id, async (client) => {
        const rows = await operationalQueryRows<StaffVersionRow>(
          client,
          `SELECT id, version, status
             FROM merchant_cashier_staff
            WHERE merchant_id = $1 AND id = $2
            LIMIT 1
            FOR UPDATE`,
          [id, staffId],
        );
        const current = rows[0];
        if (!current || current.status === 'revoked') {
          throw new CashierDiscountPolicyAuthorityError(
            'CASHIER_STAFF_NOT_FOUND',
            'cashier staff member was not found',
            404,
          );
        }
        if (Number(current.version) !== expectedVersion) {
          throw new CashierDiscountPolicyAuthorityError(
            'CASHIER_STAFF_VERSION_CONFLICT',
            'cashier staff changed before this discount policy update',
            409,
          );
        }

        await client.query(
          `DELETE FROM merchant_cashier_staff_permissions
            WHERE merchant_id = $1 AND staff_id = $2
              AND permission IN ('sale.discount', 'sale.discount_override')`,
          [id, staffId],
        );
        if (policy.enabled) {
          await client.query(
            `INSERT INTO merchant_cashier_staff_permissions
               (merchant_id, staff_id, permission, granted_at)
             VALUES ($1,$2,'sale.discount',now())
             ON CONFLICT DO NOTHING`,
            [id, staffId],
          );
          if (policy.can_approve_override) {
            await client.query(
              `INSERT INTO merchant_cashier_staff_permissions
                 (merchant_id, staff_id, permission, granted_at)
               VALUES ($1,$2,'sale.discount_override',now())
               ON CONFLICT DO NOTHING`,
              [id, staffId],
            );
          }
        }

        const stored = await upsertCashierDiscountPolicy(client, {
          merchantId: id,
          staffId,
          policy,
        });
        const updated = await operationalQueryRows<StaffVersionRow>(
          client,
          `UPDATE merchant_cashier_staff
              SET version = version + 1, updated_at = now()
            WHERE merchant_id = $1 AND id = $2 AND version = $3
            RETURNING id, version, status`,
          [id, staffId, expectedVersion],
        );
        if (updated.length !== 1) {
          throw new CashierDiscountPolicyAuthorityError(
            'CASHIER_STAFF_VERSION_CONFLICT',
            'cashier staff changed before this discount policy update',
            409,
          );
        }

        const permissionRows = await operationalQueryRows<PermissionRow>(
          client,
          `SELECT permission
             FROM merchant_cashier_staff_permissions
            WHERE merchant_id = $1 AND staff_id = $2
            ORDER BY permission`,
          [id, staffId],
        );
        const permissionSnapshot = permissionRows.map((row) => row.permission);
        await client.query(
          `UPDATE cashier_operator_sessions
              SET permission_snapshot = $3::jsonb
            WHERE merchant_id = $1 AND staff_id = $2 AND status = 'active'`,
          [id, staffId, JSON.stringify(permissionSnapshot)],
        );

        return {
          staff_id: staffId,
          staff_version: Number(updated[0].version),
          discount_policy: stored,
        };
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get(
  '/cashier/operator/discount-policy',
  requireCashierOperatorSession,
  async (_req, res) => {
    try {
      const context = getCashierOperatorContext(res);
      const policy = await withMerchantOperationalTransaction(
        context.merchant_id,
        async (client) => {
          if (!context.permissions.includes('sale.discount')) {
            return disabledStoredCashierDiscountPolicy();
          }
          const policies = await loadCashierDiscountPolicies(
            client,
            context.merchant_id,
            context.staff_id,
          );
          const stored = policies.get(context.staff_id) || disabledStoredCashierDiscountPolicy();
          return {
            ...stored,
            can_approve_override:
              stored.can_approve_override && context.permissions.includes('sale.discount_override'),
          };
        },
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, discount_policy: policy });
    } catch (error) {
      sendError(res, error);
    }
  },
);

export default router;
