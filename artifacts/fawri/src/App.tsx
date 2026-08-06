import { Switch, Route, Router as WouterRouter } from "wouter";
import type { ComponentType, LazyExoticComponent } from "react";
import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { clearSession, getAdminAuthHeaders, getAdminSessionToken, initStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import SupportPreviewLauncher from "@/components/admin/SupportPreviewLauncher";
import EmergencyReadAccessLauncher from "@/components/admin/EmergencyReadAccessLauncher";
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
  () => import("@/pages/dashboard/SavedAnswersPage"),
);
const BotTrainingPage = lazy(() => import("@/pages/dashboard/BotTrainingPage"));
const ChannelsPage = lazy(() => import("@/pages/dashboard/ChannelsPage"));
const SubscriptionPage = lazy(
  () => import("@/pages/dashboard/SubscriptionPage"),
);
const SettingsPage = lazy(() => import("@/pages/dashboard/SettingsPage"));
const SupportPage = lazy(() => import("@/pages/dashboard/SupportPage"));

// Admin
const AdminPage = lazy(() => import("@/pages/AdminPage"));
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
        <Route path="/admin/work-monitor/:adminId">
          {(params) => <AdminWorkMonitorPage adminId={params.adminId} />}
        </Route>
        <Route path="/admin">{() => <AdminPage />}</Route>

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
          {() => <DashboardRoute Page={BotTrainingPage} />}
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

function AdminActivityHeartbeat() {
  useEffect(() => {
    let activityPending = true;
    let stopped = false;

    const markActivity = () => {
      activityPending = true;
    };

    const sendHeartbeat = async () => {
      if (stopped || !getAdminSessionToken()) return;
      const activity = activityPending;
      activityPending = false;

      try {
        const response = await fetch('/api/auth/admin/session/heartbeat', {
          method: 'POST',
          headers: {
            ...getAdminAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ activity }),
        });
        if (response.status === 401) {
          clearSession();
          window.location.href = '/login';
        }
      } catch {
        // A temporary connection interruption must not destroy a valid session.
      }
    };

    window.addEventListener('pointerdown', markActivity, { passive: true });
    window.addEventListener('keydown', markActivity);
    window.addEventListener('focus', markActivity);
    document.addEventListener('visibilitychange', markActivity);
    void sendHeartbeat();
    const timer = window.setInterval(() => void sendHeartbeat(), 30_000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', markActivity);
      window.removeEventListener('keydown', markActivity);
      window.removeEventListener('focus', markActivity);
      document.removeEventListener('visibilitychange', markActivity);
    };
  }, []);

  return null;
}

function App() {
  useEffect(() => {
    initStore();
  }, []);

  const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AdminActivityHeartbeat />
          <WouterRouter base={routerBase}>
            <AppRouter />
            <SupportPreviewLauncher />
            <EmergencyReadAccessLauncher />
            <EmergencyIncidentNoticeBanner />
          </WouterRouter>

          <Toaster position="top-center" richColors offset="12px" />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
