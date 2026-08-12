import { ADMINISTRATORS_TAB_ADMINISTRATOR_PASSWORD_TEXT, ADMINISTRATORS_TAB_WORK_MONITOR_TEXT, ADMINISTRATORS_TAB_PERMISSION_TEXT, ADMINISTRATORS_TAB_ADMINISTRATOR_STATUS_TEXT } from '@/lib/translations/features/components/admin/AdministratorsTab';
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldUser,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";

import { getAdminAuthHeaders } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import AssistantPasswordResetDialog from "@/components/admin/AssistantPasswordResetDialog";

type AdminRole = "owner_admin" | "assistant_admin";

type AdminPermission =
  | "view_merchants"
  | "manage_merchant_status"
  | "manage_subscriptions"
  | "manage_channels"
  | "view_logs"
  | "inspect_merchant_sessions"
  | "manage_support";

type SupportedLanguage = "ar" | "en" | "ku";

interface AdminAccount {
  id: string;
  owner_name: string;
  store_name: string;
  phone: string;
  status: string;
  language: SupportedLanguage;
  theme_preference: string;
  created_at: string;
  is_admin: true;
  admin_role: AdminRole;
  permissions: AdminPermission[];
  admin_enabled: boolean;
  otp_verified: boolean;
  must_change_password: boolean;
  work_status?: "active" | "idle" | "offline";
  open_session_count?: number;
  last_activity_at?: string | null;
  pending_device_count?: number;
}

interface AdministratorsApiResponse {
  ok: boolean;
  admins?: AdminAccount[];
  error?: string;
}

interface CreateAdministratorApiResponse {
  ok: boolean;
  admin?: AdminAccount;
  error?: string;
  code?: string;
}

interface UpdateAdministratorPermissionsResponse {
  ok: boolean;
  admin?: AdminAccount;
  error?: string;
  code?: string;
}

interface UpdateAdministratorStatusResponse {
  ok: boolean;
  admin?: AdminAccount;
  error?: string;
  code?: string;
}

interface AdministratorFormState {
  ownerName: string;
  phone: string;
  password: string;
  language: SupportedLanguage;
}

interface AdministratorsText {
  dir: "rtl" | "ltr";
  administratorsLoading: string;
  administratorsLoadError: string;
  administratorsRetry: string;
  administratorsOwnerRole: string;
  administratorsAssistantRole: string;
  administratorsEnabled: string;
  administratorsDisabled: string;
  administratorsVerified: string;
  administratorsNotVerified: string;
  administratorsPhoneLabel: string;
  administratorsLanguageLabel: string;
  administratorsCreatedAtLabel: string;
  administratorsCountLabel: string;
  administratorsLanguageArabic: string;
  administratorsLanguageEnglish: string;
  administratorsLanguageKurdish: string;
  administratorsAddButton: string;
  administratorsDialogTitle: string;
  administratorsDialogDescription: string;
  administratorsNameLabel: string;
  administratorsPhoneLabelInput: string;
  administratorsPasswordLabel: string;
  administratorsLanguageInputLabel: string;
  administratorsCreate: string;
  administratorsCancel: string;
  administratorsCreating: string;
  administratorsCreateSuccess: string;
  administratorsNameRequired: string;
  administratorsPhoneRequired: string;
  administratorsPhoneInvalid: string;
  administratorsPasswordRequired: string;
  administratorsPasswordInvalid: string;
  administratorsPhoneExists: string;
  administratorsCreateError: string;
  administratorsConnectionError: string;
}

interface AdministratorsTabProps {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  adminText: AdministratorsText;
}

function getInterfaceLanguage(): SupportedLanguage {
  const language = document.documentElement.lang.toLowerCase();

  if (language.startsWith("en")) return "en";
  if (language.startsWith("ku")) return "ku";

  return "ar";
}

function formatDate(value: string, language: SupportedLanguage): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  const locale =
    language === "en" ? "en-US" : language === "ku" ? "ckb-IQ" : "ar-IQ";

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function normalizePhoneInput(value: string): string {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";

  return value
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/\D/g, "")
    .slice(0, 11);
}

