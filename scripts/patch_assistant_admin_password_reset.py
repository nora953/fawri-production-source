from pathlib import Path
import json


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    path.write_text(text.replace(old, new, 1))


def insert_after_once(path: Path, anchor: str, addition: str, label: str) -> None:
    replace_once(path, anchor, anchor + addition, label)


# -----------------------------------------------------------------------------
# Backend admin summary contract
# -----------------------------------------------------------------------------
admin_management = Path("artifacts/api-server/src/services/adminManagement.ts")
replace_once(
    admin_management,
    "  admin_enabled: boolean;\n  otp_verified: boolean;\n};\n",
    "  admin_enabled: boolean;\n  otp_verified: boolean;\n  must_change_password: boolean;\n};\n",
    "admin summary forced-password flag",
)

# -----------------------------------------------------------------------------
# Backend authentication and password-reset workflow
# -----------------------------------------------------------------------------
auth = Path("artifacts/api-server/src/routes/auth.ts")
replace_once(
    auth,
    "  admin_enabled?: boolean;\n  otp_verified?: boolean;\n",
    "  admin_enabled?: boolean;\n  otp_verified?: boolean;\n  must_change_password?: boolean;\n  admin_session_version?: number;\n",
    "merchant admin security fields",
)
replace_once(
    auth,
    'type SafeMerchant = Omit<Merchant, "password">;\n',
    'type SafeMerchant = Omit<Merchant, "password" | "admin_session_version">;\n',
    "safe merchant admin session field",
)
replace_once(
    auth,
    "type AdminSessionPayload = {\n  adminId: string;\n  expiresAt: number;\n};\n",
    "type AdminSessionPayload = {\n  adminId: string;\n  sessionVersion: number;\n  expiresAt: number;\n};\n",
    "admin session payload version",
)
replace_once(
    auth,
    "        admin_enabled: _adminEnabled,\n        ...regularMerchant\n",
    "        admin_enabled: _adminEnabled,\n        must_change_password: _mustChangePassword,\n        admin_session_version: _adminSessionVersion,\n        ...regularMerchant\n",
    "strip admin security fields from merchants",
)
replace_once(
    auth,
    "      void _adminEnabled;\n\n      return regularMerchant;\n",
    "      void _adminEnabled;\n      void _mustChangePassword;\n      void _adminSessionVersion;\n\n      return regularMerchant;\n",
    "void stripped admin security fields",
)
replace_once(
    auth,
    "        permissions: undefined,\n        admin_enabled: true,\n",
    "        permissions: undefined,\n        admin_enabled: true,\n        must_change_password: false,\n        admin_session_version: normalizeAdminSessionVersion(\n          merchant.admin_session_version,\n        ),\n",
    "normalize owner admin security state",
)
replace_once(
    auth,
    "      permissions: normalizeAssistantPermissions(merchant.permissions),\n      admin_enabled: merchant.admin_enabled !== false,\n",
    "      permissions: normalizeAssistantPermissions(merchant.permissions),\n      admin_enabled: merchant.admin_enabled !== false,\n      must_change_password: merchant.must_change_password === true,\n      admin_session_version: normalizeAdminSessionVersion(\n        merchant.admin_session_version,\n      ),\n",
    "normalize assistant admin security state",
)
insert_after_once(
    auth,
    "function makeId(prefix: string): string {\n  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;\n}\n",
    "\nfunction normalizeAdminSessionVersion(value: unknown): number {\n  return typeof value === \"number\" && Number.isInteger(value) && value >= 0\n    ? value\n    : 0;\n}\n\nfunction revokeAdminSessions(admin: Merchant): void {\n  admin.admin_session_version =\n    normalizeAdminSessionVersion(admin.admin_session_version) + 1;\n}\n",
    "admin session version helpers",
)
replace_once(
    auth,
    "function createAdminSessionToken(adminId: string): string {\n  const payload: AdminSessionPayload = {\n    adminId,\n    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,\n  };\n",
    "function createAdminSessionToken(admin: Merchant): string {\n  const payload: AdminSessionPayload = {\n    adminId: admin.id,\n    sessionVersion: normalizeAdminSessionVersion(\n      admin.admin_session_version,\n    ),\n    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,\n  };\n",
    "create versioned admin session token",
)
replace_once(
    auth,
    "      typeof payload.expiresAt !== \"number\" ||\n      !Number.isFinite(payload.expiresAt) ||\n      payload.expiresAt <= Date.now()\n",
    "      typeof payload.expiresAt !== \"number\" ||\n      !Number.isFinite(payload.expiresAt) ||\n      payload.expiresAt <= Date.now()\n",
    "admin session validation anchor",
)
replace_once(
    auth,
    "    return {\n      adminId: payload.adminId,\n      expiresAt: payload.expiresAt,\n    };\n",
    "    return {\n      adminId: payload.adminId,\n      sessionVersion:\n        typeof payload.sessionVersion === \"number\" &&\n        Number.isInteger(payload.sessionVersion) &&\n        payload.sessionVersion >= 0\n          ? payload.sessionVersion\n          : 0,\n      expiresAt: payload.expiresAt,\n    };\n",
    "normalize legacy admin session token version",
)
replace_once(
    auth,
    "function requireAdminSession(\n  req: Request,\n  res: Response,\n): Merchant | null {\n",
    "function requireAdminSession(\n  req: Request,\n  res: Response,\n  options: { allowPasswordChangeRequired?: boolean } = {},\n): Merchant | null {\n",
    "admin session options",
)
replace_once(
    auth,
    "  if (!admin) {\n    sendError(res, 401, \"admin session is invalid\");\n    return null;\n  }\n\n  return admin;\n}\n",
    "  if (!admin) {\n    sendError(res, 401, \"admin session is invalid\");\n    return null;\n  }\n\n  if (\n    payload.sessionVersion !==\n    normalizeAdminSessionVersion(admin.admin_session_version)\n  ) {\n    sendError(res, 401, \"admin session was revoked\", {\n      code: \"ADMIN_SESSION_REVOKED\",\n    });\n    return null;\n  }\n\n  if (\n    admin.must_change_password === true &&\n    options.allowPasswordChangeRequired !== true\n  ) {\n    sendError(res, 403, \"administrator password change is required\", {\n      code: \"ADMIN_PASSWORD_CHANGE_REQUIRED\",\n    });\n    return null;\n  }\n\n  return admin;\n}\n",
    "enforce revoked sessions and required password change",
)
replace_once(
    auth,
    "function publicMerchant(merchant: Merchant): SafeMerchant {\n  const { password, ...safeMerchant } = normalizeMerchantLifecycle(merchant);\n  void password;\n  return safeMerchant;\n}\n",
    "function publicMerchant(merchant: Merchant): SafeMerchant {\n  const {\n    password,\n    admin_session_version: adminSessionVersion,\n    ...safeMerchant\n  } = normalizeMerchantLifecycle(merchant);\n  void password;\n  void adminSessionVersion;\n  return safeMerchant;\n}\n",
    "hide admin session version",
)
replace_once(
    auth,
    "    admin_enabled: admin.admin_enabled !== false,\n    otp_verified: admin.otp_verified === true,\n",
    "    admin_enabled: admin.admin_enabled !== false,\n    otp_verified: admin.otp_verified === true,\n    must_change_password: admin.must_change_password === true,\n",
    "admin summary password state",
)
replace_once(
    auth,
    "      admin_enabled: true,\n      otp_verified: true,\n      warning_stage: 0,\n",
    "      admin_enabled: true,\n      otp_verified: true,\n      must_change_password: false,\n      admin_session_version: 0,\n      warning_stage: 0,\n",
    "new assistant security defaults",
)
replace_once(
    auth,
    "      ? { admin_token: createAdminSessionToken(merchant.id) }\n",
    "      ? { admin_token: createAdminSessionToken(merchant) }\n",
    "login creates versioned admin token",
)
replace_once(
    auth,
    'router.get("/admin/me", (req: Request, res: Response) => {\n  const admin = requireAdminSession(req, res);\n',
    'router.get("/admin/me", (req: Request, res: Response) => {\n  const admin = requireAdminSession(req, res, {\n    allowPasswordChangeRequired: true,\n  });\n',
    "allow required-password admin profile",
)

