You are continuing sfx-webapp-boilerplate-b859 from prior r5 HEAD 975f936. The original task contract takes precedence — do NOT narrow scope to the gate verification.

## Original task contract (sfx-webapp-boilerplate-b859) — verbatim

Title: F1 brand-profile: entity + CRUD + active-brand selector + app shell

Description: Parent: sfx-webapp-boilerplate-2cb0. Feature 1 of 3 (foundation chunk). Brand profile entity, full CRUD API behind JwtAuthGuard, active-brand Zustand store with persist, AppShell + top bar + user menu + active-brand selector, /, /brands/new, /brands/<id> shell. Preserve Keycloak+oauth2-proxy+RS256/JWKS auth exactly. Spec: /workspace/.overstory/specs/sfx-webapp-boilerplate-b859.md (already attached via --spec).

Out-of-scope: brand-voice fields/endpoints (F2), visual-identity fields/endpoints (F3), search, dos/don'ts, version history, agent retrieval API, AI integrations.

## Prior-state context

Your branch overstory/builder-brand-profile-r6/sfx-webapp-boilerplate-b859 forks from r5 HEAD 975f936. The full fix stack is present:

  975f936 fix(probe): prefix curated tuples with apiPrefix to match contract endpoints (NEW — r5 last attempt)
  fcf811f [WIP-ZOMBIE-RECOVERY] (Option A round 1: curated-tuple pre-population)
  928e961 fix(probe): canonicalize path params for coverage suppression
  c292a78 [WIP-ZOMBIE-RECOVERY] builder-brand-profile session-end
  04b05fc fix(brand-profile): align ResourceCaptures resource name with Prisma model

Boilerplate equivalents on origin (per operator): 46fe262 canonicalize (on master), 8ba7d97 ordering (operator-local), 1e123b7 apiPrefix (operator-local — what 975f936 mirrors).

Mulch record mx-cd88c5 tracks Option A. 975f936 should clear the two CONTRACT_STATUS_UNREACHABLE failures on /auth/me:200 and /brands:200.

## Your job — minimum walk

1. `pnpm stack:up && pnpm probe:smoke` — verify probe clean.
   - Expected: 0 UNGENERATABLE for :id paths, 0 CONTRACT_STATUS_UNREACHABLE for /auth/me:200 and /brands:200, 20/20 curated PASS, EXIT 0.
2. If probe STILL fails on /auth/me:200 or /brands:200 → mail me with --type error and EXACT failure shape. Do NOT apply another patch. Operator wants the precise failure to disambiguate hypothesis #2 (curatedSummary populated at gate time?) vs #3 (method-case/trailing-slash mismatch). NO patch-and-pray.
3. If probe passes: run typecheck + lint + test:coverage + test:integration to clear close-gate.
4. Send worker_done mail with BOTH:
   - `## runtime-evidence` — full probe:smoke JSON summary
   - `## qa-test-evidence` — report path under .claude/hook-reports/qa-test-<task>-<hash>.md, mode=full, flows verified covering every spec feature, final FAILED=0 CRITICAL=0 HIGH=0

## Runtime acceptance criteria (from spec §2)

**API surface (5 endpoints, all JwtAuthGuard-protected):**
- GET /api/v1/brands → 200 list of caller's brands ordered updatedAt DESC
- POST /api/v1/brands → 201 + created BrandProfile, ownerSubject = request.user.subject. MUST carry `@ResourceCaptures({ fromPath: 'id', resource: 'brand', pathParam: 'id' })`.
- GET /api/v1/brands/:id → 200 if owned, 404 otherwise (never 403 — existence not leaked)
- PUT /api/v1/brands/:id → 200 if owned, 404 otherwise
- DELETE /api/v1/brands/:id → 200 (TransformInterceptor envelope returns `{success:true,data:null}`), 404 if not owned. Cascades F2/F3 sibling tables via FK.

**Auth assertions (every endpoint):**
- Happy w/ valid admin bearer from _shared.json → 2xx + `{success:true,data:T}` envelope
- Anonymous (no bearer) → 401
- Cross-tenant (brand owned by user A, accessed by user B) → 404 for GET/PUT/DELETE :id

**Validation (Zod brandProfileWriteSchema):**
- name: trimmed, 1..120 chars. Empty/whitespace → 400 field-level error
- description: optional, 0..2000 chars. null allowed on PUT
- id path param: idParamSchema

**Pages (web):**
- `/` → empty-state when 0 brands; redirect to `/brands/<active-id>` when active stored; redirect to `/brands/<most-recent-updatedAt>` when ≥1 brand with no active stored; clear+fallback when stored active no longer exists
- `/brands/new` → name (1..120) + description form, POST /api/v1/brands → 201 → redirect `/brands/<new-id>` + set active
- `/brands/<id>` → header + two empty placeholder cards (Brand voice / Visual identity) with CTAs to `/brands/<id>/voice/edit` and `/brands/<id>/visual-identity/edit` (those 404 in F1 — F2/F3 add them)
- AuthGate is outermost client wrapper for every authenticated route. Render order: `<AuthGate><AppShell><PageBody/></AuthGate>`.

## Auth contract per surface

- All /api/v1/brands* endpoints: **authenticated** (JwtAuthGuard). Unauth → 401.
- /, /brands/new, /brands/:id pages: **authenticated** (existing oauth2-proxy upstream). Unauth → 3xx redirect to oauth2-proxy login surface.
- Identity = `request.user.subject` from JwtAuthGuard. Repository takes (id, ownerSubject) and returns null for both 'not found' and 'not owned' (mx-b562ca pattern). Controller maps null → NotFoundException, never ForbiddenException.
- NEVER touch apps/api/src/modules/auth/**, apps/api/src/common/auth/**, apps/api/src/common/guards/jwt-auth.guard.ts, apps/api/src/common/decorators/auth-roles.decorator.ts, apps/web/src/features/auth/**. The probe asserts auth unchanged.

## Contract annotation reminder

Keep annotations current — they ARE the contract; the flows generator reads them:
- Zod schemas in @sfx/validation/schemas/ — every field with explicit type
- NestJS controller decorators: @UseGuards(JwtAuthGuard), @ApiTags, @ApiResponse for every status (200/201/400/401/404), @ApiBearerAuth, @ResourceCaptures on POST
- @ApiProperty / @ApiPropertyOptional MUST declare `type:` (tsx+esbuild reflect-metadata limitation, mx convention)
- @Inject(TOKEN) per ctor param explicitly (same reason)
- @UsePipes(new ZodValidationPipe(schema)) — bind to @Body, NOT handler-level (mx-4d4764)
- If schema.prisma touched → run `pnpm db:migrate -- --name <slug>` BEFORE probe:smoke (mx-325de6)
- NEVER add overlay.flows (retired). NEVER add matrix paths to overlay.ignore[].
- DO NOT touch probe source (.overstory/claude-profiles/*/hooks/probes/**) — that path is operator/coordinator domain. r5's 975f936 is already on your branch.

## QA evidence contract (worker_done required)

worker_done mail MUST include both:
- `## runtime-evidence` — full probe:smoke JSON summary
- `## qa-test-evidence` — report path under .claude/hook-reports/qa-test-<task>-<hash>.md, mode=full, flows verified covering every spec feature, final FAILED=0 CRITICAL=0 HIGH=0

Stale or rubber-stamp evidence fails merge gate.

Acknowledge receipt with a short status mail. Then proceed.
