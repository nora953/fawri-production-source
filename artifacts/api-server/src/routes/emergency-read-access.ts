import { Router, type Request, type Response } from "express";
import {
  AUTH_DB_PATH,
  authenticateAdmin,
  audit,
  findMerchant,
  makeId,
  now,
  sendError,
  writeJson,
  type AdminRecord,
  type AuthenticatedAdmin,
  type MerchantRecord,
} from "../services/supportPreviewSessions";
import { buildMerchantReadOnlySnapshot } from "../services/merchantReadOnlySnapshot";
import {
  activeEmergencyAuthorization,
  appendEmergencyAuditEvent,
  createMerchantIncidentNotice,
  createOwnerAlert,
  readEmergencyAccessDb,
  refreshEmergencyAccessExpirations,
  upsertEmergencyAuthorization,
  verifyEmergencyAuditChain,
  writeEmergencyAccessDb,
  type EmergencyAccessDb,
  type EmergencyAccessRequest,
  type EmergencyAccessSeverity,
} from "../services/emergencyReadAccess";

const router = Router();
const REQUEST_WINDOW_MS = 10 * 60 * 1000;

function authenticateAnyAdmin(
  req: Request,
  res: Response,
): AuthenticatedAdmin | null {
  return authenticateAdmin(req, res, {
    allowOwner: true,
    requiredPermissions: [],
  });
}

function requireOwner(
  authenticated: AuthenticatedAdmin,
  res: Response,
): boolean {
  if (authenticated.admin.admin_role === "owner_admin") return true;
  sendError(res, 403, "owner administrator permission is required", {
    code: "OWNER_ADMIN_REQUIRED",
  });
  return false;
}

function loadEmergencyDb(res: Response): EmergencyAccessDb | null {
  const db = readEmergencyAccessDb();
  const chain = verifyEmergencyAuditChain(db);
  if (!chain.valid) {
    sendError(res, 503, "emergency audit chain verification failed", {
      code: "EMERGENCY_AUDIT_CHAIN_INVALID",
      invalid_sequence: chain.invalid_sequence,
    });
    return null;
  }
  if (refreshEmergencyAccessExpirations(db)) {
    writeEmergencyAccessDb(db);
  }
  return db;
}

function findAssistantAdmin(
  authenticated: AuthenticatedAdmin,
  adminId: string,
): AdminRecord | null {
  const record = authenticated.authDb.merchants.find(
    (candidate) =>
      candidate.id === adminId &&
      candidate.is_admin === true &&
      (candidate as AdminRecord).admin_role === "assistant_admin",
  );
  return record ? (record as AdminRecord) : null;
}

function activeOrPendingDuplicate(
  db: EmergencyAccessDb,
  adminId: string,
  merchantId: string,
): EmergencyAccessRequest | null {
  return (
    db.requests.find(
      (request) =>
        request.requested_by_admin_id === adminId &&
        request.merchant_id === merchantId &&
        (request.status === "pending" || request.status === "active"),
    ) || null
  );
}

function parseRequestInput(req: Request, res: Response): {
  merchantId: string;
  incidentReference: string;
  severity: EmergencyAccessSeverity;
  reason: string;
  durationMinutes: 15 | 30;
  criticalSelfActivate: boolean;
} | null {
  const merchantId = String(req.body?.merchant_id || "").trim();
  const incidentReference = String(
    req.body?.incident_reference || "",
  ).trim();
  const severity = String(req.body?.severity || "").trim();
  const reason = String(req.body?.reason || "").trim();
  const durationValue = Number(req.body?.duration_minutes);
  const criticalSelfActivate = req.body?.critical_self_activate === true;

  if (!merchantId) {
    sendError(res, 400, "merchant id is required", {
      code: "EMERGENCY_MERCHANT_REQUIRED",
    });
    return null;
  }
  if (
    incidentReference.length < 5 ||
    incidentReference.length > 120
  ) {
    sendError(res, 400, "incident reference must be 5 to 120 characters", {
      code: "EMERGENCY_INCIDENT_REFERENCE_INVALID",
    });
    return null;
  }
  if (severity !== "high" && severity !== "critical") {
    sendError(res, 400, "severity must be high or critical", {
      code: "EMERGENCY_SEVERITY_INVALID",
    });
    return null;
  }
  if (reason.length < 10 || reason.length > 1000) {
    sendError(res, 400, "incident reason must be 10 to 1000 characters", {
      code: "EMERGENCY_REASON_INVALID",
    });
    return null;
  }
  if (durationValue !== 15 && durationValue !== 30) {
    sendError(res, 400, "duration must be 15 or 30 minutes", {
      code: "EMERGENCY_DURATION_INVALID",
    });
    return null;
  }

  return {
    merchantId,
    incidentReference,
    severity,
    reason,
    durationMinutes: durationValue,
    criticalSelfActivate,
  };
}

