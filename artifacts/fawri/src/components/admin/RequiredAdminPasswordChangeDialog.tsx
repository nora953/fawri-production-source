import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { getAdminAuthHeaders, setAdminSessionToken } from "@/lib/store";
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
          ...getAdminAuthHeaders(),
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
          <div className={lang === "ar" ? "space-y-1" : "space-y-2"}>
            <Label htmlFor="required-admin-new-password" className={lang === "ar" ? "block leading-6" : undefined}>{text.password}</Label>
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

          <div className={lang === "ar" ? "space-y-1" : "space-y-2"}>
            <Label htmlFor="required-admin-confirm-password" className={lang === "ar" ? "block leading-6" : undefined}>{text.confirm}</Label>
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
