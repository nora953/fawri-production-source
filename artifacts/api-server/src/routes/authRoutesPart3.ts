import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import crypto from "node:crypto";
import {
  calculateRetentionStatus,
  deleteMerchant,
  MerchantDeleteReason,
  MerchantRetentionStatus,
} from "../services/merchantLifecycle";
import { registerMerchantAuthDeletion } from "../services/merchantAuthData";
import {
  registerMerchantRetentionUpdate,
  startMerchantRetentionScheduler,
} from "../services/merchantRetentionScheduler";
import {
  AdminManagementError,
  createAssistantAdmin,
  listAdmins,
  setAssistantAdminEnabled,
  updateAssistantAdminPermissions,
  registerAdminManagement,
  type AdminSummary,
} from "../services/adminManagement";
import {
  getPasswordValidationError,
  hashPassword,
  verifyPassword,
} from "../services/passwordService";
import {
  AdminWorkMonitorError,
  adminDeviceSecurityEnforced,
  approveAdminTrustedDevice,
  createAdminTrackedSession,
  getAdminCardSecuritySummary,
  getAdminWorkMonitor,
  isAdminDeviceTrusted,
  normalizeAdminDeviceId,
  recordAdminFailedLogin,
  registerAdminDeviceAttempt,
  revokeAdminTrackedSession,
  revokeAdminTrustedDevice,
  revokeAllAdminTrackedSessions,
  touchAdminTrackedSession,
  validateAdminTrackedSession,
  type AdminTrackedSession,
} from "../services/adminWorkMonitor";
import './authRoutesPart2';
import { ACCOUNT_CHANNEL_ACTIVATION_MS, adminHasPermission, appendAdminLog, appendMerchantBalanceNotification, appendMerchantSubscriptionPlanNotification, consumeReplies, createPaidSubscription, emitMerchantRealtimeState, ensureDb, findRegularMerchant, isAssistantAdmin, isMerchantDeleteReason, isOwnerAdmin, isSubscriptionPlan, makeId, normalizeSubscriptionRecord, now, publicMerchant, purchaseAdditionalReplies, recalculateSubscriptionTotals, requireAdminPermission, requireAdminSession, requireOwner, router, sendError, writeDb } from './authRuntime';
import type { MerchantBalanceNotificationRecord, MerchantDeletionRequest, MerchantStatus } from './authRuntime';

router.put("/merchants/:id/note", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_merchant_status");
  if (!admin) return;

  const merchantId = String(req.params.id || "").trim();
  const note = String(req.body?.note || "").trim();
  if (note.length > 5000) {
    return sendError(res, 400, "note is too long");
  }

  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  if (note) db.admin_notes[merchantId] = note;
  else delete db.admin_notes[merchantId];

  appendAdminLog(db, admin, merchant, "note_saved", "internal note saved");
  writeDb(db);

  return res.json({ ok: true, merchant_id: merchantId, note });
});

router.get("/admin/deletion-requests", (req: Request, res: Response) => {
  const admin = requireAdminSession(req, res);
  if (!admin) return;

  if (
    !isOwnerAdmin(admin) &&
    !adminHasPermission(admin, "manage_merchant_status")
  ) {
    return sendError(res, 403, "admin permission is required", {
      code: "ADMIN_PERMISSION_REQUIRED",
      permission: "manage_merchant_status",
    });
  }

  const db = ensureDb();
  return res.json({
    ok: true,
    deletion_requests: [...db.deletion_requests].sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    ),
  });
});

