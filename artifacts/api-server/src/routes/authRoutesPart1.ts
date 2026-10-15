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
import { OTP_RESEND_COOLDOWN_SECONDS, addBaghdadCalendarMonths, adminSubscriptionRealtimeClients, appendAdminLog, appendMerchantEmergencyActivationNotification, buildAdminSubscriptionSnapshot, buildMerchantRealtimePayload, clearMerchantSessionCookie, createAdminSessionToken, createAssistantTrackedSession, deliverOtp, emitMerchantRealtimeState, ensureDb, findRegularMerchant, findValidOtp, getAdminDeviceContext, getBaghdadDateParts, getMerchantIdFromSession, getOtpRetryAfterSeconds, includeDevCode, isTrialStatus, issueOtp, makeId, merchantRealtimeClients, normalizeLanguage, normalizeOptionalUrl, normalizePhone, now, publicMerchant, recalculateSubscriptionTotals, refreshAndPersistSubscriptionLifecycle, refreshAndPersistSupportLifecycle, refreshInspectionRequestExpirations, requireAdminPermission, requireMerchantSession, requireSupportAssistant, router, sendAdminWorkMonitorError, sendError, sendOtpCooldownError, setMerchantSessionCookie, setSupportTicketWaitingOn, writeAdminSubscriptionRealtimeEvent, writeDb, writeMerchantRealtimeEvent } from './authRuntime';
import type { AddonReplyBatch, InspectionSessionRequestStatus, Merchant, MerchantRealtimeClient, OtpRecord, SupportTicketCategory, SupportTicketMessage, SupportTicketRecord } from './authRuntime';

router.post("/signup", async (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password || "").trim();
  const ownerName = String(req.body?.owner_name || "").trim();
  const storeName = String(req.body?.store_name || "").trim();
  const activityType = String(req.body?.activity_type || "").trim();
  const language = normalizeLanguage(req.body?.language);

  if (!phone) return sendError(res, 400, "اكتب رقم الهاتف");
  const passwordError = getPasswordValidationError(password);
  if (passwordError) {
    return sendError(res, 400, passwordError.message);
  }
  if (!ownerName) return sendError(res, 400, "اكتب اسم صاحب المتجر");
  if (!storeName) return sendError(res, 400, "اكتب اسم المتجر");
  if (!activityType) return sendError(res, 400, "اختر نوع النشاط");

  const db = ensureDb();
  const existing = db.merchants.find((merchant) => normalizePhone(merchant.phone) === phone);

  if (existing) {
    if (!existing.is_admin && existing.otp_verified === false) {
      const retryAfterSeconds = getOtpRetryAfterSeconds(
        db,
        phone,
        "signup",
      );

      if (retryAfterSeconds > 0) {
        return sendOtpCooldownError(res, retryAfterSeconds);
      }

      existing.owner_name = ownerName;
      existing.store_name = storeName;
      existing.password = hashPassword(password);
      existing.activity_type = activityType;
      existing.instagram_link = normalizeOptionalUrl(req.body?.instagram_link);
      existing.messenger_link = normalizeOptionalUrl(req.body?.messenger_link);
      existing.telegram_link = normalizeOptionalUrl(req.body?.telegram_link);
      existing.language = language;
      existing.status = "pending_activation";
      existing.account_status = "pending_review";
      existing.onboarding_status = "pending_review";
      existing.trial_status = "eligible";
      existing.signup_source = "direct";
      existing.requested_plan = null;
      existing.approved_at = undefined;
      existing.channel_activation_deadline = undefined;

      const otp = issueOtp(db, phone, "signup");
      const delivery = await deliverOtp(phone, otp.code, "signup");

      if (!delivery.ok) {
        return sendError(res, 502, delivery.error);
      }

      writeDb(db);

      return res.status(200).json({
        ok: true,
        merchant: publicMerchant(existing),
        ...(includeDevCode() ? { devCode: otp.code } : {}),
        message: "تم إرسال رمز تحقق جديد",
        retry_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
      });
    }

    return sendError(res, 409, "رقم الهاتف مسجل مسبقاً");
  }

  const merchant: Merchant = {
    id: makeId("merchant"),
    owner_name: ownerName,
    store_name: storeName,
    phone,
    password: hashPassword(password),
    activity_type: activityType,
    instagram_link: normalizeOptionalUrl(req.body?.instagram_link),
    messenger_link: normalizeOptionalUrl(req.body?.messenger_link),
    telegram_link: normalizeOptionalUrl(req.body?.telegram_link),
    status: "pending_activation",
    language,
    theme_preference: "auto",
    created_at: now(),
    otp_verified: false,
    account_status: "pending_review",
    onboarding_status: "pending_review",
    trial_status: "eligible",
    signup_source: "direct",
    requested_plan: null,
    warning_stage: 0,
    retention_status: MerchantRetentionStatus.Protected,
  };

  db.merchants.push(merchant);
  const otp = issueOtp(db, phone, "signup");
  const delivery = await deliverOtp(phone, otp.code, "signup");

  if (!delivery.ok) {
    return sendError(res, 502, delivery.error);
  }

  writeDb(db);

  return res.status(201).json({
    ok: true,
    merchant: publicMerchant(merchant),
    ...(includeDevCode() ? { devCode: otp.code } : {}),
    message: "تم إنشاء الحساب وإرسال رمز التحقق",
    retry_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
  });
});