function writeSecurityState(
  authenticated: AuthenticatedAdmin,
  db: EmergencyAccessDb,
): void {
  writeEmergencyAccessDb(db);
  writeJson(AUTH_DB_PATH, authenticated.authDb);
}

function activateRequest(
  db: EmergencyAccessDb,
  request: EmergencyAccessRequest,
  actor: AdminRecord,
  eventType: string,
): void {
  const startedAt = now();
  request.status = "active";
  request.started_at = startedAt;
  request.expires_at = new Date(
    Date.now() + request.duration_minutes * 60 * 1000,
  ).toISOString();
  appendEmergencyAuditEvent(db, {
    event_type: eventType,
    request_id: request.id,
    actor,
    merchant: { id: request.merchant_id },
    incident_reference: request.incident_reference,
    metadata: {
      duration_minutes: request.duration_minutes,
      severity: request.severity,
      activation_mode: request.activation_mode,
    },
  });
}

function publicOverview(
  authenticated: AuthenticatedAdmin,
  db: EmergencyAccessDb,
) {
  const isOwner = authenticated.admin.admin_role === "owner_admin";
  const authorization = activeEmergencyAuthorization(
    db,
    authenticated.admin.id,
  );
  return {
    is_owner: isOwner,
    authorization,
    authorizations: isOwner ? db.authorizations : undefined,
    requests: isOwner
      ? db.requests
      : db.requests.filter(
          (request) =>
            request.requested_by_admin_id === authenticated.admin.id,
        ),
    owner_alerts: isOwner ? db.owner_alerts : undefined,
    merchant_notices: isOwner ? db.merchant_notices : undefined,
    audit_chain: isOwner
      ? {
          valid: true,
          event_count: db.audit_events.length,
          latest_hash:
            db.audit_events[db.audit_events.length - 1]?.hash || "GENESIS",
        }
      : undefined,
  };
}

router.get("/overview", (req: Request, res: Response) => {
  const authenticated = authenticateAnyAdmin(req, res);
  if (!authenticated) return;
  const db = loadEmergencyDb(res);
  if (!db) return;
  res.setHeader("Cache-Control", "no-store");
  return res.json({ ok: true, ...publicOverview(authenticated, db) });
});

router.put(
  "/authorizations/:adminId",
  (req: Request, res: Response) => {
    const authenticated = authenticateAnyAdmin(req, res);
    if (!authenticated || !requireOwner(authenticated, res)) return;
    const db = loadEmergencyDb(res);
    if (!db) return;

    const assistant = findAssistantAdmin(
      authenticated,
      String(req.params.adminId || "").trim(),
    );
    if (!assistant) {
      return sendError(res, 404, "assistant administrator not found", {
        code: "EMERGENCY_ASSISTANT_NOT_FOUND",
      });
    }
    if (
      assistant.status !== "approved" ||
      assistant.admin_enabled === false
    ) {
      return sendError(res, 409, "assistant administrator is not active", {
        code: "EMERGENCY_ASSISTANT_INACTIVE",
      });
    }

    const canRequest = req.body?.can_request === true;
    const canCriticalSelfActivate =
      req.body?.can_critical_self_activate === true;
    const authorization = upsertEmergencyAuthorization(
      db,
      authenticated.admin,
      assistant,
      {
        can_request: canRequest,
        can_critical_self_activate: canCriticalSelfActivate,
      },
    );
    audit(
      authenticated.authDb,
      authenticated.admin,
      {
        id: assistant.id,
        owner_name: assistant.owner_name,
        store_name: assistant.store_name,
        phone: assistant.phone,
        activity_type: "admin",
        status: assistant.status,
      },
      canRequest
        ? "emergency_read_access_authorized"
        : "emergency_read_access_revoked",
      canRequest
        ? "emergency read-only access authorization granted"
        : "emergency read-only access authorization revoked",
      {
        assistant_admin_id: assistant.id,
        critical_self_activation: authorization.can_critical_self_activate
          ? 1
          : 0,
      },
    );
    writeSecurityState(authenticated, db);
    return res.json({ ok: true, authorization });
  },
);