router.post(
  "/merchants/:id/deletion-requests",
  (req: Request, res: Response) => {
    const admin = requireAdminPermission(req, res, "manage_merchant_status");
    if (!admin) return;

    if (!isAssistantAdmin(admin)) {
      return sendError(res, 403, "only an assistant admin can submit a deletion request", {
        code: "ASSISTANT_ADMIN_REQUIRED",
      });
    }

    const merchantId = String(req.params.id || "").trim();
    const reason = String(req.body?.reason || "").trim();
    const details = String(req.body?.details || "").trim();

    if (!merchantId) return sendError(res, 400, "merchantId is required");
    if (!isMerchantDeleteReason(reason)) {
      return sendError(res, 400, "invalid deletion reason");
    }
    if (!details) return sendError(res, 400, "deletion request details are required");
    if (details.length > 1000) {
      return sendError(res, 400, "deletion request details are too long");
    }

    const db = ensureDb();
    const merchant = findRegularMerchant(db, merchantId);
    if (!merchant) return sendError(res, 404, "merchant not found");
    if (merchant.status !== "suspended") {
      return sendError(res, 409, "merchant must be suspended before requesting deletion");
    }

    if (
      db.deletion_requests.some(
        (request) =>
          request.merchant_id === merchantId && request.status === "pending",
      )
    ) {
      return sendError(res, 409, "a pending deletion request already exists");
    }

    if (reason === MerchantDeleteReason.RetentionExpired) {
      const retention = calculateRetentionStatus(merchant.subscription_expires_at);
      if (String(retention.retentionStatus) !== "eligible_for_deletion") {
        return sendError(res, 409, "merchant is not eligible for retention deletion");
      }
    }

    const deletionRequest: MerchantDeletionRequest = {
      id: makeId("deletion-request"),
      merchant_id: merchant.id,
      merchant_name: merchant.store_name,
      merchant_phone: merchant.phone,
      requested_by_admin_id: admin.id,
      requested_by_admin_name: admin.owner_name,
      requested_by_admin_phone: admin.phone,
      reason,
      details,
      status: "pending",
      created_at: now(),
    };

    db.deletion_requests.unshift(deletionRequest);
    appendAdminLog(
      db,
      admin,
      merchant,
      "deletion_requested",
      "merchant deletion requested",
      { reason: `${reason}: ${details}` },
    );
    writeDb(db);

    return res.status(201).json({ ok: true, deletion_request: deletionRequest });
  },
);

router.post(
  "/admin/deletion-requests/:requestId/reject",
  (req: Request, res: Response) => {
    const owner = requireOwner(req, res);
    if (!owner) return;

    const requestId = String(req.params.requestId || "").trim();
    const db = ensureDb();
    const deletionRequest = db.deletion_requests.find(
      (request) => request.id === requestId,
    );

    if (!deletionRequest) return sendError(res, 404, "deletion request not found");
    if (deletionRequest.status !== "pending") {
      return sendError(res, 409, "deletion request is already reviewed");
    }

    deletionRequest.status = "rejected";
    deletionRequest.reviewed_by_admin_id = owner.id;
    deletionRequest.reviewed_at = now();
    appendAdminLog(
      db,
      owner,
      { id: deletionRequest.merchant_id, store_name: deletionRequest.merchant_name },
      "deletion_request_rejected",
      "merchant deletion request rejected",
      { reason: deletionRequest.details },
    );
    writeDb(db);

    return res.json({ ok: true, deletion_request: deletionRequest });
  },
);

router.post("/admin/verify-password", (req: Request, res: Response) => {
  const sessionAdmin = requireAdminSession(req, res);
  if (!sessionAdmin) return;

  const adminId = String(req.body?.adminId || "").trim();
  const adminPassword = String(req.body?.adminPassword || "");

  if (!adminId) return sendError(res, 400, "adminId is required");
  if (!adminPassword) {
    return sendError(res, 400, "admin password is required");
  }

  if (
    sessionAdmin.id !== adminId ||
    !verifyPassword(adminPassword, sessionAdmin.password)
  ) {
    return sendError(res, 401, "admin credentials are incorrect");
  }

  return res.json({ ok: true });
});

