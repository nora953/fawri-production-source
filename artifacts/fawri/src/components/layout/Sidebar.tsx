import React from "react";
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
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { clearSession } from "@/lib/store";

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

export function Sidebar() {
  const { t, isRTL } = useI18n();
  const [location, setLocation] = useLocation();

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
      <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-6">
        <Link
          href="/dashboard"
          className="text-2xl font-bold tracking-tight text-sidebar-primary"
        >
          {t.sidebar_brand}
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
