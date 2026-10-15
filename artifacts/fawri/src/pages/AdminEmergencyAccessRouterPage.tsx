import {
  ADMIN_EMERGENCY_ACCESS_ROUTER_PAGE_ASSISTANT_FORM_COPY,
  ADMIN_EMERGENCY_ACCESS_ROUTER_PAGE_OWNER_FORM_COPY,
  ADMIN_EMERGENCY_ACCESS_ROUTER_PAGE_VIEW_LABELS,
} from '@/lib/translations/features/pages/AdminEmergencyAccessRouterPage';
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
  activation_mode?: string;
  requested_at?: string;
};

type OverviewResponse = {
  ok?: boolean;
  is_owner?: boolean;
  requests?: EmergencyRequest[];
};

const VIEW_LABELS = ADMIN_EMERGENCY_ACCESS_ROUTER_PAGE_VIEW_LABELS;
const ASSISTANT_FORM_COPY =
  ADMIN_EMERGENCY_ACCESS_ROUTER_PAGE_ASSISTANT_FORM_COPY;
const OWNER_FORM_COPY = ADMIN_EMERGENCY_ACCESS_ROUTER_PAGE_OWNER_FORM_COPY;

const OWNER_BUTTON_CLASS =
  "emergency-owner-snapshot-button inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground";

const OWNER_START_TIMEOUT_MS = 8_000;
const OWNER_START_POLL_MS = 250;

/**
 * Keeps the existing emergency-access management screen intact while routing
 * active snapshot actions to the dedicated, full-page read-only interface.
 * The owner gets a separately audited read-only view without impersonating the
 * requesting assistant or reusing the assistant's device-bound session.
 *
 * The API already activates owner-created sessions immediately. This wrapper
 * gives the owner the matching direct-session copy and routes a successful
 * owner activation straight to its safe snapshot. Assistant requests retain
 * the approval workflow and their original wording.
 */
export default function AdminEmergencyAccessRouterPage() {
  const { lang } = useI18n();
  const [, setLocation] = useLocation();

  useEffect(() => {
    let stopped = false;
    let refreshTimer: number | null = null;
    let ownerLaunchTimer: number | null = null;
    let lastOverview: OverviewResponse | null = null;
    let ownerMode = false;

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
        lastOverview = data;
        ownerMode = data.is_owner === true;
        return data;
      } catch {
        return null;
      }
    };

    const requestGrid = () =>
      document.querySelector<HTMLElement>(
        ".emergency-access-route main > div.grid:nth-child(2)",
      );

    const ownerFormCard = () =>
      requestGrid()?.firstElementChild instanceof HTMLElement
        ? (requestGrid()?.firstElementChild as HTMLElement)
        : null;

    const syncOwnerFormCopy = () => {
      if (!ownerMode) return;
      const formCard = ownerFormCard();
      if (!formCard) return;

      const ownerCopy = OWNER_FORM_COPY[lang];
      const assistantCopy = ASSISTANT_FORM_COPY[lang];
      const title =
        formCard.querySelector<HTMLElement>('[data-slot="card-title"]') ||
        formCard.querySelector<HTMLElement>(".text-base");
      if (title && title.textContent?.trim() !== ownerCopy.title) {
        title.textContent = ownerCopy.title;
      }

      const submitButton = Array.from(
        formCard.querySelectorAll<HTMLButtonElement>("button"),
      ).find((button) => {
        const label = button.querySelector<HTMLElement>("span")?.textContent?.trim();
        return (
          label === assistantCopy.submit ||
          label === assistantCopy.activating ||
          label === ownerCopy.submit ||
          label === ownerCopy.activating
        );
      });
      if (!submitButton) return;

      submitButton.dataset.ownerDirectStart = "true";
      const submitLabel = submitButton.querySelector<HTMLElement>("span");
      const desiredLabel = submitButton.disabled
        ? ownerCopy.activating
        : ownerCopy.submit;
      if (submitLabel && submitLabel.textContent?.trim() !== desiredLabel) {
        submitLabel.textContent = desiredLabel;
      }
    };

    const syncOwnerSuccessToast = () => {
      if (!ownerMode) return;
      const assistantSuccess = ASSISTANT_FORM_COPY[lang].success;
      const ownerSuccess = OWNER_FORM_COPY[lang].success;
      document
        .querySelectorAll<HTMLElement>('[data-sonner-toast] [data-title]')
        .forEach((title) => {
          if (title.textContent?.trim() === assistantSuccess) {
            title.textContent = ownerSuccess;
          }
        });
    };

    const syncOwnerSnapshotButtons = (data: OverviewResponse) => {
      if (!data.is_owner || stopped) return;

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

    const syncOwnerUi = async () => {
      const data = await loadOverview();
      if (!data || stopped) return;
      syncOwnerFormCopy();
      syncOwnerSuccessToast();
      syncOwnerSnapshotButtons(data);
    };

    const scheduleSync = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void syncOwnerUi();
      }, 80);
    };

    const watchForOwnerDirectSession = (
      incidentReference: string,
      startedAt: number,
    ) => {
      const deadline = startedAt + OWNER_START_TIMEOUT_MS;

      const poll = async () => {
        if (stopped) return;
        const data = await loadOverview();
        const request = (data?.requests || []).find((item) => {
          const requestedAt = item.requested_at
            ? new Date(item.requested_at).getTime()
            : 0;
          return (
            item.status === "active" &&
            item.activation_mode === "owner_direct_activation" &&
            item.incident_reference === incidentReference &&
            requestedAt >= startedAt - 2_000
          );
        });

        if (request) {
          setLocation(
            `/admin/emergency-access/${encodeURIComponent(request.id)}/snapshot`,
          );
          return;
        }

        if (Date.now() < deadline) {
          ownerLaunchTimer = window.setTimeout(poll, OWNER_START_POLL_MS);
        }
      };

      ownerLaunchTimer = window.setTimeout(poll, OWNER_START_POLL_MS);
    };

    const handleSnapshotClick = async (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest("button");
      if (!(button instanceof HTMLButtonElement)) return;

      if (button.dataset.ownerDirectStart === "true" && ownerMode) {
        const formCard = ownerFormCard();
        const incidentReference = formCard
          ?.querySelector<HTMLInputElement>('input[dir="ltr"]')
          ?.value.trim();
        if (incidentReference) {
          if (ownerLaunchTimer !== null) {
            window.clearTimeout(ownerLaunchTimer);
            ownerLaunchTimer = null;
          }
          watchForOwnerDirectSession(incidentReference, Date.now());
        }
        return;
      }

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

      const data = lastOverview || (await loadOverview());
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
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("click", handleSnapshotClick, true);
    void syncOwnerUi();

    return () => {
      stopped = true;
      observer.disconnect();
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      if (ownerLaunchTimer !== null) window.clearTimeout(ownerLaunchTimer);
      document.removeEventListener("click", handleSnapshotClick, true);
    };
  }, [lang, setLocation]);

  return <AdminEmergencyAccessPage />;
}