router.post("/merchants/:id/delete", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  const merchantId = String(req.params.id || "").trim();
  const adminId = String(req.body?.adminId || "").trim();
  const adminPassword = String(req.body?.adminPassword || "");
  const deletionRequestId = String(req.body?.deletionRequestId || "").trim();

  if (!merchantId) return sendError(res, 400, "merchantId is required");
  if (!adminId) return sendError(res, 400, "adminId is required");
  if (!adminPassword) return sendError(res, 400, "admin password is required");
  if (!deletionRequestId) {
    return sendError(res, 400, "deletionRequestId is required");
  }

  const db = ensureDb();

  if (
    owner.id !== adminId ||
    !verifyPassword(adminPassword, owner.password)
  ) {
    return sendError(res, 401, "admin credentials are incorrect");
  }

  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");
  if (merchant.status !== "suspended") {
    return sendError(res, 409, "merchant must remain suspended until deletion review");
  }

  const deletionRequest = db.deletion_requests.find(
    (request) =>
      request.id === deletionRequestId &&
      request.merchant_id === merchantId,
  );

  if (!deletionRequest) {
    return sendError(res, 404, "deletion request not found");
  }
  if (deletionRequest.status !== "pending") {
    return sendError(res, 409, "deletion request is already reviewed");
  }

  const retention = calculateRetentionStatus(
    merchant.subscription_expires_at,
  );

  if (
    deletionRequest.reason === MerchantDeleteReason.RetentionExpired &&
    String(retention.retentionStatus) !== "eligible_for_deletion"
  ) {
    return sendError(res, 409, "merchant is not eligible for retention deletion");
  }

  try {
    const result = deleteMerchant({
      merchantId,
      reason: deletionRequest.reason,
      performedBy: owner.id,
      performedAt: now(),
      retentionStatus: retention.retentionStatus,
    });

    const latestDb = ensureDb();
    const latestRequest = latestDb.deletion_requests.find(
      (request) => request.id === deletionRequestId,
    );

    if (latestRequest) {
      latestRequest.status = "completed";
      latestRequest.reviewed_by_admin_id = owner.id;
      latestRequest.reviewed_at = now();
    }

    delete latestDb.channel_overrides[merchantId];
    delete latestDb.admin_notes[merchantId];
    appendAdminLog(
      latestDb,
      owner,
      merchant,
      "merchant_deleted",
      "merchant account and dependent data permanently deleted",
      { reason: `${deletionRequest.reason}: ${deletionRequest.details}` },
    );
    writeDb(latestDb);

    return res.json({
      ...result,
      deletion_request: latestRequest || deletionRequest,
    });
  } catch (error) {
    console.error("Merchant deletion failed:", error);

    const message =
      error instanceof Error
        ? error.message
        : "merchant deletion failed";

    if (message.includes("not eligible")) {
      return sendError(res, 409, message);
    }

    return sendError(res, 500, "merchant deletion failed");
  }
});

router.get("/admin/subscriptions", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_subscriptions");
  if (!admin) return;

  const db = ensureDb();
  return res.json({
    ok: true,
    subscriptions: [...db.subscriptions].sort(
      (left, right) =>
        new Date(right.start_date).getTime() -
        new Date(left.start_date).getTime(),
    ),
  });
});

router.post("/admin/subscriptions/migrate", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  const candidates = Array.isArray(req.body?.subscriptions)
    ? req.body.subscriptions
    : [];
  if (candidates.length > 1000) {
    return sendError(res, 400, "too many subscriptions to migrate");
  }

  const db = ensureDb();
  let imported = 0;

  for (const candidate of candidates) {
    const subscription = normalizeSubscriptionRecord(candidate);
    if (!subscription) continue;
    const merchant = findRegularMerchant(db, subscription.merchant_id);
    if (!merchant) continue;
    if (db.subscriptions.some(
      (existing) => existing.merchant_id === subscription.merchant_id,
    )) {
      continue;
    }

    db.subscriptions.push(subscription);
    merchant.subscription_started_at = subscription.start_date;
    merchant.subscription_expires_at = subscription.expires_at;
    merchant.warning_stage = 0;
    merchant.retention_status = MerchantRetentionStatus.Protected;
    merchant.eligible_for_deletion_at = undefined;
    merchant.grace_period_ends_at = undefined;
    imported += 1;
  }

  if (imported > 0) writeDb(db);
  return res.json({ ok: true, imported, subscriptions: db.subscriptions });
});

