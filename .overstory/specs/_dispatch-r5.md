You are continuing sfx-webapp-boilerplate-b859. Prior agent (r3) left at commit fcf811f with these specific upstream patches:

- c292a78 builder-brand-profile WIP — initial F1 brand-profile implementation
- 04b05fc fix(brand-profile): align ResourceCaptures resource name with Prisma model
- 928e961 fix(probe): canonicalize path params for coverage suppression
- fcf811f WIP — http-smoke.ts curated-coverage ordering patch (operator-applied)

The original task contract takes precedence — do NOT narrow scope to the blocker list.

## Original task contract (sfx-webapp-boilerplate-b859) — verbatim

Title: F1 brand-profile: entity + CRUD + active-brand selector + app shell

Description: Parent: sfx-webapp-boilerplate-2cb0. Feature 1 of 3 (foundation chunk). Brand profile entity, full CRUD API behind JwtAuthGuard, active-brand Zustand store with persist, AppShell + top bar + user menu + active-brand selector, /, /brands/new, /brands/<id> shell. Preserve Keycloak+oauth2-proxy+RS256/JWKS auth exactly. Spec: /workspace/.overstory/specs/sfx-webapp-boilerplate-b859.md (already-attached via --spec).

Out-of-scope: brand-voice fields/endpoints (F2), visual-identity fields/endpoints (F3), search, dos/don'ts, version history, agent retrieval API, AI integrations.

## Prior-state context

- Branch overstory/builder-brand-profile-r5/sfx-webapp-boilerplate-b859 forked from r3 HEAD fcf811f. All three fixes (canonicalize + ordering + ResourceCaptures alignment) are present in your tree.
- Mulch record mx-cd88c5 (Option A operator-applied): http-smoke.ts curated-coverage ordering bug fixed. Expected: 0 UNGENERATABLE + 0 CONTRACT_STATUS_UNREACHABLE on /auth/me:200 and /brands:200.
- The two WIP-ZOMBIE-RECOVERY commits in history (fcf811f, c292a78, 7298bcb) are audit-trail from prior session-end hooks — preserve. Do NOT amend/reset them.

## Your job — minimum walk

1. `pnpm stack:up && pnpm probe:smoke` — confirm probe clean.
2. If failures remain: invoke flow-failure-response skill per CLAUDE.md routing table. Do NOT edit .flows.generated.json or runtime-contract.flows/ — you are builder, path-boundary hook blocks it. Mail me with --type flow_mismatch if root cause is contract drift.
3. If probe passes: run typecheck + lint + test:coverage + test:integration to clear close-gate.
4. Send worker_done mail with both `## runtime-evidence` (full probe JSON summary) AND `## qa-test-evidence` (per CLAUDE.md QA contract).

## Runtime acceptance criteria (from spec §2 — what the probe will assert)

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
- @UsePipes(new ZodValidationPipe(schema)) — bind to @Body, NOT handler-level (mx-4d4764 — pipe runs against every param incl. path id)
- If schema.prisma touched → run `pnpm db:migrate -- --name <slug>` BEFORE probe:smoke (mx-325de6 — bridge picks up new migration directories within ~1.5s)
- NEVER add overlay.flows (retired). NEVER add matrix paths to overlay.ignore[].

## QA evidence contract (worker_done required)

worker_done mail MUST include both:
- `## runtime-evidence` — full probe:smoke JSON summary
- `## qa-test-evidence` — report path under .claude/hook-reports/qa-test-<task>-<hash>.md, mode=full, flows verified covering every spec feature, final FAILED=0 CRITICAL=0 HIGH=0

Stale or rubber-stamp evidence fails merge gate.

Acknowledge receipt with a short status mail. Then proceed.
