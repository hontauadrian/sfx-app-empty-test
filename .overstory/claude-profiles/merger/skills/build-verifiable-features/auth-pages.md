# Auth Pages and Protected Procedures

## When to use this pattern

You're building a Next.js page, a tRPC procedure, an Express route, or
declaring login/register/post-login destinations for the Logical App
Contract. Path-name and folder-name heuristics that historically inferred
"this looks protected" or "this looks like the login page" have been
removed. You must declare intent explicitly.

This skill covers four declarations:

1. **Next.js page identity** — sibling `page.identity.<ext>` file.
2. **tRPC procedure protection** — `// @protected` or `.meta({ protected: true })`.
3. **Express route protection** — overlay or `x-auth-required` extension.
4. **Page identity overlay** — `overlay.auth.{loginPage,registerPage,postLoginDestination}` (fallback only).

## Why path-name and folder-name guesses were removed

Folder names like `(auth)`, `(dashboard)`, `(protected)`, `(authenticated)`,
`(app)`, `(private)` are conventions in some apps but not others. A folder
called `(dashboard)` may be public marketing. A page at `/admin` may have
no guard. A function named `requireAuth` may be a no-op shim. Field names
like `statusCode` may not exist in your error envelope at all.

The probe's job is to catch contract drift. Heuristics defeat that — they
fabricate green assertions on routes that look right but aren't. The
probe is now strict: declare the boundary, or the probe stays silent and
emits a DIAG telling you which declaration to add.

## Pattern 1 — Next.js page identity (sibling file)

### Why a sibling file (and not a comment, and not an export)?

Two earlier designs both failed:

- **Line comment on the layout** (`// @routeGuard authenticated`) — fragile.
  Comment regex is brittle (JSDoc blocks silently fail), the value space
  is hard-coded (`authenticated` only), and there's no place for the
  *role* declaration the Logical Contract needs (login-page,
  register-page, post-login-destination). Adding a sibling channel for
  role would have meant two parallel mechanisms.
- **`export const routeGuard = 'authenticated'` on `page.tsx`** —
  **rejected by Next.js 15.** App Router's `PageProps` index signature
  rejects extra exports with: *"Property 'routeGuard' is incompatible
  with index signature."* The build fails. There is no way to attach a
  typed declaration to a page module.

The only design that satisfies both constraints (declarative + Next.js
15-compatible + extensible to roles) is a **typed sibling file** named
`page.identity.<ext>`, co-located with the `page.tsx` it describes.

The sibling file is:

- **Typed** — agents and developers get autocomplete + compile-time
  checks against an enum of valid roles and guards.
- **Declarative** — the probe statically parses `export const identity = {…}`
  with regex; no runtime, no path-name guessing.
- **Per-page** — each page declares its own role/guard; no
  ancestor-walking ambiguity.
- **Co-located** — the declaration sits next to the file it describes,
  so renames stay in sync.
- **Open-ended** — adding a new role (e.g. `verify-email-page`,
  `oauth-callback-page`) is a one-line type-union extension; no detector
  rewrite needed.

### The pattern

For every page that has a special role in the auth flow OR is
authenticated, create a `page.identity.<ext>` file next to `page.tsx`:

```ts
// apps/web/src/app/(public)/login/page.identity.ts
import type { PageIdentity } from '@/lib/probe/page-identity';

export const identity: PageIdentity = {
  role: 'login-page',
  guard: 'public',
};
```

```ts
// apps/web/src/app/(public)/register/page.identity.ts
import type { PageIdentity } from '@/lib/probe/page-identity';

export const identity: PageIdentity = {
  role: 'register-page',
  guard: 'public',
};
```

```ts
// apps/web/src/app/dashboard/page.identity.ts
import type { PageIdentity } from '@/lib/probe/page-identity';

export const identity: PageIdentity = {
  role: 'post-login-destination',
  guard: 'authenticated',
};
```

```ts
// apps/web/src/app/settings/page.identity.ts
import type { PageIdentity } from '@/lib/probe/page-identity';

export const identity: PageIdentity = {
  role: 'public', // settings page exists at this route, but has no special logical role
  guard: 'authenticated',
};
```

### The PageIdentity type

Define this type once in your project. The probe doesn't import it — it
parses the `identity` object literal directly with regex — but TypeScript
keeps developers and agents honest:

```ts
// apps/web/src/lib/probe/page-identity.ts
export type PageRole =
  | 'login-page'
  | 'register-page'
  | 'post-login-destination'
  | 'logout-destination'
  | 'public';

export type PageGuard = 'public' | 'authenticated';

export interface PageIdentity {
  role: PageRole;
  guard: PageGuard;
}
```

### Public pages without a special role

If a page is public AND has no special logical role, you can either:

1. Skip the identity file entirely — the page is detected as `guard='unknown'`
   (an info-level DIAG, not a failure).
2. Declare `{ role: 'public', guard: 'public' }` to be explicit.

Option 2 is recommended for marketing/landing pages where you want the
DIAG to go away.

### Detector rules (for reference)

The probe scans every directory containing a `page.<ext>` (App Router)
for a sibling `page.identity.<ext>` file matching:

