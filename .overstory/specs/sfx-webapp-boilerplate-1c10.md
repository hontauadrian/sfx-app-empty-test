<!-- written-by: scout-f3-tabshell -->
# Feature spec — F3 Admin internal tab shell (layout + AdminTabBar)

Top-level: sfx-webapp-boilerplate-26a0 (Phase-2 plan). Feature task: sfx-webapp-boilerplate-1c10.
Source product-plan: .overstory/specs/sfx-webapp-boilerplate-26a0.md §3 Chunk B + §5 J3.
Source dispatch: mail msg-a4bxtdykchlx from coordinator.
Scout: scout-f3-tabshell. Mode: direct-builder. Web-only feature — no Prisma, no API, no migration, no auth code, no new package.

F3 is parallel-safe with Chunk A (Company Info field expansion). F3 has no dependency on F1, F2, F4, or F5 of the older product-plan. F3 unblocks sfx-webapp-boilerplate-d0fe.

---

## 1. Context (files read)

### Existing admin-shell feature (keep — do not modify)

- `apps/web/src/features/admin-shell/index.ts` — current barrel exports `Sidebar`, `AdminRouteGate`, `AdminLandingPage`. F3 removes `AdminLandingPage` export (component deleted — see T7).
- `apps/web/src/features/admin-shell/constants.ts` — exports `HOME_ROUTE = '/'`, `ADMIN_ROUTE = '/admin'`, `ADMIN_COMPANY_INFO_ROUTE = '/admin/company-info'`. F3 extends with `ADMIN_TAB_REGISTRY` (T1).
- `apps/web/src/features/admin-shell/presentation/components/Sidebar/{index.tsx,use-sidebar.ts,map-to-sidebar-ui-model.ts,types.ts}` + `__tests__/` — reference pattern for F3 `AdminTabBar` (4-file pattern: presentation/hook/mapper/types + co-located `__tests__/`). Active-state predicate `pathname === ADMIN_ROUTE || pathname.startsWith(ADMIN_ROUTE + '/')` — F3 reuses that exact shape.
- `apps/web/src/features/admin-shell/presentation/components/AdminRouteGate/index.tsx` — untouched by F3. Wraps protected admin children. Used by F3's new `app/admin/layout.tsx`.
- `apps/web/src/features/admin-shell/presentation/pages/admin-landing/` — currently rendered at `/admin`. **DELETED by F3** (T7). After F3, `/admin` becomes a server-side redirect to `/admin/company-info`; no landing page rendered.

### Existing app/admin routes

- `apps/web/src/app/admin/page.tsx` — currently `<AuthGate><AdminRouteGate><AdminLandingPage/></AdminRouteGate></AuthGate>`. **Rewritten by F3** (T4) to `import { redirect } from 'next/navigation'; export default function AdminPage(): never { redirect(ADMIN_COMPANY_INFO_ROUTE); }`. Server-side redirect; no React tree.
- `apps/web/src/app/admin/__tests__/page.test.tsx` — rewritten to assert `redirect()` invocation (mock `next/navigation`).
- `apps/web/src/app/admin/company-info/page.tsx` — currently `<AuthGate><AdminRouteGate><CompanyInfoPage/></AdminRouteGate></AuthGate>`. **Rewritten by F3** (T5) to drop per-page `AuthGate` + `AdminRouteGate` wrappers — both hoisted into new `app/admin/layout.tsx` (single source of truth for `/admin/*` auth boundary). Page becomes `export default function Page(): ReactNode { return <CompanyInfoPage />; }`.
- `apps/web/src/app/admin/company-info/__tests__/page.test.tsx` — rewritten: drops gate-mocks, asserts `CompanyInfoPage` renders directly.

### Root layout

- `apps/web/src/app/layout.tsx` — mounts global `<Sidebar />` inside `<Providers>`. **Unchanged by F3.** The new `app/admin/layout.tsx` nests inside this root layout; root layout's sidebar continues to render alongside the new admin tab shell.
- `apps/web/src/app/providers.tsx` — `QueryClientProvider` + `ThemeProvider` + `LanguageProvider`. Unchanged. The admin layout server-component does not need providers — `useTranslations`-driven children are inside a client subtree.

### Localization (ADR-007 — translations resolved in mapper)

