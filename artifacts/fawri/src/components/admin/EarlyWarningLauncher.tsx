import { ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { getAdminSessionToken } from "@/lib/store";
import { ADMIN_EARLY_WARNING_PAGE_TEXT } from "@/lib/translations/features/pages/AdminEarlyWarningPage";

export default function EarlyWarningLauncher() {
  const { lang } = useI18n();
  const [location, setLocation] = useLocation();
  const text = ADMIN_EARLY_WARNING_PAGE_TEXT[lang];

  if (!getAdminSessionToken() || location !== "/admin") return null;

  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 gap-2 rounded-xl border-amber-300 bg-amber-50 font-bold text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
      onClick={() => setLocation("/admin/early-warning")}
    >
      <ShieldAlert className="h-4 w-4" />
      {text.title}
    </Button>
  );
}
