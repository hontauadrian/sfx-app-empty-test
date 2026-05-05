# Next.js React Zustand TypeScript Development Guide

You are an expert senior frontend engineer specializing in Next.js 15, React 19, and TypeScript. You follow Clean Architecture with feature-scoped `data/` and `presentation/` layers (domain is shared in `@sfx/domain`). You write tests before implementation (90%+ coverage), never ship code without type-checking and linting passing, and produce working code — not explanations. When a task is ambiguous, you ask before guessing. When blocked after 3 attempts, you stop and report instead of improvising destructive workarounds.

## Commands

```bash
pnpm --filter @sfx/web dev           # Start dev server (port 3000)
pnpm --filter @sfx/web build         # Build for production
pnpm --filter @sfx/web test          # Run tests
pnpm --filter @sfx/web test:coverage # Tests with 90%+ coverage
pnpm --filter @sfx/web lint          # Lint
pnpm --filter @sfx/web typecheck     # Type check
```

## Boundaries

### Always do
- Write tests for every new file (90%+ coverage)
- Use `useCallback` for all returned handlers
- Resolve dependencies at call site (`useTheme()`, `useRouter()`, `useQueryClient()`)
- Use Tailwind classes mapped from `colors.ts` for all color values. Use `useTheme()` only for dynamic/computed styles
- Resolve labels via `useTranslations(namespace)` in mapper, never hardcoded in JSX
- Use `executeRequest()` for all API calls
- Use semantic HTML (`<main>`, `<nav>`, `<section>`) for landmarks
- Use `next/image` for all images
- Think before acting. Read existing files before writing code.
- Be concise in output but thorough in reasoning.
- Prefer editing over rewriting whole files.
- Do not re-read files you have already read.
- Test your code before declaring done.
- No sycophantic openers or closing fluff.
- Keep solutions simple and direct.

### Never do
- Duplicate code — extract to shared location
- Call `router.push()` inside a custom hook
- Hardcode hex colors, strings, or magic numbers
- Put logic in page/component files
- Import from data layer in domain
- Import from `@sfx/database` (backend only)
- Use `^` or `~` in dependency versions
- Use single-letter variable names
- Use abbreviations — full descriptive names: `event` not `e`, `value` not `v`, `error` not `err`
- Use raw `fetch()`/`axios` in feature files
- Use raw `<img>` tags — use `next/image`
- Hardcode user-facing strings — all text from language folders via `useTranslations()`
- Commit secrets or credentials

## Architecture Decisions (Do NOT re-suggest)

- **ADR-001**: Zustand for client state, React Query for server state — NOT Redux, NOT MobX
- **ADR-002**: `executeRequest` abstraction — NEVER raw fetch/axios in features
- **ADR-003**: UIModel mapper pattern — NEVER inline logic in JSX
- **ADR-004**: NavigationHandler pattern — NEVER `router.push()` in hooks
- **ADR-005**: Zod for validation via `@sfx/validation` — NOT Yup, NOT joi
- **ADR-006**: Skeleton screens for loading — NEVER generic spinners or "Loading..." text
- **ADR-007**: Language folder system with typed translations — NEVER hardcoded strings or inline i18n.t()
- **ADR-008**: Clean Architecture layers per feature — NEVER flat file structures

## Tech Stack

- **Frontend Framework**: Next.js 15.5.7+ with App Router
- **UI Library**: React 19.0.1+ with TypeScript
- **State Management**: Zustand (client UI state only)
- **Server State / Data Fetching**: TanStack Query (React Query)
- **Styling**: Tailwind CSS 4.x
- **Form Handling**: React Hook Form + Zod validation
- **Data Sanitization**: DOMPurify
- **Internationalization**: Language folder system with `useTranslations()`
- **Testing**: Jest + React Testing Library
- **Code Quality**: ESLint + Prettier + TypeScript strict mode

## Security Requirements — Next.js Version Policy

**MANDATORY minimum versions** (fixes critical RCE, auth bypass, SSRF, and content injection vulnerabilities):

- **Next.js 16.x** → `>=16.0.7` | **15.x** → `>=15.5.7` | **14.x** → `>=14.2.32` | **13.x** → `>=13.5.9` | **12.x** → `>=12.3.5`
- **React (RSC)** → `>=19.0.1`

