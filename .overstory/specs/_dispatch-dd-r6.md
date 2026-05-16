You are continuing sfx-webapp-boilerplate-34c3 from prior dd-r4 HEAD 2aa4521 (WIP-ZOMBIE-RECOVERY on top of full F1 implementation + B2 flow fix). The original task contract takes precedence — do NOT narrow scope to the alias restoration.

## Original task contract (sfx-webapp-boilerplate-34c3) — verbatim

Title: part2/F1 dos-and-donts: per-brand CRUD with 5-category + do/don't taxonomy

Description: Parent: sfx-webapp-boilerplate-bc83. Feature 1 of 2. DosAndDontEntry many-per-brand with FK + ON DELETE CASCADE. 5 endpoints under /api/v1/brands/:brandId/dos-and-donts (LIST?category=, CREATE, READ, UPDATE, DELETE). Fields: type (do|don't), category (tone|vocabulary|visuals|legal|campaign-messaging), title, body, optional suggestedCorrection. Dos & Don'ts card on /brands/<id> grouped by category then type. Edit pages at /brands/<id>/dos-and-donts/new and /<entryId>/edit. Preserve Keycloak auth. Mirror F2/F3 module structure.

Full spec: /workspace/.overstory/specs/sfx-webapp-boilerplate-34c3.md (attached via --spec).

Out-of-scope: F2 content-check screen (a051), cross-section search, version history, agent retrieval API, automated scoring, AI integrations.

## Prior-state context

Your branch overstory/builder-dd-r6/sfx-webapp-boilerplate-34c3 forks from dd-r4 HEAD 2aa4521. The branch already carries:

- Full F1 implementation from dd-r3: domain entity, Prisma model + migration, validation schema, NestJS dos-and-donts module (5 endpoints), web feature (data + presentation), new pages, DosAndDontsCard mount on /brands/<id>. 5473 insertions across 128 files.
- B2 flow fix (commit 0cf6e98): declares `"parents": ["brandProfile"]` on dosAndDontEntry resource in .overstory/runtime-contract.flows/sfx-webapp-boilerplate-34c3.json.
- WIP-ZOMBIE-RECOVERY commits from prior agent sessions (boilerplate.com + dd-r4 zombie).
- A regression introduced by dd-r4 on `apps/api/src/modules/brand-profile/application/controllers/brand-profile.controller.ts` — the multi-alias `@ResourceCaptures` for the POST handler was reverted to single-alias. This caused `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED` on probe runs against the nested-resource chain.

Operator authorized A.rev (msg-25elfvep8zzm 2026-05-16T16:41Z): restore the multi-alias. This is the canonical convention (mulch mx-3bf156, boilerplate aa12af1 synced to master 0b84c5f today).

## Your job — minimum walk

1. **Restore multi-alias `@ResourceCaptures`** on `apps/api/src/modules/brand-profile/application/controllers/brand-profile.controller.ts` POST handler:

   ```ts
   @Post()
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('accessToken')
   @ResourceCaptures(
     { fromPath: 'id', resource: 'brandProfile', pathParam: 'id' },
     { fromPath: 'id', resource: 'brandProfile', pathParam: 'brandId' },
   )
   ```

   Pure additive metadata (same fromPath, same resource, only pathParam differs). Spec §8 protects runtime behavior, not flow-generator metadata. NO other code edits required to clear the probe.

2. **Audit child controller** `apps/api/src/modules/dos-and-donts/application/controllers/dos-and-dont.controller.ts` for the same regression. If single-alias only, leave as-is unless probe flags it (child resource captures use a single pathParam since it isn't nested-under itself). Verify it matches the version on dd-r3 HEAD (0cf6e98).

3. **Commit** on your branch with message:
   `fix(brand-profile): add brandId pathParam alias for nested-resource probe chains`

4. **Run** `pnpm stack:up && pnpm probe:smoke`. Expected: 0 `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED`, 0 `FLOW_STEP_FAILED` on the 21 curated dos-and-donts special_flows, EXIT 0.

5. **If probe stays red** after the alias restoration: file `flow_escalation` upstream (true generator bug per operator). Do NOT C2-allowlist, do NOT edit probe source, do NOT touch `.flows.generated.json` / `.matrix.json` / `.runtime-contract.logical.json` / overlay.

6. **On probe green**: run typecheck + lint + test:coverage + test:integration to clear close-gate.

7. **Send worker_done mail** to coordinator with BOTH:
   - `## runtime-evidence` — full probe:smoke JSON summary
   - `## qa-test-evidence` — report path under `.claude/hook-reports/qa-test-<task>-<hash>.md`, mode=full, flows verified covering every F1 spec feature (J1 add, J2 edit, J3 delete, list grouping, empty state, cross-tenant 404, validation 400, cascade delete), final FAILED=0 CRITICAL=0 HIGH=0

8. **After merge**: record a mulch convention entry on dev-stack documenting the pattern:
   > POST under `/<parent>/:<parentId>/<child>` requires the parent's `@ResourceCaptures` to include BOTH the self-reference (`pathParam: 'id'`) AND every nested-route alias (`pathParam: '<parent>Id'`). Missing aliases trigger `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED`. The chain emitter looks up captures by `pathParam`, not by resource name. flow-foundation.md documents the schema; this convention documents the failure mode.

## Runtime acceptance criteria (from spec §1)

**API surface (5 endpoints, all JwtAuthGuard-protected) under /api/v1/brands/:brandId/dos-and-donts:**
- GET `?category=<enum?>` → 200 list grouped by category+type for caller's brand, 404 if brand not owned
- POST → 201 + created DosAndDontEntry, parent brand must be owned by caller
- GET `/:entryId` → 200 if owned, 404 otherwise
- PUT `/:entryId` → 200 if owned, 404 otherwise
- DELETE `/:entryId` → 200 envelope `{success:true,data:null}`, 404 if not owned

**Auth assertions (every endpoint):**
- Happy w/ valid admin bearer from _shared.json → 2xx + `{success:true,data:T}` envelope
- Anonymous (no bearer) → 401
- Cross-tenant (brand owned by user A, accessed by user B) → 404 for every method
- Brand-delete cascade → child entries gone (ON DELETE CASCADE FK)

**Validation (Zod):**
- type: enum 'do' | 'don\\'t' — unknown → 400
- category: enum tone|vocabulary|visuals|legal|campaign-messaging — unknown → 400
- title: trimmed, required, 1..200
- body: required, 1..4000
- suggestedCorrection: optional, 0..4000
- ?category filter: enum or 'all' sentinel — unknown → 400

**Pages (web):**
- `/brands/<id>` → DosAndDontsCard mounted, empty-state when no entries, grouped list when ≥1
- `/brands/<id>/dos-and-donts/new` → 5-field form (type pill, category select, title, body, optional suggestedCorrection), POST → 201 → redirect `/brands/<id>`
- `/brands/<id>/dos-and-donts/:entryId/edit` → pre-populated form, PUT → 200 → redirect `/brands/<id>`, 404 → "Entry not found" with link back

## Auth contract per surface

- All `/api/v1/brands/:brandId/dos-and-donts*` endpoints: **authenticated** (JwtAuthGuard). Unauth → 401.
- Pages: **authenticated** (oauth2-proxy upstream). Unauth → 3xx redirect to oauth2-proxy login.
- Identity = `request.user.subject` from JwtAuthGuard. Brand ownership pre-check via `IBrandProfileRepository.findById(brandId, ownerSubject)` (DI symbol `BRAND_PROFILE_REPOSITORY`). null → NotFoundException, never ForbiddenException.
- NEVER touch `apps/api/src/modules/auth/**`, `apps/api/src/common/auth/**`, `apps/api/src/common/guards/jwt-auth.guard.ts`, `apps/api/src/common/decorators/auth-roles.decorator.ts`, `apps/web/src/features/auth/**`.

## Contract annotation reminder

- Zod schemas in @sfx/validation/schemas/dos-and-donts.schema.ts — every field with explicit type
- NestJS controller decorators: `@UseGuards(JwtAuthGuard)`, `@ApiTags`, `@ApiResponse` for every status (200/201/400/401/404), `@ApiBearerAuth`, `@ResourceCaptures` on POST handlers
- `@ApiProperty` / `@ApiPropertyOptional` MUST declare `type:` (tsx+esbuild reflect-metadata limitation)
- `@Inject(TOKEN)` per ctor param explicitly
- `@UsePipes(new ZodValidationPipe(schema))` — bind to `@Body`, NOT handler-level
- DO NOT touch probe source (`.overstory/claude-profiles/*/hooks/probes/**`) — operator/coordinator domain
- NEVER add overlay.flows (retired); NEVER add matrix paths to overlay.ignore[]

## QA evidence contract (worker_done required)

worker_done mail MUST include both:
- `## runtime-evidence` — full probe:smoke JSON summary
- `## qa-test-evidence` — report path under `.claude/hook-reports/qa-test-<task>-<hash>.md`, mode=full, flows verified, final FAILED=0 CRITICAL=0 HIGH=0

Stale or rubber-stamp evidence fails merge gate.

Acknowledge receipt with a short status mail. Then proceed.
