import { SUPPORT_PREVIEW_LAUNCHER_TEXT } from '@/lib/translations/features/components/admin/SupportPreviewLauncher';
import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getAdminAuthHeaders, getAdminSessionToken } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

type InspectionRequest = {
  id: string;
  admin_id: string;
  mode: "live_observation" | "independent_read_only";
  status: "pending" | "approved" | "rejected" | "expired";
  consent_decision?: "approved" | "rejected";
  ended_at?: string;
  session_expires_at?: string;
};

type Ticket = {
  id: string;
  subject: string;
  merchant_name: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  assigned_admin_id?: string;
  inspection_requests?: InspectionRequest[];
};

type AdminSummary = { id: string };

const TEXT = SUPPORT_PREVIEW_LAUNCHER_TEXT;

export default function SupportPreviewLauncher() {
  const { lang, dir } = useI18n();
  const [location, setLocation] = useLocation();
  const [admin, setAdmin] = useState<AdminSummary | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const text = lang === "en" ? TEXT.en : lang === "ku" ? TEXT.ku : TEXT.ar;

  useEffect(() => {
    if (!getAdminSessionToken() || !location.startsWith("/admin")) return;

    if (location.startsWith("/admin/support-preview/")) {
      let active = true;
      let redirecting = false;
      const sessionId = decodeURIComponent(
        location
          .slice("/admin/support-preview/".length)
          .split(/[/?#]/, 1)[0] || "",
      );

      const verifyPreview = async () => {
        if (!sessionId || redirecting) return;
        try {
          const response = await fetch(
            `/api/auth/admin/support-preview/${encodeURIComponent(sessionId)}/snapshot`,
            {
              headers: getAdminAuthHeaders(),
              cache: "no-store",
            },
          );
          if (!active || response.ok) return;
          const data = await response.json().catch(() => null);
          if (response.status !== 410) return;

          redirecting = true;
          toast.error(
            data?.end_reason === "merchant_terminated"
              ? text.endedByMerchant
              : text.ended,
            { duration: 5_000 },
          );
          setLocation("/admin");
        } catch {
          // A temporary connection failure must not end an otherwise valid session.
        }
      };

      const verifyWhenVisible = () => {
        if (document.visibilityState === "visible") {
          void verifyPreview();
        }
      };

      void verifyPreview();
      const intervalId = window.setInterval(() => void verifyPreview(), 2_000);
      window.addEventListener("focus", verifyWhenVisible);
      document.addEventListener("visibilitychange", verifyWhenVisible);

      return () => {
        active = false;
        window.clearInterval(intervalId);
        window.removeEventListener("focus", verifyWhenVisible);
        document.removeEventListener("visibilitychange", verifyWhenVisible);
      };
    }

    let active = true;
    const load = async () => {
      try {
        const [adminResponse, ticketsResponse] = await Promise.all([
          fetch("/api/auth/admin/me", {
            headers: getAdminAuthHeaders(),
            cache: "no-store",
          }),
          fetch("/api/auth/admin/support/tickets", {
            headers: getAdminAuthHeaders(),
            cache: "no-store",
          }),
        ]);
        const adminData = await adminResponse.json().catch(() => null);
        const ticketsData = await ticketsResponse.json().catch(() => null);
        if (!active) return;
        if (adminResponse.ok && adminData?.ok && adminData.admin) {
          setAdmin(adminData.admin as AdminSummary);
        }
        if (ticketsResponse.ok && ticketsData?.ok && Array.isArray(ticketsData.tickets)) {
          setTickets(ticketsData.tickets as Ticket[]);
        }
      } catch {
        // A temporary connection failure should not interrupt the admin panel.
      }
    };

    void load();
    const intervalId = window.setInterval(() => void load(), 10_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [lang, location, setLocation, text.ended, text.endedByMerchant]);

  const approved = useMemo(() => {
    if (!admin) return [];
    const timestamp = Date.now();
    return tickets.flatMap((ticket) => {
      if (
        ticket.assigned_admin_id !== admin.id ||
        (ticket.status !== "open" && ticket.status !== "in_progress")
      ) {
        return [];
      }
      const request = (ticket.inspection_requests || []).find(
        (item) =>
          item.admin_id === admin.id &&
          item.mode === "independent_read_only" &&
          item.status === "approved" &&
          item.consent_decision === "approved" &&
          !item.ended_at &&
          new Date(item.session_expires_at || 0).getTime() > timestamp,
      );
      return request ? [{ ticket, request }] : [];
    });
  }, [admin, tickets]);

  if (
    !getAdminSessionToken() ||
    !location.startsWith("/admin") ||
    location.startsWith("/admin/support-preview/") ||
    approved.length === 0
  ) {
    return null;
  }

  const start = async (ticketId: string, requestId: string) => {
    setOpeningId(requestId);
    try {
      const response = await fetch("/api/auth/admin/support-preview/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({ ticket_id: ticketId, request_id: requestId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.session?.id) {
        throw new Error(data?.error || "could not start preview");
      }
      setLocation(`/admin/support-preview/${encodeURIComponent(data.session.id)}`);
    } catch (error) {
      console.error("Could not start support preview:", error);
      toast.error(text.error);
    } finally {
      setOpeningId(null);
    }
  };

  const item = approved[0];
  return (
    <aside
      dir={dir}
      className="fixed bottom-5 start-5 z-[70] w-[min(92vw,380px)] rounded-2xl border border-emerald-300 bg-background p-4 shadow-2xl dark:border-emerald-800"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-black">{text.title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{text.body}</p>
          <p className="mt-2 truncate text-sm font-bold">{item.ticket.merchant_name}</p>
          <p className="truncate text-xs text-muted-foreground">{item.ticket.subject}</p>
          <Button
            className="mt-3 w-full"
            disabled={openingId !== null}
            onClick={() => void start(item.ticket.id, item.request.id)}
          >
            {openingId === item.request.id ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <Eye className="me-2 h-4 w-4" />
            )}
            {openingId === item.request.id ? text.opening : text.open}
          </Button>
        </div>
      </div>
    </aside>
  );
}