import { useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { OWNER_RECOVERY_COPY } from "@/lib/ownerRecoveryCopy";
import { validatePassword } from "@/lib/validators";

type Stage = "key1" | "phone" | "confirm" | "success";

async function request(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(value?.error || value?.code || "REQUEST_FAILED"));
    (error as Error & { code?: string }).code = String(value?.code || "REQUEST_FAILED");
    throw error;
  }
  return value;
}

export default function OwnerRecoveryPage({ recoveryId }: { recoveryId: string }) {
  const { lang, dir, t } = useI18n();
  const [, setLocation] = useLocation();
  const copy = OWNER_RECOVERY_COPY[lang];
  const basePath = `/api/auth/owner-recovery/${encodeURIComponent(recoveryId)}`;
  const fieldLabelClass = "text-[13px] leading-4";
  const fieldHeaderClass = "flex min-h-4 items-center justify-between gap-3";
  const fieldInputClass = "h-10 rounded-xl";
  const fieldBlockClass = "space-y-1.5";
  const sectionClass = "space-y-3";
  const fieldInvalidInputClass = "border-red-500 focus-visible:ring-red-500";

  const [stage, setStage] = useState<Stage>("key1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [oldPhone, setOldPhone] = useState("");
  const [key1, setKey1] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [confirmNewPhone, setConfirmNewPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [forgotPassword, setForgotPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmNewPasswordError, setConfirmNewPasswordError] = useState("");
  const [key2, setKey2] = useState("");
  const [key2Open, setKey2Open] = useState(false);

  const fail = () => {
    setNotice("");
    setError(copy.genericError);
  };

  const getPasswordError = (password: string) => {
    if (!password) return "";
    if (password.length < 8) return t.signup_password_min;
    if (/[\u0600-\u06FF]/.test(password)) return t.signup_password_english_only;
    if (/[^A-Za-z0-9@#$%&!_-]/.test(password)) return t.signup_password_allowed_symbols;
    if (!/[A-Z]/.test(password)) return t.signup_password_uppercase;
    if (!/[0-9]/.test(password)) return t.signup_password_number;
    return "";
  };

  const getConfirmPasswordError = (password: string, confirmation: string) => {
    if (!confirmation) return t.signup_confirm_password_required;
    return password === confirmation ? "" : t.signup_confirm_password_mismatch;
  };

  const start = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request(`${basePath}/start`, {
        key_1: key1.trim().toLowerCase(),
      });
      setKey1("");
      setStage("phone");
    } catch {
      fail();
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await request(`${basePath}/otp/request`, {
        old_phone: oldPhone,
        new_phone: newPhone,
        confirm_new_phone: confirmNewPhone,
      });
      setOtpRequested(true);
      setDevCode(String(value?.devCode || ""));
      setNotice(copy.otpSent);
    } catch {
      fail();
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`${basePath}/otp/verify`, { code: otp.trim() });
      setOtp("");
      setDevCode("");
      setNotice(copy.otpVerified);
      setStage("confirm");
    } catch {
      fail();
    } finally {
      setBusy(false);
    }
  };

  const openFinalConfirmation = () => {
    setError("");
    if (forgotPassword) {
      const passwordError = validatePassword(newPassword)
        ? ""
        : getPasswordError(newPassword) || t.password_error;
      const confirmationError = getConfirmPasswordError(newPassword, confirmNewPassword);
      setNewPasswordError(passwordError);
      setConfirmNewPasswordError(confirmationError);
      if (passwordError || confirmationError) return;
    } else if (!currentPassword) {
      fail();
      return;
    }
    setKey2Open(true);
  };

  const complete = async () => {
    setBusy(true);
    setError("");
    try {
      await request(`${basePath}/complete`, {
        key_2: key2.trim().toLowerCase(),
        forgot_password: forgotPassword,
        current_password: forgotPassword ? "" : currentPassword,
        new_password: forgotPassword ? newPassword : "",
        confirm_new_password: forgotPassword ? confirmNewPassword : "",
      });
      setKey2("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setNewPasswordError("");
      setConfirmNewPasswordError("");
      setKey2Open(false);
      setStage("success");
    } catch {
      fail();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main dir={dir} className="min-h-[100dvh] bg-muted/30 px-3 py-3 sm:px-4 sm:py-4">
      <div className="mx-auto max-w-lg">
        <div className="mb-2 flex items-center justify-center">
          <img src="/fawri-logo.svg" alt="Fawri" className="h-10 w-auto" />
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-1.5 px-5 pb-3 pt-4 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <CardTitle className="text-xl font-black">{copy.portalTitle}</CardTitle>
            <p className="text-xs leading-5 text-muted-foreground">{copy.portalIntro}</p>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-4">
            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-2.5 text-xs font-semibold text-destructive">
                {error}
              </div>
            )}
            {notice && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                {notice}
              </div>
            )}

            {stage === "key1" && (
              <form onSubmit={start} className={sectionClass}>
                <div className={fieldBlockClass}>
                  <div className={fieldHeaderClass}>
                    <Label htmlFor="key-1" className={fieldLabelClass}>{copy.key1Label}</Label>
                  </div>
                  <Input
                    id="key-1"
                    dir="ltr"
                    autoComplete="off"
                    spellCheck={false}
                    value={key1}
                    onChange={(event) => setKey1(event.target.value)}
                    className={fieldInputClass}
                  />
                </div>
                <Button className="h-10 w-full gap-2 rounded-xl" disabled={busy || !key1.trim()} type="submit">
                  <KeyRound className="h-4 w-4" />
                  {busy ? copy.saving : copy.start}
                </Button>
              </form>
            )}

            {stage === "phone" && (
              <div className={sectionClass}>
                <div className={fieldBlockClass}>
                  <div className={fieldHeaderClass}>
                    <Label htmlFor="old-phone" className={fieldLabelClass}>{copy.oldPhone}</Label>
                  </div>
                  <Input
                    id="old-phone"
                    dir="ltr"
                    inputMode="tel"
                    autoComplete="tel"
                    value={oldPhone}
                    onChange={(event) => setOldPhone(event.target.value)}
                    placeholder="07XXXXXXXXX"
                    disabled={otpRequested}
                    className={fieldInputClass}
                  />
                </div>
                <div className={fieldBlockClass}>
                  <div className={fieldHeaderClass}>
                    <Label htmlFor="new-phone" className={fieldLabelClass}>{copy.newPhone}</Label>
                  </div>
                  <Input
                    id="new-phone"
                    dir="ltr"
                    inputMode="tel"
                    value={newPhone}
                    onChange={(event) => setNewPhone(event.target.value)}
                    placeholder="07XXXXXXXXX"
                    disabled={otpRequested}
                    className={fieldInputClass}
                  />
                </div>
                <div className={fieldBlockClass}>
                  <div className={fieldHeaderClass}>
                    <Label htmlFor="confirm-phone" className={fieldLabelClass}>{copy.confirmNewPhone}</Label>
                  </div>
                  <Input
                    id="confirm-phone"
                    dir="ltr"
                    inputMode="tel"
                    value={confirmNewPhone}
                    onChange={(event) => setConfirmNewPhone(event.target.value)}
                    placeholder="07XXXXXXXXX"
                    disabled={otpRequested}
                    className={fieldInputClass}
                  />
                </div>
                {!otpRequested ? (
                  <Button
                    className="h-10 w-full gap-2 rounded-xl"
                    disabled={busy || !oldPhone || !newPhone || !confirmNewPhone}
                    onClick={() => void sendOtp()}
                  >
                    <Smartphone className="h-4 w-4" />
                    {busy ? copy.saving : copy.sendOtp}
                  </Button>
                ) : (
                  <>
                    <div className={fieldBlockClass}>
                      <div className={fieldHeaderClass}>
                        <Label htmlFor="otp" className={fieldLabelClass}>{copy.otp}</Label>
                      </div>
                      <Input
                        id="otp"
                        dir="ltr"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={otp}
                        onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                        className={fieldInputClass}
                      />
                      {devCode && (
                        <p dir="ltr" className="text-[11px] text-muted-foreground">
                          Local preview OTP: {devCode}
                        </p>
                      )}
                    </div>
                    <Button className="h-10 w-full rounded-xl" disabled={busy || otp.length !== 6} onClick={() => void verifyOtp()}>
                      {busy ? copy.saving : copy.verifyOtp}
                    </Button>
                  </>
                )}
              </div>
            )}

            {stage === "confirm" && (
              <div className={sectionClass}>
                <button
                  type="button"
                  className="text-xs font-bold text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    setForgotPassword((value) => !value);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmNewPassword("");
                    setNewPasswordError("");
                    setConfirmNewPasswordError("");
                  }}
                >
                  {copy.forgotPassword}
                </button>

                {!forgotPassword ? (
                  <div className={fieldBlockClass}>
                    <div className={fieldHeaderClass}>
                      <Label htmlFor="current-password" className={fieldLabelClass}>{copy.currentPassword}</Label>
                    </div>
                    <PasswordInput
                      id="current-password"
                      dir="ltr"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      className={fieldInputClass}
                    />
                  </div>
                ) : (
                  <>
                    <div className={fieldBlockClass}>
                      <div className={fieldHeaderClass}>
                        <Label htmlFor="new-password" className={fieldLabelClass}>{copy.newPassword}</Label>
                      </div>
                      <PasswordInput
                        id="new-password"
                        dir="ltr"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(event) => {
                          const value = event.target.value;
                          setNewPassword(value);
                          setNewPasswordError(getPasswordError(value));
                          setConfirmNewPasswordError(
                            confirmNewPassword ? getConfirmPasswordError(value, confirmNewPassword) : "",
                          );
                        }}
                        onBlur={() => setNewPasswordError(getPasswordError(newPassword))}
                        aria-invalid={!!newPasswordError}
                        className={`${fieldInputClass} ${newPasswordError ? fieldInvalidInputClass : ""}`}
                      />
                      {newPasswordError && (
                        <p className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700" role="alert">
                          {newPasswordError}
                        </p>
                      )}
                    </div>
                    <div className={fieldBlockClass}>
                      <div className={fieldHeaderClass}>
                        <Label htmlFor="confirm-password" className={fieldLabelClass}>{copy.confirmNewPassword}</Label>
                      </div>
                      <PasswordInput
                        id="confirm-password"
                        dir="ltr"
                        autoComplete="new-password"
                        value={confirmNewPassword}
                        onChange={(event) => {
                          const value = event.target.value;
                          setConfirmNewPassword(value);
                          setConfirmNewPasswordError(getConfirmPasswordError(newPassword, value));
                        }}
                        onBlur={() => setConfirmNewPasswordError(getConfirmPasswordError(newPassword, confirmNewPassword))}
                        aria-invalid={!!confirmNewPasswordError}
                        className={`${fieldInputClass} ${confirmNewPasswordError ? fieldInvalidInputClass : ""}`}
                      />
                      {confirmNewPasswordError && (
                        <p className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700" role="alert">
                          {confirmNewPasswordError}
                        </p>
                      )}
                    </div>
                  </>
                )}

                <Button className="h-10 w-full gap-2 rounded-xl" disabled={busy} onClick={openFinalConfirmation}>
                  <LockKeyhole className="h-4 w-4" />
                  {copy.confirmRecovery}
                </Button>
              </div>
            )}

            {stage === "success" && (
              <div className="space-y-3 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-black">{copy.successTitle}</h2>
                <p className="text-xs leading-5 text-muted-foreground">{copy.successBody}</p>
                <Button className="h-10 w-full rounded-xl" onClick={() => setLocation("/login")}>
                  {copy.login}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={key2Open} onOpenChange={(open) => !busy && setKey2Open(open)}>
        <DialogContent dir={dir} className="rounded-2xl sm:max-w-md">
          <DialogHeader className="space-y-1.5">
            <DialogTitle className="text-lg font-black">{copy.key2Title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-xs leading-5 text-muted-foreground">{copy.key2Help}</p>
            <div className={fieldBlockClass}>
              <div className={fieldHeaderClass}>
                <Label htmlFor="key-2" className={fieldLabelClass}>{copy.key2}</Label>
              </div>
              <Input
                id="key-2"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                value={key2}
                onChange={(event) => setKey2(event.target.value)}
                className={fieldInputClass}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-3">
            <Button className="h-10 rounded-xl" variant="outline" disabled={busy} onClick={() => setKey2Open(false)}>
              {copy.cancel}
            </Button>
            <Button className="h-10 rounded-xl" disabled={busy || !key2.trim()} onClick={() => void complete()}>
              {busy ? copy.saving : copy.complete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