- `apps/web/src/features/presentation/localization/types.ts` — `TranslationNamespaces` currently exposes only `common`. The existing pattern is sub-objects on `common`, not separate namespaces: `common.admin.subnav.companyInfo` already provides the Company Info tab label. The dispatch mail's literal `useTranslations('admin')` is interpreted as labels sourced from the `common.admin.*` sub-object — F3 follows the in-tree convention (`useTranslations('common')` + `translations.admin.tabs.companyInfo`) rather than introducing a brand-new namespace, because (a) every consumer in-tree uses `useTranslations('common')`, (b) `TranslationNamespaces` is a typed map and adding a top-level namespace would require restructuring the registry, (c) `common.admin.subnav.companyInfo` already exists with the correct label in both languages. F3 extends `AdminTranslations` with a new `tabs: { companyInfo: string }` sub-object and uses it for the tab bar (subnav is kept untouched — it was the old landing-page subnav and is no longer rendered after F3).
- `apps/web/src/features/presentation/localization/languages/en/common.ts` — `common.admin.subnav.companyInfo = 'Company Info'`. F3 adds `common.admin.tabs.companyInfo = 'Company Info'` (T6).
- `apps/web/src/features/presentation/localization/languages/ro/common.ts` — `common.admin.subnav.companyInfo = 'Informatii companie'`. F3 adds `common.admin.tabs.companyInfo = 'Informatii companie'` (T6).
- `apps/web/src/features/presentation/localization/use-translations.ts` — generic `useTranslations` indexed by namespace. Unchanged.

### Routing constants forward-compat (Chunk C history routes)

Chunk C will introduce `/admin/company-info/history` and `/admin/company-info/history/:versionId`. F3's `AdminTabBar` active-state predicate for Company Info MUST already match those URLs so Chunk C does not need to rewire the tab. The predicate `pathname === ADMIN_COMPANY_INFO_ROUTE || pathname.startsWith(ADMIN_COMPANY_INFO_ROUTE + '/')` covers `/admin/company-info`, `/admin/company-info/history`, `/admin/company-info/history/abc` — and **also** covers `/admin` because the `/admin` page server-redirects to `/admin/company-info` (the browser address bar shows `/admin/company-info` at render time). F3 tests assert active-state at all four URLs.

### Tests / runner

- `apps/web/src/features/admin-shell/presentation/components/Sidebar/__tests__/Sidebar.test.tsx` — vitest + @testing-library/react + `vi.mock` on the hook. F3 mirrors exactly.
- `apps/web/src/features/admin-shell/presentation/components/Sidebar/__tests__/map-to-sidebar-ui-model.test.ts` — table-driven mapper test against `enCommon`. F3 mirrors.
- Stop hook + coverage gate enforces 90/90/90/90 — every new source file ships with a matching test file under sibling `__tests__/`.

### Out-of-scope (DO NOT TOUCH in F3)

- `apps/web/src/features/auth/*` — no auth code modified.
- `apps/web/src/features/company-info/*` — no company-info code modified.
- `apps/api/**` — no backend changes.
- `packages/**` — no shared package changes (constants stay inside `features/admin-shell/`).
- `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-1c10.json` — lead authors this BEFORE `ov sling`. F3 builder does NOT create or edit the flow file (path-boundary hook will block).

---

## 2. Task breakdown

Seven tasks, ordered. Each task ships test file(s) **before** implementation file(s) in the same commit (Stop hook would block otherwise). All paths absolute from repo root.

### T1 — Tab registry types + extensible registry in `features/admin-shell/constants.ts`

**New types + value.** Tab registry is a single source of truth; future tabs (`Users`, `Settings`, …) plug in by appending an entry — zero refactor in the bar component.

**Test file (write first):** `apps/web/src/features/admin-shell/__tests__/constants.test.ts` (create new — no constants test currently).

Test cases:
- `HOME_ROUTE === '/'`
- `ADMIN_ROUTE === '/admin'`
- `ADMIN_COMPANY_INFO_ROUTE === '/admin/company-info'`
- `ADMIN_TAB_REGISTRY` is a non-empty readonly array
- Each entry has `{ id: string; labelKey: string; href: string; isActive: (pathname: string) => boolean }`
- First entry has `id === 'companyInfo'` and `href === ADMIN_COMPANY_INFO_ROUTE`
- `companyInfo.isActive('/admin')` returns `true` (matches pre-redirect URL for resilience)
- `companyInfo.isActive('/admin/company-info')` returns `true`
- `companyInfo.isActive('/admin/company-info/history')` returns `true` (forward-compat for Chunk C)
- `companyInfo.isActive('/admin/company-info/history/v-abc-123')` returns `true`
- `companyInfo.isActive('/admin/company-information')` returns `false` (no naive startsWith)
- `companyInfo.isActive('/')` returns `false`
- `companyInfo.isActive('/administration')` returns `false`

