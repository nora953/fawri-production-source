from pathlib import Path

ROOT = Path('artifacts/fawri/src')
SIDEBAR = ROOT / 'components/layout/Sidebar.tsx'
BOTTOM_NAV = ROOT / 'components/layout/BottomNav.tsx'
LAYOUT = ROOT / 'components/layout/DashboardLayout.tsx'
APP = ROOT / 'App.tsx'
HOOK = ROOT / 'hooks/useMerchantNotifications.ts'
PAGE = ROOT / 'pages/dashboard/NotificationsPage.tsx'
AR = ROOT / 'lib/translations/ar.ts'
EN = ROOT / 'lib/translations/en.ts'
KU = ROOT / 'lib/translations/ku.ts'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


SIDEBAR.write_text(r'''import React from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  MessageSquare,
  Package,
  ShoppingBag,
  BookOpen,
  Brain,
  Radio,
  CreditCard,
  Settings,
  LogOut,
  Bell,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { clearSession } from "@/lib/store";
import { useUnreadMerchantNotificationCount } from "@/hooks/useMerchantNotifications";

type SidebarItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

function isActiveRoute(
  location: string,
  href: string,
  exact?: boolean,
): boolean {
  if (href === "/dashboard") {
    return location === "/dashboard" || location === "/dashboard/overview";
  }

  if (exact) {
    return location === href;
  }

  return location === href || location.startsWith(`${href}/`);
}

function NotificationBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span className="absolute -end-1.5 -top-1.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-black leading-none text-white shadow-sm ring-2 ring-sidebar">
      {count >= 50 ? "50+" : count}
    </span>
  );
}

export function Sidebar() {
  const { t, isRTL } = useI18n();
  const [location, setLocation] = useLocation();
  const unreadNotifications = useUnreadMerchantNotificationCount();
  const notificationsActive = isActiveRoute(
    location,
    "/dashboard/notifications",
  );

  const navItems: SidebarItem[] = [
    {
      href: "/dashboard",
      label: t.overview,
      icon: LayoutDashboard,
      exact: true,
    },
    {
      href: "/dashboard/conversations",
      label: t.conversations,
      icon: MessageSquare,
    },
    { href: "/dashboard/products", label: t.products, icon: Package },
    { href: "/dashboard/orders", label: t.orders, icon: ShoppingBag },
    {
      href: "/dashboard/saved-answers",
      label: t.saved_answers,
      icon: BookOpen,
    },
    {
      href: "/dashboard/bot-training",
      label: t.sidebar_bot_training,
      icon: Brain,
    },
    { href: "/dashboard/channels", label: t.channels, icon: Radio },
    {
      href: "/dashboard/subscription",
      label: t.subscription,
      icon: CreditCard,
    },
    { href: "/dashboard/settings", label: t.settings, icon: Settings },
  ];

  const handleLogout = () => {
    clearSession();
    setLocation("/");
  };

  return (
    <aside
      className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex"
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-6">
        <Link
          href="/dashboard"
          className="text-2xl font-bold tracking-tight text-sidebar-primary"
        >
          {t.sidebar_brand}
        </Link>

        <Link
          href="/dashboard/notifications"
          aria-label={t.notifications_title}
          title={t.notifications_title}
          aria-current={notificationsActive ? "page" : undefined}
          className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
            notificationsActive
              ? "border-sidebar-primary/50 bg-sidebar-accent text-sidebar-primary"
              : "border-sidebar-border text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-primary"
          }`}
        >
          <Bell className="h-5 w-5" />
          <NotificationBadge count={unreadNotifications} />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <nav className="flex flex-col gap-1 px-3">
          {navItems.map((item) => {
            const isActive = isActiveRoute(location, item.href, item.exact);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="shrink-0 border-t border-sidebar-border p-4">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/50 hover:text-destructive"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span>{t.logout}</span>
        </button>
      </div>
    </aside>
  );
}
''', encoding='utf-8')

