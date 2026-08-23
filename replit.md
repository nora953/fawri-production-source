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
- Operational cloud authority: Express + PostgreSQL for cut-over domains
- Legacy browser state: localStorage remains only for compatibility/mock/local-preference paths that have not been cut over; it is not an operational authority for server-authoritative domains
- Icons: lucide-react (UI) + react-icons/fa (platform brand icons)
- Spreadsheet: xlsx (for CSV/Excel product import)
- Animations: framer-motion
- Toasts: sonner

## Where things live

- `artifacts/fawri/src/lib/types.ts` — legacy/shared frontend TypeScript data model interfaces
- `artifacts/fawri/src/lib/store.ts` — legacy localStorage compatibility CRUD; do not promote it into a production authority
- `artifacts/fawri/src/lib/cashierLocalContracts.ts` — provider-neutral local-first cashier contracts and cloud/local capability policy
- `artifacts/fawri/src/lib/i18n.tsx` — I18n context + useI18n hook (JSX — .tsx)
- `artifacts/fawri/src/lib/i18n.ts` — re-exports from i18n.tsx (preserves existing imports)
- `artifacts/fawri/src/lib/translations/` — ar.ts, ku.ts, en.ts
- `artifacts/fawri/src/lib/validators.ts` — phone + password validation
- `artifacts/fawri/src/contexts/ThemeContext.tsx` — light/dark/auto theme
- `artifacts/fawri/src/pages/` — all pages
- `artifacts/fawri/src/components/layout/` — Header, DashboardLayout, Sidebar, BottomNav
- `artifacts/fawri/src/components/PlatformIcon.tsx` — branded social icons
- `docs/fawri-ui-baseline.md` — canonical merchant UI baseline
- `docs/local-first-cashier-architecture.md` — canonical cashier/POS architecture contract

## Architecture decisions

- **Server authority after cutover**: operational domains already moved to PostgreSQL/API must not fall back to browser localStorage.
- **Legacy localStorage**: old products/orders helpers may be used only as migration/compatibility evidence. They are not the production cashier authority.
- **Local-first cashier**: local cashier sales remain available without an active cloud subscription and during internet outages. Cloud sync, AI, connected channels, remote management, and cloud backup are optional cloud capabilities.
- **Cashier storage provider is intentionally undecided**: the current app is web/Vite and has no production SQLite/PWA offline runtime yet. Use provider-neutral contracts first; choose IndexedDB/PWA vs desktop/SQLite through a focused durability prototype.
- **i18n.ts → i18n.tsx split**: The I18nProvider uses JSX, so it lives in i18n.tsx. The i18n.ts file re-exports from it.
- **RTL/LTR**: Controlled via the I18n layer/document direction. Arabic and Kurdish are RTL; English is LTR.
- **Platform icons**: Social platform brand icons use react-icons/fa — not lucide-react.
- **Orange primary brand**: #f97316 (orange-500), via the Fawri theme tokens.

## Merchant UI generation contract

Before creating or visually editing any merchant-facing page, modal, form, catalog editor, settings surface, commerce workflow, or cashier UI:

1. Read `docs/fawri-ui-baseline.md` first.
2. Reuse the canonical `fawri-ui-baseline` wrapper and constants in `artifacts/fawri/src/lib/fawriUiBaseline.ts` instead of inventing page-specific form styling.
3. Treat SignupPage, LoginPage, and Admin Early Warning as the approved visual references for typography, spacing, controls, RTL/LTR behavior, focus states, and interaction density.
4. New merchant controls default to 48px height, 12px radius, 14px labels with 20px line-height, 8px label-to-control spacing, and Fawri theme tokens unless the baseline explicitly permits a compact control.
5. Prefer shared Fawri/shadcn Select and Checkbox primitives. Do not rely on browser-default select arrows or merchant-facing `datetime-local` rendering.
6. Arabic/Kurdish RTL must place select arrows and control affordances correctly; technical/numeric values may remain LTR where appropriate.
7. A page is not visually complete until it is checked against the baseline in Arabic, Kurdish, English, desktop, and mobile.

This UI contract is the default for future generated merchant interfaces and should be changed only by an explicit design-system decision, not by one-off page polish.

## Local-first cashier generation contract

Before creating or changing cashier/POS runtime, persistence, order creation, inventory mutation, subscription gating, or cloud synchronization:

1. Read `docs/local-first-cashier-architecture.md` first.
2. Reuse `artifacts/fawri/src/lib/cashierLocalContracts.ts`; do not bypass it by binding the cashier UI directly to HTTP, PostgreSQL, localStorage, IndexedDB, or SQLite details.
3. Local cashier capability must not depend on cloud subscription state or connectivity. An expired/inactive/unknown cloud entitlement disables cloud capabilities, not local selling.
4. Cloud capabilities fail closed unless entitlement is confirmed active and connectivity is online.
5. Do not use `artifacts/fawri/src/lib/store.ts` or `orderEngine.ts` as the production local cashier authority.
6. Completed local sales use immutable snapshots with ISO currency + integer minor-unit money.
7. Inventory changes use append-only movements. Sale + inventory movements + outbox append must be atomic in the chosen durable local provider.
8. Cloud sync is operation-based and idempotent. Never use destructive last-write-wins for sales or inventory movements.
9. Do not choose a storage provider until the PWA/IndexedDB vs desktop/SQLite durability gate is explicitly completed.
10. Do not claim POS production readiness until offline cold start, restart recovery, duplicate/uncertain sync, returns/voids, inventory exactly-once behavior, historical promotion snapshots, and local-only operation are tested.

## Product

- **Landing page**: Hero, supported channels, Why Fawri features, How it works, Pricing, Final CTA
- **Auth**: Signup, OTP, lifecycle/pending activation flows
- **Merchant dashboard**: Overview, Conversations, Products & Services, Promotions, Orders, Saved Answers, Channels, Subscription, Settings
- **Admin panel**: merchant/subscription/channel/support administration
- **3 languages**: Arabic (RTL), Kurdish Sorani (RTL), English (LTR)
- **3 theme modes**: Light, Dark, Auto

## User preferences

- No word "bot" in public marketing copy — use "Fawri", "موظف مبيعاتك الذكي", "Smart Sales Assistant"
- No "unlimited" anywhere in pricing
- No emojis in UI
- Primary color: Orange
- Subscription pricing currently uses Iraqi Dinar (IQD); merchant commerce currency is a separate authority and must not be conflated with subscription billing currency

## Gotchas

- **i18n.ts contains no JSX**: it is a re-export wrapper. Actual JSX lives in `i18n.tsx`.
- **Platform icons**: import branded platform icons from `react-icons/fa`, not lucide-react.
- **xlsx package**: must remain in Fawri dependencies for spreadsheet import.
- **Legacy localStorage code exists**: presence does not make it authoritative. Check the domain's current server/local authority before using it.
- **Cashier local mode is not subscription-gated**: never disable local sales because the cloud subscription expired or the network is unavailable.

## Pointers

- See `docs/fawri-ui-baseline.md` for merchant UI generation.
- See `docs/local-first-cashier-architecture.md` before any POS/local persistence/sync work.
