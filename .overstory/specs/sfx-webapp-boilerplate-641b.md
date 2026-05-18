# Feature spec — F3 Sidebar + admin shell + `/admin` landing + role gate

Top-level issue: `sfx-webapp-boilerplate-c33f`. Feature issue: `sfx-webapp-boilerplate-641b`.
Source product-plan: `.overstory/specs/sfx-webapp-boilerplate-c33f.md`.
F1 spec: `.overstory/specs/sfx-webapp-boilerplate-51de.md` — F3 consumes `AUTH_ROLE_ADMIN` from `@sfx/shared`.
Mode: direct-builder. Web-only feature — no api, no Prisma, no migration, no flow-file authoring.

F4 imports `AdminRouteGate` from this feature; F4 dispatch blocked on F3 close.

---

## 1. Context (files read)

### Routing + root composition
- `apps/web/src/app/layout.tsx` — root layout. `<html lang="en">` → `<head>` (theme script) → `<body><Providers>{children}</Providers></body>`.
- `apps/web/src/app/page.tsx` — root page renders `<AuthGate><HomePage /></AuthGate>`. Pattern to mirror in `app/admin/page.tsx`.
- `apps/web/src/app/providers.tsx` — `QueryClientProvider` → `ThemeProvider` → `LanguageProvider`. Sidebar consumes `useAuthSessionRepository()` (React Query) and `useTranslations('common')` — both must resolve inside `<Providers>`. Sidebar MUST mount INSIDE the Providers tree.

### Auth + session shape
- `apps/web/src/features/auth/data/mapper/map-to-auth-session.ts` — `AuthSession = { isAuthenticated, subject, email: string|null, roles: string[], hasAppAccess }`.
- `apps/web/src/features/auth/data/repositories/use-auth-session-repository.ts` — `useAuthSessionRepository(): UseQueryResult<AuthSession>`. F3 reads `{ data: session, isLoading, isError }`.
- `apps/web/src/features/auth/presentation/components/AuthGate/use-auth-gate.ts` — pattern for hook + UIModel mapper. Loading skeleton uses `animate-pulse rounded-lg bg-muted`.
- `apps/web/src/features/auth/presentation/components/AuthGate/index.tsx` — pattern for "3-branch render".
- `apps/web/src/features/auth/index.ts` — exports `AuthGate`, `useAuthSessionRepository`, `fetchAuthSession`, `AuthSession`.

### Shared role constant (F1 dependency)
- `packages/shared/src/index.ts` — F1 ships `AUTH_ROLE_ADMIN`. F3 imports as `import { AUTH_ROLE_ADMIN } from '@sfx/shared'`. NEVER hardcode `'admin'`.

### Localization (typed labels)
- `apps/web/src/features/presentation/localization/types.ts` — `CommonTranslations` interface. F3 adds nested sub-objects `nav` and `admin`.
- `apps/web/src/features/presentation/localization/languages/en/common.ts` + `ro/common.ts` — TypeScript enforces parity. F3 adds nested keys to both.
- `apps/web/src/features/presentation/localization/use-translations.ts` — `useTranslations('common')` returns typed `CommonTranslations`.

### Patterns to mirror (home feature template)
- `apps/web/src/features/home/presentation/pages/home/index.tsx` — `'use client'`, calls hook, renders from `uiModel`.
- `apps/web/src/features/home/presentation/pages/home/use-home.ts` — hook composes `useTranslations` + repo hook + mapper.
- `apps/web/src/features/home/presentation/pages/home/map-to-home-page-ui-model.ts` — pure mapper.
- `apps/web/src/features/home/presentation/pages/home/types.ts` — `*PageUIModel` + `Use*Return` types.

### Theme tokens
- `apps/web/src/features/presentation/theme/colors.ts` — Tailwind v4 `@theme` tokens. F3 styles via utility classes (`bg-background`, `text-foreground`, `border-border`, `hover:bg-muted`, `text-muted-foreground`). NEVER hardcode hex.

### Flow file (informational; F3 builder does NOT touch)
- `.overstory/runtime-contract.flows/_shared.json` — actors declared.
- `.overstory/runtime-contract.flows/641b.json` — authored by lead before builder spawns.

---

## 2. Task breakdown

Six task groups.

### T1 — Translations: extend `CommonTranslations` + add EN + RO entries

**Modified files**
- `apps/web/src/features/presentation/localization/types.ts`
- `apps/web/src/features/presentation/localization/languages/en/common.ts`
- `apps/web/src/features/presentation/localization/languages/ro/common.ts`

