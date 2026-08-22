import { useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { getStableAuthDeviceId } from "@/lib/authClientCutover";
import { useI18n } from "@/lib/i18n";
import { OWNER_RECOVERY_COPY } from "@/lib/ownerRecoveryCopy";

type RecoveryStatus = {
  enabled: boolean;
  created_at: string | null;
  used_at: string | null;
};

type RecoveryBundle = {
  recovery_path: string;
  key_1: string;
  key_2: string;
  created_at: string;
};

async function jsonRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Fawri-Device-Id": getStableAuthDeviceId(),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(body?.error || body?.code || "REQUEST_FAILED"));
    (error as Error & { code?: string }).code = String(body?.code || "REQUEST_FAILED");
    throw error;
  }
  return body;
}

export default function OwnerRecoverySetupPage() {
  const { lang, dir } = useI18n();
  const [, setLocation] = useLocation();
  const copy = OWNER_RECOVERY_COPY[lang];
  const fieldLabelClass = "leading-5";
  const fieldHeaderClass = "flex min-h-5 items-center justify-between gap-3";
  const fieldInputClass = "h-12 rounded-xl";
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [bundle, setBundle] = useState<RecoveryBundle | null>(null);
  const [ownerPassword, setOwnerPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const recoveryUrl = useMemo(() => {
    if (!bundle?.recovery_path) return "";
    return `${window.location.origin}${bundle.recovery_path}`;
  }, [bundle]);

  useEffect(() => {
    let alive = true;
    void jsonRequest("/api/auth/admin/owner-recovery/status")
      .then((value) => {
        if (!alive) return;
        setStatus({
          enabled: value.enabled === true,
          created_at: value.created_at || null,
          used_at: value.used_at || null,
        });
      })
      .catch((caught) => {
        if (!alive) return;
        const code = String((caught as Error & { code?: string })?.code || "");
        if (code === "OWNER_ADMIN_REQUIRED" || code === "AUTH_SESSION_INVALID") {
          setLocation("/admin");
          return;
        }
        setError(copy.genericError);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [copy.genericError, setLocation]);

  const generate = async () => {
    if (!ownerPassword) return;
    setGenerating(true);
    setError("");
    setBundle(null);
    try {
      const value = await jsonRequest("/api/auth/admin/owner-recovery/generate", {
        method: "POST",
        body: JSON.stringify({ owner_password: ownerPassword }),
      });
      const next: RecoveryBundle = {
        recovery_path: String(value.recovery_path || ""),
        key_1: String(value.key_1 || ""),
        key_2: String(value.key_2 || ""),
        created_at: String(value.created_at || new Date().toISOString()),
      };
      setBundle(next);
      setStatus({ enabled: true, created_at: next.created_at, used_at: null });
    } catch {
      setError(copy.genericError);
    } finally {
      setOwnerPassword("");
      setGenerating(false);
    }
  };

  const copyValue = async (name: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(name);
      window.setTimeout(() => setCopied(""), 1400);
    } catch {
      setError(copy.genericError);
    }
  };

  return (
    <main dir={dir} className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-black tracking-tight">{copy.setupTitle}</h1>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">{copy.setupDescription}</p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/admin")}>
            {copy.back}
          </Button>
        </div>

        <Card className="border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="flex gap-3 p-4 text-sm font-medium leading-6">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
            <span>{copy.setupWarning}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5" />
              {copy.currentStatus}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-bold">
                    {loading ? "…" : status?.enabled ? copy.enabled : copy.disabled}
                  </div>
                  {status?.created_at && (
                    <div className="mt-1 text-xs text-muted-foreground" dir="ltr">
                      {new Date(status.created_at).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-2">
                  <div className={fieldHeaderClass}>
                    <Label htmlFor="owner-recovery-password" className={fieldLabelClass}>
                      {copy.currentPassword}
                    </Label>
                  </div>
                  <PasswordInput
                    id="owner-recovery-password"
                    dir="ltr"
                    autoComplete="current-password"
                    value={ownerPassword}
                    onChange={(event) => setOwnerPassword(event.target.value)}
                    disabled={loading || generating}
                    className={fieldInputClass}
                  />
                </div>
                <Button
                  onClick={() => void generate()}
                  disabled={loading || generating || !ownerPassword}
                  className="h-12 rounded-xl"
                >
                  {generating
                    ? copy.saving
                    : status?.enabled
                      ? copy.regenerate
                      : copy.generate}
                </Button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm font-semibold text-destructive">
                {error}
              </div>
            )}

            {bundle && (
              <div className="space-y-4 rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
                <div className="rounded-xl bg-background p-3 text-sm font-bold text-primary">
                  {copy.displayOnce}
                </div>
                {[
                  ["link", copy.recoveryLink, recoveryUrl],
                  ["key1", copy.key1, bundle.key_1],
                  ["key2", copy.key2, bundle.key_2],
                ].map(([name, label, value]) => (
                  <div key={name} className="space-y-2">
                    <div className="text-sm font-bold">{label}</div>
                    <div className="flex items-start gap-2">
                      <code
                        dir="ltr"
                        className="min-w-0 flex-1 break-all rounded-xl border bg-background p-3 text-xs leading-5 sm:text-sm"
                      >
                        {value}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={copy.copy}
                        onClick={() => void copyValue(name, value)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    {copied === name && (
                      <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        {copy.copied}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