function isValidAdminPassword(value: string): boolean {
  return (
    value.length >= 8 &&
    /^[A-Za-z0-9@#$%&]+$/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}

export default function AdministratorsTab({
  title,
  description,
  emptyTitle,
  emptyDescription,
  adminText,
}: AdministratorsTabProps) {
  const language = getInterfaceLanguage();
  const [, setLocation] = useLocation();

  // The official administration dictionary is now the primary source.
  // The old internal dictionary remains temporarily below only as a
  // rollback reference until visual verification is completed.
  const permissionList: readonly AdminPermission[] = [
    "view_merchants",
    "manage_merchant_status",
    "manage_subscriptions",
    "manage_channels",
    "view_logs",
    "inspect_merchant_sessions",
    "manage_support",
  ];

  const permissionText = ADMINISTRATORS_TAB_PERMISSION_TEXT[language];

  const administratorStatusText = ADMINISTRATORS_TAB_ADMINISTRATOR_STATUS_TEXT[language];

  const administratorPasswordText = ADMINISTRATORS_TAB_ADMINISTRATOR_PASSWORD_TEXT[language];

  const workMonitorText = ADMINISTRATORS_TAB_WORK_MONITOR_TEXT[language];

  const t = {
    loading: adminText.administratorsLoading,
    loadError: adminText.administratorsLoadError,
    retry: adminText.administratorsRetry,
    ownerAdmin: adminText.administratorsOwnerRole,
    assistantAdmin: adminText.administratorsAssistantRole,
    enabled: adminText.administratorsEnabled,
    disabled: adminText.administratorsDisabled,
    verified: adminText.administratorsVerified,
    notVerified: adminText.administratorsNotVerified,
    phone: adminText.administratorsPhoneLabel,
    language: adminText.administratorsLanguageLabel,
    createdAt: adminText.administratorsCreatedAtLabel,
    administratorsCount: adminText.administratorsCountLabel,
    languages: {
      ar: adminText.administratorsLanguageArabic,
      en: adminText.administratorsLanguageEnglish,
      ku: adminText.administratorsLanguageKurdish,
    },
    addButton: adminText.administratorsAddButton,
    dialogTitle: adminText.administratorsDialogTitle,
    dialogDescription: adminText.administratorsDialogDescription,
    nameLabel: adminText.administratorsNameLabel,
    phoneInputLabel: adminText.administratorsPhoneLabelInput,
    passwordLabel: adminText.administratorsPasswordLabel,
    languageInputLabel: adminText.administratorsLanguageInputLabel,
    create: adminText.administratorsCreate,
    cancel: adminText.administratorsCancel,
    creating: adminText.administratorsCreating,
    createSuccess: adminText.administratorsCreateSuccess,
    nameRequired: adminText.administratorsNameRequired,
    phoneRequired: adminText.administratorsPhoneRequired,
    phoneInvalid: adminText.administratorsPhoneInvalid,
    passwordRequired: adminText.administratorsPasswordRequired,
    passwordInvalid: adminText.administratorsPasswordInvalid,
    phoneExists: adminText.administratorsPhoneExists,
    createError: adminText.administratorsCreateError,
    connectionError: adminText.administratorsConnectionError,
  };

  const [administrators, setAdministrators] = useState<AdminAccount[]>([]);
  const [selectedAdministrator, setSelectedAdministrator] =
    useState<AdminAccount | null>(null);
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [selectedPermissions, setSelectedPermissions] =
    useState<AdminPermission[]>([]);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const originalPermissions = selectedAdministrator?.permissions ?? [];
  const hasPermissionChanges =
    selectedAdministrator?.admin_role === "assistant_admin" &&
    (selectedPermissions.length !== originalPermissions.length ||
      selectedPermissions.some(
        (permission) => !originalPermissions.includes(permission),
      ));
  const [updatingAdministratorStatusId, setUpdatingAdministratorStatusId] =
    useState<string | null>(null);
  const [passwordResetAdministrator, setPasswordResetAdministrator] =
    useState<AdminAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<AdministratorFormState>({
    ownerName: "",
    phone: "",
    password: "",
    language,
  });

  const loadAdministrators = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
      setLoadError(false);
    }

    try {
      const response = await fetch("/api/auth/admins", {
        headers: getAdminAuthHeaders(),
      });

      const data = (await response
        .json()
        .catch(() => null)) as AdministratorsApiResponse | null;

      if (!response.ok || !data?.ok || !Array.isArray(data.admins)) {
        throw new Error(data?.error || "Could not load administrators");
      }

      setAdministrators(data.admins);
    } catch (error) {
      console.error("Administrators API load failed:", error);
      if (!silent) {
        setAdministrators([]);
        setLoadError(true);
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdministrators();
    const timer = window.setInterval(
      () => void loadAdministrators(true),
      30_000,
    );
    return () => window.clearInterval(timer);
  }, [loadAdministrators]);

  const resetCreateForm = () => {
    setForm({
      ownerName: "",
      phone: "",
      password: "",
      language,
    });
    setFormError("");
    setShowPassword(false);
  };

  const handleCreateDialogChange = (open: boolean) => {
    if (isCreating) return;

    setIsCreateDialogOpen(open);

    if (!open) {
      resetCreateForm();
    }
  };

  const openPermissionDialog = (administrator: AdminAccount) => {
    if (administrator.admin_role !== "assistant_admin") return;

    setSelectedAdministrator(administrator);
    setSelectedPermissions(
      Array.isArray(administrator.permissions)
        ? [...administrator.permissions]
        : [],
    );
    setPermissionDialogOpen(true);
  };

  const togglePermission = (
    permission: AdminPermission,
    checked: boolean,
  ) => {
    setSelectedPermissions((currentPermissions) => {
      if (checked) {
        return currentPermissions.includes(permission)
          ? currentPermissions
          : [...currentPermissions, permission];
      }

      return currentPermissions.filter(
        (currentPermission) => currentPermission !== permission,
      );
    });
  };

  const getCreationErrorMessage = (
    data: CreateAdministratorApiResponse | null,
  ): string => {
    switch (data?.code) {
      case "OWNER_NAME_REQUIRED":
        return t.nameRequired;
      case "INVALID_PHONE":
        return t.phoneInvalid;
      case "PHONE_ALREADY_EXISTS":
        return t.phoneExists;
      default:
        if (data?.code?.startsWith("PASSWORD_")) {
          return t.passwordInvalid;
        }

        return t.createError;
    }
  };

  const handleCreateAdministrator = async () => {
    if (isCreating) return;

    const ownerName = form.ownerName.trim();
    const phone = normalizePhoneInput(form.phone);
    const password = form.password;

    setFormError("");

    if (!ownerName) {
      setFormError(t.nameRequired);
      return;
    }

    if (!phone) {
      setFormError(t.phoneRequired);
      return;
    }

    if (!/^07\d{9}$/.test(phone)) {
      setFormError(t.phoneInvalid);
      return;
    }

    if (!password) {
      setFormError(t.passwordRequired);
      return;
    }

    if (!isValidAdminPassword(password)) {
      setFormError(t.passwordInvalid);
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/auth/admins", {
        method: "POST",
        headers: {
          ...getAdminAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          owner_name: ownerName,
          phone,
          password,
          language: form.language,
        }),
      });

      const data = (await response
        .json()
        .catch(() => null)) as CreateAdministratorApiResponse | null;

      if (!response.ok || !data?.ok || !data.admin) {
        setFormError(getCreationErrorMessage(data));
        return;
      }

      setAdministrators((current) => [
        data.admin as AdminAccount,
        ...current.filter((item) => item.id !== data.admin?.id),
      ]);

      toast.success(t.createSuccess);
      setIsCreateDialogOpen(false);
      resetCreateForm();
    } catch (error) {
      console.error("Create administrator request failed:", error);
      setFormError(t.connectionError);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSavePermissions = async () => {
    if (
      isSavingPermissions ||
      !hasPermissionChanges ||
      !selectedAdministrator ||
      selectedAdministrator.admin_role !== "assistant_admin"
    ) {
      return;
    }

    setIsSavingPermissions(true);

    try {
      const response = await fetch(
        `/api/auth/admins/${selectedAdministrator.id}/permissions`,
        {
          method: "PATCH",
          headers: {
            ...getAdminAuthHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            permissions: selectedPermissions,
          }),
        },
      );

      const data = (await response
        .json()
        .catch(() => null)) as UpdateAdministratorPermissionsResponse | null;

      if (!response.ok || !data?.ok || !data.admin) {
        toast.error(permissionText.error);
        return;
      }

      setAdministrators((current) =>
        current.map((administrator) =>
          administrator.id === data.admin?.id
            ? (data.admin as AdminAccount)
            : administrator,
        ),
      );

      setSelectedAdministrator(data.admin);
      setSelectedPermissions(data.admin.permissions ?? []);
      setPermissionDialogOpen(false);
      toast.success(permissionText.success);
    } catch (error) {
      console.error("Update administrator permissions request failed:", error);
      toast.error(permissionText.connectionError);
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const handleToggleAdministratorStatus = async (
    administrator: AdminAccount,
  ) => {
    if (
      administrator.admin_role !== "assistant_admin" ||
      updatingAdministratorStatusId !== null
    ) {
      return;
    }

    const nextEnabled = administrator.admin_enabled === false;

    setUpdatingAdministratorStatusId(administrator.id);

    try {
      const response = await fetch(
        `/api/auth/admins/${administrator.id}/enabled`,
        {
          method: "PATCH",
          headers: {
            ...getAdminAuthHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            enabled: nextEnabled,
          }),
        },
      );

      const data = (await response
        .json()
        .catch(() => null)) as UpdateAdministratorStatusResponse | null;

      if (!response.ok || !data?.ok || !data.admin) {
        toast.error(administratorStatusText.error);
        return;
      }

      setAdministrators((current) =>
        current.map((currentAdministrator) =>
          currentAdministrator.id === data.admin?.id
            ? (data.admin as AdminAccount)
            : currentAdministrator,
        ),
      );

      toast.success(
        nextEnabled
          ? administratorStatusText.enabledSuccess
          : administratorStatusText.disabledSuccess,
      );
    } catch (error) {
      console.error("Update administrator status request failed:", error);
      toast.error(administratorStatusText.connectionError);
    } finally {
      setUpdatingAdministratorStatusId(null);
    }
  };

  return (
    <section className="space-y-3" dir={adminText.dir}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>

          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-7 sm:text-xl">
              {title}
            </h2>

            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end">
          <Button
            type="button"
            className="w-full gap-2 sm:w-auto"
            onClick={() => {
              setFormError("");
              setIsCreateDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t.addButton}
          </Button>

          {!isLoading && !loadError && administrators.length > 0 && (
            <Badge variant="secondary" className="w-fit px-3 py-1.5">
              {t.administratorsCount}: {administrators.length}
            </Badge>
          )}
        </div>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center px-4 py-10 text-center">
            <Loader2
              className="h-8 w-8 animate-spin text-primary"
              aria-hidden="true"
            />

            <p className="mt-4 text-sm text-muted-foreground">{t.loading}</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && loadError && (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center px-4 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <XCircle
                className="h-7 w-7 text-destructive"
                aria-hidden="true"
              />
            </div>

            <h3 className="mt-4 text-base font-semibold sm:text-lg">
              {t.loadError}
            </h3>

            <Button
              type="button"
              variant="outline"
              className="mt-5 gap-2"
              onClick={() => void loadAdministrators()}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t.retry}
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !loadError && administrators.length === 0 && (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center px-4 py-10 text-center sm:px-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Users
                className="h-7 w-7 text-muted-foreground"
                aria-hidden="true"
              />
            </div>

            <h3 className="mt-4 text-base font-semibold sm:text-lg">
              {emptyTitle}
            </h3>

            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              {emptyDescription}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !loadError && administrators.length > 0 && (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {administrators.map((administrator) => {
            const isOwner = administrator.admin_role === "owner_admin";
            const isEnabled = administrator.admin_enabled !== false;

            return (
              <Card key={administrator.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-start justify-between gap-3 border-b bg-muted/30 p-3.5">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        {isOwner ? (
                          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                        ) : (
                          <ShieldUser className="h-5 w-5" aria-hidden="true" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">
                          {administrator.owner_name || "—"}
                        </h3>

                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {isOwner ? t.ownerAdmin : t.assistantAdmin}
                        </p>
                      </div>
                    </div>

                    <Badge
                      variant={isEnabled ? "default" : "secondary"}
                      className="shrink-0"
                    >
                      {isEnabled ? t.enabled : t.disabled}
                    </Badge>
                  </div>

                  <div className="space-y-3 p-3.5">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="flex min-w-0 items-start gap-2 rounded-xl border border-border/70 bg-muted/20 p-2.5">
                        <Phone
                          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />

                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground">
                            {t.phone}
                          </p>
                          <p
                            className="mt-0.5 break-all text-xs font-semibold"
                            dir="ltr"
                          >
                            {administrator.phone || "—"}
                          </p>
                        </div>
                      </div>

                      <div className="flex min-w-0 items-start gap-2 rounded-xl border border-border/70 bg-muted/20 p-2.5">
                        <UserRound
                          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />

                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground">
                            {t.language}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold">
                            {t.languages[administrator.language] ??
                              administrator.language}
                          </p>
                        </div>
                      </div>

                      <div className="flex min-w-0 items-start gap-2 rounded-xl border border-border/70 bg-muted/20 p-2.5">
                        <CalendarDays
                          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />

                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground">
                            {t.createdAt}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold">
                            {formatDate(administrator.created_at, language)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {!isOwner && (
                      <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <span
                              className={
                                "h-3 w-3 shrink-0 rounded-full " +
                                (administrator.work_status === "active"
                                  ? "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.14)]"
                                  : administrator.work_status === "idle"
                                    ? "bg-amber-500"
                                    : "bg-slate-400")
                              }
                              aria-hidden="true"
                            />
                            <span>
                              {administrator.work_status === "active"
                                ? workMonitorText.active
                                : administrator.work_status === "idle"
                                  ? workMonitorText.idle
                                  : workMonitorText.offline}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {workMonitorText.sessions}: {administrator.open_session_count ?? 0}
                          </p>
                          {(administrator.pending_device_count ?? 0) > 0 && (
                            <p className="mt-1 text-xs font-semibold text-orange-600">
                              {administrator.pending_device_count}{" "}
                              {(administrator.pending_device_count ?? 0) === 1
                                ? workMonitorText.pendingDevice
                                : workMonitorText.pendingDevices}
                            </p>
                          )}
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          className="w-full gap-2 sm:w-auto"
                          onClick={() =>
                            setLocation(`/admin/work-monitor/${administrator.id}`)
                          }
                        >
                          <Activity className="h-4 w-4" aria-hidden="true" />
                          {workMonitorText.button}
                          <Badge variant="secondary" className="ms-1 px-1.5 py-0">
                            {administrator.open_session_count ?? 0}
                          </Badge>
                        </Button>
                      </div>
                    )}

                    {!isOwner && (
                      <div className="grid gap-2 border-t pt-3 sm:grid-cols-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => openPermissionDialog(administrator)}
                        >
                          {permissionText.button}
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          className="w-full gap-2"
                          onClick={() => setPasswordResetAdministrator(administrator)}
                        >
                          <KeyRound className="h-4 w-4" aria-hidden="true" />
                          {administratorPasswordText.button}
                        </Button>

                        <Button
                          type="button"
                          variant={
                            administrator.admin_enabled === false
                              ? "default"
                              : "destructive"
                          }
                          className="w-full"
                          disabled={updatingAdministratorStatusId !== null}
                          onClick={() =>
                            void handleToggleAdministratorStatus(administrator)
                          }
                        >
                          {updatingAdministratorStatusId === administrator.id && (
                            <Loader2
                              className="me-2 h-4 w-4 animate-spin"
                              aria-hidden="true"
                            />
                          )}

                          {updatingAdministratorStatusId === administrator.id
                            ? administrator.admin_enabled === false
                              ? administratorStatusText.enabling
                              : administratorStatusText.disabling
                            : administrator.admin_enabled === false
                              ? administratorStatusText.enable
                              : administratorStatusText.disable}
                        </Button>
                      </div>
                    )}

                    {administrator.must_change_password && !isOwner && (
                      <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-700">
                        {administratorPasswordText.required}
                      </Badge>
                    )}

                    <div className="flex items-center gap-2 border-t pt-3 text-xs">
                      {administrator.otp_verified ? (
                        <>
                          <CheckCircle2
                            className="h-4 w-4 text-green-600"
                            aria-hidden="true"
                          />
                          <span>{t.verified}</span>
                        </>
                      ) : (
                        <>
                          <XCircle
                            className="h-4 w-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="text-muted-foreground">
                            {t.notVerified}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AssistantPasswordResetDialog
        open={passwordResetAdministrator !== null}
        administratorId={passwordResetAdministrator?.id || ""}
        administratorName={passwordResetAdministrator?.owner_name || ""}
        onOpenChange={(open) => {
          if (!open) setPasswordResetAdministrator(null);
        }}
        onSuccess={() => {
          setPasswordResetAdministrator(null);
          void loadAdministrators();
        }}
      />

      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogChange}>
        <DialogContent
          className={
            adminText.dir === "rtl"
              ? "sm:max-w-lg [&>button]:left-4 [&>button]:right-auto"
              : "sm:max-w-lg"
          }
          dir={adminText.dir}
          onEscapeKeyDown={(event) => {
            if (isCreating) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (isCreating) event.preventDefault();
          }}
        >
          <DialogHeader
            className={
              language === "ar" || language === "ku"
                ? "text-right sm:!text-right"
                : adminText.dir === "rtl"
                  ? "text-right"
                  : "text-left"
            }
          >
            <DialogTitle>{t.dialogTitle}</DialogTitle>
            <DialogDescription>{t.dialogDescription}</DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateAdministrator();
            }}
          >
            <div className="space-y-2">
              <Label
                htmlFor="administrator-owner-name"
                className="block min-h-5 leading-5"
              >
                {t.nameLabel}
              </Label>

              <Input
                id="administrator-owner-name"
                value={form.ownerName}
                disabled={isCreating}
                autoComplete="name"
                maxLength={100}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    ownerName: event.target.value,
                  }));
                  setFormError("");
                }}
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="administrator-phone"
                className="block min-h-5 leading-5"
              >
                {t.phoneInputLabel}
              </Label>

              <Input
                id="administrator-phone"
                value={form.phone}
                disabled={isCreating}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={11}
                dir="ltr"
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    phone: normalizePhoneInput(event.target.value),
                  }));
                  setFormError("");
                }}
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="administrator-password"
                className="block min-h-5 leading-5"
              >
                {t.passwordLabel}
              </Label>

              <div className="relative">
                <Input
                  id="administrator-password"
                  value={form.password}
                  disabled={isCreating}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  dir="ltr"
                  className="pe-11"
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }));
                    setFormError("");
                  }}
                />

                {language === "ar" || language === "ku" ? (
                  <button
                    type="button"
                    aria-label={t.passwordLabel}
                    disabled={isCreating}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}

                    <span className="sr-only">{t.passwordLabel}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label={t.passwordLabel}
                    disabled={isCreating}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}

                    <span className="sr-only">{t.passwordLabel}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="administrator-language"
                className="block min-h-5 leading-5"
              >
                {t.languageInputLabel}
              </Label>

              <Select
                value={form.language}
                disabled={isCreating}
                onValueChange={(value) => {
                  setForm((current) => ({
                    ...current,
                    language: value as SupportedLanguage,
                  }));
                  setFormError("");
                }}
              >
                <SelectTrigger id="administrator-language">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent dir={adminText.dir}>
                  <SelectItem value="ar">{t.languages.ar}</SelectItem>
                  <SelectItem value="en">{t.languages.en}</SelectItem>
                  <SelectItem value="ku">{t.languages.ku}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={isCreating}
                onClick={() => handleCreateDialogChange(false)}
              >
                {t.cancel}
              </Button>

              <Button type="submit" disabled={isCreating}>
                {isCreating && (
                  <Loader2
                    className="me-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}

                {isCreating ? t.creating : t.create}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={permissionDialogOpen}
        onOpenChange={(open) => {
          if (isSavingPermissions) return;

          setPermissionDialogOpen(open);

          if (!open) {
            setSelectedAdministrator(null);
            setSelectedPermissions([]);
          }
        }}
      >
        <DialogContent
          className={
            adminText.dir === "rtl"
              ? "sm:max-w-lg [&>button]:left-4 [&>button]:right-auto"
              : "sm:max-w-lg"
          }
          dir={adminText.dir}
          onEscapeKeyDown={(event) => {
            if (isSavingPermissions) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (isSavingPermissions) event.preventDefault();
          }}
        >
          <DialogHeader
            className={
              adminText.dir === "rtl"
                ? "pl-14 text-right sm:!text-right"
                : "pr-14 text-left"
            }
          >
            <DialogTitle>{permissionText.title}</DialogTitle>

            <DialogDescription>
              <span className="block">{permissionText.description}</span>
              {selectedAdministrator?.owner_name && (
                <span className="mt-1 block" dir="auto">
                  ({selectedAdministrator.owner_name})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {permissionList.map((permission) => (
              <div
                key={permission}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <Checkbox
                  id={`administrator-permission-${permission}`}
                  checked={selectedPermissions.includes(permission)}
                  disabled={isSavingPermissions}
                  onCheckedChange={(checked) =>
                    togglePermission(permission, checked === true)
                  }
                />

                <Label
                  htmlFor={`administrator-permission-${permission}`}
                  className="flex-1 cursor-pointer leading-6"
                >
                  {permissionText[permission]}
                </Label>
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isSavingPermissions}
              onClick={() => setPermissionDialogOpen(false)}
            >
              {permissionText.cancel}
            </Button>

            <Button
              type="button"
              disabled={
                isSavingPermissions ||
                !selectedAdministrator ||
                !hasPermissionChanges
              }
              onClick={() => void handleSavePermissions()}
            >
              {isSavingPermissions && (
                <Loader2
                  className="me-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}

              {isSavingPermissions
                ? permissionText.saving
                : permissionText.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