BOTTOM_NAV.write_text(r'''import React, { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  MessageSquare,
  Package,
  ShoppingBag,
  Settings,
  MoreHorizontal,
  BookOpen,
  Brain,
  Radio,
  CreditCard,
  LogOut,
  Bell,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { clearSession } from "@/lib/store";
import { useUnreadMerchantNotificationCount } from "@/hooks/useMerchantNotifications";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: number;
};

function isActiveRoute(
  location: string,
  href: string,
  exact?: boolean,
): boolean {
  if (href === "/dashboard") {
    return location === "/dashboard" || location === "/dashboard/overview";
  }

  if (exact) {
    return location === href;
  }

  return location === href || location.startsWith(`${href}/`);
}

function NavBadge({ count }: { count?: number }) {
  if (!count || count <= 0) return null;

  return (
    <span className="absolute -end-2 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[8px] font-black leading-none text-white shadow-sm ring-2 ring-background">
      {count >= 50 ? "50+" : count}
    </span>
  );
}

export function BottomNav() {
  const { t, dir } = useI18n();
  const [location, setLocation] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const unreadNotifications = useUnreadMerchantNotificationCount();

  const mainItems: NavItem[] = [
    {
      href: "/dashboard",
      label: t.overview,
      icon: LayoutDashboard,
      exact: true,
    },
    {
      href: "/dashboard/conversations",
      label: t.conversations,
      icon: MessageSquare,
    },
    {
      href: "/dashboard/products",
      label: t.products,
      icon: Package,
    },
    {
      href: "/dashboard/orders",
      label: t.orders,
      icon: ShoppingBag,
    },
  ];

  const moreItems: NavItem[] = [
    {
      href: "/dashboard/notifications",
      label: t.notifications_title,
      icon: Bell,
      badge: unreadNotifications,
    },
    {
      href: "/dashboard/saved-answers",
      label: t.saved_answers,
      icon: BookOpen,
    },
    {
      href: "/dashboard/bot-training",
      label: t.sidebar_bot_training,
      icon: Brain,
    },
    {
      href: "/dashboard/channels",
      label: t.channels,
      icon: Radio,
    },
    {
      href: "/dashboard/subscription",
      label: t.subscription,
      icon: CreditCard,
    },
    {
      href: "/dashboard/settings",
      label: t.settings,
      icon: Settings,
    },
  ];

  const isMoreActive = useMemo(() => {
    return moreItems.some((item) =>
      isActiveRoute(location, item.href, item.exact),
    );
  }, [location, moreItems]);

  const currentMoreLabel = t.bottom_nav_more;

  const handleLogout = () => {
    setMoreOpen(false);
    clearSession();
    setLocation("/");
  };

  const handleNavigate = () => {
    setMoreOpen(false);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-border bg-background px-2 pb-safe md:hidden"
      dir={dir}
      aria-label={t.bottom_nav_aria_label}
    >
      {mainItems.map((item) => {
        const isActive = isActiveRoute(location, item.href, item.exact);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={handleNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`flex h-full w-16 flex-col items-center justify-center gap-1 transition-colors ${
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <item.icon className="h-5 w-5" />
            <span className="max-w-full truncate px-1 text-[10px]">
              {item.label}
            </span>
          </Link>
        );
      })}

      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={currentMoreLabel}
            className={`flex h-full w-16 flex-col items-center justify-center gap-1 transition-colors ${
              moreOpen || isMoreActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="relative inline-flex">
              <MoreHorizontal className="h-5 w-5" />
              <NavBadge count={unreadNotifications} />
            </span>
            <span className="text-[10px]">{currentMoreLabel}</span>
          </button>
        </PopoverTrigger>

        <PopoverContent
          align={dir === "rtl" ? "start" : "end"}
          side="top"
          sideOffset={10}
          className="mb-2 w-60 rounded-2xl p-2 shadow-xl"
        >
          <div className="flex flex-col gap-1" dir={dir}>
            {moreItems.map((item) => {
              const isActive = isActiveRoute(location, item.href, item.exact);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent"
                  }`}
                >
                  <span className="relative inline-flex shrink-0">
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                    <NavBadge count={item.badge} />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}

            <div className="my-1 h-px bg-border" />

            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>{t.logout}</span>
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </nav>
  );
}
''', encoding='utf-8')

LAYOUT.write_text(r'''import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useLocation } from 'wouter';
import {
  getCurrentMerchant,
  refreshCurrentMerchantFromApi,
} from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import type { Merchant } from '@/lib/types';

const PRODUCT_READ_ONLY_STATUSES = new Set([
  'warning_2',
  'warning_3',
  'final_warning',
  'eligible_for_deletion',
]);

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t, dir } = useI18n();
  const [location, setLocation] = useLocation();
  const [merchant, setMerchant] = useState<Merchant | undefined>(
    getCurrentMerchant(),
  );

  useEffect(() => {
    let active = true;

    refreshCurrentMerchantFromApi()
      .then((updated) => {
        if (!active) return;
        if (updated) setMerchant(updated);
        if (!updated || updated.status !== 'approved') {
          setLocation('/login');
        }
      })
      .catch(() => {
        const current = getCurrentMerchant();
        if (!current || current.status !== 'approved') {
          setLocation('/login');
        }
      });

    return () => {
      active = false;
    };
  }, [setLocation]);

  const productsReadOnly =
    location.startsWith('/dashboard/products') &&
    PRODUCT_READ_ONLY_STATUSES.has(merchant?.retention_status || '');

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl" dir={dir}>
            {productsReadOnly && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-extrabold">{t.retention_warning_2_title}</p>
                  <p className="mt-1 text-sm leading-6">
                    {t.retention_warning_2_body}
                  </p>
                </div>
              </div>
            )}

            <div className={productsReadOnly ? 'pointer-events-none select-text opacity-80' : ''}>
              {children}
            </div>
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
''', encoding='utf-8')