admin_password_self_route = r'''

router.patch(
  "/admin/password/change-required",
  (req: Request, res: Response) => {
    const admin = requireAdminSession(req, res, {
      allowPasswordChangeRequired: true,
    });
    if (!admin) return;

    if (!isAssistantAdmin(admin)) {
      return sendError(res, 403, "assistant admin account is required", {
        code: "ASSISTANT_ADMIN_REQUIRED",
      });
    }
    if (admin.must_change_password !== true) {
      return sendError(res, 409, "password change is not required", {
        code: "ADMIN_PASSWORD_CHANGE_NOT_REQUIRED",
      });
    }

    const newPassword = String(req.body?.new_password || "").trim();
    const confirmPassword = String(
      req.body?.confirm_password || "",
    ).trim();
    const passwordError = getPasswordValidationError(newPassword);
    if (passwordError) {
      return sendError(res, 400, passwordError.message, {
        code: passwordError.code,
      });
    }
    if (newPassword !== confirmPassword) {
      return sendError(res, 400, "password confirmation does not match", {
        code: "PASSWORD_CONFIRMATION_MISMATCH",
      });
    }
    if (verifyPassword(newPassword, admin.password)) {
      return sendError(res, 409, "new password must differ from temporary password", {
        code: "PASSWORD_UNCHANGED",
      });
    }

    const db = ensureDb();
    const persistedAdmin = db.merchants.find(
      (item) => item.id === admin.id && item.is_admin === true,
    );
    if (!persistedAdmin || !isAssistantAdmin(persistedAdmin)) {
      return sendError(res, 404, "assistant admin account not found", {
        code: "ADMIN_NOT_FOUND",
      });
    }

    persistedAdmin.password = hashPassword(newPassword);
    persistedAdmin.must_change_password = false;
    revokeAdminSessions(persistedAdmin);
    writeDb(db);

    return res.json({
      ok: true,
      admin: toAdminSummary(persistedAdmin),
      admin_token: createAdminSessionToken(persistedAdmin),
    });
  },
);
'''
insert_after_once(
    auth,
    'router.get("/admin/me", (req: Request, res: Response) => {\n  const admin = requireAdminSession(req, res, {\n    allowPasswordChangeRequired: true,\n  });\n  if (!admin) return;\n\n  res.setHeader("Cache-Control", "no-store");\n  return res.json({ ok: true, admin: toAdminSummary(admin) });\n});\n',
    admin_password_self_route,
    "assistant required password change route",
)