router.post("/otp/resend", async (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const purpose = String(req.body?.purpose || "").trim();

  if (!phone) return sendError(res, 400, "رقم الهاتف مطلوب");

  if (purpose !== "signup" && purpose !== "password_reset") {
    return sendError(res, 400, "غرض رمز التحقق غير صالح");
  }

  const otpPurpose = purpose as OtpRecord["purpose"];
  const db = ensureDb();
  const merchant = db.merchants.find(
    (item) => normalizePhone(item.phone) === phone && !item.is_admin,
  );

  if (!merchant) return sendError(res, 404, "الحساب غير موجود");

  if (otpPurpose === "signup" && merchant.otp_verified === true) {
    return sendError(res, 409, "تم التحقق من رقم الهاتف مسبقاً");
  }

  const retryAfterSeconds = getOtpRetryAfterSeconds(
    db,
    phone,
    otpPurpose,
  );

  if (retryAfterSeconds > 0) {
    return sendOtpCooldownError(res, retryAfterSeconds);
  }

  const otp = issueOtp(db, phone, otpPurpose);
  const delivery = await deliverOtp(phone, otp.code, otpPurpose);

  if (!delivery.ok) {
    return sendError(res, 502, delivery.error);
  }

  writeDb(db);

  return res.json({
    ok: true,
    message: "تم إرسال رمز تحقق جديد",
    retry_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
    ...(includeDevCode() ? { devCode: otp.code } : {}),
  });
});

router.post("/verify-otp", (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code || "").trim();

  if (!phone) return sendError(res, 400, "رقم الهاتف مطلوب");
  if (!code) return sendError(res, 400, "رمز التحقق مطلوب");

  const db = ensureDb();
  const merchant = db.merchants.find((item) => normalizePhone(item.phone) === phone && !item.is_admin);
  if (!merchant) return sendError(res, 404, "الحساب غير موجود");

  const otp = findValidOtp(db, phone, code, "signup");
  if (!otp) return sendError(res, 400, "رمز التحقق غير صحيح أو منتهي الصلاحية");

  otp.used = true;
  merchant.otp_verified = true;
  merchant.status = "pending_activation";
  merchant.account_status = "pending_review";
  merchant.onboarding_status = "pending_review";
  if (!isTrialStatus(merchant.trial_status)) merchant.trial_status = "eligible";
  writeDb(db);
  setMerchantSessionCookie(res, merchant.id);

  return res.json({ ok: true, merchant: publicMerchant(merchant) });
});