APP.write_text(r'''import { Switch, Route, Router as WouterRouter } from "wouter";
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
''', encoding='utf-8')

HOOK.parent.mkdir(parents=True, exist_ok=True)
HOOK.write_text(r'''import { useCallback, useEffect, useState } from 'react';

export const MERCHANT_NOTIFICATIONS_CHANGED_EVENT =
  'fawri:merchant-notifications-changed';

export function notifyMerchantNotificationsChanged(): void {
  window.dispatchEvent(new Event(MERCHANT_NOTIFICATIONS_CHANGED_EVENT));
}

export function useUnreadMerchantNotificationCount(): number {
  const [count, setCount] = useState(0);

  const loadCount = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/notifications?unread=1&limit=50', {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setCount(0);
        return;
      }

      setCount(
        Array.isArray(data.notifications) ? data.notifications.length : 0,
      );
    } catch (error) {
      console.error('Could not load unread merchant notification count:', error);
    }
  }, []);

  useEffect(() => {
    void loadCount();

    const handleRefresh = () => void loadCount();
    window.addEventListener('focus', handleRefresh);
    window.addEventListener(
      MERCHANT_NOTIFICATIONS_CHANGED_EVENT,
      handleRefresh,
    );

    return () => {
      window.removeEventListener('focus', handleRefresh);
      window.removeEventListener(
        MERCHANT_NOTIFICATIONS_CHANGED_EVENT,
        handleRefresh,
      );
    };
  }, [loadCount]);

  return count;
}
''', encoding='utf-8')

PAGE.parent.mkdir(parents=True, exist_ok=True)
PAGE.write_text(r'''import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, Loader2, RefreshCw } from 'lucide-react';

import { useI18n } from '@/lib/i18n';
import type { MerchantBalanceNotification } from '@/lib/types';
import { notifyMerchantNotificationsChanged } from '@/hooks/useMerchantNotifications';

function formatNotificationText(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(String(value)),
    template,
  );
}

export default function NotificationsPage() {
  const { t, lang } = useI18n();
  const [notifications, setNotifications] = useState<
    MerchantBalanceNotification[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const response = await fetch('/api/auth/notifications?limit=50', {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !Array.isArray(data.notifications)) {
        throw new Error('invalid notification response');
      }

      setNotifications(data.notifications as MerchantBalanceNotification[]);
    } catch (error) {
      console.error('Could not load merchant notifications:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications],
  );

  const markAsRead = async (notificationId: string) => {
    setMarkingId(notificationId);

    try {
      const response = await fetch(
        `/api/auth/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: 'PATCH' },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.notification) {
        throw new Error('could not mark notification as read');
      }

      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId
            ? { ...item, read_at: data.notification.read_at }
            : item,
        ),
      );
      notifyMerchantNotificationsChanged();
    } catch (error) {
      console.error('Could not mark merchant notification as read:', error);
    } finally {
      setMarkingId(null);
    }
  };

  const renderMessage = (notification: MerchantBalanceNotification) => {
    const template =
      notification.emergency_debt_paid > 0
        ? notification.addon_replies_added > 0
          ? t.balance_notification_debt_and_addon
          : t.balance_notification_debt_only
        : t.balance_notification_addon_only;

    return formatNotificationText(template, {
      purchased: notification.purchased_replies.toLocaleString(locale),
      debtPaid: notification.emergency_debt_paid.toLocaleString(locale),
      debtRemaining: notification.emergency_debt_remaining.toLocaleString(locale),
      addonAdded: notification.addon_replies_added.toLocaleString(locale),
    });
  };

  const renderSummary = (notification: MerchantBalanceNotification) =>
    formatNotificationText(t.balance_notification_summary, {
      base: notification.base_replies_remaining.toLocaleString(locale),
      emergency: notification.emergency_replies_remaining.toLocaleString(locale),
      addon: notification.addon_replies_remaining.toLocaleString(locale),
      total: notification.total_replies_available.toLocaleString(locale),
    });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <Bell className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-black text-foreground">
              {t.notifications_title}
            </h1>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t.notifications_subtitle}
          </p>
        </div>

        {unreadCount > 0 && (
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300">
            <span>{unreadCount.toLocaleString(locale)}</span>
            <span>{t.notifications_unread_count}</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground shadow-sm">
          <Loader2 className="me-2 h-5 w-5 animate-spin" />
          <span className="text-sm font-semibold">{t.notifications_loading}</span>
        </div>
      ) : loadError ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <p className="font-bold text-foreground">{t.notifications_load_error}</p>
          <button
            type="button"
            onClick={() => void loadNotifications()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" />
            {t.notifications_retry}
          </button>
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Bell className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-black text-foreground">
            {t.notifications_empty_title}
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {t.notifications_empty_body}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const unread = !notification.read_at;
            const marking = markingId === notification.id;

            return (
              <article
                key={notification.id}
                className={`rounded-2xl border p-4 shadow-sm transition-colors sm:p-5 ${
                  unread
                    ? 'border-sky-300 bg-sky-50/80 dark:border-sky-700 dark:bg-sky-950/25'
                    : 'border-border bg-card'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      unread
                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Bell className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="font-black text-foreground">
                        {t.balance_notification_title}
                      </h2>
                      <time
                        className="text-[11px] font-medium text-muted-foreground"
                        dateTime={notification.created_at}
                      >
                        {new Date(notification.created_at).toLocaleString(locale)}
                      </time>
                    </div>

                    <p className="mt-2 text-sm font-medium leading-7 text-foreground/90">
                      {renderMessage(notification)}
                    </p>

                    <p className="mt-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-xs font-semibold leading-6 text-foreground">
                      {renderSummary(notification)}
                    </p>

                    <div className="mt-3 flex justify-end">
                      {unread ? (
                        <button
                          type="button"
                          disabled={marking}
                          onClick={() => void markAsRead(notification.id)}
                          className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {marking ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          {t.notifications_mark_read}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          <Check className="h-4 w-4" />
                          {t.notifications_read}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
''', encoding='utf-8')