```js
const IDENTITY_FILE_BASENAME_RE = /^page\.identity\.(tsx|ts|jsx|js)$/;
const IDENTITY_BLOCK_RE         = /export\s+const\s+identity\s*(?::\s*[A-Za-z_$][\w$.]*\s*)?=\s*(\{[\s\S]*?\})\s*(?:as\s+const)?\s*;?/m;
const ROLE_KEY_RE               = /(?:^|[\s{,])role\s*:\s*['"]([^'"]+)['"]/;
const GUARD_KEY_RE              = /(?:^|[\s{,])guard\s*:\s*['"]([^'"]+)['"]/;
```

Valid roles: `login-page`, `register-page`, `post-login-destination`,
`logout-destination`, `public`.

Valid guards: `public`, `authenticated`.

### Role uniqueness — declarative refusal on conflict

Each role (except `public`) must be claimed by **at most one** page. If
two pages both declare `role: 'login-page'`, the probe emits
`PAGE_ROLE_AMBIGUOUS` and **drops the role from the map** — it refuses to
pick. You must fix the source so exactly one page owns the role.

### Pages Router (legacy)

Pages Router files (`pages/dashboard.tsx`) do not yet have a
sibling-file convention. They are detected as `guard='unknown'` and the
probe runs no auth-boundary assertions for them. Migrate to App Router
to get identity declarations.

### What NOT to do

| Form | Why it fails |
|---|---|
| `export const identity = {…}` directly in `page.tsx` | **Next.js 15 PageProps index signature rejects extra exports.** Build fails. |
| `// @routeGuard authenticated` line comment on layout | Removed. Use the sibling file instead. |
| Naming the file `identity.ts` (no `page.` prefix) | Detector regex requires `page.identity.<ext>`. Skipped. |
| Putting the file at a non-page directory | Detector only scans directories that contain a `page.<ext>` sibling. |
| `export const identity = { role: 'dashboard', … }` | `dashboard` is not a valid role. The probe emits `PAGE_IDENTITY_INVALID` and the file is ignored. |
| `export const identity = { role: 'login-page' }` (no `guard`) | `guard` is required. `PAGE_IDENTITY_INVALID`. |

### Diagnostics

| DIAG | Level | Meaning |
|---|---|---|
| `PAGE_IDENTITY_UNDECLARED` | info | Page has no sibling `page.identity.<ext>`. Defaults to `guard='unknown'`. Not a failure. |
| `PAGE_IDENTITY_INVALID` | warn | The identity file exists but the `role`/`guard` values don't match the allowed enums, or the export isn't parseable. |
| `PAGE_ROLE_AMBIGUOUS` | warn | Two or more pages claim the same role. Probe refuses to pick. |

## Pattern 2 — tRPC protected procedures

### Declare via comment (recommended)

```ts
export const userRouter = router({
  // @protected
  getProfile: t.procedure.query(({ ctx }) => ctx.user),
});
```

The comment must be on the line immediately above the procedure
assignment. The probe matches `/\/\/\s*@protected\b/`.

### Declare via `.meta({ protected: true })`

```ts
export const userRouter = router({
  getProfile: t.procedure
    .meta({ protected: true })
    .query(({ ctx }) => ctx.user),
});
```

The `.meta(...)` call must appear in the procedure chain before
`.query(…)` / `.mutation(…)`. The probe matches
`/\.meta\s*\(\s*\{[^}]*protected\s*:\s*true/` against the procedure
declaration text.

### What gets removed if you forget

| Removed heuristic | Reason |
|---|---|
| `protectedProcedure` string match | Trivially defeated by aliasing: `const proc = protectedProcedure;` then using `proc` looks public. |

Procedures without one of the two accepted declarations get
`guard='unknown'` and `TRPC_PROTECTION_UNDECLARED` is emitted listing the
count.

## Pattern 3 — Express route protection

Express routes are detected by regex (`app.get(...)`, `router.post(...)`)
because Express has no compile-time type system. Auth is handled by
ad-hoc middleware functions whose names vary wildly. Function-name
matching (`requireAuth`, `authGuard`, `isAuthenticated`, `ensureAuth`,
`protect`, `jwt`) was a heuristic and was removed.

All Express endpoints now default to `guard='unknown'` and the probe
emits `EXPRESS_AUTH_UNDECLARED` listing the count.

To declare auth on an Express route:

1. Generate an OpenAPI document for it (e.g. via `swagger-jsdoc`) and add
   the `x-auth-required: true` extension on the operation, OR
2. Migrate the route to NestJS where guards are first-class via
   `@UseGuards()` + `@ApiBearerAuth()`.

If neither is feasible, the route remains in the matrix as `unknown`
and the probe runs no auth-boundary assertions for it.

## Pattern 4 — Page identity overlay (fallback)

The Logical App Contract has rows like:

| Row id | Actor state | Surface |
|---|---|---|
| `authed-login-page` | authenticated | `/login` |
| `authed-register-page` | authenticated | `/register` |
| `post-register-landing` | just-registered | `/dashboard` |

