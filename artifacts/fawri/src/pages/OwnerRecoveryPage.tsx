import { FormEvent, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { OWNER_RECOVERY_COPY } from "@/lib/ownerRecoveryCopy";

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
  const { lang, dir } = useI18n();
  const [, setLocation] = useLocation();
  const copy = OWNER_RECOVERY_COPY[lang];
  const basePath = `/api/auth/owner-recovery/${encodeURIComponent(recoveryId)}`;

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
  const [key2, setKey2] = useState("");
  const [key2Open, setKey2Open] = useState(false);

  const fail = () => {
    setNotice("");
    setError(copy.genericError);
  };

  const start = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request(`${basePath}/start`, {
        old_phone: oldPhone,
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
      if (!newPassword || newPassword !== confirmNewPassword) {
        fail();
        return;
      }
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
      setKey2Open(false);
      setStage("success");
    } catch {
      fail();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main dir={dir} className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-xl">
        <div className="mb-5 flex items-center justify-center">
          <img src="/fawri-logo.svg" alt="Fawri" className="h-14 w-auto" />
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-black">{copy.portalTitle}</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">{copy.portalIntro}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm font-semibold text-destructive">
                {error}
              </div>
            )}
            {notice && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                {notice}
              </div>
            )}

            {stage === "key1" && (
              <form onSubmit={start} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="old-phone">{copy.oldPhone}</Label>
                  <Input
                    id="old-phone"
                    dir="ltr"
                    inputMode="tel"
                    autoComplete="tel"
                    value={oldPhone}
                    onChange={(event) => setOldPhone(event.target.value)}
                    placeholder="07XXXXXXXXX"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="key-1">{copy.key1Label}</Label>
                  <Input
                    id="key-1"
                    dir="ltr"
                    autoComplete="off"
                    spellCheck={false}
                    value={key1}
                    onChange={(event) => setKey1(event.target.value)}
                  />
                </div>
                <Button className="w-full gap-2" disabled={busy} type="submit">
                  <KeyRound className="h-4 w-4" />
                  {busy ? copy.saving : copy.start}
                </Button>
              </form>
            )}

            {stage === "phone" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-phone">{copy.newPhone}</Label>
                  <Input
                    id="new-phone"
                    dir="ltr"
                    inputMode="tel"
                    value={newPhone}
                    onChange={(event) => setNewPhone(event.target.value)}
                    placeholder="07XXXXXXXXX"
                    disabled={otpRequested}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-phone">{copy.confirmNewPhone}</Label>
                  <Input
                    id="confirm-phone"
                    dir="ltr"
                    inputMode="tel"
                    value={confirmNewPhone}
                    onChange={(event) => setConfirmNewPhone(event.target.value)}
                    placeholder="07XXXXXXXXX"
                    disabled={otpRequested}
                  />
                </div>
                {!otpRequested ? (
                  <Button className="w-full gap-2" disabled={busy} onClick={() => void sendOtp()}>
                    <Smartphone className="h-4 w-4" />
                    {busy ? copy.saving : copy.sendOtp}
                  </Button>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="otp">{copy.otp}</Label>
                      <Input
                        id="otp"
                        dir="ltr"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={otp}
                        onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                      />
                      {devCode && (
                        <p dir="ltr" className="text-xs text-muted-foreground">
                          Local preview OTP: {devCode}
                        </p>
                      )}
                    </div>
                    <Button className="w-full" disabled={busy} onClick={() => void verifyOtp()}>
                      {busy ? copy.saving : copy.verifyOtp}
                    </Button>
                  </>
                )}
              </div>
            )}

            {stage === "confirm" && (
              <div className="space-y-4">
                <button
                  type="button"
                  className="text-sm font-bold text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    setForgotPassword((value) => !value);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmNewPassword("");
                  }}
                >
                  {copy.forgotPassword}
                </button>

                {!forgotPassword ? (
                  <div className="space-y-2">
                    <Label htmlFor="current-password">{copy.currentPassword}</Label>
                    <Input
                      id="current-password"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="new-password">{copy.newPassword}</Label>
                      <Input
                        id="new-password"
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">{copy.confirmNewPassword}</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        autoComplete="new-password"
                        value={confirmNewPassword}
                        onChange={(event) => setConfirmNewPassword(event.target.value)}
                      />
                    </div>
                  </>
                )}

                <Button className="w-full gap-2" disabled={busy} onClick={openFinalConfirmation}>
                  <LockKeyhole className="h-4 w-4" />
                  {copy.confirmRecovery}
                </Button>
              </div>
            )}

            {stage === "success" && (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                  <ShieldCheck className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-black">{copy.successTitle}</h2>
                <p className="text-sm leading-6 text-muted-foreground">{copy.successBody}</p>
                <Button className="w-full" onClick={() => setLocation("/login")}>
                  {copy.login}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={key2Open} onOpenChange={(open) => !busy && setKey2Open(open)}>
        <DialogContent dir={dir}>
          <DialogHeader>
            <DialogTitle>{copy.key2Title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">{copy.key2Help}</p>
            <div className="space-y-2">
              <Label htmlFor="key-2">{copy.key2}</Label>
              <Input
                id="key-2"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                value={key2}
                onChange={(event) => setKey2(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setKey2Open(false)}>
              {copy.cancel}
            </Button>
            <Button disabled={busy || !key2.trim()} onClick={() => void complete()}>
              {busy ? copy.saving : copy.complete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
