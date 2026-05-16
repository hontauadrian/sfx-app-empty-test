You are scout-brand-voice. Produce the F2 brand-voice feature spec.

## Original task contract (sfx-webapp-boilerplate-6fba) — verbatim

Title: F2 brand-voice: 8-field voice CRUD per brand

Description: Parent sfx-webapp-boilerplate-2cb0. Feature 2 of 3. Depends on F1 brand-profile being merged (DONE — merged at master 3caa99c). BrandVoice 1:1 with BrandProfile (FK + ON DELETE CASCADE). 8 fields per brand. Upsert PUT. 200 empty payload for missing row, 404 for cross-tenant. Edit page + voice card on brand detail. Preserve Keycloak auth.

## Read these files in order before writing the spec

1. /workspace/.overstory/specs/sfx-webapp-boilerplate-2cb0.md (product plan; F2 = §3 Feature F2, J3 = §1, runtime acceptance = §5 J3)
2. /workspace/.overstory/specs/sfx-webapp-boilerplate-b859.md (F1 spec — pattern to follow)
3. /workspace/apps/api/src/modules/brand-profile/** (the merged F1 implementation — match conventions: repository pattern, controller decorators, DTO shape, integration test layout)
4. /workspace/packages/domain/src/entities/brand-profile.ts and /workspace/packages/domain/src/contracts/brand-profile-repository.ts (domain pattern: ownerSubject scoping via (id, ownerSubject) returning null for both not-found and not-owned)
5. /workspace/packages/validation/src/schemas/brand-profile.schema.ts (Zod pattern with explicit type:)
6. /workspace/packages/database/prisma/schema.prisma and /workspace/packages/database/prisma/migrations/20260515144009_add_brand_profile/migration.sql (Prisma + migration pattern; FK + CASCADE shape)
7. /workspace/apps/web/src/features/brand-profile/** (data layer: executeRequest pattern, React Query repositories, hook composition, page-pattern)
8. /workspace/apps/web/src/app/brands/[id]/page.tsx (current F1 stub render with voice-card + visual-identity-card placeholders — F2 replaces voice-card)
9. /workspace/.overstory/runtime-contract.flows/sfx-webapp-boilerplate-b859.json (curated flow shape for reference)
10. /workspace/.overstory/runtime-contract.flows/_shared.json (shared actors + fixtures)

## Output path

Write spec at: /workspace/.overstory/specs/sfx-webapp-boilerplate-6fba.md

## Spec template (mirror sfx-webapp-boilerplate-b859.md structure)

1. Scope of THIS spec (F2 only)
2. User-visible behaviour (the probe will assert) — shell mention, page render, journey J3 verbatim from §1 of product plan
3. Runtime acceptance criteria — exact endpoints, validation rules from product plan §5 J3, auth contract per endpoint
4. File-by-file task breakdown — one task per file-group, TDD steps per task (write test → write impl → run gates)
5. Out-of-scope (no F3, no dos/don'ts, no version history)
6. Auth preservation — Keycloak + oauth2-proxy + RS256/JWKS stack untouched; @UseGuards(JwtAuthGuard) on every new endpoint; ownerSubject pattern from F1
7. mx convention reminders: @Inject(TOKEN) per ctor param, @ApiProperty type:, @UsePipes bind to @Body, @ApiResponse for every status, @ResourceCaptures on POST (if applicable — F2 endpoints are upsert PUT, may not need ResourceCaptures since brand-voice is scoped under brand:id chain)

## Auth preservation note

F2 is protected (JwtAuthGuard + AuthGate). Product plan did NOT request auth replacement. Do not propose /login, /register, local HS256 cookies, or removal of OAUTH_* / Keycloak / oauth2-proxy.

Reuse the F1 ownership pattern: repository takes (brandId, ownerSubject) and returns null for not-found-or-not-owned; controller maps null → NotFoundException, never ForbiddenException.

## Out-of-scope guard

Voice card on /brands/<id> is F2 territory. The visual-identity card on the same page is F3 — do NOT spec voice card touching visual-identity rendering. If brand-profile/page.tsx coordination is needed, spec only the voice section additions and call out the F3 seam explicitly.

## Endpoints (from product plan §3 Feature F2)

- `GET /api/brands/:id/voice` — returns 200 with current data OR 200 with "empty" voice payload if no row yet — NEVER 404 for missing-but-creatable-state
- `PUT /api/brands/:id/voice` — upsert; creates the row on first save
- Both `@UseGuards(JwtAuthGuard)`

## DB storage (from product plan §3 Feature F2)

Mixed columns: explicit text columns for scalars (toneOfVoice), JSONB columns for list-shaped fields:
- preferredVocabulary (string[])
- restrictedVocabulary (string[])
- messagingPillars (string[])
- writingStyleRules (string[])
- audienceRules ({audience: string; rule: string}[])
- approvedExamplePhrases (string[])
- rejectedExamplePhrases (string[])

## Form fields (from product plan §1 J3) — all eight

- toneOfVoice (multiline text)
- preferredVocabulary (string list, add/remove rows)
- restrictedVocabulary (string list, add/remove rows)
- messagingPillars (string list, add/remove rows)
- writingStyleRules (string list, add/remove rows)
- audienceRules (list of {audience: string; rule: string} pairs, add/remove rows)
- approvedExamplePhrases (string list, add/remove rows)
- rejectedExamplePhrases (string list, add/remove rows)

## When done

Send a result mail to coordinator with:
- Spec path
- Summary of task breakdown (number of tasks, rough file count per task)
- Any open questions

Acknowledge receipt with a short status mail. Then proceed.