router.post("/requests", (req: Request, res: Response) => {
  const authenticated = authenticateAnyAdmin(req, res);
  if (!authenticated) return;
  const db = loadEmergencyDb(res);
  if (!db) return;
  const input = parseRequestInput(req, res);
  if (!input) return;

  const isOwner = authenticated.admin.admin_role === "owner_admin";
  const authorization = activeEmergencyAuthorization(
    db,
    authenticated.admin.id,
  );
  if (!isOwner && !authorization) {
    return sendError(res, 403, "emergency read access is not authorized", {
      code: "EMERGENCY_AUTHORIZATION_REQUIRED",
    });
  }

  const merchant = findMerchant(authenticated.authDb, input.merchantId);
  if (!merchant) {
    return sendError(res, 404, "merchant not found", {
      code: "EMERGENCY_MERCHANT_NOT_FOUND",
    });
  }
  const duplicate = activeOrPendingDuplicate(
    db,
    authenticated.admin.id,
    merchant.id,
  );
  if (duplicate) {
    return sendError(
      res,
      409,
      "an active or pending emergency request already exists",
      {
        code: "EMERGENCY_REQUEST_ALREADY_EXISTS",
        request_id: duplicate.id,
      },
    );
  }

  const ownerDirect = isOwner;
  const criticalSelfActivation =
    !isOwner &&
    input.criticalSelfActivate &&
    input.severity === "critical" &&
    authorization?.can_critical_self_activate === true;
  if (
    input.criticalSelfActivate &&
    !ownerDirect &&
    !criticalSelfActivation
  ) {
    return sendError(
      res,
      403,
      "critical self-activation is not authorized",
      { code: "EMERGENCY_CRITICAL_SELF_ACTIVATION_FORBIDDEN" },
    );
  }

  const requestedAt = now();
  const request: EmergencyAccessRequest = {
    id: makeId("emergency-read-access"),
    merchant_id: merchant.id,
    merchant_name: merchant.store_name,
    requested_by_admin_id: authenticated.admin.id,
    requested_by_admin_name: authenticated.admin.owner_name,
    incident_reference: input.incidentReference,
    severity: input.severity,
    reason: input.reason,
    duration_minutes: input.durationMinutes,
    read_only: true,
    status:
      ownerDirect || criticalSelfActivation ? "active" : "pending",
    activation_mode: ownerDirect
      ? "owner_direct_activation"
      : criticalSelfActivation
        ? "critical_self_activation"
        : "owner_approval",
    requested_at: requestedAt,
    ...(ownerDirect || criticalSelfActivation
      ? {}
      : {
          request_expires_at: new Date(
            Date.now() + REQUEST_WINDOW_MS,
          ).toISOString(),
        }),
    ...(authenticated.payload.sessionId
      ? { admin_session_id: authenticated.payload.sessionId }
      : {}),
    ...(authenticated.payload.deviceId
      ? { admin_device_id: authenticated.payload.deviceId }
      : {}),
    viewed_sections: [],
  };
  db.requests.unshift(request);
  appendEmergencyAuditEvent(db, {
    event_type: "emergency_access_requested",
    request_id: request.id,
    actor: authenticated.admin,
    merchant,
    incident_reference: request.incident_reference,
    metadata: {
      severity: request.severity,
      duration_minutes: request.duration_minutes,
      critical_self_activate_requested: input.criticalSelfActivate,
    },
  });

  if (ownerDirect) {
    request.reviewed_by_owner_id = authenticated.admin.id;
    request.reviewed_by_owner_name = authenticated.admin.owner_name;
    request.reviewed_at = requestedAt;
    activateRequest(
      db,
      request,
      authenticated.admin,
      "emergency_owner_direct_access_activated",
    );
  } else if (criticalSelfActivation) {
    activateRequest(
      db,
      request,
      authenticated.admin,
      "emergency_critical_self_access_activated",
    );
    createOwnerAlert(db, request, "critical_self_activation");
  } else {
    createOwnerAlert(db, request, "approval_required");
  }

  audit(
    authenticated.authDb,
    authenticated.admin,
    merchant,
    request.status === "active"
      ? "emergency_read_access_activated"
      : "emergency_read_access_requested",
    request.status === "active"
      ? "emergency read-only access activated"
      : "emergency read-only access requested",
    {
      emergency_request_id: request.id,
      incident_reference: request.incident_reference,
      severity: request.severity,
      duration_minutes: request.duration_minutes,
      activation_mode: request.activation_mode,
    },
    request.reason,
  );
  writeSecurityState(authenticated, db);
  res.setHeader("Cache-Control", "no-store");
  return res.status(201).json({ ok: true, request });
});

