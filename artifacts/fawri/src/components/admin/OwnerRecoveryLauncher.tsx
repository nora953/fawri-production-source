import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { getStableAuthDeviceId } from "@/lib/authClientCutover";
import { useI18n } from "@/lib/i18n";
import { OWNER_RECOVERY_COPY } from "@/lib/ownerRecoveryCopy";

export default function OwnerRecoveryLauncher() {
  const { lang } = useI18n();
  const [location, setLocation] = useLocation();
  const [owner, setOwner] = useState(false);
  const copy = OWNER_RECOVERY_COPY[lang];

  useEffect(() => {
    if (location !== "/admin") {
      setOwner(false);
      return;
    }
    let alive = true;
    void fetch("/api/auth/admin/me", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { "X-Fawri-Device-Id": getStableAuthDeviceId() },
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((value) => {
        if (!alive || !value) return;
        const role = value?.admin_profile?.role || value?.admin?.admin_role || value?.admin_role;
        setOwner(role === "owner_admin");
      })
      .catch(() => {
        if (alive) setOwner(false);
      });
    return () => {
      alive = false;
    };
  }, [location]);

  if (!owner || location !== "/admin") return null;

  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 gap-2 rounded-xl border-primary/30 bg-primary/5 font-bold"
      onClick={() => setLocation("/admin/owner-recovery-setup")}
    >
      <KeyRound className="h-4 w-4" />
      {copy.setupTitle}
    </Button>
  );
}