router.post("/login", (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password || "").trim();

  if (!phone || !password) return sendError(res, 400, "اكتب رقم الهاتف وكلمة المرور");

  const db = ensureDb();
  const matchingAccounts = db.merchants.filter(
    (item) => normalizePhone(item.phone) === phone,
  );
  const merchant = matchingAccounts.find((item) =>
    verifyPassword(password, item.password),
  );

  if (!merchant) {
    const matchingAdmin = matchingAccounts.find(
      (item) => item.is_admin === true,
    );
    if (matchingAdmin) {
      const device = getAdminDeviceContext(req);
      recordAdminFailedLogin({
        adminId: matchingAdmin.id,
        phone,
        deviceId: device.deviceId,
        deviceLabel: device.deviceLabel,
        reason: "invalid_credentials",
      });
    }
    return sendError(res, 401, "رقم الهاتف أو كلمة المرور غير صحيحة");
  }

  if (!merchant.is_admin && merchant.otp_verified === false) {
    return sendError(res, 401, "رقم الهاتف أو كلمة المرور غير صحيحة");
  }

  if (
    merchant.is_admin === true &&
    merchant.admin_role === "assistant_admin" &&
    merchant.admin_enabled === false
  ) {
    return sendError(
      res,
      403,
      "admin account is disabled",
      { code: "ADMIN_DISABLED" },
    );
  }

  // Migrate old plain-text passwords to hashed passwords after a successful login.
  if (!merchant.password.startsWith("sha256$")) {
    merchant.password = hashPassword(password);
    writeDb(db);
  }

  let trackedSession: AdminTrackedSession | undefined;
  try {
    trackedSession = createAssistantTrackedSession(merchant, req);
  } catch (error) {
    const response = sendAdminWorkMonitorError(res, error);
    if (response) return response;
    throw error;
  }

  res.setHeader("Cache-Control", "no-store");
  const safeAccount = publicMerchant(merchant);

  if (merchant.is_admin) {
    return res.json({
      ok: true,
      account_type: "admin",
      merchant: safeAccount,
      admin_token: createAdminSessionToken(merchant, trackedSession),
    });
  }

  setMerchantSessionCookie(res, merchant.id);
  return res.json({
    ok: true,
    account_type: "merchant",
    merchant: safeAccount,
  });
});

router.post("/logout", (_req: Request, res: Response) => {
  clearMerchantSessionCookie(res);
  return res.json({ ok: true });
});

router.post("/password-reset/request", async (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);

  if (!phone) return sendError(res, 400, "اكتب رقم الهاتف");

  const db = ensureDb();
  const merchant = db.merchants.find((item) => normalizePhone(item.phone) === phone && !item.is_admin);
  if (!merchant) return sendError(res, 404, "لا يوجد حساب بهذا الرقم");

  const retryAfterSeconds = getOtpRetryAfterSeconds(
    db,
    phone,
    "password_reset",
  );

  if (retryAfterSeconds > 0) {
    return sendOtpCooldownError(res, retryAfterSeconds);
  }

  const otp = issueOtp(db, phone, "password_reset");
  const delivery = await deliverOtp(phone, otp.code, "password_reset");

  if (!delivery.ok) {
    return sendError(res, 502, delivery.error);
  }

  writeDb(db);

  return res.json({
    ok: true,
    message: "تم إرسال رمز التحقق",
    retry_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
    ...(includeDevCode() ? { devCode: otp.code } : {}),
  });
});