def patch_translation(path: Path, marker: str, addition: str, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    if addition.strip() in text:
        raise RuntimeError(f'{label}: translation keys already exist')
    text = replace_once(text, marker, marker + addition, label)
    path.write_text(text, encoding='utf-8')


patch_translation(
    AR,
    '  balance_notification_dismiss: "تحديد الإشعار كمقروء",\n',
    '''  notifications_title: "الإشعارات",
  notifications_subtitle: "تابع تحديثات رصيد الردود والعمليات المهمة في حسابك.",
  notifications_empty_title: "لا توجد إشعارات",
  notifications_empty_body: "ستظهر هنا تحديثات الرصيد والعمليات المهمة في حسابك.",
  notifications_unread_count: "غير مقروء",
  notifications_mark_read: "تحديد كمقروء",
  notifications_read: "مقروء",
  notifications_loading: "جاري تحميل الإشعارات...",
  notifications_load_error: "تعذر تحميل الإشعارات.",
  notifications_retry: "إعادة المحاولة",
''',
    'Arabic notification page translations',
)

patch_translation(
    EN,
    '  balance_notification_dismiss: "Mark notification as read",\n',
    '''  notifications_title: "Notifications",
  notifications_subtitle: "Review reply-balance updates and important account activity.",
  notifications_empty_title: "No notifications",
  notifications_empty_body: "Reply-balance updates and important account activity will appear here.",
  notifications_unread_count: "unread",
  notifications_mark_read: "Mark as read",
  notifications_read: "Read",
  notifications_loading: "Loading notifications...",
  notifications_load_error: "Notifications could not be loaded.",
  notifications_retry: "Try again",
''',
    'English notification page translations',
)

patch_translation(
    KU,
    '  balance_notification_dismiss: "نیشانکردنی ئاگادارکردنەوە وەک خوێندراو",\n',
    '''  notifications_title: "ئاگادارکردنەوەکان",
  notifications_subtitle: "نوێکارییەکانی کرێدیتی وەڵام و کردارە گرنگەکانی هەژمارەکەت ببینە.",
  notifications_empty_title: "هیچ ئاگادارکردنەوەیەک نییە",
  notifications_empty_body: "نوێکارییەکانی کرێدیت و کردارە گرنگەکانی هەژمارەکەت لێرە دەردەکەون.",
  notifications_unread_count: "نەخوێندراو",
  notifications_mark_read: "وەک خوێندراو نیشانی بکە",
  notifications_read: "خوێندراو",
  notifications_loading: "ئاگادارکردنەوەکان بار دەکرێن...",
  notifications_load_error: "بارکردنی ئاگادارکردنەوەکان سەرکەوتوو نەبوو.",
  notifications_retry: "دووبارە هەوڵ بدەوە",
''',
    'Kurdish notification page translations',
)

print('Moved merchant notifications into a dedicated page with bell badges.')
