import { useEffect } from "react";
import { useLocation } from "wouter";

import AdminEmergencyAccessPage from "@/pages/AdminEmergencyAccessPage";
import { useI18n } from "@/lib/i18n";
import { getAdminAuthHeaders } from "@/lib/store";

type EmergencyRequest = {
  id: string;
  incident_reference: string;
  merchant_name: string;
  status: string;
};

type OverviewResponse = {
  ok?: boolean;
  requests?: EmergencyRequest[];
};

const VIEW_LABELS = {
  ar: "فتح النسخة الآمنة",
  ku: "کردنەوەی وێنەی پارێزراو",
  en: "Open safe snapshot",
} as const;

/**
 * Keeps the existing emergency-access management screen intact while routing
 * active snapshot actions to the dedicated, full-page read-only interface.
 */
export default function AdminEmergencyAccessRouterPage() {
  const { lang } = useI18n();
  const [, setLocation] = useLocation();

  useEffect(() => {
    let stopped = false;

    const handleSnapshotClick = async (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest("button");
      if (!(button instanceof HTMLButtonElement)) return;
      if (button.textContent?.trim() !== VIEW_LABELS[lang]) return;

      const requestCard = button.closest(".rounded-xl.border.bg-card.p-4");
      const incidentReference = requestCard
        ?.querySelector<HTMLElement>('p[dir="ltr"]')
        ?.textContent?.trim();

      if (!incidentReference) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      try {
        const response = await fetch(
          "/api/auth/admin/emergency-read-access/overview",
          {
            headers: getAdminAuthHeaders(),
            cache: "no-store",
          },
        );
        const data = (await response.json().catch(() => null)) as
          | OverviewResponse
          | null;
        if (!response.ok || !data?.ok || stopped) return;

        const request = (data.requests || []).find(
          (item) =>
            item.status === "active" &&
            item.incident_reference === incidentReference,
        );
        if (!request || stopped) return;

        setLocation(
          `/admin/emergency-access/${encodeURIComponent(request.id)}/snapshot`,
        );
      } catch {
        // The existing page remains usable if a temporary request fails.
      }
    };

    document.addEventListener("click", handleSnapshotClick, true);
    return () => {
      stopped = true;
      document.removeEventListener("click", handleSnapshotClick, true);
    };
  }, [lang, setLocation]);

  return <AdminEmergencyAccessPage />;
}
