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
  is_owner?: boolean;
  requests?: EmergencyRequest[];
};

const VIEW_LABELS = {
  ar: "فتح النسخة الآمنة",
  ku: "کردنەوەی وێنەی پارێزراو",
  en: "Open safe snapshot",
} as const;

const OWNER_BUTTON_CLASS =
  "emergency-owner-snapshot-button inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground";

/**
 * Keeps the existing emergency-access management screen intact while routing
 * active snapshot actions to the dedicated, full-page read-only interface.
 * The owner gets a separately audited read-only view without impersonating the
 * requesting assistant or reusing the assistant's device-bound session.
 */
export default function AdminEmergencyAccessRouterPage() {
  const { lang } = useI18n();
  const [, setLocation] = useLocation();

  useEffect(() => {
    let stopped = false;
    let refreshTimer: number | null = null;

    const loadOverview = async (): Promise<OverviewResponse | null> => {
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
        if (!response.ok || !data?.ok || stopped) return null;
        return data;
      } catch {
        return null;
      }
    };

    const syncOwnerSnapshotButtons = async () => {
      const data = await loadOverview();
      if (!data?.is_owner || stopped) return;

      const activeByIncident = new Map(
        (data.requests || [])
          .filter((request) => request.status === "active")
          .map((request) => [request.incident_reference, request]),
      );

      document
        .querySelectorAll<HTMLElement>(
          ".emergency-access-route .rounded-xl.border.bg-card.p-4",
        )
        .forEach((card) => {
          const incidentReference = card
            .querySelector<HTMLElement>('p[dir="ltr"]')
            ?.textContent?.trim();
          const request = incidentReference
            ? activeByIncident.get(incidentReference)
            : undefined;
          if (!request) return;

          const actions = card.querySelector<HTMLElement>(
            ".mt-4.flex.flex-wrap.gap-2",
          );
          if (!actions) return;

          const existing = actions.querySelector<HTMLButtonElement>(
            ".emergency-owner-snapshot-button",
          );
          if (existing) {
            existing.dataset.requestId = request.id;
            return;
          }

          const button = document.createElement("button");
          button.type = "button";
          button.className = OWNER_BUTTON_CLASS;
          button.dataset.requestId = request.id;
          button.textContent = VIEW_LABELS[lang];
          actions.prepend(button);
        });
    };

    const scheduleSync = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void syncOwnerSnapshotButtons();
      }, 80);
    };

    const handleSnapshotClick = async (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest("button");
      if (!(button instanceof HTMLButtonElement)) return;
      if (button.textContent?.trim() !== VIEW_LABELS[lang]) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const directRequestId = button.dataset.requestId;
      if (directRequestId) {
        setLocation(
          `/admin/emergency-access/${encodeURIComponent(directRequestId)}/snapshot`,
        );
        return;
      }

      const requestCard = button.closest(".rounded-xl.border.bg-card.p-4");
      const incidentReference = requestCard
        ?.querySelector<HTMLElement>('p[dir="ltr"]')
        ?.textContent?.trim();
      if (!incidentReference) return;

      const data = await loadOverview();
      const request = (data?.requests || []).find(
        (item) =>
          item.status === "active" &&
          item.incident_reference === incidentReference,
      );
      if (!request || stopped) return;

      setLocation(
        `/admin/emergency-access/${encodeURIComponent(request.id)}/snapshot`,
      );
    };

    const observer = new MutationObserver(scheduleSync);
    const root = document.querySelector(".emergency-access-route");
    if (root) observer.observe(root, { childList: true, subtree: true });

    document.addEventListener("click", handleSnapshotClick, true);
    void syncOwnerSnapshotButtons();

    return () => {
      stopped = true;
      observer.disconnect();
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      document.removeEventListener("click", handleSnapshotClick, true);
    };
  }, [lang, setLocation]);

  return <AdminEmergencyAccessPage />;
}