router.post(
  "/requests/:requestId/decision",
  (req: Request, res: Response) => {
    const authenticated = authenticateAnyAdmin(req, res);
    if (!authenticated || !requireOwner(authenticated, res)) return;
    const db = loadEmergencyDb(res);
    if (!db) return;

    const request = db.requests.find(
      (item) => item.id === String(req.params.requestId || "").trim(),
    );
    if (!request) {
      return sendError(res, 404, "emergency request not found", {
        code: "EMERGENCY_REQUEST_NOT_FOUND",
      });
    }
    if (request.status !== "pending") {
      return sendError(res, 409, "emergency request is not pending", {
        code: "EMERGENCY_REQUEST_NOT_PENDING",
      });
    }

    const decision = String(req.body?.decision || "").trim();
    if (decision !== "approve" && decision !== "reject") {
      return sendError(res, 400, "decision must be approve or reject", {
        code: "EMERGENCY_DECISION_INVALID",
      });
    }
    const merchant = findMerchant(
      authenticated.authDb,
      request.merchant_id,
    );
    if (!merchant) {
      return sendError(res, 404, "merchant not found", {
        code: "EMERGENCY_MERCHANT_NOT_FOUND",
      });
    }

    const reviewedAt = now();
    request.reviewed_by_owner_id = authenticated.admin.id;
    request.reviewed_by_owner_name = authenticated.admin.owner_name;
    request.reviewed_at = reviewedAt;
    if (decision === "approve") {
      activateRequest(
        db,
        request,
        authenticated.admin,
        "emergency_owner_approved_access",
      );
    } else {
      request.status = "rejected";
      request.rejected_at = reviewedAt;
      request.ended_at = reviewedAt;
      request.end_reason = "owner_rejected";
      appendEmergencyAuditEvent(db, {
        event_type: "emergency_owner_rejected_access",
        request_id: request.id,
        actor: authenticated.admin,
        merchant,
        incident_reference: request.incident_reference,
      });
    }

    audit(
      authenticated.authDb,
      authenticated.admin,
      merchant,
      decision === "approve"
        ? "emergency_read_access_approved"
        : "emergency_read_access_rejected",
      decision === "approve"
        ? "owner approved emergency read-only access"
        : "owner rejected emergency read-only access",
      {
        emergency_request_id: request.id,
        requester_admin_id: request.requested_by_admin_id,
        incident_reference: request.incident_reference,
      },
      request.reason,
    );
    writeSecurityState(authenticated, db);
    return res.json({ ok: true, request });
  },
);

function resolveActiveRequest(
  req: Request,
  res: Response,
): {
  authenticated: AuthenticatedAdmin;
  db: EmergencyAccessDb;
  request: EmergencyAccessRequest;
  merchant: MerchantRecord;
} | null {
  const authenticated = authenticateAnyAdmin(req, res);
  if (!authenticated) return null;
  const db = loadEmergencyDb(res);
  if (!db) return null;
  const request = db.requests.find(
    (item) => item.id === String(req.params.requestId || "").trim(),
  );
  if (!request) {
    sendError(res, 404, "emergency request not found", {
      code: "EMERGENCY_REQUEST_NOT_FOUND",
    });
    return null;
  }
  if (request.requested_by_admin_id !== authenticated.admin.id) {
    sendError(res, 403, "emergency access belongs to another administrator", {
      code: "EMERGENCY_ADMIN_MISMATCH",
    });
    return null;
  }
  if (
    request.admin_session_id &&
    request.admin_session_id !== authenticated.payload.sessionId
  ) {
    sendError(res, 403, "emergency access belongs to another login session", {
      code: "EMERGENCY_SESSION_MISMATCH",
    });
    return null;
  }
  if (
    request.admin_device_id &&
    request.admin_device_id !== authenticated.payload.deviceId
  ) {
    sendError(res, 403, "emergency access belongs to another device", {
      code: "EMERGENCY_DEVICE_MISMATCH",
    });
    return null;
  }
  if (
    request.status !== "active" ||
    !request.expires_at ||
    new Date(request.expires_at).getTime() <= Date.now()
  ) {
    sendError(res, 410, "emergency access is not active", {
      code: "EMERGENCY_ACCESS_INACTIVE",
    });
    return null;
  }
  const authorization = activeEmergencyAuthorization(
    db,
    authenticated.admin.id,
  );
  if (
    authenticated.admin.admin_role !== "owner_admin" &&
    !authorization
  ) {
    sendError(res, 403, "emergency authorization was revoked", {
      code: "EMERGENCY_AUTHORIZATION_REVOKED",
    });
    return null;
  }
  const merchant = findMerchant(authenticated.authDb, request.merchant_id);
  if (!merchant) {
    sendError(res, 404, "merchant not found", {
      code: "EMERGENCY_MERCHANT_NOT_FOUND",
    });
    return null;
  }
  return { authenticated, db, request, merchant };
}