**Modified file:** `apps/web/src/features/admin-shell/constants.ts`

Add:

```ts
export type AdminTabId = 'companyInfo';

export interface AdminTab {
  readonly id: AdminTabId;
  readonly labelKey: 'companyInfo';
  readonly href: string;
  readonly isActive: (pathname: string) => boolean;
}

function tabActive(href: string): (pathname: string) => boolean {
  return (pathname) => pathname === href || pathname.startsWith(href + '/');
}

export const ADMIN_TAB_REGISTRY: readonly AdminTab[] = [
  {
    id: 'companyInfo',
    labelKey: 'companyInfo',
    href: ADMIN_COMPANY_INFO_ROUTE,
    isActive: (pathname) =>
      pathname === ADMIN_ROUTE ||
      pathname === ADMIN_COMPANY_INFO_ROUTE ||
      pathname.startsWith(ADMIN_COMPANY_INFO_ROUTE + '/'),
  },
];
```

`labelKey` is a string literal that selects from `translations.admin.tabs[labelKey]` (T6 wires the keys). `tabActive` is exported as a helper for future tabs that want the simple `href || startsWith(href + '/')` semantics; the Company Info entry uses an inlined variant because it also matches `/admin` (pre-redirect URL).

### T2 — AdminTabBar presentation component

PascalCase folder per project convention. 4-file pattern.

**New folder:** `apps/web/src/features/admin-shell/presentation/components/AdminTabBar/`

**Files (test files FIRST):**

`__tests__/map-to-admin-tab-bar-ui-model.test.ts` — mapper test. Cases:
- Maps each entry of `ADMIN_TAB_REGISTRY` to a UI item with `key=id`, `label=translations.admin.tabs[labelKey]`, `href=entry.href`, `isActive=entry.isActive(pathname)`.
- Active-state at `pathname='/admin'` → companyInfo active.
- Active-state at `pathname='/admin/company-info'` → companyInfo active.
- Active-state at `pathname='/admin/company-info/history'` → companyInfo active.
- Active-state at `pathname='/admin/company-info/history/v-1'` → companyInfo active.
- Active-state at `pathname='/admin/users'` (hypothetical future tab path) → companyInfo NOT active.
- Active-state at `pathname='/'` → companyInfo NOT active.
- Uses `enCommon.admin.tabs.companyInfo` as the label when passed enCommon.
- Uses `roCommon.admin.tabs.companyInfo` as the label when passed roCommon.
- Accepts a custom registry fixture with 2 entries (`companyInfo` + a synthetic `users` entry that has its own `isActive`) — verifies BOTH items appear in the result, BOTH active-states resolved independently. Establishes extensibility — required by dispatch mail.
- `navAriaLabel` equals `translations.appName` (matches sidebar convention).

`__tests__/use-admin-tab-bar.test.ts` — hook test. Cases:
- Calls `usePathname()` (mocked from `next/navigation`) and feeds it to the mapper.
- Returns a `uiModel` whose `items` reflect the registry passed to the hook (default `ADMIN_TAB_REGISTRY`; test injects custom registry via optional arg).
- Returns Romanian labels when `LanguageProvider` is mocked to `'ro'`.
- Falls back to `'/'` when `usePathname()` returns `null`.

`__tests__/AdminTabBar.test.tsx` — component test (mock the hook). Cases:
- Renders `<nav role="navigation" aria-label="SFX App">`.
- Renders one `<a>` per `uiModel.items` with `href` + label text.
- The active item carries `aria-current="page"`; the inactive item does not.
- The active item applies the active CSS class (e.g. `bg-muted`) — assertion mirrors Sidebar test.
- Multi-tab fixture (2 items, one active, one inactive) — both rendered.
- Single-tab fixture (companyInfo only) — exactly one `<a>`.
- Renders Romanian labels when the uiModel carries them.

**Source files (after tests are written):**

`types.ts`:

