# Fawri / فوري

A SaaS web platform for Iraqi online stores — Fawri is a smart sales assistant that replies automatically to customers on social platforms, understands products and stock, and helps convert messages and comments into orders.

## Run & Operate

- `pnpm --filter @workspace/fawri run dev` — run the frontend (auto-started via workflow)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui
- Routing: wouter
- State: localStorage (mock MVP — database-ready architecture)
- API: Express 5 (shared api-server artifact)
- Icons: lucide-react (UI) + react-icons/fa (platform brand icons)
- Spreadsheet: xlsx (for CSV/Excel product import)
- Animations: framer-motion
- Toasts: sonner

## Where things live

- `artifacts/fawri/src/lib/types.ts` — all TypeScript data model interfaces
- `artifacts/fawri/src/lib/store.ts` — localStorage CRUD + seed data
- `artifacts/fawri/src/lib/i18n.tsx` — I18n context + useI18n hook (JSX — .tsx)
- `artifacts/fawri/src/lib/i18n.ts` — re-exports from i18n.tsx (preserves all existing imports)
- `artifacts/fawri/src/lib/translations/` — ar.ts, ku.ts, en.ts
- `artifacts/fawri/src/lib/validators.ts` — phone + password validation
- `artifacts/fawri/src/contexts/ThemeContext.tsx` — light/dark/auto theme
- `artifacts/fawri/src/pages/` — all pages (LandingPage, auth, dashboard/*, AdminPage, Privacy, Terms)
- `artifacts/fawri/src/components/layout/` — Header, DashboardLayout, Sidebar, BottomNav
- `artifacts/fawri/src/components/PlatformIcon.tsx` — branded social icons

## Architecture decisions

- **localStorage MVP**: All data stored in localStorage with database-ready interfaces. Easy swap to Supabase/PostgreSQL later by replacing store.ts getters/setters with API calls.
- **i18n.ts → i18n.tsx split**: The I18nProvider uses JSX, so it lives in i18n.tsx. The i18n.ts file re-exports from it to preserve all 23 existing imports without changes.
- **RTL/LTR**: Controlled via `document.documentElement.dir`. Arabic and Kurdish are RTL; English is LTR. CSS `[dir="rtl"]` block applies Arabic font stack and removes letter-spacing.
- **Platform icons**: All social platform icons (Instagram, Messenger, Telegram, WhatsApp, TikTok) use react-icons/fa — NOT lucide-react, which doesn't have brand logos.
- **Orange primary brand**: #f97316 (orange-500). Applied as the primary CSS var throughout.

## Product

- **Landing page**: Hero, supported channels, Why Fawri features, How it works, Pricing (Silver/Gold/Diamond in IQD), Final CTA
- **Auth**: Signup with phone validation (starts with 0, 11 digits) + password validation (7+ chars, uppercase+number, no symbols), OTP mock, pending activation screen
- **Merchant dashboard**: Overview (plan usage + alerts), Conversations (chat UI + take over), Products (CRUD + add modal), Import (xlsx parse + column mapping), Orders (status management), Saved Answers, Channels (mock connect/disconnect), Subscription (emergency credit), Settings
- **Admin panel**: Approve/reject merchants, activate/renew plans, reset reply counters
- **3 languages**: Arabic (RTL), Kurdish Sorani (RTL), English (LTR) — all persisted in localStorage
- **3 theme modes**: Light, Dark, Auto (follows system prefers-color-scheme)

## User preferences

- No word "bot" in any public marketing copy — use "Fawri", "موظف مبيعاتك الذكي", "Smart Sales Assistant"
- No "unlimited" anywhere in pricing
- No emojis in UI
- Primary color: Orange
- Pricing in Iraqi Dinar (IQD)

## Gotchas

- **i18n.ts contains JSX**: The file `i18n.ts` is a re-export wrapper. The actual JSX lives in `i18n.tsx`. Do NOT write JSX directly in `i18n.ts`.
- **Platform icons**: Always import from `react-icons/fa` (FaInstagram, FaFacebookMessenger, FaTelegram, FaWhatsapp, FaTiktok) — not from lucide-react.
- **xlsx package**: Must be in fawri's devDependencies for the import products page to work.
- **Demo login**: Phone `07901234567`, password `Demo1234` — logs into the demo merchant (approved status, Gold plan).
- **Admin login**: Phone `07801234567`, password `Admin123` — logs into admin panel.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