These rows reference page **identities** (login, register, post-login
destination), not arbitrary routes.

**Primary source: sibling `page.identity.<ext>` files.** When a page
declares `role: 'login-page'`, it appears in `matrix.pageRoles['login-page']`
and the Logical Contract emitter wires up the assertion automatically.
This is the recommended approach.

**Fallback source: overlay.** For projects that haven't yet adopted the
sibling-file convention, or for declaring identities the probe needs but
no page file exists for, declare them in `.runtime-contract.overlay.json`:

```json
{
  "auth": {
    "loginPage": "/login",
    "registerPage": "/register",
    "postLoginDestination": "/dashboard"
  }
}
```

The overlay schema (`hooks/probes/overlay-schema.json`) accepts these
three keys; any other key under `auth` is rejected.

The matrix loader merges overlay → `matrix.pageRoles` so the emitters
have a single source of truth. Sibling files take precedence in the
detector pass; the overlay then layers on top of (and overrides) the
detected map.

### Two-step lookup

The emitter first reads `matrix.pageRoles[<role>]`, then matches it
against the detected pages list:

1. If no source declares the role → emit `LOGIN_PAGE_UNDECLARED` /
   `REGISTER_PAGE_UNDECLARED` / `AUTH_POST_LOGIN_DEST_UNDECLARED` with a
   message naming both the sibling-file and overlay options.
2. If declared but no detected page has that exact route → emit the same
   DIAG with the message
   `"… does not match any detected page route. Fix the page.identity.ts file or overlay, or add the page."`

### Example: full Logical-Contract auth wiring with sibling files

```ts
// apps/web/src/app/(public)/login/page.identity.ts
export const identity: PageIdentity = { role: 'login-page',           guard: 'public'        };

// apps/web/src/app/(public)/register/page.identity.ts
export const identity: PageIdentity = { role: 'register-page',        guard: 'public'        };

// apps/web/src/app/dashboard/page.identity.ts
export const identity: PageIdentity = { role: 'post-login-destination', guard: 'authenticated' };
```

With these in place the probe generates:

- `logical:authed-login-page:-login` — authenticated user navigates to
  `/login`, expects 3xx redirect.
- `logical:authed-register-page:-register` — same for `/register`.
- A post-register landing flow that registers a fresh user, expects
  redirect to `/dashboard`, and asserts the dashboard renders.

## DIAG quick reference

| DIAG | Declaration that fixes it |
|---|---|
| `PAGE_IDENTITY_UNDECLARED` | (info-only) Add a sibling `page.identity.<ext>` declaring `{ role, guard }` |
| `PAGE_IDENTITY_INVALID` | Fix `role` / `guard` to match the allowed enums |
| `PAGE_ROLE_AMBIGUOUS` | Two pages claim the same role — pick one |
| `TRPC_PROTECTION_UNDECLARED` | `// @protected` line above procedure, or `.meta({ protected: true })` |
| `EXPRESS_AUTH_UNDECLARED` | `x-auth-required: true` on the operation, or migrate to NestJS |
| `LOGIN_PAGE_UNDECLARED` | Sibling `page.identity.ts` with `role: 'login-page'`, or `overlay.auth.loginPage` |
| `REGISTER_PAGE_UNDECLARED` | Sibling `page.identity.ts` with `role: 'register-page'`, or `overlay.auth.registerPage` |
| `AUTH_POST_LOGIN_DEST_UNDECLARED` | Sibling `page.identity.ts` with `role: 'post-login-destination'` (and `guard: 'authenticated'`), or `overlay.auth.postLoginDestination` |
| `AUTH_TOKEN_STORAGE_UNDECLARED` | `overlay.authDetection.tokenStorage` set to declare client-side token storage |

## Anti-patterns the probe will surface

- Declaring `overlay.auth.postLoginDestination = "/dashboard"` for a page
  whose `page.identity.ts` is missing or declares `guard: 'public'` —
  the overlay points at a public page, the post-register landing
  assertion runs against an unauthenticated landing, and contract drift
  is silently green. Both the overlay (or sibling file) AND the page's
  guard must agree.
- Two pages both exporting `{ role: 'login-page', … }` — `PAGE_ROLE_AMBIGUOUS`,
  the role drops out of the map, no `authed-login-page` flow generated.
- Putting `export const identity = {…}` directly in `page.tsx` — Next.js
  15 build fails immediately with the PageProps index-signature error.
- Using `protectedProcedure` everywhere without a `// @protected` comment
  or `.meta({ protected: true })` — every procedure shows up as
  `unknown`. Add the declaration.

## Source of truth the probe scans

- Next.js: sibling `page.identity.<ext>` file in the same directory as
  `page.<ext>`. The probe parses `export const identity = { role, guard }`
  with regex.
- tRPC: procedure declaration text for the `// @protected` line above
  and `.meta({ protected: ...})` chain inline.
- Express: nothing — guard is always `unknown` until OpenAPI extension
  or NestJS migration.
- Page identities: detected `pageRoles` map, with
  `.runtime-contract.overlay.json` `auth.*` keys merged on top as a
  fallback / override layer.