router.put("/merchants/:id/subscription", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_subscriptions");
  if (!admin) return;

  const merchantId = String(req.params.id || "").trim();
  const operation = String(req.body?.operation || "").trim() as
    | "activate"
    | "change"
    | "renew";
  const plan = String(req.body?.plan || "").trim();

  if (!merchantId) return sendError(res, 400, "merchantId is required");
  if (!["activate", "change", "renew"].includes(operation)) {
    return sendError(res, 400, "invalid subscription operation");
  }
  if (!isSubscriptionPlan(plan) || plan === "trial") {
    return sendError(res, 400, "invalid paid subscription plan");
  }

  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  const existingIndex = db.subscriptions.findIndex(
    (subscription) => subscription.merchant_id === merchantId,
  );
  const existing = existingIndex >= 0
    ? recalculateSubscriptionTotals(db.subscriptions[existingIndex])
    : undefined;
  const existingExpired = existing
    ? new Date(existing.expires_at).getTime() <= Date.now()
    : true;
  const existingBaseExhausted = existing
    ? existing.base_replies_remaining <= 0
    : false;
  const canStartNewCycle = existingExpired || existingBaseExhausted;

  if (operation === "activate" && existing) {
    return sendError(res, 409, "merchant already has a subscription");
  }
  if ((operation === "change" || operation === "renew") && !existing) {
    return sendError(res, 409, "merchant does not have a subscription");
  }
  if (
    (operation === "change" || operation === "renew") &&
    existing &&
    !canStartNewCycle
  ) {
    return sendError(
      res,
      409,
      "a new subscription cycle requires exhausted base replies or an expired subscription",
      {
        code: "SUBSCRIPTION_CYCLE_STILL_ACTIVE",
        base_replies_remaining: existing.base_replies_remaining,
        expires_at: existing.expires_at,
      },
    );
  }
  if (operation === "renew" && existing && existing.plan_name !== plan) {
    return sendError(res, 409, "renewal must keep the current plan");
  }

  const previousExpiresAt = existing?.expires_at;
  const previousPlanName = existing?.plan_name;
  const emergencyDeduction = existing?.emergency_debt || 0;
  const subscription = createPaidSubscription(
    merchantId,
    plan,
    existing,
    operation,
  );
  if (existingIndex >= 0) db.subscriptions[existingIndex] = subscription;
  else db.subscriptions.push(subscription);

  if (previousExpiresAt && previousExpiresAt !== subscription.expires_at) {
    merchant.last_subscription_ended_at = existingExpired
      ? previousExpiresAt
      : subscription.start_date;
  }
  merchant.subscription_started_at = subscription.start_date;
  merchant.subscription_expires_at = subscription.expires_at;
  merchant.warning_stage = 0;
  merchant.retention_status = MerchantRetentionStatus.Protected;
  merchant.eligible_for_deletion_at = undefined;
  merchant.grace_period_ends_at = undefined;

  const actionType = operation === "activate"
    ? "plan_activated"
    : operation === "change"
      ? "plan_changed"
      : "plan_renewed";
  appendAdminLog(
    db,
    admin,
    merchant,
    actionType,
    `subscription ${operation}: ${plan}`,
    {
      meta: {
        plan,
        ...(emergencyDeduction > 0
          ? { emergency_deduction: emergencyDeduction }
          : {}),
      },
    },
  );
  const merchantNotification = appendMerchantSubscriptionPlanNotification(
    db,
    merchantId,
    operation,
    subscription,
    previousPlanName,
    Math.max(0, emergencyDeduction - subscription.emergency_debt),
  );
  writeDb(db);
  emitMerchantRealtimeState(db, merchantId, "subscription_updated");

  return res.json({
    ok: true,
    merchant: publicMerchant(merchant),
    subscription,
    notification: merchantNotification,
  });
});

router.patch("/merchants/:id/subscription", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_subscriptions");
  if (!admin) return;

  const merchantId = String(req.params.id || "").trim();
  const action = String(req.body?.action || "").trim();
  const amount = Number(req.body?.amount);
  const enabled = req.body?.enabled;

  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");
  const subscription = db.subscriptions.find(
    (item) => item.merchant_id === merchantId,
  );
  if (!subscription) return sendError(res, 404, "subscription not found");

  recalculateSubscriptionTotals(subscription);
  let actionType = "";
  let details = "";
  let meta: Record<string, string | number> = {};
  let merchantNotification: MerchantBalanceNotificationRecord | undefined;

  if (action === "add_replies") {
    if (!Number.isInteger(amount) || amount <= 0) {
      return sendError(res, 400, "positive integer amount is required");
    }
    const purchase = purchaseAdditionalReplies(subscription, amount);
    if (subscription.status === "replies_exhausted" && subscription.replies_remaining > 0) {
      subscription.status = "active";
      subscription.auto_reply_enabled = true;
    }
    actionType = "replies_added";
    details = `purchased ${amount} replies`;
    meta = {
      amount,
      emergency_debt_paid: purchase.debtPaid,
      addon_replies_added: purchase.addonAdded,
    };
    merchantNotification = appendMerchantBalanceNotification(
      db,
      merchant.id,
      amount,
      purchase,
      subscription,
    );
  } else if (action === "deduct_replies") {
    if (!Number.isInteger(amount) || amount <= 0) {
      return sendError(res, 400, "positive integer amount is required");
    }
    if (amount > subscription.replies_remaining) {
      return sendError(res, 409, "amount exceeds remaining replies", {
        replies_remaining: subscription.replies_remaining,
      });
    }
    consumeReplies(subscription, amount);
    recalculateSubscriptionTotals(subscription);
    actionType = "replies_deducted";
    details = `deducted ${amount} replies`;
    meta = { amount };
  } else if (action === "reset_replies") {
    subscription.base_replies_used = 0;
    recalculateSubscriptionTotals(subscription);
    actionType = "replies_reset";
    details = `base reply counter reset to ${subscription.base_reply_limit}`;
    meta = { limit: subscription.base_reply_limit };
  } else if (action === "set_auto_reply") {
    if (typeof enabled !== "boolean") {
      return sendError(res, 400, "enabled boolean is required");
    }
    if (enabled && subscription.status !== "active") {
      return sendError(res, 409, "automatic replies require an active subscription");
    }
    subscription.auto_reply_enabled = enabled;
    actionType = enabled ? "auto_reply_enabled" : "auto_reply_disabled";
    details = enabled ? "automatic replies enabled" : "automatic replies disabled";
  } else {
    return sendError(res, 400, "invalid subscription action");
  }

  appendAdminLog(db, admin, merchant, actionType, details, { meta });
  writeDb(db);
  emitMerchantRealtimeState(db, merchantId, "subscription_updated");
  return res.json({
    ok: true,
    subscription,
    ...(merchantNotification ? { notification: merchantNotification } : {}),
  });
});