router.post("/password-reset/confirm", (req: Request, res: Response) => {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code || "").trim();
  const newPassword = String(req.body?.newPassword || req.body?.new_password || "").trim();
  const confirmPassword = String(req.body?.confirmPassword || req.body?.confirm_password || "").trim();

  if (!phone) return sendError(res, 400, "اكتب رقم الهاتف");
  if (!code) return sendError(res, 400, "اكتب رمز التحقق");
  const passwordError = getPasswordValidationError(newPassword);
  if (passwordError) {
    return sendError(res, 400, passwordError.message);
  }
  if (newPassword !== confirmPassword) return sendError(res, 400, "كلمتا المرور غير متطابقتين");

  const db = ensureDb();
  const merchant = db.merchants.find((item) => normalizePhone(item.phone) === phone && !item.is_admin);
  if (!merchant) return sendError(res, 404, "الحساب غير موجود");

  const otp = findValidOtp(db, phone, code, "password_reset");
  if (!otp) return sendError(res, 400, "رمز التحقق غير صحيح أو منتهي الصلاحية");

  otp.used = true;
  merchant.otp_verified = true;
  merchant.password = hashPassword(newPassword);
  writeDb(db);

  return res.json({ ok: true, merchant: publicMerchant(merchant) });
});

router.post(
  "/change-password",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const currentPassword = String(
      req.body?.currentPassword || req.body?.oldPassword || "",
    ).trim();
    const newPassword = String(
      req.body?.newPassword || req.body?.new_password || "",
    ).trim();
    const confirmPassword = String(
      req.body?.confirmPassword || req.body?.confirm_password || "",
    ).trim();

    if (currentPassword.length < 1) {
      return sendError(res, 400, "current password is required");
    }

    const passwordError = getPasswordValidationError(newPassword);
    if (passwordError) {
      return sendError(res, 400, passwordError.message);
    }
    if (newPassword !== confirmPassword) {
      return sendError(
        res,
        400,
        "new password confirmation does not match",
      );
    }

    const db = ensureDb();
    const merchant = findRegularMerchant(db, merchantId);
    if (!merchant) return sendError(res, 404, "merchant not found");
    if (!verifyPassword(currentPassword, merchant.password)) {
      return sendError(res, 401, "current password is incorrect");
    }

    merchant.password = hashPassword(newPassword);
    writeDb(db);

    return res.json({ ok: true, merchant: publicMerchant(merchant) });
  },
);

router.get("/me", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  return res.json({ ok: true, merchant: publicMerchant(merchant) });
});

router.get("/events", requireMerchantSession, (req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const clientId = makeId("merchant-realtime");

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  req.socket.setTimeout(0);
  req.socket.setKeepAlive(true);

  let clients = merchantRealtimeClients.get(merchantId);
  if (!clients) {
    clients = new Map<string, MerchantRealtimeClient>();
    merchantRealtimeClients.set(merchantId, clients);
  }
  clients.set(clientId, { id: clientId, response: res });

  writeMerchantRealtimeEvent(
    res,
    "snapshot",
    buildMerchantRealtimePayload(ensureDb(), merchantId),
  );

  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;
    try {
      res.write(": heartbeat\n\n");
      const flush = (res as Response & { flush?: () => void }).flush;
      if (typeof flush === "function") flush.call(res);
    } catch {
      // The close handler removes disconnected clients.
    }
  }, 25_000);

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    const currentClients = merchantRealtimeClients.get(merchantId);
    currentClients?.delete(clientId);
    if (currentClients?.size === 0) {
      merchantRealtimeClients.delete(merchantId);
    }
    if (!res.writableEnded) res.end();
  };

  req.on("close", cleanup);
  res.on("close", cleanup);
});

router.get(
  "/admin/subscriptions/events",
  (req: Request, res: Response) => {
    const admin = requireAdminPermission(req, res, "manage_subscriptions");
    if (!admin) return;

    const clientId = makeId("admin-subscription-realtime");

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    req.socket.setTimeout(0);
    req.socket.setKeepAlive(true);

    adminSubscriptionRealtimeClients.set(clientId, {
      id: clientId,
      admin_id: admin.id,
      response: res,
    });

    writeAdminSubscriptionRealtimeEvent(
      res,
      "snapshot",
      buildAdminSubscriptionSnapshot(ensureDb()),
    );

    const heartbeat = setInterval(() => {
      if (res.writableEnded) return;
      try {
        res.write(": heartbeat\\n\\n");
        const flush = (res as Response & { flush?: () => void }).flush;
        if (typeof flush === "function") flush.call(res);
      } catch {
        // The close handler removes disconnected clients.
      }
    }, 25_000);

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      adminSubscriptionRealtimeClients.delete(clientId);
      if (!res.writableEnded) res.end();
    };

    req.on("close", cleanup);
    res.on("close", cleanup);
  },
);

