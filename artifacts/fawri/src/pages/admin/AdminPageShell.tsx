import React, { useState } from "react";
import {
  BadgeCheck,
  Ban,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Headphones,
  LayoutGrid,
  LogOut,
  Menu,
  PauseCircle,
  ScrollText,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import EmergencyReadAccessLauncher from "@/components/admin/EmergencyReadAccessLauncher";
import { Button } from "@/components/ui/button";
import { clearSession } from "@/lib/store";
import { AdminPageView } from "@/pages/admin/AdminPageView";
import type { AdminPageViewModel } from "@/pages/admin/useAdminPageController";

type AdminPageShellProps = {
  model: AdminPageViewModel;
};

const TAB_ICONS: Record<string, LucideIcon> = {
  all: LayoutGrid,
  pending: Clock3,
  approved: BadgeCheck,
  suspended: PauseCircle,
  rejected: Ban,
  support: Headphones,
  administrators: UsersRound,
  deletion_requests: Trash2,
  logs: ScrollText,
};

export function AdminPageShell({ model }: AdminPageShellProps) {
  const {
    TABS,
    adminText,
    currentAdmin,
    lang,
    setLang,
    setLocation,
    setTab,
    tab,
    tabCount,
  } = model;

  const isRTL = adminText.dir === "rtl";
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 768;
  });

  const pendingAdminDeviceCount = Number(
    (
      currentAdmin as
        | (typeof currentAdmin & { pending_device_count?: number })
        | undefined
    )?.pending_device_count || 0,
  );

  const activeTab = TABS.find((item) => item.id === tab);
  const contentOffset = sidebarOpen
    ? isRTL
      ? "md:pr-72"
      : "md:pl-72"
    : "";

  const closeSidebarOnSmallScreen = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const logout = () => {
    clearSession();
    setLocation("/");
  };

  return (
    <div
      className="admin-page-shell min-h-[100dvh] bg-slate-50/70 dark:bg-background"
      dir={adminText.dir}
    >
      <style>{`
        .admin-page-shell .admin-page-legacy > div > header {
          display: none !important;
        }
        .admin-page-shell .admin-page-legacy > div > main > .\\-mx-4 {
          display: none !important;
        }
        .admin-page-shell .admin-page-legacy > div > main {
          max-width: none !important;
          padding-top: 1rem !important;
        }
        .admin-sidebar-emergency button {
          width: 100% !important;
          min-height: 2.75rem !important;
          height: 2.75rem !important;
          justify-content: flex-start !important;
          border-radius: 0.875rem !important;
          border-color: rgb(255 255 255 / 0.12) !important;
          background: rgb(255 255 255 / 0.06) !important;
          color: rgb(255 255 255 / 0.88) !important;
          padding-inline: 0.75rem !important;
          box-shadow: none !important;
        }
        .admin-sidebar-emergency button:hover {
          background: rgb(255 255 255 / 0.12) !important;
          color: white !important;
        }
      `}</style>

      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[1px] md:hidden"
          aria-label={lang === "ar" ? "إغلاق القائمة" : lang === "ku" ? "داخستنی لیست" : "Close menu"}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 z-50 flex w-72 flex-col overflow-hidden border-white/10 bg-[linear-gradient(180deg,#07182d_0%,#091d36_52%,#061426_100%)] text-white shadow-2xl transition-transform duration-300 ease-out ${
          isRTL ? "right-0 border-l" : "left-0 border-r"
        }`}
        style={{
          transform: sidebarOpen
            ? "translateX(0)"
            : isRTL
              ? "translateX(100%)"
              : "translateX(-100%)",
        }}
        aria-hidden={!sidebarOpen}
      >
        <div className="relative flex h-16 shrink-0 items-center border-b border-white/10 px-5">
          <img
            src="/fawri-logo.svg"
            alt="Fawri"
            className="h-10 w-auto object-contain"
            draggable={false}
          />
          <div className="absolute inset-y-0 end-3 flex items-center md:hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label={lang === "ar" ? "إغلاق القائمة" : lang === "ku" ? "داخستنی لیست" : "Close menu"}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-2 pt-5">
          <div className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
            {lang === "ar" ? "أقسام الإدارة" : lang === "ku" ? "بەشەکانی بەڕێوەبردن" : "Administration"}
          </div>
          <nav className="space-y-1.5" aria-label={adminText.mainAdminTitle}>
            {TABS.map((item) => {
              const Icon = TAB_ICONS[item.id] || LayoutGrid;
              const count =
                item.filter === "ADMINISTRATORS"
                  ? pendingAdminDeviceCount
                  : tabCount(item);
              const active = item.id === tab;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    closeSidebarOnSmallScreen();
                  }}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex min-h-11 w-full items-center gap-3 overflow-hidden rounded-xl px-3 text-sm transition-all duration-200 ${
                    active
                      ? "bg-white/12 font-bold text-white shadow-[0_8px_26px_rgba(0,0,0,0.18)] ring-1 ring-white/10"
                      : "text-white/68 hover:bg-white/[0.07] hover:text-white"
                  }`}
                >
                  {active && (
                    <span
                      className={`absolute inset-y-2 w-1 rounded-full bg-orange-500 ${
                        isRTL ? "right-0" : "left-0"
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      active
                        ? "bg-orange-500/15 text-orange-400"
                        : "bg-white/[0.04] text-white/55 group-hover:text-white/90"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-start">
                    {item.label}
                  </span>
                  {count > 0 && (
                    <span
                      dir="ltr"
                      className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
                        active
                          ? "bg-orange-500 text-white"
                          : "bg-white/10 text-white/65"
                      }`}
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto border-t border-white/10 p-4">
          <div className="admin-sidebar-emergency mb-2">
            <EmergencyReadAccessLauncher />
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex h-11 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-white/70 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span>{adminText.mainLogout}</span>
          </button>
        </div>
      </aside>

      <div className={`min-h-[100dvh] transition-[padding] duration-300 ease-out ${contentOffset}`}>
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 shadow-[0_1px_0_rgba(15,23,42,0.03)] backdrop-blur-xl dark:border-border dark:bg-background/90">
          <div className="flex h-16 items-center gap-3 px-4 md:px-6">
            <button
              type="button"
              onClick={() => setSidebarOpen((value) => !value)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-muted"
              aria-label={
                sidebarOpen
                  ? lang === "ar"
                    ? "إخفاء القائمة الجانبية"
                    : lang === "ku"
                      ? "شاردنەوەی لیستی تەنیشت"
                      : "Hide sidebar"
                  : lang === "ar"
                    ? "إظهار القائمة الجانبية"
                    : lang === "ku"
                      ? "پیشاندانی لیستی تەنیشت"
                      : "Show sidebar"
              }
              title={sidebarOpen ? "Hide" : "Show"}
            >
              {sidebarOpen ? (
                isRTL ? (
                  <ChevronRight className="h-5 w-5" />
                ) : (
                  <ChevronLeft className="h-5 w-5" />
                )
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold text-muted-foreground">
                {lang === "ar" ? "لوحة التحكم" : lang === "ku" ? "کۆنترۆڵ پانێڵ" : "Control panel"}
              </p>
              <h1 className="truncate text-base font-black text-foreground md:text-lg">
                {activeTab?.label || adminText.mainAdminTitle}
              </h1>
            </div>

            {currentAdmin && (
              <div className="hidden max-w-[23rem] items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm lg:flex dark:border-border dark:bg-card">
                <span className="max-w-44 truncate font-bold text-foreground">
                  {currentAdmin.owner_name}
                </span>
                <span className="h-4 w-px bg-border" aria-hidden="true" />
                <span className="font-semibold tabular-nums text-muted-foreground" dir="ltr">
                  {currentAdmin.phone}
                </span>
              </div>
            )}

            <div className="flex shrink-0 items-center overflow-hidden rounded-xl border border-slate-200 bg-white p-0.5 text-[11px] font-bold shadow-sm dark:border-border dark:bg-card">
              {(["ar", "ku", "en"] as const).map((language) => (
                <button
                  key={language}
                  type="button"
                  onClick={() => setLang(language)}
                  className={`rounded-lg px-2 py-1.5 transition-colors ${
                    lang === language
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {language === "ar"
                    ? adminText.langAr
                    : language === "ku"
                      ? adminText.langKu
                      : adminText.langEn}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="admin-page-legacy">
          <AdminPageView model={model} />
        </div>
      </div>
    </div>
  );
}
