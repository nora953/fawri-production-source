import crypto from "node:crypto";
import { getFawriDataFilePath } from "../lib/dataPaths";
import {
  makeId,
  now,
  readJson,
  writeJson,
  type AdminRecord,
  type MerchantRecord,
} from "./supportPreviewSessions";

export const EMERGENCY_ACCESS_DB_PATH = getFawriDataFilePath(
  "emergency-read-access.json",
);

export type EmergencyAccessSeverity = "high" | "critical";
export type EmergencyAccessStatus =
  | "pending"
  | "active"
  | "rejected"
  | "expired"
  | "ended";
export type EmergencyAccessActivationMode =
  | "owner_approval"
  | "critical_self_activation"
  | "owner_direct_activation";

export type EmergencyAccessAuthorization = {
  admin_id: string;
  admin_name: string;
  can_request: boolean;
  can_critical_self_activate: boolean;
  granted_by_owner_id: string;
  granted_by_owner_name: string;
  granted_at: string;
  updated_at: string;
  revoked_at?: string;
};

export type EmergencyAccessRequest = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  requested_by_admin_id: string;
  requested_by_admin_name: string;
  incident_reference: string;
  severity: EmergencyAccessSeverity;
  reason: string;
  duration_minutes: 15 | 30;
  read_only: true;
  status: EmergencyAccessStatus;
  activation_mode: EmergencyAccessActivationMode;
  requested_at: string;
  request_expires_at?: string;
  reviewed_by_owner_id?: string;
  reviewed_by_owner_name?: string;
  reviewed_at?: string;
  rejected_at?: string;
  started_at?: string;
  expires_at?: string;
  ended_at?: string;
  end_reason?: "owner_rejected" | "duration_expired" | "admin_ended" | "owner_ended";
  admin_session_id?: string;
  admin_device_id?: string;
  first_viewed_at?: string;
  viewed_sections: string[];
  merchant_notice_created_at?: string;
};

export type EmergencyOwnerAlert = {
  id: string;
  request_id: string;
  type: "approval_required" | "critical_self_activation";
  title: string;
  details: string;
  created_at: string;
  read_at?: string;
};

export type EmergencyMerchantNotice = {
  id: string;
  merchant_id: string;
  request_id: string;
  incident_reference: string;
  accessed_by_admin_name: string;
  activation_mode: EmergencyAccessActivationMode;
  started_at: string;
  ended_at: string;
  created_at: string;
  read_at?: string;
};

export type EmergencyAuditEvent = {
  id: string;
  sequence: number;
  event_type: string;
  request_id?: string;
  actor_admin_id?: string;
  actor_admin_name?: string;
  merchant_id?: string;
  incident_reference?: string;
  metadata?: Record<string, string | number | boolean>;
  created_at: string;
  previous_hash: string;
  hash: string;
};

export type EmergencyAccessDb = {
  authorizations: EmergencyAccessAuthorization[];
  requests: EmergencyAccessRequest[];
  owner_alerts: EmergencyOwnerAlert[];
  merchant_notices: EmergencyMerchantNotice[];
  audit_events: EmergencyAuditEvent[];
};

const EMPTY_DB: EmergencyAccessDb = {
  authorizations: [],
  requests: [],
  owner_alerts: [],
  merchant_notices: [],
  audit_events: [],
};

export function readEmergencyAccessDb(): EmergencyAccessDb {
  const raw = readJson<Partial<EmergencyAccessDb>>(
    EMERGENCY_ACCESS_DB_PATH,
    EMPTY_DB,
  );
  return {
    authorizations: Array.isArray(raw.authorizations)
      ? raw.authorizations
      : [],
    requests: Array.isArray(raw.requests) ? raw.requests : [],
    owner_alerts: Array.isArray(raw.owner_alerts) ? raw.owner_alerts : [],
    merchant_notices: Array.isArray(raw.merchant_notices)
      ? raw.merchant_notices
      : [],
    audit_events: Array.isArray(raw.audit_events) ? raw.audit_events : [],
  };
}

export function writeEmergencyAccessDb(db: EmergencyAccessDb): void {
  writeJson(EMERGENCY_ACCESS_DB_PATH, db);
}

function hashEventPayload(
  event: Omit<EmergencyAuditEvent, "hash">,
): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(event))
    .digest("hex");
}