```ts
import type { AdminTab } from '../../../constants';

export interface AdminTabBarItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly isActive: boolean;
}

export interface AdminTabBarUIModel {
  readonly navAriaLabel: string;
  readonly items: readonly AdminTabBarItem[];
}

export interface UseAdminTabBarReturn {
  readonly uiModel: AdminTabBarUIModel;
}

export interface AdminTabBarProps {
  readonly registry?: readonly AdminTab[];
}
```

`map-to-admin-tab-bar-ui-model.ts`:
- Signature: `mapToAdminTabBarUIModel({ translations, pathname, registry }: { translations: CommonTranslations; pathname: string; registry: readonly AdminTab[] }): AdminTabBarUIModel`.
- For each `tab` in `registry`: `{ key: tab.id, label: translations.admin.tabs[tab.labelKey], href: tab.href, isActive: tab.isActive(pathname) }`.
- `navAriaLabel: translations.appName`.

`use-admin-tab-bar.ts`:
- `'use client'`.
- `import { usePathname } from 'next/navigation'`.
- `import { useTranslations } from '@/features/presentation/localization'`.
- `import { ADMIN_TAB_REGISTRY } from '../../../constants'`.
- Signature: `useAdminTabBar(registry: readonly AdminTab[] = ADMIN_TAB_REGISTRY): UseAdminTabBarReturn`.
- Body: `const translations = useTranslations('common'); const pathname = usePathname() ?? '/'; return { uiModel: mapToAdminTabBarUIModel({ translations, pathname, registry }) };`.

`index.tsx`:
- `'use client'`.
- Component `AdminTabBar({ registry }: AdminTabBarProps): ReactNode`.
- Calls `useAdminTabBar(registry)`.
- Renders `<nav aria-label={uiModel.navAriaLabel} className="border-b border-border bg-background"><ul className="flex gap-2 px-4">{items.map(...)}</ul></nav>`.
- Each item: `<li key={item.key}><Link href={item.href} aria-current={item.isActive ? 'page' : undefined} className={...}>{item.label}</Link></li>` — uses `next/link`.
- Active class: `bg-muted text-foreground border-b-2 border-primary`; inactive: `text-muted-foreground hover:bg-muted hover:text-foreground`. Exact classNames derived from sidebar's tokens; never hardcode hex (CLAUDE.md rule).

**Modified file:** `apps/web/src/features/admin-shell/index.ts` — add `export { AdminTabBar } from './presentation/components/AdminTabBar';`. Update barrel test (`__tests__/index.test.ts`) to assert the new export. Remove `AdminLandingPage` export (T7 deletes the component).

### T3 — `app/admin/layout.tsx` wraps `{children}` in the tab shell

**New file:** `apps/web/src/app/admin/layout.tsx`

The layout is a **server component** that wraps the per-route children in `<AuthGate><AdminRouteGate>` + `<AdminTabBar />`. Both gates are pure client subtrees (already `'use client'`), so they can be children of a server component. `AdminTabBar` is `'use client'`.

```tsx
import type { ReactNode } from 'react';
import { AuthGate } from '@/features/auth';
import { AdminRouteGate, AdminTabBar } from '@/features/admin-shell';

interface AdminLayoutProps {
  readonly children: ReactNode;
}

/**
 * @routeGuard authenticated
 * @unauthRedirect /login
 */
export default function AdminLayout({ children }: AdminLayoutProps): ReactNode {
  return (
    <AuthGate>
      <AdminRouteGate>
        <div className="flex min-h-screen flex-col">
          <AdminTabBar />
          <div className="flex-1">{children}</div>
        </div>
      </AdminRouteGate>
    </AuthGate>
  );
}
```

**Test file (write first):** `apps/web/src/app/admin/__tests__/layout.test.tsx`. Cases:
- Renders `AuthGate > AdminRouteGate > AdminTabBar` + the children block.
- Children render where expected (`render(<AdminLayout><div data-testid="child" /></AdminLayout>)` then assert the child is inside the gates).
- Mocks `@/features/auth.AuthGate`, `@/features/admin-shell.AdminRouteGate`, `@/features/admin-shell.AdminTabBar` as identity wrappers (mirrors existing pattern in `app/admin/__tests__/page.test.tsx`).

### T4 — `app/admin/page.tsx` server-redirect to `/admin/company-info`

**Rewritten file:** `apps/web/src/app/admin/page.tsx`

```tsx
import { redirect } from 'next/navigation';
import { ADMIN_COMPANY_INFO_ROUTE } from '@/features/admin-shell/constants';

export default function AdminPage(): never {
  redirect(ADMIN_COMPANY_INFO_ROUTE);
}
```

