export type AdminLanguage = "ar" | "ku" | "en";
export type AdminRole = "owner_admin" | "assistant_admin";

export type AdminPermission =
  | "view_merchants"
  | "manage_merchant_status"
  | "manage_subscriptions"
  | "manage_channels"
  | "view_logs"
  | "inspect_merchant_sessions"
  | "manage_support";

export type AdminSummary = {
  id: string;
  owner_name: string;
  store_name: string;
  phone: string;
  status: string;
  language: AdminLanguage;
  theme_preference: string;
  created_at: string;
  is_admin: true;
  admin_role: AdminRole;
  permissions: AdminPermission[];
  admin_enabled: boolean;
  otp_verified: boolean;
};

export type CreateAssistantAdminInput = {
  ownerName: string;
  phone: string;
  password: string;
  language?: string;
};

type AdminManagementHandlers = {
  listAdmins: () => AdminSummary[];
  createAssistantAdmin: (
    input: CreateAssistantAdminInput,
  ) => AdminSummary;
  setAssistantAdminEnabled: (
    adminId: string,
    enabled: boolean,
  ) => AdminSummary;
  updateAssistantAdminPermissions: (
    adminId: string,
    permissions: AdminPermission[],
  ) => AdminSummary;
};

let handlers: AdminManagementHandlers | undefined;

export class AdminManagementError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "AdminManagementError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function registerAdminManagement(
  nextHandlers: AdminManagementHandlers,
): void {
  handlers = nextHandlers;
}

function requireHandlers(): AdminManagementHandlers {
  if (!handlers) {
    throw new Error("Admin management handlers are not registered");
  }

  return handlers;
}

export function listAdmins(): AdminSummary[] {
  return requireHandlers().listAdmins();
}

export function createAssistantAdmin(
  input: CreateAssistantAdminInput,
): AdminSummary {
  return requireHandlers().createAssistantAdmin(input);
}


export function setAssistantAdminEnabled(
  adminId: string,
  enabled: boolean,
): AdminSummary {
  return requireHandlers().setAssistantAdminEnabled(adminId, enabled);
}

export function updateAssistantAdminPermissions(
  adminId: string,
  permissions: AdminPermission[],
): AdminSummary {
  return requireHandlers().updateAssistantAdminPermissions(
    adminId,
    permissions,
  );
}
