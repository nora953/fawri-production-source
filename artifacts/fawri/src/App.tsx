import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import type { ComponentType, LazyExoticComponent } from "react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, KeyRound, ShieldAlert } from "lucide-react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { initStore } from "@/lib/store";
import {
  getStableAuthDeviceId,
  installAuthClientCutover,
  secureAdminLogout,
} from "@/lib/authClientCutover";
import { useI18n } from "@/lib/i18n";
import { OWNER_RECOVERY_COPY } from "@/lib/ownerRecoveryCopy";
import { ADMIN_EARLY_WARNING_PAGE_TEXT } from "@/lib/translations/features/pages/AdminEarlyWarningPage";
import SupportPreviewLauncher from "@/components/admin/SupportPreviewLauncher";
import EmergencyIncidentNoticeBanner from "@/components/EmergencyIncidentNoticeBanner";
import "@/styles/emergency-access-compact.css";

// Layouts
import { DashboardLayout } from "@/components/layout/DashboardLayout";

// Public Pages - lazy loaded to reduce the first JavaScript bundle
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const SignupPage = lazy(() => import("@/pages/SignupPage"));
const OTPPage = lazy(() => import("@/pages/OTPPage"));
const PendingPage = lazy(() => import("@/pages/PendingPage"));
const PrivacyPage = lazy(() => import("@/pages/PrivacyPage"));
const TermsPage = lazy(() => import("@/pages/TermsPage"));
const OwnerRecoveryPage = lazy(() => import("@/pages/OwnerRecoveryPage"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Dashboard Pages - each page loads only when opened
const OverviewPage = lazy(() => import("@/pages/dashboard/OverviewPage"));
const NotificationsPage = lazy(
  () => import("@/pages/dashboard/NotificationsPage"),
);
const ConversationsPage = lazy(
  () => import("@/pages/dashboard/ConversationsPage"),
);
const ProductsPage = lazy(() => import("@/pages/dashboard/ProductsPage"));
const ImportProductsPage = lazy(
  () => import("@/pages/dashboard/ImportProductsPage"),
);
const OrdersPage = lazy(() => import("@/pages/dashboard/OrdersPage"));
const SavedAnswersPage = lazy(
  () => import("@/pages/dashboard/SavedAnswersPage.ts"),
);
const TrainingPage = lazy(() => import("@/pages/dashboard/TrainingPage.ts"));
const ChannelsPage = lazy(() => import("@/pages/dashboard/ChannelsPage"));
const SubscriptionPage = lazy(
  () => import("@/pages/dashboard/SubscriptionPage"),
);
const SettingsPage = lazy(() => import("@/pages/dashboard/SettingsPage"));
const SupportPage = lazy(() => import("@/pages/dashboard/SupportPage"));

// Admin
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const AdminEarlyWarningPage = lazy(() => import("@/pages/AdminEarlyWarningPage"));
const AdminWorkMonitorPage = lazy(() => import("@/pages/AdminWorkMonitorPage"));
const AdminSupportPreviewPage = lazy(
  () => import("@/pages/AdminSupportPreviewPage"),
);
const AdminEmergencyAccessRouterPage = lazy(
  () => import("@/pages/AdminEmergencyAccessRouterPage"),
);
const AdminEmergencySnapshotPage = lazy(
  () => import("@/pages/AdminEmergencySnapshotPage"),
);
const OwnerRecoverySetupPage = lazy(
  () => import("@/pages/OwnerRecoverySetupPage"),
);

const queryClient = new QueryClient();

type LazyPage =
  | ComponentType<Record<string, never>>
  | LazyExoticComponent<ComponentType<Record<string, never>>>;

function PageLoading() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center text-sm font-semibold text-muted-foreground">
      {t.app_loading}
    </div>
  );
}

function DashboardRoute({ Page }: { Page: LazyPage }) {
  return (
    <DashboardLayout>
      <Page />
    </DashboardLayout>
  );
}