Server-side redirect; no React tree. `AuthGate` + `AdminRouteGate` are now in the parent layout — even before the redirect runs, the layout still composes the gates around `{children}` from the page, so deny-states are still rendered correctly.

**Test file (rewritten):** `apps/web/src/app/admin/__tests__/page.test.tsx`. Cases:
- Mocks `next/navigation` to a spy on `redirect`.
- Calling `AdminPage()` throws (Next.js `redirect` throws a navigation signal — `vi.mocked(redirect).mockImplementation(() => { throw new Error('NEXT_REDIRECT'); })` to model that).
- The spy was called with `'/admin/company-info'`.

### T5 — Hoist auth gates out of `app/admin/company-info/page.tsx`

**Rewritten file:** `apps/web/src/app/admin/company-info/page.tsx`

```tsx
import type { ReactNode } from 'react';
import { CompanyInfoPage } from '@/features/company-info';

/**
 * @routeGuard authenticated
 * @unauthRedirect /login
 */
export default function Page(): ReactNode {
  return <CompanyInfoPage />;
}
```

The page no longer mounts `AuthGate` or `AdminRouteGate` — the layout owns the gates for all of `/admin/*`. Keep the `@routeGuard authenticated` doc comment for the contract compiler.

**Test file (rewritten):** `apps/web/src/app/admin/company-info/__tests__/page.test.tsx`. Cases:
- Mocks `@/features/company-info.CompanyInfoPage` as `<div data-testid="company-info-page" />`.
- Asserts `<Page />` renders the mocked page directly (no gate wrappers expected).

### T6 — Translations: `admin.tabs.companyInfo` (en + ro)

**Modified file:** `apps/web/src/features/presentation/localization/types.ts`

Add:

```ts
export interface AdminTabsTranslations {
  readonly companyInfo: string;
}
export interface AdminTranslations {
  readonly landing: AdminLandingTranslations;
  readonly subnav: AdminSubnavTranslations;
  readonly denied: AdminDeniedTranslations;
  readonly tabs: AdminTabsTranslations;   // NEW
}
```

**Modified file:** `apps/web/src/features/presentation/localization/languages/en/common.ts` — add `admin.tabs = { companyInfo: 'Company Info' }`.

**Modified file:** `apps/web/src/features/presentation/localization/languages/ro/common.ts` — add `admin.tabs = { companyInfo: 'Informatii companie' }`.

**Tests:** type-system enforces structural parity (both folders implement `CommonTranslations`) — typecheck catches mismatched keys. Add value-presence assertions to whichever existing language-folder test exists (or create `apps/web/src/features/presentation/localization/__tests__/admin-tabs.test.ts` asserting both languages expose non-empty `common.admin.tabs.companyInfo`).

### T7 — Delete `admin-landing` (no longer rendered)

`/admin` server-redirects to `/admin/company-info`. The landing page component is unreachable. Delete to avoid carrying dead code.

**Deleted folder:** `apps/web/src/features/admin-shell/presentation/pages/admin-landing/` (entire directory including `__tests__/`).

**Modified file:** `apps/web/src/features/admin-shell/index.ts` — remove the `AdminLandingPage` re-export.

**Modified file:** `apps/web/src/features/admin-shell/__tests__/index.test.ts` — remove `AdminLandingPage` from the barrel-export assertion; add `AdminTabBar` (already covered in T2).

If lead prefers a softer landing (keep the file for a transition period), this task can be deferred — but the spec assumes deletion because the redirect makes the landing component unreachable.

### Dependency order inside the feature

T1 → T2 (mapper imports `ADMIN_TAB_REGISTRY`) → T6 (mapper consumes `translations.admin.tabs.companyInfo`) → T3 (layout imports `AdminTabBar`) → T4 + T5 (in parallel — both independent) → T7 (cleanup).

In practice the builder can commit T1+T2+T6 together (the tab-bar slice is internally consistent only with all three), then T3+T4+T5 together (layout-and-page wiring lands as one observable change), then T7 (cleanup commit). Three commits total is acceptable; one big commit is also fine — the Stop hook only cares about per-file test coverage, not commit granularity.

---

## 3. TDD pattern reference

Reference patterns the builder copies verbatim — these are the in-tree templates the Stop hook has already accepted:

- **Mapper test:** `apps/web/src/features/admin-shell/presentation/components/Sidebar/__tests__/map-to-sidebar-ui-model.test.ts` — pure-function table-driven, imports `enCommon` directly, asserts shape of `uiModel`.
- **Hook test:** `apps/web/src/features/admin-shell/presentation/components/Sidebar/__tests__/use-sidebar.test.ts` — `vi.mock('next/navigation', ...)` for `usePathname`, mock language provider, mock auth repository.
- **Component test:** `apps/web/src/features/admin-shell/presentation/components/Sidebar/__tests__/Sidebar.test.tsx` — mocks the hook (`vi.mock('../use-sidebar', ...)`), asserts roles + `aria-current` + className tokens.
- **App-router page test:** `apps/web/src/app/admin/__tests__/page.test.tsx` (current version) — mocks `@/features/auth` and `@/features/admin-shell`, asserts containment via `toContainElement`.

For T4 redirect test, the canonical Next.js pattern (the builder must introduce it — first instance in this repo):

```ts
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

import AdminPage from '../page';
import { redirect } from 'next/navigation';

it('redirects to /admin/company-info', () => {
  expect(() => AdminPage()).toThrow('NEXT_REDIRECT');
  expect(redirect).toHaveBeenCalledWith('/admin/company-info');
});
```

---

## 4. Runtime acceptance (user-visible behavior the probe asserts)

Copied verbatim from product-plan §5 J3 + auth-boundary section, scoped to F3's diff. The probe generates concrete HTTP assertions from Zod schemas + NestJS decorators + the logical contract; the bullets below define the **journey-level outcomes** F3 is responsible for.

### J3 — Internal tab shell

- `GET /admin` (server-side) issues a 3xx redirect to `/admin/company-info`. Verified by Playwright following the redirect; verified by curl observing `Location: /admin/company-info` on the response from `/admin`.
- `GET /admin/company-info` returns HTML containing the admin tab bar with a tab labeled **Company Info** whose link target is `/admin/company-info` and which carries `aria-current="page"` (active marker).
- `GET /admin/company-info/history` (when Chunk C lands and the route exists) returns HTML containing the same tab bar with **Company Info** still active. Forward-compat assertion — F3 tests it via unit tests against the active-state mapper since the route does not yet exist; runtime probe will validate it once Chunk C is merged.
- The CTA on the Company Info tab named **View history** (added by Chunk C) is reachable from `/admin/company-info`. Out-of-scope for F3; mentioned only to establish that the tab bar must not visually swallow page-level CTAs.

### Auth-boundary regressions (preserved — F3 must not break)

- Unauthenticated visitor hitting `/admin` (after redirect, `/admin/company-info`) is redirected by oauth2-proxy to the existing Keycloak login surface.
- Unauthenticated visitor hitting `/admin/company-info` directly is redirected by oauth2-proxy.
- Authenticated non-admin hitting `/admin` (redirected to `/admin/company-info`) sees the existing `AdminRouteGate` deny screen — title, message, and back-to-home link from `translations.admin.denied`.
- Authenticated admin sees the tab bar render with `Company Info` active. Browser refresh on `/admin/company-info` keeps the tab active.
- Sidebar `Admin` item visibility (already shipped Phase-1) is unchanged — non-admins do not see it in the DOM; admins do.

### General

- Every CTA named in §2 (App shell) leads somewhere that renders without a runtime error (no React `Error: …` overlay, no 500 in the network panel).
- No regression in the existing `/admin/company-info` page — it continues to render the form, with the auth gates now hoisted into the layout.

---

## 5. Guard contract

Per scout-overlay contract requirements:

| Surface | Classification | Unauth behavior | Non-admin behavior |
|---|---|---|---|
| `/admin` (Next.js page → server redirect) | `authenticated` | oauth2-proxy → Keycloak login | `AdminRouteGate` deny screen (post-redirect on `/admin/company-info`) |
| `/admin/company-info` (Next.js page) | `authenticated` | oauth2-proxy → Keycloak login | `AdminRouteGate` deny screen |
| `app/admin/layout.tsx` (wraps all `/admin/*`) | n/a — layout | oauth2-proxy → Keycloak login | `AdminRouteGate` deny screen |
| `AdminTabBar` component | n/a — only mounted under the layout | unreachable | unreachable |