router.patch("/merchants/:id/status", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_merchant_status");
  if (!admin) return;

  const merchantId = String(req.params.id || "").trim();
  const status = String(req.body?.status || "").trim() as MerchantStatus;
  const reason = String(req.body?.reason || "").trim();

  if (!["pending_activation", "approved", "rejected", "suspended"].includes(status)) {
    return sendError(res, 400, "invalid status");
  }

  const db = ensureDb();
  const merchant = db.merchants.find((item) => item.id === merchantId && !item.is_admin);
  if (!merchant) return sendError(res, 404, "merchant not found");

  const hasPendingDeletionRequest = db.deletion_requests.some(
    (request) =>
      request.merchant_id === merchantId && request.status === "pending",
  );
  if (hasPendingDeletionRequest && status !== "suspended") {
    return sendError(
      res,
      409,
      "merchant must remain suspended until the deletion request is reviewed",
    );
  }

  if (status === "approved" && merchant.otp_verified !== true) {
    return sendError(res, 409, "phone number must be verified before approval");
  }

  if ((status === "suspended" || status === "rejected") && !reason) {
    return sendError(res, 400, "reason is required for this status");
  }

  const previousStatus = merchant.status;
  const transitionAt = now();
  merchant.status = status;

  if (status === "approved") {
    merchant.account_status = "approved";

    if (previousStatus !== "suspended") {
      merchant.approved_at = transitionAt;
      merchant.channel_activation_deadline = new Date(
        new Date(transitionAt).getTime() + ACCOUNT_CHANNEL_ACTIVATION_MS,
      ).toISOString();

      if (merchant.onboarding_status !== "channel_connected") {
        merchant.onboarding_status = "awaiting_channel";
      }
      if (merchant.trial_status === "eligible" || !merchant.trial_status) {
        merchant.trial_status = "not_started";
      }
    }
  } else if (status === "pending_activation") {
    merchant.account_status = "pending_review";
    merchant.onboarding_status = "pending_review";
    merchant.approved_at = undefined;
    merchant.channel_activation_deadline = undefined;
    if (merchant.trial_status === "not_started" || !merchant.trial_status) {
      merchant.trial_status = "eligible";
    }
  } else if (status === "rejected") {
    merchant.account_status = "rejected";
    merchant.onboarding_status = "pending_review";
    merchant.channel_activation_deadline = undefined;
  } else {
    merchant.account_status = "suspended";
  }

  const subscription = db.subscriptions.find(
    (item) => item.merchant_id === merchantId,
  );
  if (subscription && status === "suspended") {
    subscription.status = "suspended";
    subscription.auto_reply_enabled = false;
  } else if (
    subscription &&
    status === "approved" &&
    previousStatus === "suspended"
  ) {
    const expired = new Date(subscription.expires_at).getTime() <= Date.now();
    subscription.status = expired
      ? "expired"
      : subscription.replies_remaining <= 0
        ? "replies_exhausted"
        : "active";
    subscription.auto_reply_enabled = subscription.status === "active";
  }

  appendAdminLog(
    db,
    admin,
    merchant,
    status === "approved" && previousStatus === "suspended"
      ? "unsuspended"
      : status === "pending_activation"
        ? "restore_pending"
        : status,
    `merchant status changed from ${previousStatus} to ${status}`,
    { ...(reason ? { reason } : {}) },
  );
  writeDb(db);

  return res.json({ ok: true, merchant: publicMerchant(merchant) });
});