owner_reset_route = r'''

router.patch("/admins/:adminId/password", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  const adminId = String(req.params.adminId || "").trim();
  const ownerPassword = String(req.body?.owner_password || "");
  const temporaryPassword = String(
    req.body?.temporary_password || "",
  ).trim();
  const confirmTemporaryPassword = String(
    req.body?.confirm_temporary_password || "",
  ).trim();

  if (!adminId) {
    return sendError(res, 400, "adminId is required", {
      code: "ADMIN_ID_REQUIRED",
    });
  }
  if (!ownerPassword) {
    return sendError(res, 400, "owner password is required", {
      code: "OWNER_PASSWORD_REQUIRED",
    });
  }
  if (!verifyPassword(ownerPassword, owner.password)) {
    return sendError(res, 401, "owner password is incorrect", {
      code: "OWNER_PASSWORD_INCORRECT",
    });
  }

  const passwordError = getPasswordValidationError(temporaryPassword);
  if (passwordError) {
    return sendError(res, 400, passwordError.message, {
      code: passwordError.code,
    });
  }
  if (temporaryPassword !== confirmTemporaryPassword) {
    return sendError(res, 400, "temporary password confirmation does not match", {
      code: "PASSWORD_CONFIRMATION_MISMATCH",
    });
  }

  const db = ensureDb();
  const assistant = db.merchants.find(
    (item) => item.id === adminId && item.is_admin === true,
  );
  if (!assistant) {
    return sendError(res, 404, "assistant admin account not found", {
      code: "ADMIN_NOT_FOUND",
    });
  }
  if (!isAssistantAdmin(assistant)) {
    return sendError(res, 400, "owner admin password cannot be reset here", {
      code: "OWNER_ADMIN_PASSWORD_CANNOT_BE_RESET",
    });
  }
  if (verifyPassword(temporaryPassword, assistant.password)) {
    return sendError(res, 409, "temporary password must differ from current password", {
      code: "PASSWORD_UNCHANGED",
    });
  }

  assistant.password = hashPassword(temporaryPassword);
  assistant.must_change_password = true;
  revokeAdminSessions(assistant);
  appendAdminLog(
    db,
    owner,
    { id: assistant.id, store_name: assistant.owner_name },
    "assistant_admin_password_reset",
    "assistant administrator temporary password issued",
    {
      meta: {
        assistant_admin_id: assistant.id,
        assistant_admin_phone: assistant.phone,
      },
    },
  );
  writeDb(db);

  return res.json({
    ok: true,
    admin: toAdminSummary(assistant),
  });
});
'''
insert_after_once(
    auth,
    "router.patch(\n  \"/admins/:adminId/permissions\",\n  (req: Request, res: Response) => {\n",
    "",
    "admin permissions route anchor check",
)
# Insert the owner password-reset route immediately before local data migration.
replace_once(
    auth,
    'router.post("/admin/local-data-migration", (req: Request, res: Response) => {\n',
    owner_reset_route + '\nrouter.post("/admin/local-data-migration", (req: Request, res: Response) => {\n',
    "owner assistant password reset route",
)

# -----------------------------------------------------------------------------
# Frontend data types
# -----------------------------------------------------------------------------
types = Path("artifacts/fawri/src/lib/types.ts")
replace_once(
    types,
    "  admin_enabled?: boolean;\n  otp_verified?: boolean;\n",
    "  admin_enabled?: boolean;\n  otp_verified?: boolean;\n  must_change_password?: boolean;\n",
    "frontend admin password flag",
)