**Test cases**
1-12. Assertions on each new key value (EN: `Home`/`Admin`/`Administration`/`Company Info`/`Back to Home`/non-empty deny strings; RO: `Acasă`/`Administrare`/non-empty).
13. Type parity test: deep-equal key check recurses into nested sub-objects.

**Implementation**
1. Extend `CommonTranslations` with `NavTranslations { home, admin }` + `AdminTranslations { landing: { title }, subnav: { companyInfo }, denied: { title, message, backToHome } }`.
2. EN: `nav: { home: 'Home', admin: 'Admin' }`, `admin: { landing: { title: 'Administration' }, subnav: { companyInfo: 'Company Info' }, denied: { title: 'Access denied', message: 'You do not have permission to view this page.', backToHome: 'Back to Home' } }`.
3. RO: `nav: { home: 'Acasă', admin: 'Administrare' }`, `admin: { landing: { title: 'Administrare' }, subnav: { companyInfo: 'Informații companie' }, denied: { title: 'Acces interzis', message: 'Nu ai permisiunea de a vizualiza această pagină.', backToHome: 'Înapoi la Acasă' } }`.

**Notes**
- Nested sub-objects match product-plan dotted naming (`nav.home`, `admin.landing.title`).
- TS parity enforced via `const common: CommonTranslations = { … }`.

### T2 — `AdminRouteGate` component

**New files**
- `apps/web/src/features/admin-shell/presentation/components/AdminRouteGate/{index.tsx,types.ts,use-admin-route-gate.ts,map-to-admin-route-gate-ui-model.ts}`
- `__tests__/{AdminRouteGate.test.tsx,map-to-admin-route-gate-ui-model.test.ts}`

**Test cases**

AdminRouteGate.test.tsx:
1. `isLoading=true` → skeleton; children NOT rendered.
2. `isLoading=false, isError=true` → deny surface.
3. `data={isAuthenticated:false, roles:[]}` → deny surface.
4. `data={isAuthenticated:true, roles:[]}` → deny surface with heading + body + `Back to Home` link `href="/"`.
5. `data={isAuthenticated:true, roles:['admin']}` → children passthrough.
6. `data={isAuthenticated:true, roles:['viewer','admin']}` → children passthrough (.includes).
7. `Back to Home` link keyboard-accessible `<a href="/">`.
8. Deny labels from `useTranslations('common').admin.denied.*`.

map-to-admin-route-gate-ui-model.test.ts:
9. Loading → `{status:'loading'}`.
10. Undefined session → `'denied'` with all fields.
11. Empty roles → `'denied'`.
12. Admin role → `'allowed'`.
13. Non-admin role → `'denied'`.
14. `backToHomeHref === '/'`.

**Implementation**
1. Types:
   ```ts
   export type AdminRouteGateUIModel =
     | { readonly status: 'loading' }
     | { readonly status: 'allowed' }
     | { readonly status: 'denied'; readonly title; readonly message; readonly backToHomeLabel; readonly backToHomeHref };
   ```
2. Mapper: loading → loading; admin role → allowed; else denied with translations + `backToHomeHref: '/'`.
3. Hook (`'use client'`): reads translations + session repo, delegates.
4. Component (`'use client'`): switch on `uiModel.status`. Allowed → children. Loading → skeleton. Denied → `<main><section><h1>{title}</h1><p>{message}</p><a href={backToHomeHref}>{backToHomeLabel}</a></section></main>`. Same Tailwind tokens as AuthGate unauth surface.

**Notes**
- Import `AUTH_ROLE_ADMIN` from `@sfx/shared`. Never hardcode.
- Deny surface uses `<main>` for landmark.

### T3 — `AdminLandingPage` component

**New files**
- `apps/web/src/features/admin-shell/presentation/pages/admin-landing/{index.tsx,types.ts,use-admin-landing.ts,map-to-admin-landing-page-ui-model.ts}`
- `__tests__/{AdminLandingPage.test.tsx,map-to-admin-landing-page-ui-model.test.ts}`
- `apps/web/src/features/admin-shell/constants.ts` — `HOME_ROUTE = '/'`, `ADMIN_ROUTE = '/admin'`, `ADMIN_COMPANY_INFO_ROUTE = '/admin/company-info'`.

**Test cases**

AdminLandingPage.test.tsx:
1. `<h1>` text matches `admin.landing.title` ('Administration').
2. `<nav>` with exactly ONE link.
3. Link text matches `admin.subnav.companyInfo` ('Company Info').
4. Link `href === '/admin/company-info'`.
5. Page does NOT call any data-fetching hook.
6. Page wrapped in `<main>`.

