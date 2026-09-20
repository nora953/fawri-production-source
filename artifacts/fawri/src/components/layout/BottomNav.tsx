import React, { useMemo, useState } from "react";
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
  Calculator,
  Users,
  BarChart3,
  LogOut,
  Bell,
  Headphones,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { clearSession } from "@/lib/store";
import {
  useUnreadMerchantNotificationCount,
  type MerchantNotificationCountState,
} from "@/hooks/useMerchantNotifications";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: MerchantNotificationCountState;
  fullPage?: boolean;
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

function NavBadge({
  count,
  isKurdish,
  unavailableLabel,
}: {
  count?: MerchantNotificationCountState;
  isKurdish: boolean;
  unavailableLabel: string;
}) {
  if (count === undefined || count === "loading") return null;
  const unavailable = count === "unavailable";
  if (!unavailable && count <= 0) return null;

  return (
    <span
      dir="ltr"
      aria-label={unavailable ? unavailableLabel : undefined}
      title={unavailable ? unavailableLabel : undefined}
      className={`absolute -end-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[8px] leading-none tabular-nums text-white shadow-sm ring-2 ring-background ${
        isKurdish ? "font-sans font-bold" : "font-black"
      }`}
    >
      {unavailable ? "!" : count >= 50 ? "50+" : count}
    </span>
  );
}

export function BottomNav() {
  const { t, dir, lang } = useI18n();
  const [location, setLocation] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const unreadNotifications = useUnreadMerchantNotificationCount();
  const cashierLabel =
    lang === "en" ? "Cashier" : lang === "ku" ? "کاشێر" : "الكاشير";
  const cashierManagementLabel =
    lang === "en"
      ? "Cashiers & Staff"
      : lang === "ku"
        ? "کاشێر و کارمەندان"
        : "الكاشيرات والموظفون";
  const reportsLabel =
    lang === "en"
      ? "Reports"
      : lang === "ku"
        ? "ڕاپۆرتەکان"
        : "التقارير";

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
      href: "/dashboard/cashiers",
      label: cashierManagementLabel,
      icon: Users,
      exact: true,
    },
    {
      href: "/dashboard/reports",
      label: reportsLabel,
      icon: BarChart3,
    },
    {
      href: "/cashier.html",
      label: cashierLabel,
      icon: Calculator,
      fullPage: true,
    },
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
      href: "/dashboard/support",
      label: t.support_nav,
      icon: Headphones,
    },
    {
      href: "/dashboard/settings",
      label: t.settings,
      icon: Settings,
    },
  ];

  const isMoreActive = useMemo(() => {
    return moreItems.some((item) =>
      !item.fullPage && isActiveRoute(location, item.href, item.exact),
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
              <NavBadge
                count={unreadNotifications}
                isKurdish={lang === "ku"}
                unavailableLabel={t.notifications_load_error}
              />
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
              const isActive = !item.fullPage && isActiveRoute(location, item.href, item.exact);
              const className = `flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent"
              }`;
              const content = (
                <>
                  <span className="relative inline-flex shrink-0">
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                    <NavBadge
                      count={item.badge}
                      isKurdish={lang === "ku"}
                      unavailableLabel={t.notifications_load_error}
                    />
                  </span>
                  <span className="truncate">{item.label}</span>
                </>
              );

              if (item.fullPage) {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleNavigate}
                    className={className}
                  >
                    {content}
                  </a>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={className}
                >
                  {content}
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