router.get("/notifications", requireMerchantSession, (req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  refreshAndPersistSupportLifecycle(db);
  refreshAndPersistSubscriptionLifecycle(db);
  const unreadOnly = String(req.query.unread || "") === "1";
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(50, requestedLimit))
    : 20;

  const notifications = db.merchant_notifications
    .filter(
      (item) =>
        item.merchant_id === merchantId &&
        (!unreadOnly || !item.read_at),
    )
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    )
    .slice(0, limit)
    .map((notification) => {
      if (notification.type !== "inspection_session_request") return notification;

      const ticket = db.support_tickets.find(
        (item) =>
          item.id === notification.ticket_id &&
          item.merchant_id === merchantId,
      );
      const inspectionRequest = ticket?.inspection_requests.find(
        (item) => item.id === notification.inspection_request_id,
      );

      if (!inspectionRequest) {
        return {
          ...notification,
          request_status: "expired" as InspectionSessionRequestStatus,
        };
      }

      return {
        ...notification,
        request_status: inspectionRequest.status,
        consent_decision: inspectionRequest.consent_decision,
        responded_at: inspectionRequest.responded_at,
        session_expires_at: inspectionRequest.session_expires_at,
        ended_at: inspectionRequest.ended_at,
        end_reason: inspectionRequest.end_reason,
      };
    });

  res.setHeader("Cache-Control", "no-store");
  return res.json({ ok: true, notifications });
});

router.patch(
  "/notifications/:id/read",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const notificationId = String(req.params.id || "").trim();
    const db = ensureDb();
    const notification = db.merchant_notifications.find(
      (item) => item.id === notificationId && item.merchant_id === merchantId,
    );
    if (!notification) return sendError(res, 404, "notification not found");

    notification.read_at = notification.read_at || now();
    writeDb(db);
    emitMerchantRealtimeState(db, merchantId, "notifications_updated");
    return res.json({ ok: true, notification });
  },
);

router.get("/support/tickets", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  refreshAndPersistSupportLifecycle(db);
  const tickets = db.support_tickets
    .filter((ticket) => ticket.merchant_id === merchantId)
    .sort(
      (left, right) =>
        new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
    );

  res.setHeader("Cache-Control", "no-store");
  return res.json({ ok: true, tickets });
});

router.post("/support/tickets", requireMerchantSession, (req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  const subject = String(req.body?.subject || "").trim();
  const message = String(req.body?.message || "").trim();
  const category = String(req.body?.category || "other").trim() as SupportTicketCategory;
  const allowedCategories: readonly SupportTicketCategory[] = [
    "technical",
    "billing",
    "channels",
    "account",
    "other",
  ];

  if (subject.length < 3 || subject.length > 120) {
    return sendError(res, 400, "invalid support subject");
  }
  if (message.length < 2 || message.length > 4000) {
    return sendError(res, 400, "invalid support message");
  }
  if (!allowedCategories.includes(category)) {
    return sendError(res, 400, "invalid support category");
  }

  const activeCount = db.support_tickets.filter(
    (ticket) =>
      ticket.merchant_id === merchantId &&
      (ticket.status === "open" || ticket.status === "in_progress"),
  ).length;
  if (activeCount >= 10) {
    return sendError(res, 409, "too many active support tickets");
  }

  const createdAt = now();
  const ticket: SupportTicketRecord = {
    id: makeId("support-ticket"),
    merchant_id: merchant.id,
    merchant_name: merchant.store_name,
    merchant_phone: merchant.phone,
    subject,
    category,
    status: "open",
    created_at: createdAt,
    updated_at: createdAt,
    waiting_on: "admin",
    waiting_since: createdAt,
    inspection_requests: [],
    messages: [
      {
        id: makeId("support-message"),
        sender_type: "merchant",
        sender_id: merchant.id,
        sender_name: merchant.owner_name,
        body: message,
        created_at: createdAt,
      },
    ],
  };

  db.support_tickets.unshift(ticket);
  writeDb(db);
  emitMerchantRealtimeState(db, merchantId, "support_updated");
  return res.status(201).json({ ok: true, ticket });
});