map-to-admin-landing-page-ui-model.test.ts:
7. Returns `{ title, subnavItems: [{key:'companyInfo', label, href:'/admin/company-info'}] }`.
8. `subnavItems` length 1.
9. Labels from `translations.admin.*`.

**Implementation**
1. Types: `AdminLandingPageUIModel { title, subnavItems: readonly AdminSubnavItem[] }`.
2. Mapper: hand-authored array of length 1.
3. Hook (`'use client'`): `useTranslations('common')` + mapper.
4. Component (`'use client'`): `<main><h1>{title}</h1><nav><ul>...</ul></nav></main>`.

### T4 — `Sidebar` component

**New files**
- `apps/web/src/features/admin-shell/presentation/components/Sidebar/{index.tsx,types.ts,use-sidebar.ts,map-to-sidebar-ui-model.ts}`
- `__tests__/{Sidebar.test.tsx,map-to-sidebar-ui-model.test.ts}`

**Test cases**

map-to-sidebar-ui-model.test.ts:
1. Loading → `{status:'loading'}`.
2-3. Unauth → `{status:'hidden'}`.
4-5. Authenticated no admin role + various pathnames → `items:[home]` with active flag per `pathname === '/'`.
6. Admin role + `'/'` → `items:[home,admin]`, home active.
7. Admin role + `'/admin'` → admin active.
8. Admin role + `'/admin/company-info'` → admin active (startsWith '/admin/' semantic).
9. Admin role + `'/administration'` → admin NOT active (rule = `pathname === '/admin' || pathname.startsWith('/admin/')`, not naïve `startsWith('/admin')`).
10. Home active only on exact `/`.
11. Non-admin role (`'viewer'` only) → admin entry NOT in array.
12. Multi-role array including admin → admin entry present.
13. Labels from `translations.nav.*`.
14. Stable `key` ('home', 'admin').

Sidebar.test.tsx:
15. `status:'loading'` → skeleton rail.
16. `status:'hidden'` → `container.firstChild === null`.
17-19. `visible` with various items + active → `aria-current="page"` on active link.
20. Active link className includes a theme-derived active token (e.g. `bg-muted` or `border-l-primary`).
21. `getByRole('navigation')` resolves with `aria-label`.
22. RO language → links read 'Acasă'/'Administrare'.

**Implementation**
1. Types:
   ```ts
   export interface SidebarNavItem {
     readonly key: 'home' | 'admin';
     readonly label: string;
     readonly href: string;
     readonly isActive: boolean;
   }
   export type SidebarUIModel =
     | { readonly status: 'loading' }
     | { readonly status: 'hidden' }
     | { readonly status: 'visible'; readonly items: readonly SidebarNavItem[]; readonly navAriaLabel: string };
   ```
2. Mapper:
   - Loading → loading.
   - Unauth → hidden.
   - Always-include home with `isActive: pathname === HOME_ROUTE`.
   - If `roles.includes(AUTH_ROLE_ADMIN)`: append admin with `isActive: pathname === ADMIN_ROUTE || pathname.startsWith(\`${ADMIN_ROUTE}/\`)`.
3. Hook (`'use client'`): `useTranslations`, `useAuthSessionRepository`, `usePathname()` from `next/navigation`, delegate.
4. Component (`'use client'`): switch on status. Hidden → null. Loading → `<aside>` skeleton. Visible → `<aside><nav aria-label><ul>` of `<li><a href aria-current={isActive ? 'page' : undefined}>{label}</a></li>`. Tailwind tokens only (`w-56 shrink-0 border-r border-border bg-background`).

**Notes**
- Active-state rule MUST be `pathname === ADMIN_ROUTE || pathname.startsWith(\`${ADMIN_ROUTE}/\`)` — never naïve `startsWith('/admin')`.
- Sidebar HIDES (returns null) on unauth — AuthGate centered surface stays centered.
- `usePathname()` from `next/navigation` returns string in Next 15.

### T5 — Mount sidebar in root layout + admin route wrapper

**Modified files**
- `apps/web/src/app/layout.tsx`

**New files**
- `apps/web/src/app/admin/page.tsx`
- `apps/web/src/features/admin-shell/index.ts` (barrel: `Sidebar`, `AdminRouteGate`, `AdminLandingPage`).
- `apps/web/src/app/__tests__/layout.test.tsx`
- `apps/web/src/app/admin/__tests__/page.test.tsx`

**Test cases**
1. Layout renders `<Providers>` and `<Sidebar />` is mounted inside the Providers tree.
2. Layout outputs a flex container.
3. `<html lang="en">` preserved.
4. `app/admin/page.tsx` renders `<AuthGate><AdminRouteGate><AdminLandingPage /></AdminRouteGate></AuthGate>`. ZERO logic in wrapper.