export function appendEmergencyAuditEvent(
  db: EmergencyAccessDb,
  input: {
    event_type: string;
    request_id?: string;
    actor?: Pick<AdminRecord, "id" | "owner_name">;
    merchant?: Pick<MerchantRecord, "id">;
    incident_reference?: string;
    metadata?: Record<string, string | number | boolean>;
  },
): EmergencyAuditEvent {
  const previous = db.audit_events[db.audit_events.length - 1];
  const withoutHash: Omit<EmergencyAuditEvent, "hash"> = {
    id: makeId("emergency-audit"),
    sequence: (previous?.sequence || 0) + 1,
    event_type: input.event_type,
    ...(input.request_id ? { request_id: input.request_id } : {}),
    ...(input.actor
      ? {
          actor_admin_id: input.actor.id,
          actor_admin_name: input.actor.owner_name,
        }
      : {}),
    ...(input.merchant ? { merchant_id: input.merchant.id } : {}),
    ...(input.incident_reference
      ? { incident_reference: input.incident_reference }
      : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    created_at: now(),
    previous_hash: previous?.hash || "GENESIS",
  };
  const event: EmergencyAuditEvent = {
    ...withoutHash,
    hash: hashEventPayload(withoutHash),
  };
  db.audit_events.push(event);
  return event;
}

export function verifyEmergencyAuditChain(
  db: EmergencyAccessDb,
): { valid: boolean; invalid_sequence?: number } {
  let previousHash = "GENESIS";
  for (let index = 0; index < db.audit_events.length; index += 1) {
    const event = db.audit_events[index];
    const { hash, ...withoutHash } = event;
    const expectedHash = hashEventPayload(withoutHash);
    if (
      event.sequence !== index + 1 ||
      event.previous_hash !== previousHash ||
      event.hash !== expectedHash
    ) {
      return { valid: false, invalid_sequence: event.sequence };
    }
    previousHash = hash;
  }
  return { valid: true };
}

export function activeEmergencyAuthorization(
  db: EmergencyAccessDb,
  adminId: string,
): EmergencyAccessAuthorization | null {
  return (
    db.authorizations.find(
      (authorization) =>
        authorization.admin_id === adminId &&
        !authorization.revoked_at &&
        authorization.can_request,
    ) || null
  );
}

export function upsertEmergencyAuthorization(
  db: EmergencyAccessDb,
  owner: AdminRecord,
  assistant: AdminRecord,
  input: {
    can_request: boolean;
    can_critical_self_activate: boolean;
  },
): EmergencyAccessAuthorization {
  const timestamp = now();
  const existing = db.authorizations.find(
    (authorization) => authorization.admin_id === assistant.id,
  );
  const authorization: EmergencyAccessAuthorization = existing || {
    admin_id: assistant.id,
    admin_name: assistant.owner_name,
    can_request: false,
    can_critical_self_activate: false,
    granted_by_owner_id: owner.id,
    granted_by_owner_name: owner.owner_name,
    granted_at: timestamp,
    updated_at: timestamp,
  };

  authorization.admin_name = assistant.owner_name;
  authorization.can_request = input.can_request;
  authorization.can_critical_self_activate =
    input.can_request && input.can_critical_self_activate;
  authorization.granted_by_owner_id = owner.id;
  authorization.granted_by_owner_name = owner.owner_name;
  authorization.updated_at = timestamp;
  if (input.can_request) {
    authorization.revoked_at = undefined;
  } else {
    authorization.revoked_at = timestamp;
  }

  if (!existing) db.authorizations.unshift(authorization);
  appendEmergencyAuditEvent(db, {
    event_type: input.can_request
      ? "emergency_authorization_granted"
      : "emergency_authorization_revoked",
    actor: owner,
    metadata: {
      assistant_admin_id: assistant.id,
      can_request: authorization.can_request,
      can_critical_self_activate:
        authorization.can_critical_self_activate,
    },
  });
  return authorization;
}

export function createOwnerAlert(
  db: EmergencyAccessDb,
  request: EmergencyAccessRequest,
  type: EmergencyOwnerAlert["type"],
): EmergencyOwnerAlert {
  const alert: EmergencyOwnerAlert = {
    id: makeId("emergency-owner-alert"),
    request_id: request.id,
    type,
    title:
      type === "approval_required"
        ? "Emergency read access approval required"
        : "Critical emergency read access activated",
    details: `${request.requested_by_admin_name} — ${request.merchant_name} — ${request.incident_reference}`,
    created_at: now(),
  };
  db.owner_alerts.unshift(alert);
  return alert;
}

export function createMerchantIncidentNotice(
  db: EmergencyAccessDb,
  request: EmergencyAccessRequest,
): EmergencyMerchantNotice | null {
  if (
    request.merchant_notice_created_at ||
    !request.started_at ||
    !request.ended_at
  ) {
    return null;
  }
  const notice: EmergencyMerchantNotice = {
    id: makeId("emergency-merchant-notice"),
    merchant_id: request.merchant_id,
    request_id: request.id,
    incident_reference: request.incident_reference,
    accessed_by_admin_name: request.requested_by_admin_name,
    activation_mode: request.activation_mode,
    started_at: request.started_at,
    ended_at: request.ended_at,
    created_at: now(),
  };
  db.merchant_notices.unshift(notice);
  request.merchant_notice_created_at = notice.created_at;
  appendEmergencyAuditEvent(db, {
    event_type: "emergency_merchant_notice_created",
    request_id: request.id,
    merchant: { id: request.merchant_id },
    incident_reference: request.incident_reference,
    metadata: { notice_id: notice.id },
  });
  return notice;
}

export function refreshEmergencyAccessExpirations(
  db: EmergencyAccessDb,
): boolean {
  const timestamp = Date.now();
  let changed = false;
  for (const request of db.requests) {
    if (
      request.status === "pending" &&
      request.request_expires_at &&
      new Date(request.request_expires_at).getTime() <= timestamp
    ) {
      request.status = "expired";
      request.ended_at = now();
      request.end_reason = "duration_expired";
      appendEmergencyAuditEvent(db, {
        event_type: "emergency_request_expired",
        request_id: request.id,
        merchant: { id: request.merchant_id },
        incident_reference: request.incident_reference,
      });
      changed = true;
      continue;
    }

    if (
      request.status === "active" &&
      request.expires_at &&
      new Date(request.expires_at).getTime() <= timestamp
    ) {
      request.status = "expired";
      request.ended_at = now();
      request.end_reason = "duration_expired";
      appendEmergencyAuditEvent(db, {
        event_type: "emergency_access_duration_expired",
        request_id: request.id,
        merchant: { id: request.merchant_id },
        incident_reference: request.incident_reference,
      });
      createMerchantIncidentNotice(db, request);
      changed = true;
    }
  }
  return changed;
}