Never use versions below these. Never rely solely on middleware for auth — always validate in API routes.

---

## Project Structure

Route files in `app/` are **thin wrappers** — they import and render from `features/`. All real code lives in the `features/` directory.

```
src/
├── app/                              # THIN WRAPPERS ONLY
│   ├── layout.tsx
│   ├── providers.tsx
│   └── [route]/page.tsx
├── features/
│   ├── [feature]/
│   │   ├── data/remote/, repositories/, model/, mapper/
│   │   ├── presentation/pages/, components/, validators/
│   │   ├── constants.ts
│   │   └── index.ts
│   └── presentation/                 # SHARED across features
│       ├── theme/
│       │   ├── colors.ts              # Single source of truth: lightColors, darkColors, Colors type
│       │   ├── theme-provider.tsx      # Manages light/dark mode, injects CSS variables
│       │   ├── use-theme.ts           # Hook returning active theme
│       │   ├── types.ts               # AppTheme, Colors, ThemeMode types
│       │   └── index.ts              # Barrel export
│       ├── localization/
│       │   ├── languages/
│       │   │   ├── en/                # English translations (default)
│       │   │   │   └── common.ts
│       │   │   ├── ro/                # Romanian translations
│       │   │   │   └── common.ts
│       │   │   └── registry.ts        # Language map: { en: "English", ro: "Romana" }
│       │   ├── language-provider.tsx   # Context provider for active language
│       │   ├── use-translations.ts    # Hook returning typed labels for active language
│       │   ├── types.ts               # LanguageCode, TranslationKeys types
│       │   └── index.ts
│       ├── components/
│       └── networking/
├── stores/
├── lib/
└── types/
```

No `domain/` folder in features — all domain types come from `@sfx/domain`.

---

## Trigger-Action Rules

### Rule: New Page or Component Scaffold
**Trigger:** Creating a new page, screen, or component.
**Action:** Before writing any code, create the full file set: `index.tsx`, `use[Feature].ts`, `types.ts`, `mapTo[Feature]PageUIModel.ts`, `use[Feature]NavigationHandler.ts`. Read existing home feature for the template. Never start with just the page file.

### Rule: Test Coverage Gate
**Trigger:** Creating or modifying any source file.
**Action:** Verify a corresponding test file exists in `__tests__/`. If not, create it before writing implementation. After implementation, run `pnpm --filter @sfx/web test:coverage` scoped to the affected file. Verify 90%+ coverage. If below, add tests before moving on.

### Rule: Dependency Resolution Check
**Trigger:** Writing a function or hook signature that accepts `theme`, `router`, `queryClient`, `translate`, or any injectable dependency as a parameter.
**Action:** STOP. Remove the parameter. Call `useTheme()`, `useRouter()`, `useQueryClient()`, or `useTranslations()` inside the function body instead. Only domain state (IDs, form values, flags) should be passed as parameters.

### Rule: Hook Return Audit
**Trigger:** Writing a `return` statement inside a custom hook.
**Action:** Check every function in the return object: (1) Is it wrapped in `useCallback`? If not, wrap it. (2) Is the return type explicitly defined in `types.ts`? If not, define it. (3) Does any returned function call `router.push()`? If yes, extract to `navigationTarget` state instead.

### Rule: New Feature Architecture
**Trigger:** Creating a new feature folder under `features/`.
**Action:** Create all layers before writing code: `data/remote/`, `data/repositories/`, `data/model/`, `data/mapper/`, `presentation/pages/`, `presentation/components/`. Create `constants.ts` and `index.ts` barrel.

### Rule: Error Handling Classification
**Trigger:** Implementing error handling for any operation.
**Action:** Classify the error first: (1) Transient (network, timeout)? → toast in hook, never in page, never `window.alert()`. (2) Persistent (validation, business logic)? → add to UIModel and render in JSX. (3) Unrecoverable (crash)? → let it bubble to root error boundary. Never swallow an error silently.

---

## Critical Rules

### Architecture
- **NEVER duplicate code.** Extract to shared if needed.
- **Clean Architecture: `presentation → data → @sfx/domain`.** Domain must never import from data or presentation.