# -----------------------------------------------------------------------------
# Owner password reset dialog
# -----------------------------------------------------------------------------
assistant_reset_dialog = Path(
    "artifacts/fawri/src/components/admin/AssistantPasswordResetDialog.tsx"
)
assistant_reset_dialog.write_text(r'''import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { getAdminAuthHeaders } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

type Props = {
  open: boolean;
  administratorId: string;
  administratorName: string;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

function validPassword(value: string): boolean {
  return (
    value.length >= 8 &&
    /^[A-Za-z0-9@#$%&]+$/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}

export default function AssistantPasswordResetDialog({
  open,
  administratorId,
  administratorName,
  onOpenChange,
  onSuccess,
}: Props) {
  const { lang } = useI18n();
  const text = {
    ar: {
      title: "تغيير كلمة مرور المسؤول المساعد",
      description:
        "أكّد كلمة مرور المالك، ثم عيّن كلمة مرور مؤقتة. ستُلغى جميع جلسات المسؤول المفتوحة وسيُطلب منه تغييرها عند أول دخول.",
      ownerPassword: "كلمة مرور المالك",
      temporaryPassword: "كلمة المرور المؤقتة",
      confirmPassword: "تأكيد كلمة المرور المؤقتة",
      rules: "8 خانات على الأقل، مع رقم وحرف إنجليزي كبير، والرموز المسموحة: @ # $ % &",
      cancel: "إلغاء",
      submit: "تغيير كلمة المرور",
      saving: "جارٍ التغيير...",
      success: "تم تعيين كلمة مرور مؤقتة وإلغاء جلسات المسؤول القديمة",
      ownerWrong: "كلمة مرور المالك غير صحيحة.",
      mismatch: "كلمتا المرور المؤقتتان غير متطابقتين.",
      invalid: "كلمة المرور المؤقتة لا تطابق شروط المشروع.",
      unchanged: "يجب أن تختلف كلمة المرور المؤقتة عن كلمة المرور الحالية.",
      error: "تعذر تغيير كلمة مرور المسؤول.",
    },
    en: {
      title: "Change assistant administrator password",
      description:
        "Confirm the owner password, then set a temporary password. All existing assistant sessions will be revoked and the assistant must replace it on the next login.",
      ownerPassword: "Owner password",
      temporaryPassword: "Temporary password",
      confirmPassword: "Confirm temporary password",
      rules: "At least 8 characters, one number, one uppercase English letter, and only @ # $ % & symbols.",
      cancel: "Cancel",
      submit: "Change password",
      saving: "Changing...",
      success: "A temporary password was set and old assistant sessions were revoked",
      ownerWrong: "The owner password is incorrect.",
      mismatch: "The temporary passwords do not match.",
      invalid: "The temporary password does not meet the project rules.",
      unchanged: "The temporary password must differ from the current password.",
      error: "Could not change the administrator password.",
    },
    ku: {
      title: "گۆڕینی وشەی نهێنی بەڕێوەبەری یاریدەدەر",
      description:
        "وشەی نهێنی خاوەن پشتڕاست بکەرەوە، پاشان وشەی نهێنییەکی کاتی دابنێ. هەموو دانیشتنە کۆنەکان هەڵدەوەشێنرێنەوە و لە یەکەم چوونەژوورەوەدا دەبێت بگۆڕدرێت.",
      ownerPassword: "وشەی نهێنی خاوەن",
      temporaryPassword: "وشەی نهێنی کاتی",
      confirmPassword: "پشتڕاستکردنەوەی وشەی نهێنی کاتی",
      rules: "لانیکەم 8 پیت، ژمارەیەک، پیتی گەورەی ئینگلیزی و تەنها @ # $ % &.",
      cancel: "هەڵوەشاندنەوە",
      submit: "گۆڕینی وشەی نهێنی",
      saving: "دەگۆڕدرێت...",
      success: "وشەی نهێنی کاتی دانرا و دانیشتنە کۆنەکان هەڵوەشێنرانەوە",
      ownerWrong: "وشەی نهێنی خاوەن هەڵەیە.",
      mismatch: "دوو وشەی نهێنییە کاتییەکە یەکسان نین.",
      invalid: "وشەی نهێنی کاتی مەرجەکانی پڕۆژە پڕ ناکاتەوە.",
      unchanged: "وشەی نهێنی کاتی دەبێت لە وشەی نهێنی ئێستا جیاواز بێت.",
      error: "گۆڕینی وشەی نهێنی بەڕێوەبەر سەرنەکەوت.",
    },
  }[lang];

  const [ownerPassword, setOwnerPassword] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOwnerPassword("");
    setTemporaryPassword("");
    setConfirmPassword("");
    setError("");
  }, [administratorId, open]);

  const close = () => {
    if (saving) return;
    onOpenChange(false);
  };

  const submit = async () => {
    if (saving) return;
    setError("");

    if (!validPassword(temporaryPassword)) {
      setError(text.invalid);
      return;
    }
    if (temporaryPassword !== confirmPassword) {
      setError(text.mismatch);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(
        `/api/auth/admins/${encodeURIComponent(administratorId)}/password`,
        {
          method: "PATCH",
          headers: {
            ...getAdminAuthHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            owner_password: ownerPassword,
            temporary_password: temporaryPassword,
            confirm_temporary_password: confirmPassword,
          }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        if (data?.code === "OWNER_PASSWORD_INCORRECT") {
          setError(text.ownerWrong);
        } else if (data?.code === "PASSWORD_CONFIRMATION_MISMATCH") {
          setError(text.mismatch);
        } else if (data?.code === "PASSWORD_UNCHANGED") {
          setError(text.unchanged);
        } else if (String(data?.code || "").startsWith("PASSWORD_")) {
          setError(text.invalid);
        } else {
          setError(text.error);
        }
        return;
      }

      toast.success(text.success);
      onSuccess();
      onOpenChange(false);
    } catch (requestError) {
      console.error("Assistant administrator password reset failed:", requestError);
      setError(text.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        dir={lang === "en" ? "ltr" : "rtl"}
        className={
          lang === "en"
            ? "sm:max-w-lg"
            : "sm:max-w-lg [&>button]:left-4 [&>button]:right-auto"
        }
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        <DialogHeader className={lang === "en" ? "text-left" : "text-right sm:!text-right"}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </div>
            <DialogTitle className="leading-7">{text.title}</DialogTitle>
          </div>
          <DialogDescription className="pt-2 leading-6">
            {text.description}
            {administratorName ? ` (${administratorName})` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="owner-confirm-password">{text.ownerPassword}</Label>
            <PasswordInput
              id="owner-confirm-password"
              value={ownerPassword}
              disabled={saving}
              autoComplete="current-password"
              dir="ltr"
              onChange={(event) => {
                setOwnerPassword(event.target.value);
                setError("");
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assistant-temporary-password">{text.temporaryPassword}</Label>
            <PasswordInput
              id="assistant-temporary-password"
              value={temporaryPassword}
              disabled={saving}
              autoComplete="new-password"
              dir="ltr"
              onChange={(event) => {
                setTemporaryPassword(event.target.value);
                setError("");
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assistant-temporary-password-confirm">{text.confirmPassword}</Label>
            <PasswordInput
              id="assistant-temporary-password-confirm"
              value={confirmPassword}
              disabled={saving}
              autoComplete="new-password"
              dir="ltr"
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setError("");
              }}
            />
          </div>

          <p className="text-xs leading-5 text-muted-foreground">{text.rules}</p>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={saving} onClick={close}>
            {text.cancel}
          </Button>
          <Button
            type="button"
            disabled={
              saving ||
              !ownerPassword ||
              !temporaryPassword ||
              !confirmPassword
            }
            onClick={() => void submit()}
          >
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {saving ? text.saving : text.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
''')

