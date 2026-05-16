You are scout-visual-identity. Produce the F3 visual-identity feature spec.

## Original task contract (sfx-webapp-boilerplate-cfeb) — verbatim

Title: F3 visual-identity: 7-field visual identity CRUD per brand

Description: Parent sfx-webapp-boilerplate-2cb0. Feature 3 of 3. Depends on F1 brand-profile being merged (DONE — merged at master 3caa99c). VisualIdentity 1:1 with BrandProfile (FK + ON DELETE CASCADE). 7 fields per brand (logo rules, colour palette, typography rules, spacing/layout, image style, iconography, usage restrictions). Hex refinement on colour palette. Upsert PUT. Edit page + visual-identity card on brand detail. Preserve Keycloak auth.

## Read these files in order before writing the spec

1. /workspace/.overstory/specs/sfx-webapp-boilerplate-2cb0.md (F3 = §3 Feature F3, J4 = §1, runtime acceptance = §5 J4)
2. /workspace/.overstory/specs/sfx-webapp-boilerplate-b859.md (F1 spec)
3. /workspace/.overstory/specs/sfx-webapp-boilerplate-6fba.md (F2 spec — if it exists by the time you run; F3 mirrors F2's shape almost exactly with 7 fields instead of 8)
4. /workspace/apps/api/src/modules/brand-profile/** (pattern)
5. /workspace/packages/domain/src/entities/brand-profile.ts and /workspace/packages/domain/src/contracts/brand-profile-repository.ts (ownership pattern)
6. /workspace/packages/validation/src/schemas/brand-profile.schema.ts (Zod pattern)
7. /workspace/packages/database/prisma/schema.prisma and the F1 migration directory (Prisma pattern)
8. /workspace/apps/web/src/features/brand-profile/** (data layer)
9. /workspace/apps/web/src/app/brands/[id]/page.tsx (F1 stub — F3 replaces visual-identity-card)
10. /workspace/.overstory/runtime-contract.flows/sfx-webapp-boilerplate-b859.json (curated flow shape)

## Output path

Write spec at: /workspace/.overstory/specs/sfx-webapp-boilerplate-cfeb.md

## Spec template (mirror b859.md)

1. Scope of THIS spec (F3 only — 7 visual-identity fields)
2. User-visible behaviour — J4 verbatim from product plan §1
3. Runtime acceptance — endpoints from §3 Feature F3, validation rules from §5 J4, auth contract per endpoint
   - Colour-palette items: { name: string; hex: string; usage?: string }. Hex MUST validate as #RRGGBB or #RGB (Zod regex).
   - Typography rules: { role: string; family: string; weight?: string; size?: string; notes?: string }.
   - Five remaining fields: nullable text (logoUsageRules, spacingLayout, imageStyle, iconography, usageRestrictions).
4. File-by-file task breakdown
5. Out-of-scope (no F2, no asset uploads, no token system)
6. Auth preservation (same as F2)
7. mx conventions

## Auth preservation note

F3 is protected (JwtAuthGuard + AuthGate). Product plan did NOT request auth replacement. Do not propose /login, /register, local HS256 cookies, or removal of OAUTH_* / Keycloak / oauth2-proxy.

Reuse the F1 ownership pattern: repository takes (brandId, ownerSubject) and returns null for not-found-or-not-owned; controller maps null → NotFoundException.

## Out-of-scope guard

Visual-identity card on /brands/<id> is F3 territory. The voice card on the same page is F2 — spec only the visual-identity section additions. F3 builder forks AFTER F2 merges into master (sequential merge order), so F3 picks up the voice card and only adds the visual-identity card.

## Endpoints (from product plan §3 Feature F3)

- `GET /api/brands/:id/visual-identity` — returns 200 with current data OR 200 with empty payload if no row yet — NEVER 404 for missing-but-creatable-state
- `PUT /api/brands/:id/visual-identity` — upsert
- Both `@UseGuards(JwtAuthGuard)`

## DB storage (from product plan §3 Feature F3)

- coloursPalette: JSONB ({ name: string; hex: string; usage?: string }[])
- typographyRules: JSONB ({ role: string; family: string; weight?: string; size?: string; notes?: string }[])
- logoUsageRules, spacingLayout, imageStyle, iconography, usageRestrictions: nullable text columns

## Form fields (from product plan §1 J4) — all seven

- logoUsageRules (multiline text)
- coloursPalette (list of {name, hex, usage?} rows, add/remove)
- typographyRules (list of {role, family, weight?, size?, notes?} rows, add/remove)
- spacingLayout (multiline text)
- imageStyle (multiline text)
- iconography (multiline text)
- usageRestrictions (multiline text)

## When done

Send a result mail to coordinator with:
- Spec path
- Summary of task breakdown (number of tasks, rough file count per task)
- Any open questions

Acknowledge receipt with a short status mail. Then proceed.