router.get(
  "/support/tickets/:id",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const ticketId = String(req.params.id || "").trim();
    const db = ensureDb();
    refreshAndPersistSupportLifecycle(db);
    const ticket = db.support_tickets.find(
      (item) => item.id === ticketId && item.merchant_id === merchantId,
    );
    if (!ticket) return sendError(res, 404, "support ticket not found");

    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, ticket });
  },
);

router.post(
  "/support/tickets/:id/messages",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const ticketId = String(req.params.id || "").trim();
    const body = String(req.body?.message || "").trim();
    const db = ensureDb();
    const merchant = findRegularMerchant(db, merchantId);
    const ticket = db.support_tickets.find(
      (item) => item.id === ticketId && item.merchant_id === merchantId,
    );

    if (!merchant) return sendError(res, 404, "merchant not found");
    if (!ticket) return sendError(res, 404, "support ticket not found");
    if (ticket.status === "closed" || ticket.status === "resolved") {
      return sendError(res, 409, "support ticket is closed");
    }
    if (body.length < 1 || body.length > 4000) {
      return sendError(res, 400, "invalid support message");
    }

    const supportMessage: SupportTicketMessage = {
      id: makeId("support-message"),
      sender_type: "merchant",
      sender_id: merchant.id,
      sender_name: merchant.owner_name,
      body,
      created_at: now(),
    };
    ticket.messages.push(supportMessage);
    ticket.updated_at = supportMessage.created_at;
    setSupportTicketWaitingOn(ticket, "admin", supportMessage.created_at);
    let notificationChanged = false;
    for (const notification of db.merchant_notifications) {
      if (
        notification.type === "support_reply_reminder" &&
        notification.merchant_id === merchantId &&
        notification.ticket_id === ticket.id &&
        !notification.read_at
      ) {
        notification.read_at = supportMessage.created_at;
        notificationChanged = true;
      }
    }
    writeDb(db);
    emitMerchantRealtimeState(db, merchantId, "support_updated");
    if (notificationChanged) {
      emitMerchantRealtimeState(db, merchantId, "notifications_updated");
    }
    return res.status(201).json({ ok: true, ticket, message: supportMessage });
  },
);

router.post(
  "/support/tickets/:id/inspection-requests/:requestId/decision",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const ticketId = String(req.params.id || "").trim();
    const requestId = String(req.params.requestId || "").trim();
    const decision = String(req.body?.decision || "").trim();
    const db = ensureDb();
    refreshInspectionRequestExpirations(db);

    const ticket = db.support_tickets.find(
      (item) => item.id === ticketId && item.merchant_id === merchantId,
    );
    if (!ticket) return sendError(res, 404, "support ticket not found");

    const inspectionRequest = (ticket.inspection_requests || []).find(
      (item) => item.id === requestId,
    );
    if (!inspectionRequest) {
      return sendError(res, 404, "inspection session request not found");
    }
    if (inspectionRequest.status !== "pending") {
      writeDb(db);
      return sendError(res, 409, "inspection session request is no longer pending", {
        code: "INSPECTION_REQUEST_NOT_PENDING",
        status: inspectionRequest.status,
      });
    }
    if (decision !== "approve" && decision !== "reject") {
      return sendError(res, 400, "invalid inspection session decision");
    }

    const respondedAt = now();
    inspectionRequest.responded_at = respondedAt;
    delete inspectionRequest.ended_at;
    delete inspectionRequest.end_reason;
    if (decision === "approve") {
      inspectionRequest.status = "approved";
      inspectionRequest.consent_decision = "approved";
      inspectionRequest.approved_at = respondedAt;
      delete inspectionRequest.rejected_at;
      inspectionRequest.session_expires_at = new Date(
        Date.now() + inspectionRequest.session_duration_minutes * 60 * 1000,
      ).toISOString();
    } else {
      inspectionRequest.status = "rejected";
      inspectionRequest.consent_decision = "rejected";
      inspectionRequest.rejected_at = respondedAt;
      delete inspectionRequest.approved_at;
      delete inspectionRequest.session_expires_at;
    }
    ticket.updated_at = respondedAt;

    const inspectionNotification = db.merchant_notifications.find(
      (item) =>
        item.type === "inspection_session_request" &&
        item.merchant_id === merchantId &&
        item.inspection_request_id === inspectionRequest.id,
    );
    if (inspectionNotification) {
      inspectionNotification.read_at = inspectionNotification.read_at || respondedAt;
    }

    writeDb(db);
    emitMerchantRealtimeState(db, merchantId, "support_updated");
    emitMerchantRealtimeState(db, merchantId, "notifications_updated");
    return res.json({ ok: true, ticket, inspection_request: inspectionRequest });
  },
);

