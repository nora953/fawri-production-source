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
  LogOut,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { clearSession } from "@/lib/store";

type NavItem = {
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

export function BottomNav() {
  const { t, dir } = useI18n();
  const [location, setLocation] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
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
            <MoreHorizontal className="h-5 w-5" />
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
                  <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
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