**Implementation**
1. `layout.tsx`:
   ```tsx
   <body>
     <Providers>
       <div className="flex min-h-screen">
         <Sidebar />
         <div className="flex-1">{children}</div>
       </div>
     </Providers>
   </body>
   ```
2. `app/admin/page.tsx`:
   ```tsx
   import { AuthGate } from '@/features/auth';
   import { AdminRouteGate, AdminLandingPage } from '@/features/admin-shell';
   export default function AdminPage(): ReactNode {
     return (
       <AuthGate>
         <AdminRouteGate>
           <AdminLandingPage />
         </AdminRouteGate>
       </AuthGate>
     );
   }
   ```
3. Feature barrel `apps/web/src/features/admin-shell/index.ts` — exports `Sidebar`, `AdminRouteGate`, `AdminLandingPage`.

**Notes**
- Sidebar mount INSIDE Providers is the only interpretation that compiles — hooks `useAuthSessionRepository` + `useTranslations` need provider context.
- `app/admin/page.tsx` carries NO conditional logic — server component composing client components.

### T6 — Feature barrel + verification

**New files**
- `apps/web/src/features/admin-shell/index.ts` (created in T5).

**Test cases**
1. Barrel test: `import * as adminShell` exposes `Sidebar`, `AdminRouteGate`, `AdminLandingPage`.

**Implementation**
1. Add barrel.
2. `pnpm probe:smoke` — verify `641b.json` flows pass.
3. `pnpm --filter @sfx/web test:coverage` — ≥90% per file.

---

## 3. Acceptance

### From product-plan §3 F3
All bullets covered by T1-T6.

### Runtime acceptance from product-plan §5

**J1** — authenticated non-admin lands on Home:
- Sidebar shows exactly one nav item (`Home`/`Acasă`).
- NO `Admin` nav item.
- Backend admin-guarded endpoints return auth-denied (F2).

**J2** — admin navigates Admin → Company Info:
- Sidebar shows `Home` + `Admin`.
- Activating `Admin` lands on `/admin` with heading 'Administration' + sub-nav `Company Info`.
- Activating sub-nav navigates to `/admin/company-info` (target page is F4).

**J4** — non-admin on admin URL directly:
- `/admin` → deny surface with `Back to Home` link `href="/"`.
- `/admin/company-info` → F4 reuses `AdminRouteGate`; same deny surface.

**J5** — unauth visitor on admin URL:
- AuthGate short-circuits before AdminRouteGate; existing unauth surface renders. No new login.
- Sidebar hidden (null).

**Sidewide**:
- Sidebar present on every authenticated route inside root layout.
- Sidebar absent on unauthenticated AuthGate surface.
- Every nav item navigates without runtime error.
- `pnpm probe:smoke` passes.

### Close-gate
- `pnpm typecheck` (F1 must be merged first), `pnpm lint`, `pnpm --filter @sfx/web test:coverage` ≥90%, `pnpm probe:smoke`.

---

## 4. Guard contract