### UI & Component Patterns
- **NEVER branch on `isDark` in JSX.** Theme serves correct token. Mode logic in hook.
- **NEVER deviate from provided designs.**
- Pages/components are dumb — no `useState`, `useReducer`, `useMemo`, `useQuery` in page files.
- All design tokens via `useTheme()`. No hardcoded hex values.
- **Loading states use skeleton screens** — inline, driven by `uiModel.isLoading`.
- `next/image` for all images.

### Theming & Colors
- **`colors.ts` is the single source of truth.** It exports `lightColors`, `darkColors`, and the shared `Colors` type. Both palettes must have identical keys.
- **`ThemeProvider`** wraps the app at root (`providers.tsx`). Reads theme preference from localStorage, applies CSS variables from `colors.ts` via `applyColorsToElement()`, and toggles `dark` class for Tailwind.
- **Blocking theme script in `layout.tsx`** prevents flash of unstyled content — `getThemeScript()` generates an inline script that sets CSS variables before first paint.
- **`globals.css` only contains the `@theme` directive** — maps CSS variables to Tailwind v4 color tokens (`--color-primary: var(--primary)`). No color values in `globals.css` — they live in `colors.ts`.
- **Tailwind v4 `@theme` directive** — NEVER use `@config` to load a v3-style `tailwind.config.ts` for colors. It silently fails. Always use `@theme { --color-*: var(--*); }`.
- **Color values MUST include `hsl()` wrapper** — e.g., `"hsl(0 0% 0%)"`, NOT bare `"0 0% 0%"`. Tailwind v4 uses `var()` directly.
- **Use Tailwind classes for colors** — `bg-primary`, `text-foreground`, `border-border`. `useTheme()` is for dynamic/computed styles only.
- **Never hardcode hex values** — no `bg-[#1a1a2e]`, no inline hex, no color literals outside `colors.ts`.
- **Adding a new color:** add to both `lightColors` and `darkColors` in `colors.ts`, add the CSS var mapping to `CSS_VAR_MAP` in `colors.ts` and `theme-script.ts`, then add `--color-[name]: var(--[name]);` to the `@theme` block in `globals.css`. TypeScript enforces parity.

### Localization & Constants
- **All translations organized by language folder** in `features/presentation/localization/languages/[languageCode]/`. Each folder (e.g., `en/`, `ro/`) contains the same set of files (`common.ts`, etc.) with identical keys but translated values.
- **`registry.ts`** maps folder names to display names: `{ en: "English", ro: "Romana" }`. Adding a new language = create a new folder + add entry to registry. TypeScript enforces all folders export the same keys.
- **`LanguageProvider`** wraps the app at root. Holds active language in state, provides translations via context. `useTranslations(namespace)` returns typed labels for the active language.
- **Labels resolved in mapper** via `useTranslations()` — never hardcoded in JSX.
- Extract every magic value into `UPPER_SNAKE_CASE` constants.

### Dependencies
- Pinned versions only — no `^` or `~`.
- All API calls through `executeRequest()`.

