<!-- stub pointer — full spec authored by scout-bg-chunk-a at /workspace/.overstory/worktrees/scout-bg-chunk-a/.overstory/specs/sfx-webapp-boilerplate-3e6a.md (787 lines). Will be inlined here once landed via merger. -->

# Chunk A — Brand profile foundation (spec pointer)

Full scout-authored spec lives at:
`/workspace/.overstory/worktrees/scout-bg-chunk-a/.overstory/specs/sfx-webapp-boilerplate-3e6a.md`

13 tasks A1–A13: domain entity + port (A1), Zod schemas (A2), Prisma model + migration (A3), Nest module skeleton (A4), BrandDto + BrandsListDto (A5), Create/Rename Zod pipes (A6), BrandPrismaRepository + deriveUniqueSlug helper (A7), BrandController with class-level @UseGuards+@AuthRoles+@ApiBearerAuth + per-endpoint @ApiResponse + @ResourceCaptures on POST (A8), supertest integration suite (A9), ADMIN_TAB_REGISTRY second entry + EN/RO translations + types widening (A10), brand-shell data layer (A11), BrandProfileSelector + CreateBrandModal + RenameBrandDialog + DeleteBrandConfirm + brand-guidelines-empty/detail pages (A12), thin route wrappers Next 15 async params (A13).

**Runtime acceptance** (per top-level plan §5 J1+J7):
- Admin visiting Brand Guidelines tab with zero profiles sees empty state with create CTA.
- Submitting valid name creates+selects profile; URL reflects active brand; refresh persists.
- Switching profile via selector reloads body; deleting removes from list + selector.

**Guard contract**: all `/admin/brand-guidelines/*` pages protected by inherited `/admin/layout.tsx` AuthGate+AdminRouteGate (Phase-2 F3+F5). All `/api/v1/brands*` endpoints `@UseGuards(JwtAuthGuard)+@AuthRoles(AUTH_ROLE_ADMIN)`: unauth → 401, non-admin → 403.

**Contract annotations**: every `@ApiProperty`/`@ApiPropertyOptional` declares `type:` explicitly; `@ApiResponse` set 200/201/204/400/401/403/404 per endpoint; `@ApiBearerAuth('accessToken')`; `@ResourceCaptures({ fromPath: 'id', resource: 'brand', pathParam: 'id' })` on POST handler; downstream chunks B/C/D additively append tuples for child path params per mulch mx-3bf156.

**Nested-resource carve-out**: parent brand module CRUD is NOT locked behind blanket "do-not-modify" — additive `@ResourceCaptures` tuples on POST handler are explicitly permitted/required when downstream chunks emit `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED`.

Builder MUST Read the full scout spec at the absolute path above before any code work.