function AdminSecurityActions() {
  const { lang, dir } = useI18n();
  const [, setLocation] = useLocation();
  const [isOwner, setIsOwner] = useState(false);
  const ownerRecoveryCopy = OWNER_RECOVERY_COPY[lang];
  const earlyWarningText = ADMIN_EARLY_WARNING_PAGE_TEXT[lang];
  const menuLabel =
    lang === "ar"
      ? "إجراءات الأمان"
      : lang === "ku"
        ? "کردارەکانی ئاسایش"
        : "Security actions";

  useEffect(() => {
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
        const role =
          value?.admin_profile?.role ||
          value?.admin?.admin_role ||
          value?.admin_role;
        setIsOwner(role === "owner_admin");
      })
      .catch(() => {
        if (alive) setIsOwner(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <style>{`header .fowri-header-brand-font { display: none !important; }`}</style>
      <div
        dir={dir}
        className="fixed top-2.5 z-[65]"
        style={{
          insetInlineStart: "max(5rem, calc((100vw - 80rem) / 2 + 5rem))",
        }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1 rounded-xl bg-background/95 px-2 shadow-sm backdrop-blur"
              aria-label={menuLabel}
              title={menuLabel}
            >
              <ShieldAlert className="h-4 w-4" />
              <ChevronDown className="h-3.5 w-3.5" />
              <span className="sr-only">{menuLabel}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={6}
            className="w-80 max-w-[calc(100vw-2rem)]"
          >
            {isOwner && (
              <DropdownMenuItem
                className="cursor-pointer gap-2 whitespace-normal py-2.5 font-semibold"
                onSelect={() => setLocation("/admin/owner-recovery-setup")}
              >
                <KeyRound className="h-4 w-4 shrink-0" />
                <span>{ownerRecoveryCopy.setupTitle}</span>
              </DropdownMenuItem>
            )}
            {isOwner && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className="cursor-pointer gap-2 whitespace-normal py-2.5 font-semibold"
              onSelect={() => setLocation("/admin/early-warning")}
            >
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{earlyWarningText.title}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

function AppRouter() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Switch>
        {/* Public */}
        <Route path="/">{() => <LandingPage />}</Route>
        <Route path="/login">{() => <LoginPage />}</Route>
        <Route path="/signup">{() => <SignupPage />}</Route>
        <Route path="/verify-otp">{() => <OTPPage />}</Route>
        <Route path="/pending">{() => <PendingPage />}</Route>
        <Route path="/privacy">{() => <PrivacyPage />}</Route>
        <Route path="/terms">{() => <TermsPage />}</Route>
        <Route path="/owner-recovery/:recoveryId">
          {(params) => <OwnerRecoveryPage recoveryId={params.recoveryId} />}
        </Route>

        {/* Admin */}
        <Route path="/admin/support-preview/:sessionId">
          {(params) => <AdminSupportPreviewPage sessionId={params.sessionId} />}
        </Route>
        <Route path="/admin/emergency-access/:requestId/snapshot">
          {(params) => (
            <AdminEmergencySnapshotPage requestId={params.requestId} />
          )}
        </Route>
        <Route path="/admin/emergency-access">
          {() => (
            <div className="emergency-access-route">
              <AdminEmergencyAccessRouterPage />
            </div>
          )}
        </Route>
        <Route path="/admin/early-warning">
          {() => <AdminEarlyWarningPage />}
        </Route>
        <Route path="/admin/owner-recovery-setup">
          {() => <OwnerRecoverySetupPage />}
        </Route>
        <Route path="/admin/work-monitor/:adminId">
          {(params) => <AdminWorkMonitorPage adminId={params.adminId} />}
        </Route>
        <Route path="/admin">
          {() => (
            <>
              <AdminSecurityActions />
              <AdminPage />
            </>
          )}
        </Route>

        {/* Dashboard */}
        <Route path="/dashboard/notifications">
          {() => <DashboardRoute Page={NotificationsPage} />}
        </Route>

        <Route path="/dashboard/conversations">
          {() => <DashboardRoute Page={ConversationsPage} />}
        </Route>

        <Route path="/dashboard/products/import">
          {() => <DashboardRoute Page={ImportProductsPage} />}
        </Route>

        <Route path="/dashboard/import-products">
          {() => <DashboardRoute Page={ImportProductsPage} />}
        </Route>

        <Route path="/dashboard/products">
          {() => <DashboardRoute Page={ProductsPage} />}
        </Route>

        <Route path="/dashboard/orders">
          {() => <DashboardRoute Page={OrdersPage} />}
        </Route>

        <Route path="/dashboard/saved-answers">
          {() => <DashboardRoute Page={SavedAnswersPage} />}
        </Route>

        <Route path="/dashboard/bot-training">
          {() => <DashboardRoute Page={TrainingPage} />}
        </Route>

        <Route path="/dashboard/channels">
          {() => <DashboardRoute Page={ChannelsPage} />}
        </Route>

        <Route path="/dashboard/subscription">
          {() => <DashboardRoute Page={SubscriptionPage} />}
        </Route>

        <Route path="/dashboard/support">
          {() => <DashboardRoute Page={SupportPage} />}
        </Route>

        <Route path="/dashboard/settings">
          {() => <DashboardRoute Page={SettingsPage} />}
        </Route>

        <Route path="/dashboard/overview">
          {() => <DashboardRoute Page={OverviewPage} />}
        </Route>

        <Route path="/dashboard">
          {() => <DashboardRoute Page={OverviewPage} />}
        </Route>

        <Route>{() => <NotFound />}</Route>
      </Switch>
    </Suspense>
  );
}

function AdminSessionRevalidator() {
  const [location] = useLocation();
  const previousLocation = useRef(location);

  useEffect(() => {
    const previous = previousLocation.current;
    previousLocation.current = location;
    if (previous.startsWith('/admin') && location === '/login') {
      void secureAdminLogout();
    }
  }, [location]);

  useEffect(() => {
    if (!location.startsWith('/admin')) return;
    let stopped = false;

    const validate = async () => {
      try {
        const response = await fetch('/api/auth/admin/me', {
          credentials: 'same-origin',
          headers: { 'X-Fawri-Device-Id': getStableAuthDeviceId() },
          cache: 'no-store',
        });
        if (!stopped && response.status === 401) {
          window.location.href = '/login';
        }
      } catch {
        // Temporary connectivity failures do not manufacture a local session decision.
      }
    };

    void validate();
    const timer = window.setInterval(() => void validate(), 30_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [location]);

  return null;
}

function App() {
  installAuthClientCutover();

  useEffect(() => {
    initStore();
  }, []);

  const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <WouterRouter base={routerBase}>
            <AdminSessionRevalidator />
            <AppRouter />
            <SupportPreviewLauncher />
            <EmergencyIncidentNoticeBanner />
          </WouterRouter>

          <Toaster position="top-center" richColors offset="12px" />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
