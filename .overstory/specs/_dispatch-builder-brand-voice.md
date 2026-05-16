You are builder-brand-voice. Implement F2 brand-voice per the attached spec at /workspace/.overstory/specs/sfx-webapp-boilerplate-6fba.md.

## Task contract — verbatim

Title: F2 brand-voice: 8-field voice CRUD per brand

Description: Parent sfx-webapp-boilerplate-2cb0. Feature 2 of 3. F1 brand-profile merged at master 3caa99c. BrandVoice 1:1 with BrandProfile (FK + ON DELETE CASCADE). 8 fields per brand. Upsert PUT. 200 empty payload for missing row, 404 for cross-tenant. Edit page + voice card on brand detail. Preserve Keycloak auth.

## Per-task flow file (lead/coord-authored — DO NOT EDIT)

`.overstory/runtime-contract.flows/sfx-webapp-boilerplate-6fba.json` — 12 flows covering anon-401, admin happy (empty + populated), upsert+get roundtrip, validation failures (vocab duplicate, empty list item, audience duplicate), cross-tenant 404 (GET + PUT), brand-delete cascade.

## Runtime acceptance criteria (from spec §2)

API surface — both endpoints authenticated:
- GET /api/v1/brands/:id/voice → 200 + envelope with 8 fields + brandProfileId + nullable timestamps. NEVER 404 for missing-but-creatable row (return 200 + empty defaults). 401 unauth. 404 cross-tenant.
- PUT /api/v1/brands/:id/voice → 200 upsert. 400 validation. 401 unauth. 404 cross-tenant. NO ResourceCaptures needed — brandId chain captured by F1 POST /brands.

Validation (Zod brandVoiceWriteSchema, mx-4d4764 — bind to @Body):
- toneOfVoice: trim, max 4000, empty→null
- preferredVocabulary / restrictedVocabulary: trim 1..200 chars, case-insensitive unique, max 200 items
- messagingPillars: trim 1..200, unique, max 50
- writingStyleRules: trim 1..1000, unique, max 100
- audienceRules: {audience: 1..120, rule: 1..1000}, audience unique CI, max 50
- approvedExamplePhrases / rejectedExamplePhrases: trim 1..500, unique, max 100

Pages:
- /brands/<id>/voice/edit — form 8 fields, RHF + zodResolver, submit → PUT → router.push(/brands/<id>). Use imperative pattern from F1 new-brand (NOT inside onSuccess).
- /brands/<id> — replace `<BrandVoiceCardPlaceholder>` with `<BrandVoiceCard brandId>` from @/features/brand-voice. Card owns its own data fetch. Leave VisualIdentityCardPlaceholder alone — F3 owns.

## Auth contract per surface

- /api/v1/brands/:id/voice GET + PUT — authenticated (JwtAuthGuard), unauth → 401.
- /brands/<id>/voice/edit — authenticated (existing oauth2-proxy + AuthGate), unauth → redirect:existing-login-surface.
- Identity = request.user.subject. Repository takes (brandId, ownerSubject) and returns null for not-found-or-not-owned (mx-b562ca pattern). Controller maps null → NotFoundException, NEVER ForbiddenException.
- NEVER touch apps/api/src/modules/auth/**, apps/api/src/common/auth/**, apps/api/src/common/guards/jwt-auth.guard.ts, apps/api/src/common/decorators/auth-roles.decorator.ts, apps/web/src/features/auth/**.

## Contract annotation reminder

Keep current on every file in scope — flows generator reads them:
- Zod schemas: every field with explicit type, `.openapi()` registration via import side-effect (mirror brand-profile.schema.ts L2)
- NestJS controllers: @UseGuards(JwtAuthGuard), @ApiTags('brand-voice'), @ApiBearerAuth('accessToken'), @ApiResponse for 200/400/401/404, @ApiBody with examples
- @ApiProperty / @ApiPropertyOptional MUST declare `type:` (tsx+esbuild reflect-metadata limitation, mx convention)
- @Inject(TOKEN) per ctor param explicitly (same reason)
- @UsePipes(new ZodValidationPipe(schema)) — bind to @Body, NOT handler-level (mx-4d4764)
- After schema.prisma touched → run `pnpm db:migrate -- --name add_brand_voice` BEFORE probe:smoke (mx-325de6)
- NEVER add overlay.flows (retired). NEVER add matrix paths to overlay.ignore[].
- DO NOT touch probe source (.overstory/claude-profiles/*/hooks/probes/**) — operator/coordinator domain.
- DO NOT edit .overstory/runtime-contract.flows/*.json — path-boundary hook blocks; mail coordinator with --type flow_mismatch.

## F1 module exports — authorized one-line edit

Append `exports: [BRAND_PROFILE_REPOSITORY]` to `apps/api/src/modules/brand-profile/brand-profile.module.ts` so BrandVoiceModule can `imports: [BrandProfileModule]` and resolve the singleton via @Inject(BRAND_PROFILE_REPOSITORY). This is the SOLE F1 edit permitted. No logic change.

## F1 schema additive — authorized

Add `voice BrandVoice?` back-relation on BrandProfile model in schema.prisma. Purely additive — no column change, no constraint, no migration impact on existing F1 rows.

## QA evidence contract (worker_done required)

worker_done mail MUST include both:
- `## runtime-evidence` — full probe:smoke JSON summary, EXIT 0, every :200/:404 curated flow PASS, zero CONTRACT_STATUS_UNREACHABLE for /brands/:id/voice:*
- `## qa-test-evidence` — report path under .claude/hook-reports/qa-test-<task>-<hash>.md, mode=full, flows verified covering every spec feature (voice edit happy + empty + populated + validation + cross-tenant + brand-delete-cascade), final FAILED=0 CRITICAL=0 HIGH=0

Stale or rubber-stamp evidence fails merge gate.

Acknowledge receipt with a short status mail. Then proceed.