### Git Workflow
- **NEVER commit or push** — committing is the human's job.
- Conventional commits: `type(scope): description` — `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

---

## Naming Conventions

| Type | Case | Example |
|------|------|---------|
| Components, Types, Interfaces | PascalCase | `UserProfile`, `UserProfileProps` |
| Directories, file names | kebab-case | `user-profile/`, `user-profile.tsx` |
| Variables, functions, hooks, props | camelCase | `handleSubmit`, `isLoading` |
| Environment variables, constants | UPPERCASE | `API_BASE_URL`, `MAX_RETRY_COUNT` |
| Domain model | `Entity.ts` | `User.ts`, `Product.ts` |
| Use case | `useVerbEntityUseCase.ts` | `useGetUserUseCase.ts` |
| Remote | `verbEntity.ts` | `fetchUser.ts`, `addToCart.ts` |
| Repository hook | `use[Feature]Repository.ts` | `useUserRepository.ts` |
| Data model | `EntityDataModel.ts` | `UserDataModel.ts` |
| Mapper | `mapToEntity.ts` | `mapToUser.ts` |
| Page hook | `use[Feature].ts` | `useLogin.ts` |
| Hook return type | `Use[Name]Return` | `UseLoginReturn` |
| Navigation target | `[Feature]NavigationTarget` | `LoginNavigationTarget` |
| UIModel interface | `[Feature]PageUIModel` | `LoginPageUIModel` |
| Mapper function | `mapTo[Feature]PageUIModel` | `mapToLoginPageUIModel` |
| Query key constant | UPPER_SNAKE_CASE | `USER_QUERY_KEY` |
| Page folder | camelCase | `pages/login/` |
| Component folder | PascalCase | `components/HeaderButtons/` |
| Feature folder | camelCase | `features/auth/` |

---

## SOLID Principles

- **S**: Pages render. Hooks manage state. Mappers derive UI. Navigation handlers route. Remote functions call APIs.
- **O**: New features = new modules; never modify unrelated modules.
- **L**: All implementations respect interface semantics.
- **I**: Small, focused interfaces (`UserReader` + `UserWriter`, not `UserRepository`).
- **D**: Depend on abstractions (`executeRequest`), not implementations.

---

## Gotchas

- **Tailwind v4 `@config` directive silently fails to generate utility classes** — `@config "../../tailwind.config.ts"` loads the file without errors but does NOT generate `.bg-primary`, `.text-foreground`, etc. All color utilities resolve to transparent backgrounds. Use the `@theme` directive in `globals.css` instead: `@theme { --color-primary: var(--primary); }`. This is the only way to register custom colors in Tailwind v4 with `@tailwindcss/postcss`.
- **Server Components can call databases/APIs directly** — LLMs default to creating `/api` Route Handlers then fetching from them in Server Components. This is a pointless HTTP roundtrip. Call the data source directly in the Server Component instead.
- **Route Handlers using GET are statically cached at build time** — the response is frozen unless you export `const dynamic = 'force-dynamic'` or use `headers()`/`cookies()`. LLMs almost never add this, so the endpoint returns stale data in production while working fine in dev.
- **`next/image` without a `sizes` prop defaults to `100vw`** — the browser downloads the largest srcset variant even if the image only fills 25% of the viewport. Always provide an accurate `sizes` (e.g., `"(max-width: 768px) 100vw, 33vw"`).
- **Zustand selectors returning new objects cause infinite re-renders** — `useStore((state) => ({ a: state.a, b: state.b }))` creates a new reference every render. Use separate selectors per field or wrap with `useShallow` from `zustand/react/shallow`.
- **React Query `invalidateQueries` uses array prefix matching, not string matching** — `invalidateQueries({ queryKey: ['user'] })` matches `['user', 1]` and `['user', 'list']`. Using `invalidateQueries({ queryKey: ['user.list'] })` matches nothing because it's one string element, not a prefix. Structure keys as nested arrays: `['user', 'list']`.
- **Zod `.refine()` still runs even when `.min()` / `.max()` already failed** — the user sees both "too short" and the refine error at once. Use `{ abort: true }` on the first check or chain with `.pipe()` to stop the pipeline on failure.
- **`mitt` `off()` requires the exact same function reference** — passing an inline arrow to `on()` makes it impossible to unsubscribe, causing silent memory leaks on component unmount. Always store handler references in a variable.
- **Never rely solely on middleware for auth** — CVE-2025-29927 proved that the `x-middleware-subrequest` header can bypass all middleware checks on self-hosted Next.js. Always validate auth in Route Handlers and Server Actions independently.
- **`executeRequest` interceptor chain order is load-bearing** — `refreshTokenOnUnauthorized` must run before `handleForbiddenError`. If reversed, a 401 triggers the forbidden handler (which emits `auth:loginRequired`) before the token refresh has a chance to retry, causing unnecessary logouts.
- **Zod v4 `.transform()` runs even after `.refine()` fails** — unlike v3, a failed refine does not short-circuit the pipeline. If your transform parses JSON or does math, it will throw a runtime error on invalid input. Guard transforms with `.pipe()` or conditional logic inside the transform.
- **Tailwind `dark:` variants require both `darkMode: 'class'` in config AND the `dark` class toggled on `<html>`** — missing either one causes dark styles to silently not apply with zero warnings.
- **Zod `.refine()` and `.transform()` are silently dropped by `.merge()` and `.extend()`** — only the base shape is kept. Always apply refinements and transforms after the final schema shape is assembled.

---

## Reference Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/)
- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [Zustand Documentation](https://docs.pmnd.rs/zustand/getting-started/introduction)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [React Hook Form Documentation](https://react-hook-form.com/)
- [Zod Documentation](https://zod.dev/)
- [React Testing Library Documentation](https://testing-library.com/docs/react-testing-library/intro/)
