import { Switch, Route, Router as WouterRouter } from "wouter";
import type { ComponentType, LazyExoticComponent } from "react";
import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { initStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

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

// Admin
const AdminPage = lazy(() => import("@/pages/AdminPage"));

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
        <Route path="/admin">{() => <AdminPage />}</Route>

        {/* Dashboard */}
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

function App() {
  useEffect(() => {
    initStore();
  }, []);

  const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
          <TooltipProvider>
            <WouterRouter base={routerBase}>
              <AppRouter />
            </WouterRouter>

            <Toaster position="top-center" richColors offset="12px" />
          </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