F3 introduces no new API endpoints. F3 adds no new auth code. The existing oauth2-proxy + Keycloak boundary continues to handle session establishment; `AdminRouteGate` continues to handle role enforcement; F3 only changes WHERE those gates mount (page-level → layout-level).

---

## 6. Contract annotations (files the builder must keep current)

The contract compiler reads route metadata + JSDoc tags from these files. The builder must maintain them as part of F3:

- `apps/web/src/app/admin/layout.tsx` — add JSDoc `@routeGuard authenticated` and `@unauthRedirect /login` (match `app/admin/company-info/page.tsx` which currently uses `/login`). The layout becomes the canonical declaration site for the `/admin/*` guard.
- `apps/web/src/app/admin/page.tsx` — the redirect handler. No JSDoc needed (no React tree, no contract to extract), but the file must remain a server module (no `'use client'`).
- `apps/web/src/app/admin/company-info/page.tsx` — keep the existing `@routeGuard authenticated` and `@unauthRedirect /login` comment so the contract still records the guard at the leaf even though the gate component moved up.
- `.claude/runtime-contract.logical.json` — F3 does not touch this. The lead updates the logical contract if J3's `/admin → 3xx` is not already present; the scout flags this in the result mail if missing.

F3 does NOT touch `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-1c10.json` — the lead authors that file (path-boundary hook blocks the builder).

---

## 7. Open questions for lead / coordinator

1. **Translation namespace.** Dispatch mail says `useTranslations('admin')` (literal). In-tree convention is `useTranslations('common')` with sub-objects (`translations.admin.tabs.*`). The spec follows the in-tree convention because (a) `TranslationNamespaces` is a typed map and adding a top-level `admin` namespace requires restructuring `languages/registry.ts` + every consumer, (b) every existing consumer including the sidebar and the admin landing page uses `useTranslations('common').admin.*`, (c) `common.admin.*` already exists. If lead prefers a true new namespace `'admin'`, the spec adds an extra task (T0): create `languages/{en,ro}/admin.ts`, update `TranslationNamespaces` type, update registry, update use-translations type bound — ~6 file edits, low risk but tangential to F3 scope. **Recommendation:** keep in-tree convention.
2. **AdminLandingPage deletion (T7).** Spec deletes the unreachable landing page. Lead may prefer to keep it for one merge cycle as a soft-rollback artifact. Either is fine — deletion is the spec's recommendation because dead code rots faster than it's reverted.
3. **Tab bar visual treatment.** Spec leaves exact CSS to the builder (use Tailwind tokens; no hardcoded hex per `apps/web/CLAUDE.md`). If lead has a target mockup, send it in `flow_update` mail — builder will match. Otherwise builder picks a conventional underline-active treatment.

---

## 8. Notable findings (for parent's mulch recording — classification suggested)

- **(foundational)** Existing admin-shell pattern: `usePathname()` resolved in hook, not in JSX or mapper. Active-state predicate `pathname === route || pathname.startsWith(route + '/')` is the in-tree canonical guard against false-positive matches like `/administration`. Already enforced by Sidebar tests — F3 reuses verbatim.
- **(foundational)** Translation pattern: `useTranslations('common')` returns `CommonTranslations` (a typed map); sub-objects live under `common.<feature>.*`. New features should add a new sub-object inside `common`, not a new namespace, unless the namespace is genuinely orthogonal. F3 confirmed via every existing consumer.
- **(tactical)** Layout-vs-page auth-gate placement: when multiple `/admin/*` pages share the same auth requirement (J4/J5), the gate composition `<AuthGate><AdminRouteGate>` belongs in the Next.js layout, not the page. F3 hoists it. F4 (Chunk C history routes) inherits gates automatically once the layout owns them.
- **(observational)** Next.js `redirect()` from `next/navigation` is a server-side throwable. Test patterns must model it as a thrown error, not a returned value — confirmed via Next 15 docs; F3 introduces the first such test in this repo.
- **(foundational)** PascalCase folder per component (`AdminTabBar/`), kebab-case file inside (`use-admin-tab-bar.ts`, `map-to-admin-tab-bar-ui-model.ts`), `__tests__/` sibling. Confirmed via Sidebar + AdminRouteGate. `apps/web/CLAUDE.md` naming table is authoritative.
- **(observational)** The existing `/admin` page's `<AuthGate>` wrapper is duplicated against `/admin/company-info`'s `<AuthGate>` wrapper. With the new layout, both pages can drop the wrapper. F3 includes the cleanup (T5).
