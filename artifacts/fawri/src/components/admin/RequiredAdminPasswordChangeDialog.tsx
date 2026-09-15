import { REQUIRED_ADMIN_PASSWORD_CHANGE_DIALOG_TEXT } from '@/lib/translations/features/components/admin/RequiredAdminPasswordChangeDialog';
import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { getStableAuthDeviceId } from "@/lib/authClientCutover";
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
    /^[A-Za-z0-9@#$%&!_-]+$/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}

export default function RequiredAdminPasswordChangeDialog({
  admin,
  onChanged,
}: Props) {
  const { lang } = useI18n();
  const text = REQUIRED_ADMIN_PASSWORD_CHANGE_DIALOG_TEXT[lang];

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
      const response = await fetch("/api/auth/admin/change-password", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Fawri-Device-Id": getStableAuthDeviceId(),
        },
        body: JSON.stringify({
          new_password: password,
          confirm_password: confirmPassword,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || data?.reauthentication_required !== true) {
        if (data?.code === "PASSWORD_CONFIRMATION_INVALID") {
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

      onChanged({ ...admin, must_change_password: false });
      setPassword("");
      setConfirmPassword("");
      toast.success(text.success);
      window.location.href = "/login";
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