# -----------------------------------------------------------------------------
# Mandatory first-login password change dialog
# -----------------------------------------------------------------------------
required_change_dialog = Path(
    "artifacts/fawri/src/components/admin/RequiredAdminPasswordChangeDialog.tsx"
)
required_change_dialog.write_text(r'''import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { setAdminSessionToken } from "@/lib/store";
import type { Merchant } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

type Props = {
  admin: Merchant;
  onChanged: (admin: Merchant) => void;
};

function validPassword(value: string): boolean {
  return (
    value.length >= 8 &&
    /^[A-Za-z0-9@#$%&]+$/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}

export default function RequiredAdminPasswordChangeDialog({
  admin,
  onChanged,
}: Props) {
  const { lang } = useI18n();
  const text = {
    ar: {
      title: "يجب تغيير كلمة المرور المؤقتة",
      description:
        "استخدم كلمة مرور دائمة خاصة بك قبل الوصول إلى لوحة الإدارة. لن تتمكن من استخدام أقسام الإدارة قبل إكمال هذه الخطوة.",
      password: "كلمة المرور الجديدة",
      confirm: "تأكيد كلمة المرور الجديدة",
      rules: "8 خانات على الأقل، مع رقم وحرف إنجليزي كبير، والرموز المسموحة: @ # $ % &",
      submit: "حفظ كلمة المرور والدخول",
      saving: "جارٍ الحفظ...",
      success: "تم تغيير كلمة المرور بنجاح",
      mismatch: "كلمتا المرور غير متطابقتين.",
      invalid: "كلمة المرور لا تطابق شروط المشروع.",
      unchanged: "يجب أن تختلف كلمة المرور الجديدة عن كلمة المرور المؤقتة.",
      error: "تعذر تغيير كلمة المرور.",
    },
    en: {
      title: "Temporary password change required",
      description:
        "Set your own permanent password before accessing the administration panel. Administrative sections remain unavailable until this step is completed.",
      password: "New password",
      confirm: "Confirm new password",
      rules: "At least 8 characters, one number, one uppercase English letter, and only @ # $ % & symbols.",
      submit: "Save password and continue",
      saving: "Saving...",
      success: "Password changed successfully",
      mismatch: "The passwords do not match.",
      invalid: "The password does not meet the project rules.",
      unchanged: "The new password must differ from the temporary password.",
      error: "Could not change the password.",
    },
    ku: {
      title: "گۆڕینی وشەی نهێنی کاتی پێویستە",
      description:
        "پێش دەستگەیشتن بە پەڕەی بەڕێوەبردن وشەی نهێنییەکی هەمیشەیی بۆ خۆت دابنێ. تا تەواوکردنی ئەم هەنگاوە بەشەکانی بەڕێوەبردن بەردەست نابن.",
      password: "وشەی نهێنی نوێ",
      confirm: "پشتڕاستکردنەوەی وشەی نهێنی نوێ",
      rules: "لانیکەم 8 پیت، ژمارەیەک، پیتی گەورەی ئینگلیزی و تەنها @ # $ % &.",
      submit: "پاشەکەوتکردن و بەردەوامبوون",
      saving: "پاشەکەوت دەکرێت...",
      success: "وشەی نهێنی بە سەرکەوتوویی گۆڕدرا",
      mismatch: "دوو وشەی نهێنییەکە یەکسان نین.",
      invalid: "وشەی نهێنی مەرجەکانی پڕۆژە پڕ ناکاتەوە.",
      unchanged: "وشەی نهێنی نوێ دەبێت لە وشەی نهێنی کاتی جیاواز بێت.",
      error: "گۆڕینی وشەی نهێنی سەرنەکەوت.",
    },
  }[lang];

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    setError("");

    if (!validPassword(password)) {
      setError(text.invalid);
      return;
    }
    if (password !== confirmPassword) {
      setError(text.mismatch);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/auth/admin/password/change-required", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("fawri_admin_session_token") || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          new_password: password,
          confirm_password: confirmPassword,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data?.admin || !data?.admin_token) {
        if (data?.code === "PASSWORD_CONFIRMATION_MISMATCH") {
          setError(text.mismatch);
        } else if (data?.code === "PASSWORD_UNCHANGED") {
          setError(text.unchanged);
        } else if (String(data?.code || "").startsWith("PASSWORD_")) {
          setError(text.invalid);
        } else {
          setError(text.error);
        }
        return;
      }

      setAdminSessionToken(data.admin_token);
      onChanged(data.admin as Merchant);
      setPassword("");
      setConfirmPassword("");
      toast.success(text.success);
    } catch (requestError) {
      console.error("Required administrator password change failed:", requestError);
      setError(text.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={admin.must_change_password === true} onOpenChange={() => undefined}>
      <DialogContent
        dir={lang === "en" ? "ltr" : "rtl"}
        className="sm:max-w-lg"
        closeButtonClassName="hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className={lang === "en" ? "text-left" : "text-right sm:!text-right"}>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </div>
            <DialogTitle className="leading-7">{text.title}</DialogTitle>
          </div>
          <DialogDescription className="pt-2 leading-6">
            {text.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="required-admin-new-password">{text.password}</Label>
            <PasswordInput
              id="required-admin-new-password"
              value={password}
              disabled={saving}
              autoComplete="new-password"
              dir="ltr"
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="required-admin-confirm-password">{text.confirm}</Label>
            <PasswordInput
              id="required-admin-confirm-password"
              value={confirmPassword}
              disabled={saving}
              autoComplete="new-password"
              dir="ltr"
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setError("");
              }}
            />
          </div>

          <p className="text-xs leading-5 text-muted-foreground">{text.rules}</p>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={saving || !password || !confirmPassword}
            onClick={() => void submit()}
          >
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {saving ? text.saving : text.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
''')