router.get(
  "/requests/:requestId/snapshot",
  (req: Request, res: Response) => {
    const context = resolveActiveRequest(req, res);
    if (!context) return;
    const { authenticated, db, request, merchant } = context;

    if (!request.viewed_sections.includes("snapshot")) {
      request.viewed_sections.push("snapshot");
      request.first_viewed_at ||= now();
      appendEmergencyAuditEvent(db, {
        event_type: "emergency_snapshot_viewed",
        request_id: request.id,
        actor: authenticated.admin,
        merchant,
        incident_reference: request.incident_reference,
        metadata: { section: "snapshot" },
      });
      audit(
        authenticated.authDb,
        authenticated.admin,
        merchant,
        "emergency_read_snapshot_viewed",
        "emergency read-only merchant snapshot viewed",
        {
          emergency_request_id: request.id,
          incident_reference: request.incident_reference,
          section: "snapshot",
        },
        request.reason,
      );
      writeSecurityState(authenticated, db);
    }

    const snapshot = buildMerchantReadOnlySnapshot({
      authDb: authenticated.authDb,
      merchant,
      emergency_access: {
        request_id: request.id,
        incident_reference: request.incident_reference,
        severity: request.severity,
        reason: request.reason,
        expires_at: request.expires_at!,
      },
    });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, snapshot });
  },
);

router.all(
  "/requests/:requestId/snapshot",
  (req: Request, res: Response) =>
    sendError(res, 403, "emergency access is read-only", {
      code: "EMERGENCY_ACCESS_READ_ONLY",
      method: req.method,
    }),
);

router.post("/requests/:requestId/end", (req: Request, res: Response) => {
  const authenticated = authenticateAnyAdmin(req, res);
  if (!authenticated) return;
  const db = loadEmergencyDb(res);
  if (!db) return;
  const request = db.requests.find(
    (item) => item.id === String(req.params.requestId || "").trim(),
  );
  if (!request) {
    return sendError(res, 404, "emergency request not found", {
      code: "EMERGENCY_REQUEST_NOT_FOUND",
    });
  }
  const isOwner = authenticated.admin.admin_role === "owner_admin";
  if (
    !isOwner &&
    request.requested_by_admin_id !== authenticated.admin.id
  ) {
    return sendError(res, 403, "emergency access belongs to another administrator", {
      code: "EMERGENCY_ADMIN_MISMATCH",
    });
  }
  if (request.status !== "active") {
    return sendError(res, 409, "emergency access is not active", {
      code: "EMERGENCY_ACCESS_INACTIVE",
    });
  }
  const merchant = findMerchant(authenticated.authDb, request.merchant_id);
  if (!merchant) {
    return sendError(res, 404, "merchant not found", {
      code: "EMERGENCY_MERCHANT_NOT_FOUND",
    });
  }

  request.status = "ended";
  request.ended_at = now();
  request.end_reason = isOwner ? "owner_ended" : "admin_ended";
  appendEmergencyAuditEvent(db, {
    event_type: isOwner
      ? "emergency_access_ended_by_owner"
      : "emergency_access_ended_by_requester",
    request_id: request.id,
    actor: authenticated.admin,
    merchant,
    incident_reference: request.incident_reference,
  });
  createMerchantIncidentNotice(db, request);
  audit(
    authenticated.authDb,
    authenticated.admin,
    merchant,
    "emergency_read_access_ended",
    `emergency read-only access ended: ${request.end_reason}`,
    {
      emergency_request_id: request.id,
      incident_reference: request.incident_reference,
      end_reason: request.end_reason,
    },
    request.reason,
  );
  writeSecurityState(authenticated, db);
  return res.json({ ok: true, request });
});

router.get("/audit", (req: Request, res: Response) => {
  const authenticated = authenticateAnyAdmin(req, res);
  if (!authenticated || !requireOwner(authenticated, res)) return;
  const db = loadEmergencyDb(res);
  if (!db) return;
  const verification = verifyEmergencyAuditChain(db);
  res.setHeader("Cache-Control", "no-store");
  return res.json({
    ok: true,
    verification,
    events: db.audit_events.slice().reverse(),
  });
});

export default router;
