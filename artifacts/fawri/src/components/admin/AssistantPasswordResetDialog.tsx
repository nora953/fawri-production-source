import { ASSISTANT_PASSWORD_RESET_DIALOG_TEXT } from '@/lib/translations/features/components/admin/AssistantPasswordResetDialog';
import { useEffect, useState } from "react";
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
  const text = ASSISTANT_PASSWORD_RESET_DIALOG_TEXT[lang];

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
          <div className={lang === "ar" ? "space-y-1" : "space-y-2"}>
            <Label htmlFor="owner-confirm-password" className={lang === "ar" ? "block leading-6" : undefined}>{text.ownerPassword}</Label>
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

          <div className={lang === "ar" ? "space-y-1" : "space-y-2"}>
            <Label htmlFor="assistant-temporary-password" className={lang === "ar" ? "block leading-6" : undefined}>{text.temporaryPassword}</Label>
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

          <div className={lang === "ar" ? "space-y-1" : "space-y-2"}>
            <Label htmlFor="assistant-temporary-password-confirm" className={lang === "ar" ? "block leading-6" : undefined}>{text.confirmPassword}</Label>
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