router.post(
  "/support/tickets/:id/inspection-requests/:requestId/terminate",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const ticketId = String(req.params.id || "").trim();
    const requestId = String(req.params.requestId || "").trim();
    const db = ensureDb();
    if (refreshInspectionRequestExpirations(db)) writeDb(db);

    const ticket = db.support_tickets.find(
      (item) => item.id === ticketId && item.merchant_id === merchantId,
    );
    if (!ticket) return sendError(res, 404, "support ticket not found");

    const inspectionRequest = (ticket.inspection_requests || []).find(
      (item) => item.id === requestId,
    );
    if (!inspectionRequest) {
      return sendError(res, 404, "inspection session request not found");
    }

    const sessionExpiresAt = new Date(
      inspectionRequest.session_expires_at || 0,
    ).getTime();
    const activeApprovedSession =
      inspectionRequest.status === "approved" &&
      inspectionRequest.consent_decision === "approved" &&
      !inspectionRequest.ended_at &&
      Number.isFinite(sessionExpiresAt) &&
      sessionExpiresAt > Date.now();

    if (!activeApprovedSession) {
      return sendError(res, 409, "inspection session is not active", {
        code: "INSPECTION_SESSION_NOT_ACTIVE",
        status: inspectionRequest.status,
        end_reason: inspectionRequest.end_reason || "",
      });
    }

    const endedAt = now();
    inspectionRequest.end_reason = "merchant_terminated";
    inspectionRequest.ended_at = endedAt;
    ticket.updated_at = endedAt;

    writeDb(db);
    emitMerchantRealtimeState(db, merchantId, "support_updated");
    return res.json({
      ok: true,
      ticket,
      inspection_request: inspectionRequest,
    });
  },
);

router.get("/subscription/current", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  const subscription = db.subscriptions.find(
    (item) => item.merchant_id === merchantId,
  );
  if (!subscription) return sendError(res, 404, "subscription not found");

  recalculateSubscriptionTotals(subscription);
  writeDb(db);
  return res.json({ ok: true, subscription });
});

