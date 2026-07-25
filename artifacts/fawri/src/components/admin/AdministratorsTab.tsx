import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
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
  X,
  XCircle,
} from "lucide-react";

import { getAdminAuthHeaders } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
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
  ];

  const permissionText = {
    ar: {
      button: "إدارة الصلاحيات",
      title: "صلاحيات المسؤول المساعد",
      description: "حدد الأقسام والإجراءات التي يستطيع هذا المسؤول الوصول إليها.",
      view_merchants: "عرض التجار",
      manage_merchant_status: "إدارة حالة التجار",
      manage_subscriptions: "إدارة الاشتراكات",
      manage_channels: "إدارة القنوات",
      view_logs: "عرض سجل النشاط",
      inspect_merchant_sessions: "جلسات فحص حساب التاجر",
      manage_support: "إدارة الدعم",
      cancel: "إلغاء",
      save: "حفظ الصلاحيات",
      saving: "جارٍ الحفظ...",
      success: "تم تحديث صلاحيات المسؤول بنجاح",
      error: "تعذر تحديث الصلاحيات",
      connectionError: "تعذر الاتصال بالخادم",
    },
    en: {
      button: "Manage permissions",
      title: "Assistant administrator permissions",
      description: "Select the sections and actions this administrator can access.",
      view_merchants: "View merchants",
      manage_merchant_status: "Manage merchant status",
      manage_subscriptions: "Manage subscriptions",
      manage_channels: "Manage channels",
      view_logs: "View activity logs",
      inspect_merchant_sessions: "Inspect merchant sessions",
      manage_support: "Manage support",
      cancel: "Cancel",
      save: "Save permissions",
      saving: "Saving...",
      success: "Administrator permissions updated successfully",
      error: "Could not update permissions",
      connectionError: "Could not connect to the server",
    },
    ku: {
      button: "بەڕێوەبردنی دەسەڵاتەکان",
      title: "دەسەڵاتەکانی بەڕێوەبەری یاریدەدەر",
      description: "ئەو بەشانە دیاری بکە کە ئەم بەڕێوەبەرە دەتوانێت دەستی پێیان بگات.",
      view_merchants: "بینینی بازرگانان",
      manage_merchant_status: "بەڕێوەبردنی دۆخی بازرگانان",
      manage_subscriptions: "بەڕێوەبردنی بەشداریکردنەکان",
      manage_channels: "بەڕێوەبردنی کەناڵەکان",
      view_logs: "بینینی تۆماری چالاکی",
      inspect_merchant_sessions: "دانیشتنەکانی پشکنینی هەژماری بازرگان",
      manage_support: "بەڕێوەبردنی پشتگیری",
      cancel: "هەڵوەشاندنەوە",
      save: "پاشەکەوتکردنی دەسەڵاتەکان",
      saving: "پاشەکەوت دەکرێت...",
      success: "دەسەڵاتەکانی بەڕێوەبەر بە سەرکەوتوویی نوێکرانەوە",
      error: "نوێکردنەوەی دەسەڵاتەکان سەرکەوتوو نەبوو",
      connectionError: "پەیوەندی بە ڕاژەکارەوە نەکرا",
    },
  }[language];

  const administratorStatusText = {
    ar: {
      enable: "تفعيل المسؤول",
      disable: "تعطيل المسؤول",
      enabling: "جارٍ التفعيل...",
      disabling: "جارٍ التعطيل...",
      enabledSuccess: "تم تفعيل المسؤول بنجاح",
      disabledSuccess: "تم تعطيل المسؤول بنجاح",
      error: "تعذر تحديث حالة المسؤول",
      connectionError: "تعذر الاتصال بالخادم",
    },
    en: {
      enable: "Enable administrator",
      disable: "Disable administrator",
      enabling: "Enabling...",
      disabling: "Disabling...",
      enabledSuccess: "Administrator enabled successfully",
      disabledSuccess: "Administrator disabled successfully",
      error: "Unable to update administrator status",
      connectionError: "Unable to connect to the server",
    },
    ku: {
      enable: "چالاککردنی بەڕێوەبەر",
      disable: "ناچالاککردنی بەڕێوەبەر",
      enabling: "چالاک دەکرێت...",
      disabling: "ناچالاک دەکرێت...",
      enabledSuccess: "بەڕێوەبەر بە سەرکەوتوویی چالاک کرا",
      disabledSuccess: "بەڕێوەبەر بە سەرکەوتوویی ناچالاک کرا",
      error: "نوێکردنەوەی دۆخی بەڕێوەبەر سەرکەوتوو نەبوو",
      connectionError: "پەیوەندی بە ڕاژەکارەوە نەکرا",
    },
  }[language];

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
  const [updatingAdministratorStatusId, setUpdatingAdministratorStatusId] =
    useState<string | null>(null);
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

  const loadAdministrators = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);

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
      setAdministrators([]);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdministrators();
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
    <section className="space-y-4" dir={adminText.dir}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
        <div className="grid gap-4 lg:grid-cols-2">
          {administrators.map((administrator) => {
            const isOwner = administrator.admin_role === "owner_admin";
            const isEnabled = administrator.admin_enabled !== false;

            return (
              <Card key={administrator.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-start justify-between gap-3 border-b bg-muted/30 p-4 sm:p-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
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

                        <p className="mt-1 truncate text-sm text-muted-foreground">
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

                  <div className="space-y-4 p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <Phone
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />

                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {t.phone}
                        </p>
                        <p
                          className="mt-1 break-all text-sm font-medium"
                          dir="ltr"
                        >
                          {administrator.phone || "—"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <UserRound
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />

                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {t.language}
                        </p>
                        <p className="mt-1 text-sm font-medium">
                          {t.languages[administrator.language] ??
                            administrator.language}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <CalendarDays
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />

                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {t.createdAt}
                        </p>
                        <p className="mt-1 text-sm font-medium">
                          {formatDate(administrator.created_at, language)}
                        </p>
                      </div>
                    </div>

                    {!isOwner && (
                      <div className="space-y-2 border-t pt-4">
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

                    <div className="flex items-center gap-2 border-t pt-4 text-sm">
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

      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogChange}>
        <DialogContent
          className="max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] overflow-hidden p-0 shadow-2xl sm:max-w-xl sm:rounded-2xl [&>button]:hidden"
          dir={adminText.dir}
          onEscapeKeyDown={(event) => {
            if (isCreating) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (isCreating) event.preventDefault();
          }}
        >
          <DialogHeader className="border-b px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div
                className={
                  adminText.dir === "rtl"
                    ? "min-w-0 flex-1 text-right"
                    : "min-w-0 flex-1 text-left"
                }
              >
                <DialogTitle className="text-xl leading-7">
                  {t.dialogTitle}
                </DialogTitle>
                <DialogDescription className="mt-1 leading-6">
                  {t.dialogDescription}
                </DialogDescription>
              </div>

              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={isCreating}
                  className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground shadow-none"
                  aria-label={t.cancel}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">{t.cancel}</span>
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateAdministrator();
            }}
          >
            <div className="space-y-4 overflow-y-auto px-6 py-5">
              <div className="space-y-1.5">
                <Label
                  htmlFor="administrator-owner-name"
                  className="text-sm font-medium"
                >
                  {t.nameLabel}
                </Label>

                <Input
                  id="administrator-owner-name"
                  value={form.ownerName}
                  disabled={isCreating}
                  autoComplete="name"
                  maxLength={100}
                  className="h-11"
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      ownerName: event.target.value,
                    }));
                    setFormError("");
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="administrator-phone"
                  className="text-sm font-medium"
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
                  className="h-11 text-left"
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      phone: normalizePhoneInput(event.target.value),
                    }));
                    setFormError("");
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="administrator-password"
                  className="text-sm font-medium"
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
                    className="h-11 pe-12"
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }));
                      setFormError("");
                    }}
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isCreating}
                    className="absolute end-1.5 top-1/2 z-10 h-8 w-8 -translate-y-1/2 rounded-lg text-muted-foreground"
                    aria-label={t.passwordLabel}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}

                    <span className="sr-only">{t.passwordLabel}</span>
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="administrator-language"
                  className="text-sm font-medium"
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
                  <SelectTrigger id="administrator-language" className="h-11">
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
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm leading-6 text-destructive"
                >
                  {formError}
                </div>
              )}
            </div>

            <DialogFooter
              className={
                adminText.dir === "rtl"
                  ? "!flex-row-reverse !justify-end gap-3 border-t bg-muted/20 px-6 py-4 sm:space-x-0"
                  : "!flex-row !justify-end gap-3 border-t bg-muted/20 px-6 py-4 sm:space-x-0"
              }
            >
              <Button
                type="button"
                variant="outline"
                disabled={isCreating}
                className="min-w-24"
                onClick={() => handleCreateDialogChange(false)}
              >
                {t.cancel}
              </Button>

              <Button
                type="submit"
                disabled={isCreating}
                className="min-w-28"
              >
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
          className="sm:max-w-lg"
          dir={adminText.dir}
          onEscapeKeyDown={(event) => {
            if (isSavingPermissions) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (isSavingPermissions) event.preventDefault();
          }}
        >
          <DialogHeader
            className={adminText.dir === "rtl" ? "text-right" : "text-left"}
          >
            <DialogTitle>{permissionText.title}</DialogTitle>

            <DialogDescription>
              {permissionText.description}
              {selectedAdministrator?.owner_name
                ? ` (${selectedAdministrator.owner_name})`
                : ""}
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
              disabled={isSavingPermissions || !selectedAdministrator}
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