# -----------------------------------------------------------------------------
# Administrators tab integration
# -----------------------------------------------------------------------------
administrators_tab = Path(
    "artifacts/fawri/src/components/admin/AdministratorsTab.tsx"
)
replace_once(
    administrators_tab,
    "  CalendarDays,\n  CheckCircle2,\n",
    "  CalendarDays,\n  CheckCircle2,\n  KeyRound,\n",
    "administrator password icon import",
)
insert_after_once(
    administrators_tab,
    'import { toast } from "sonner";\n',
    '\nimport AssistantPasswordResetDialog from "@/components/admin/AssistantPasswordResetDialog";\n',
    "assistant password reset dialog import",
)
replace_once(
    administrators_tab,
    "  admin_enabled: boolean;\n  otp_verified: boolean;\n}\n",
    "  admin_enabled: boolean;\n  otp_verified: boolean;\n  must_change_password: boolean;\n}\n",
    "administrator account password state",
)
insert_after_once(
    administrators_tab,
    "  const administratorStatusText = {\n",
    "",
    "administrator status text anchor",
)
# Add button wording after the status dictionary.
replace_once(
    administrators_tab,
    "  }[language];\n\n  const t = {\n",
    "  }[language];\n\n  const administratorPasswordText = {\n    ar: { button: \"تغيير كلمة المرور\", required: \"بانتظار تغيير كلمة المرور\" },\n    en: { button: \"Change password\", required: \"Password change pending\" },\n    ku: { button: \"گۆڕینی وشەی نهێنی\", required: \"چاوەڕوانی گۆڕینی وشەی نهێنی\" },\n  }[language];\n\n  const t = {\n",
    "administrator password reset button text",
)
replace_once(
    administrators_tab,
    "  const [updatingAdministratorStatusId, setUpdatingAdministratorStatusId] =\n    useState<string | null>(null);\n",
    "  const [updatingAdministratorStatusId, setUpdatingAdministratorStatusId] =\n    useState<string | null>(null);\n  const [passwordResetAdministrator, setPasswordResetAdministrator] =\n    useState<AdminAccount | null>(null);\n",
    "administrator password reset state",
)
replace_once(
    administrators_tab,
    '                    {!isOwner && (\n                      <div className="grid gap-2 border-t pt-3 sm:grid-cols-2">\n',
    '                    {!isOwner && (\n                      <div className="grid gap-2 border-t pt-3 sm:grid-cols-3">\n',
    "administrator action columns",
)
replace_once(
    administrators_tab,
    "                        <Button\n                          type=\"button\"\n                          variant={\n                            administrator.admin_enabled === false\n",
    "                        <Button\n                          type=\"button\"\n                          variant=\"outline\"\n                          className=\"w-full gap-2\"\n                          onClick={() => setPasswordResetAdministrator(administrator)}\n                        >\n                          <KeyRound className=\"h-4 w-4\" aria-hidden=\"true\" />\n                          {administratorPasswordText.button}\n                        </Button>\n\n                        <Button\n                          type=\"button\"\n                          variant={\n                            administrator.admin_enabled === false\n",
    "administrator password reset action button",
)
replace_once(
    administrators_tab,
    "                    <div className=\"flex items-center gap-2 border-t pt-3 text-xs\">\n",
    "                    {administrator.must_change_password && !isOwner && (\n                      <Badge variant=\"outline\" className=\"border-orange-300 bg-orange-50 text-orange-700\">\n                        {administratorPasswordText.required}\n                      </Badge>\n                    )}\n\n                    <div className=\"flex items-center gap-2 border-t pt-3 text-xs\">\n",
    "administrator required password badge",
)
replace_once(
    administrators_tab,
    "      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogChange}>\n",
    "      <AssistantPasswordResetDialog\n        open={passwordResetAdministrator !== null}\n        administratorId={passwordResetAdministrator?.id || \"\"}\n        administratorName={passwordResetAdministrator?.owner_name || \"\"}\n        onOpenChange={(open) => {\n          if (!open) setPasswordResetAdministrator(null);\n        }}\n        onSuccess={() => {\n          setPasswordResetAdministrator(null);\n          void loadAdministrators();\n        }}\n      />\n\n      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogChange}>\n",
    "render assistant password reset dialog",
)

# -----------------------------------------------------------------------------
# Admin page: mandatory password change and log labels
# -----------------------------------------------------------------------------
admin_page = Path("artifacts/fawri/src/pages/AdminPage.tsx")
insert_after_once(
    admin_page,
    'import AdministratorsTab from "@/components/admin/AdministratorsTab";\n',
    'import RequiredAdminPasswordChangeDialog from "@/components/admin/RequiredAdminPasswordChangeDialog";\n',
    "required password dialog import",
)
replace_once(
    admin_page,
    '    deletion_request_rejected:\n      adminText.logsActionDeletionRequestRejected,\n',
    '    deletion_request_rejected:\n      adminText.logsActionDeletionRequestRejected,\n    assistant_admin_password_reset:\n      adminText.logsActionAssistantPasswordReset,\n',
    "password reset log action label",
)
replace_once(
    admin_page,
    '      case "note_saved":\n        return adminText.logInternalNoteSaved;\n',
    '      case "note_saved":\n        return adminText.logInternalNoteSaved;\n\n      case "assistant_admin_password_reset":\n        return adminText.logAssistantAdminPasswordReset;\n',
    "password reset localized log details",
)
replace_once(
    admin_page,
    "  const [currentAdmin, setCurrentAdmin] = useState<Merchant | undefined>();\n  const isOwnerAdmin = currentAdmin?.admin_role === \"owner_admin\";\n  const canManageAdmins = isOwnerAdmin;\n  const canViewMerchants = hasAdminPermission(currentAdmin, \"view_merchants\");\n",
    "  const [currentAdmin, setCurrentAdmin] = useState<Merchant | undefined>();\n  const passwordChangeRequired = currentAdmin?.must_change_password === true;\n  const isOwnerAdmin = currentAdmin?.admin_role === \"owner_admin\";\n  const canManageAdmins = isOwnerAdmin && !passwordChangeRequired;\n  const canViewMerchants =\n    !passwordChangeRequired &&\n    hasAdminPermission(currentAdmin, \"view_merchants\");\n",
    "gate admin permissions during forced password change",
)
replace_once(
    admin_page,
    "  const canManageMerchants = hasAdminPermission(\n    currentAdmin,\n    \"manage_merchant_status\",\n  );\n  const canManageSubscriptions = hasAdminPermission(\n    currentAdmin,\n    \"manage_subscriptions\",\n  );\n  const canManageChannels = hasAdminPermission(currentAdmin, \"manage_channels\");\n  const canViewLogs = hasAdminPermission(currentAdmin, \"view_logs\");\n  const canInspectSessions = hasAdminPermission(\n    currentAdmin,\n    \"inspect_merchant_sessions\",\n  );\n  const canManageSupport = hasAdminPermission(currentAdmin, \"manage_support\");\n",
    "  const canManageMerchants =\n    !passwordChangeRequired &&\n    hasAdminPermission(currentAdmin, \"manage_merchant_status\");\n  const canManageSubscriptions =\n    !passwordChangeRequired &&\n    hasAdminPermission(currentAdmin, \"manage_subscriptions\");\n  const canManageChannels =\n    !passwordChangeRequired &&\n    hasAdminPermission(currentAdmin, \"manage_channels\");\n  const canViewLogs =\n    !passwordChangeRequired &&\n    hasAdminPermission(currentAdmin, \"view_logs\");\n  const canInspectSessions =\n    !passwordChangeRequired &&\n    hasAdminPermission(currentAdmin, \"inspect_merchant_sessions\");\n  const canManageSupport =\n    !passwordChangeRequired &&\n    hasAdminPermission(currentAdmin, \"manage_support\");\n",
    "gate all admin permissions during forced password change",
)
replace_once(
    admin_page,
    '  return (\n    <div className="min-h-screen bg-background" dir={adminText.dir}>\n',
    '  return (\n    <div className="min-h-screen bg-background" dir={adminText.dir}>\n      {currentAdmin?.must_change_password === true && (\n        <RequiredAdminPasswordChangeDialog\n          admin={currentAdmin}\n          onChanged={setCurrentAdmin}\n        />\n      )}\n',
    "render forced password change dialog",
)