| Surface | Type | Unauth | Authed non-admin | Authed admin |
|---|---|---|---|---|
| `/` | authenticated | AuthGate surface. Sidebar hidden. | Sidebar (Home only). HomePage renders. | Sidebar (Home + Admin). HomePage renders. |
| `/admin` | authenticated + role `admin` | AuthGate surface. Sidebar hidden. | AuthGate passes → AdminRouteGate denies → in-page deny surface. Sidebar (Home only). | AuthGate passes → AdminRouteGate allows → AdminLandingPage renders. Sidebar (Home + Admin). |
| Any future admin sub-route (F4's `/admin/company-info`) | authenticated + role `admin` | AuthGate surface. | F4 reuses `AdminRouteGate`; deny. | F4's page renders. |

Auth boundary mechanics:
- `AuthGate` (existing) gates on `session.hasAppAccess`.
- `AdminRouteGate` (new) gates on `session.roles.includes(AUTH_ROLE_ADMIN)`.
- Defense in depth: backend endpoints enforce `@AuthRoles(AUTH_ROLE_ADMIN)` server-side.

### Contract annotations
- `apps/web/src/app/layout.tsx` — `export const metadata` unchanged.
- `apps/web/src/app/admin/page.tsx` — server component, no `metadata` export.
- `.overstory/runtime-contract.flows/641b.json` — owned by lead.
- No middleware (`apps/web/middleware.ts` not introduced — AuthGate at page-tree root is the boilerplate pattern).

---

## 5. Out of scope

- **No api changes.** Nothing under `apps/api/`.
- **No F1 changes.** Consume `AUTH_ROLE_ADMIN` from `@sfx/shared` only.
- **No F4 changes.** `apps/web/src/features/company-info/`, `apps/web/src/app/admin/company-info/page.tsx` out of scope.
- **No shared sidebar abstractions** (`<NavItem>`, generic `<Layout>`). Inline JSX.
- **No nav-config registry file**. `subnavItems` hand-authored in landing mapper.
- **No new translation namespaces.** Extend `common` only.
- **No edits to LanguageProvider/ThemeProvider/QueryClientProvider.**
- **No edits to `apps/web/src/features/auth/`** — read-only consumer.
- **No `/login`, `/register`, local JWT, Keycloak/oauth2-proxy/OAUTH_* removal.**
- **No middleware** (CVE-2025-29927 surface).
- **No edits to `.overstory/runtime-contract.flows/`** (hook-blocked).
- **No edits to `.runtime-contract.overlay.json` or `.runtime-contract.logical.json`.**
- **No package additions or version bumps.**
- **No new color tokens** — use existing.
- **No `router.push()` from inside hooks** — `<a href>` navigation.
- **No data fetching on `/admin` landing.**
- **No DOM-level role bypass** (no disabled-but-visible Admin link to non-admins).
- **No `as any`/`@ts-ignore`/`@ts-expect-error`.**

---

## 6. Dependencies + handoff

**Depends on:** F1 (`sfx-webapp-boilerplate-51de`) merged. Imports `AUTH_ROLE_ADMIN`.

**Independent of:** F2 (no api calls of its own).

**Unblocks:** F4 (imports `AdminRouteGate` from `@/features/admin-shell`).

**Builder handoff:**
- Capability: `builder` direct, one slot.
- File scope (writable):
  - `apps/web/src/features/admin-shell/**`
  - `apps/web/src/app/admin/**`
  - `apps/web/src/app/layout.tsx`
  - `apps/web/src/features/presentation/localization/types.ts`
  - `apps/web/src/features/presentation/localization/languages/en/common.ts`
  - `apps/web/src/features/presentation/localization/languages/ro/common.ts`
  - `apps/web/src/features/presentation/localization/languages/__tests__/registry.test.ts`
- Close-gate from worktree root: `pnpm typecheck && pnpm lint && pnpm --filter @sfx/web test:coverage && pnpm probe:smoke`.
- WORKER_DONE mail MUST include `## runtime-evidence` block.
- Flow file `.overstory/runtime-contract.flows/641b.json` authored by lead BEFORE builder spawns. Builder reads only.

---

## 7. Notable findings

- **foundational** — Sidebar MUST mount INSIDE `<Providers>`. Hooks `useAuthSessionRepository` + `useTranslations` need provider context. Product-plan §2 "sibling of `<Providers>{children}</Providers>`" describes visual layout, not React tree. Resolution: `<Providers><div className="flex"><Sidebar />{children}</div></Providers>`.
- **foundational** — Active-state for `/admin` MUST use `pathname === ADMIN_ROUTE || pathname.startsWith(\`${ADMIN_ROUTE}/\`)`. Naïve `startsWith('/admin')` false-matches `/administration`.
- **foundational** — Role match is `session.roles.includes(AUTH_ROLE_ADMIN)`, not equality. Users carry multiple roles.
- **foundational** — `CommonTranslations` parity enforced by TypeScript recursively for nested sub-objects.
- **tactical** — Sidebar HIDES on unauth (returns null) — AuthGate centered surface stays centered.
- **tactical** — `AUTH_ROLE_ADMIN` from `@sfx/shared` is SOLE source. Grep finds 3 sites max.
- **tactical** — `<aside>` + `<main>` route-level a11y landmarks. Deny surface in AdminRouteGate uses `<main>`.
- **tactical** — `usePathname()` from `next/navigation` is source of truth for active state. Don't read `window.location`.
- **tactical** — `subnavItems` hand-authored length-1 array. No feature registry pattern.
- **observational** — AuthGate skeleton `animate-pulse rounded-lg bg-muted h-32 w-full max-w-md`. Sidebar mirrors with sidebar-appropriate widths.
- **observational** — `app/admin/page.tsx` server component composing client components — no `'use client'` at page level.
- **observational** — `next/navigation` `usePathname()` returns string (no null-guard) in Next 15.
- **observational** — Romanian boilerplate uses no diacritics. Builder may follow either convention but consistently.

End of spec.