router.post("/subscription/emergency", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant || merchant.status !== "approved") {
    return sendError(res, 403, "approved merchant account is required");
  }

  const subscription = db.subscriptions.find(
    (item) => item.merchant_id === merchantId,
  );
  if (!subscription) return sendError(res, 404, "subscription not found");

  recalculateSubscriptionTotals(subscription);
  if (new Date(subscription.expires_at).getTime() <= Date.now()) {
    return sendError(res, 409, "subscription is expired");
  }
  const emergencyEligibilityThreshold = 500;
  const eligibleBalance =
    subscription.base_replies_remaining +
    subscription.addon_replies_remaining;
  if (eligibleBalance > emergencyEligibilityThreshold) {
    return sendError(
      res,
      409,
      "emergency credit requires 500 or fewer combined base and add-on replies",
      {
        code: "EMERGENCY_COMBINED_THRESHOLD_NOT_REACHED",
        base_replies_remaining: subscription.base_replies_remaining,
        addon_replies_remaining: subscription.addon_replies_remaining,
        eligible_balance: eligibleBalance,
        threshold: emergencyEligibilityThreshold,
      },
    );
  }
  if (subscription.emergency_credit_activated) {
    return sendError(res, 409, "emergency credit was already used in this cycle");
  }
  if (subscription.emergency_debt > 0) {
    return sendError(res, 409, "previous emergency debt must be paid first");
  }
  if (subscription.emergency_credit_amount <= 0) {
    return sendError(res, 409, "emergency credit is unavailable");
  }

  const activatedAt = new Date();
  const emergencyAmount = subscription.emergency_credit_amount;
  const anchorDay = getBaghdadDateParts(activatedAt).day;
  const emergencyBatch: AddonReplyBatch = {
    id: makeId("emergency-replies"),
    source: "emergency",
    purchased_at: activatedAt.toISOString(),
    expires_at: addBaghdadCalendarMonths(
      activatedAt,
      3,
      anchorDay,
    ).toISOString(),
    amount: emergencyAmount,
    remaining: emergencyAmount,
  };
  subscription.addon_reply_batches.push(emergencyBatch);
  subscription.emergency_credit_activated = true;
  subscription.emergency_credit_remaining = 0;
  subscription.emergency_credit_used = emergencyAmount;
  subscription.emergency_debt = emergencyAmount;
  subscription.pending_next_cycle_deduction = subscription.emergency_debt;
  subscription.status = "active";
  subscription.auto_reply_enabled = true;
  recalculateSubscriptionTotals(subscription, activatedAt);
  const merchantNotification = appendMerchantEmergencyActivationNotification(
    db,
    merchantId,
    emergencyBatch,
    subscription,
  );
  writeDb(db);
  emitMerchantRealtimeState(db, merchantId, "subscription_updated");

  return res.json({
    ok: true,
    subscription,
    notification: merchantNotification,
  });
});

router.get("/admin/support/tickets", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_support");
  if (!admin) return;

  const db = ensureDb();
  refreshAndPersistSupportLifecycle(db);
  const tickets = [...db.support_tickets].sort(
    (left, right) =>
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
  );
  const activeCount = tickets.filter(
    (ticket) => ticket.status === "open" || ticket.status === "in_progress",
  ).length;

  res.setHeader("Cache-Control", "no-store");
  return res.json({
    ok: true,
    tickets,
    active_count: activeCount,
    viewer_role: admin.admin_role,
  });
});

router.post(
  "/admin/support/tickets/:id/claim",
  (req: Request, res: Response) => {
    const admin = requireSupportAssistant(req, res);
    if (!admin) return;

    const ticketId = String(req.params.id || "").trim();
    const db = ensureDb();
    const ticket = db.support_tickets.find((item) => item.id === ticketId);
    if (!ticket) return sendError(res, 404, "support ticket not found");
    if (ticket.status === "resolved" || ticket.status === "closed") {
      return sendError(res, 409, "support ticket is closed");
    }
    if (ticket.assigned_admin_id && ticket.assigned_admin_id !== admin.id) {
      return sendError(res, 409, "support ticket is assigned to another admin", {
        code: "SUPPORT_TICKET_ALREADY_ASSIGNED",
      });
    }

    ticket.assigned_admin_id = admin.id;
    ticket.assigned_admin_name = admin.owner_name;
    ticket.status = "in_progress";
    ticket.updated_at = now();

    appendAdminLog(
      db,
      admin,
      { id: ticket.merchant_id, store_name: ticket.merchant_name },
      "support_ticket_claimed",
      ticket.subject,
      { meta: { ticket_id: ticket.id, subject: ticket.subject } },
    );
    writeDb(db);
    emitMerchantRealtimeState(db, ticket.merchant_id, "support_updated");
    return res.json({ ok: true, ticket });
  },
);