# -----------------------------------------------------------------------------
# Admin log translations in all three languages
# -----------------------------------------------------------------------------
admin_translations = Path("artifacts/fawri/src/lib/admin-translations.ts")
replace_once(
    admin_translations,
    '    logsActionDeletionRequestRejected: "رفض طلب الحذف",\n',
    '    logsActionDeletionRequestRejected: "رفض طلب الحذف",\n    logsActionAssistantPasswordReset: "تغيير كلمة مرور مسؤول مساعد",\n',
    "Arabic password reset log label",
)
replace_once(
    admin_translations,
    '    logInternalNoteSaved: "ملاحظة داخلية محفوظة",\n',
    '    logInternalNoteSaved: "ملاحظة داخلية محفوظة",\n    logAssistantAdminPasswordReset:\n      "تم تعيين كلمة مرور مؤقتة للمسؤول المساعد وإلغاء جلساته القديمة",\n',
    "Arabic password reset log details",
)
replace_once(
    admin_translations,
    '    logsActionDeletionRequestRejected: "Deletion request rejected",\n',
    '    logsActionDeletionRequestRejected: "Deletion request rejected",\n    logsActionAssistantPasswordReset: "Assistant password changed",\n',
    "English password reset log label",
)
replace_once(
    admin_translations,
    '    logInternalNoteSaved: "Internal note saved",\n',
    '    logInternalNoteSaved: "Internal note saved",\n    logAssistantAdminPasswordReset:\n      "A temporary password was issued and the assistant administrator sessions were revoked.",\n',
    "English password reset log details",
)
replace_once(
    admin_translations,
    '  logsActionDeletionRequestRejected: "ڕەتکردنەوەی داواکاری سڕینەوە",\n',
    '  logsActionDeletionRequestRejected: "ڕەتکردنەوەی داواکاری سڕینەوە",\n  logsActionAssistantPasswordReset: "گۆڕینی وشەی نهێنی بەڕێوەبەری یاریدەدەر",\n',
    "Kurdish password reset log label",
)
replace_once(
    admin_translations,
    '  logInternalNoteSaved: "تێبینیی ناوەکی پاشەکەوتکرا",\n',
    '  logInternalNoteSaved: "تێبینیی ناوەکی پاشەکەوتکرا",\n  logAssistantAdminPasswordReset:\n    "وشەی نهێنی کاتی دانرا و دانیشتنە کۆنەکانی بەڕێوەبەری یاریدەدەر هەڵوەشێنرانەوە",\n',
    "Kurdish password reset log details",
)

# -----------------------------------------------------------------------------
# Focused integration test
# -----------------------------------------------------------------------------
password_test = Path(
    "artifacts/api-server/tests/admin-password-reset.integration.test.mjs"
)
password_test.write_text(r'''import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDir, "..");
const serverEntry = path.join(apiRoot, "dist", "index.mjs");

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitForServer(baseUrl, child, logs) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API exited early.\n${logs()}`);
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API did not become ready.\n${logs()}`);
}

async function json(response) {
  return { response, body: await response.json().catch(() => null) };
}

test("owner resets assistant password, revokes sessions, and forces first-login change", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fawri-admin-password-"));
  const dataDir = path.join(runtimeDir, "data");
  await mkdir(dataDir, { recursive: true });

  const baseAdmin = {
    store_name: "Fawri Admin",
    activity_type: "admin",
    status: "approved",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-08-02T00:00:00.000Z",
    is_admin: true,
    admin_enabled: true,
    otp_verified: true,
    warning_stage: 0,
    retention_status: "protected",
  };

  await writeFile(
    path.join(dataDir, "merchants.json"),
    JSON.stringify({
      merchants: [
        {
          ...baseAdmin,
          id: "owner-admin",
          owner_name: "Owner",
          phone: "07111111111",
          password: "OwnerPass1@",
          admin_role: "owner_admin",
        },
        {
          ...baseAdmin,
          id: "assistant-admin",
          owner_name: "Assistant",
          phone: "07222222222",
          password: "Assistant1@",
          admin_role: "assistant_admin",
          permissions: ["view_merchants", "view_logs"],
        },
      ],
      subscriptions: [],
      otps: [],
      admin_logs: [],
      merchant_notifications: [],
      support_tickets: [],
      deletion_requests: [],
      channel_overrides: {},
      admin_notes: {},
    }),
  );

  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let output = "";
  const child = spawn(process.execPath, [serverEntry], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      LOG_LEVEL: "silent",
      BOT_DEBUG: "false",
      FAWRI_PASSWORD_SALT: "test-password-salt",
      FAWRI_ADMIN_SESSION_SECRET: "test-admin-session-secret",
      FAWRI_ADMIN_PHONE: "07111111111",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
    await rm(runtimeDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child, () => output);

  async function login(phone, password) {
    return json(await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    }));
  }

  const ownerLogin = await login("07111111111", "OwnerPass1@");
  assert.equal(ownerLogin.response.status, 200);
  const ownerToken = ownerLogin.body.admin_token;
  const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };

  const assistantLogin = await login("07222222222", "Assistant1@");
  assert.equal(assistantLogin.response.status, 200);
  const oldAssistantToken = assistantLogin.body.admin_token;
  const oldAssistantHeaders = { Authorization: `Bearer ${oldAssistantToken}` };

  const wrongOwnerPassword = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/password`,
    {
      method: "PATCH",
      headers: { ...ownerHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        owner_password: "WrongOwner1@",
        temporary_password: "Temporary2@",
        confirm_temporary_password: "Temporary2@",
      }),
    },
  ));
  assert.equal(wrongOwnerPassword.response.status, 401);
  assert.equal(wrongOwnerPassword.body.code, "OWNER_PASSWORD_INCORRECT");

  const reset = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/password`,
    {
      method: "PATCH",
      headers: { ...ownerHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        owner_password: "OwnerPass1@",
        temporary_password: "Temporary2@",
        confirm_temporary_password: "Temporary2@",
      }),
    },
  ));
  assert.equal(reset.response.status, 200);
  assert.equal(reset.body.admin.must_change_password, true);

  const revokedOldSession = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: oldAssistantHeaders },
  ));
  assert.equal(revokedOldSession.response.status, 401);
  assert.equal(revokedOldSession.body.code, "ADMIN_SESSION_REVOKED");

  const oldPasswordLogin = await login("07222222222", "Assistant1@");
  assert.equal(oldPasswordLogin.response.status, 401);

  const temporaryLogin = await login("07222222222", "Temporary2@");
  assert.equal(temporaryLogin.response.status, 200);
  assert.equal(temporaryLogin.body.merchant.must_change_password, true);
  const temporaryToken = temporaryLogin.body.admin_token;
  const temporaryHeaders = { Authorization: `Bearer ${temporaryToken}` };

  const temporaryMe = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: temporaryHeaders },
  ));
  assert.equal(temporaryMe.response.status, 200);
  assert.equal(temporaryMe.body.admin.must_change_password, true);

  const blockedAdminAccess = await json(await fetch(
    `${baseUrl}/api/auth/merchants`,
    { headers: temporaryHeaders },
  ));
  assert.equal(blockedAdminAccess.response.status, 403);
  assert.equal(blockedAdminAccess.body.code, "ADMIN_PASSWORD_CHANGE_REQUIRED");

  const mismatchChange = await json(await fetch(
    `${baseUrl}/api/auth/admin/password/change-required`,
    {
      method: "PATCH",
      headers: { ...temporaryHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        new_password: "Permanent3@",
        confirm_password: "Different4@",
      }),
    },
  ));
  assert.equal(mismatchChange.response.status, 400);
  assert.equal(mismatchChange.body.code, "PASSWORD_CONFIRMATION_MISMATCH");

  const changed = await json(await fetch(
    `${baseUrl}/api/auth/admin/password/change-required`,
    {
      method: "PATCH",
      headers: { ...temporaryHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        new_password: "Permanent3@",
        confirm_password: "Permanent3@",
      }),
    },
  ));
  assert.equal(changed.response.status, 200);
  assert.equal(changed.body.admin.must_change_password, false);
  assert.equal(typeof changed.body.admin_token, "string");

  const revokedTemporarySession = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: temporaryHeaders },
  ));
  assert.equal(revokedTemporarySession.response.status, 401);
  assert.equal(revokedTemporarySession.body.code, "ADMIN_SESSION_REVOKED");

  const finalHeaders = { Authorization: `Bearer ${changed.body.admin_token}` };
  const finalMe = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: finalHeaders },
  ));
  assert.equal(finalMe.response.status, 200);
  assert.equal(finalMe.body.admin.must_change_password, false);

  const temporaryPasswordLogin = await login("07222222222", "Temporary2@");
  assert.equal(temporaryPasswordLogin.response.status, 401);
  const permanentPasswordLogin = await login("07222222222", "Permanent3@");
  assert.equal(permanentPasswordLogin.response.status, 200);

  const ownerLogs = await json(await fetch(
    `${baseUrl}/api/auth/admin/logs`,
    { headers: ownerHeaders },
  ));
  assert.equal(ownerLogs.response.status, 200);
  const resetLog = ownerLogs.body.logs.find(
    (log) => log.action_type === "assistant_admin_password_reset",
  );
  assert.ok(resetLog);
  assert.equal(resetLog.admin_id, "owner-admin");
  assert.equal(resetLog.merchant_id, "assistant-admin");
  assert.equal(JSON.stringify(resetLog).includes("Temporary2@"), false);
  assert.equal(JSON.stringify(resetLog).includes("OwnerPass1@"), false);

  const persisted = JSON.parse(
    await readFile(path.join(dataDir, "merchants.json"), "utf8"),
  );
  const persistedAssistant = persisted.merchants.find(
    (merchant) => merchant.id === "assistant-admin",
  );
  assert.equal(persistedAssistant.must_change_password, false);
  assert.equal(persistedAssistant.admin_session_version, 2);
  assert.match(persistedAssistant.password, /^sha256\$/);
  assert.equal(persistedAssistant.password.includes("Permanent3@"), false);
});
''')

# Add a package script for the focused test.
package_json = Path("artifacts/api-server/package.json")
package_data = json.loads(package_json.read_text())
package_data["scripts"]["test:admin-password-reset"] = (
    "node ./build.mjs && node --test ./tests/admin-password-reset.integration.test.mjs"
)
package_json.write_text(json.dumps(package_data, ensure_ascii=False, indent=2) + "\n")

print("Assistant administrator password reset workflow applied.")
