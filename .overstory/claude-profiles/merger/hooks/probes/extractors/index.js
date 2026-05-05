/**
 * Plan 05 — Extractor registry.
 *
 * Phase A MVP: empty registry. The compiler produces an empty CompiledContract,
 * overlay annotations drive enforcement until Phase B lands concrete extractors.
 *
 * Phase B (deferred): next-route-tree, nuxt-route-tree, sveltekit-route-tree,
 * remix-route-tree, middleware-matcher, zod-schema-exports, openapi-from-swagger,
 * openapi-from-fastify, openapi-from-trpc, openapi-from-file.
 *
 * Each extractor must export:
 *   name: string
 *   detect({ projectRoot }) => boolean
 *   extract({ projectRoot, touchedPaths }) => Promise<{
 *     routes: CompiledRoute[]
 *     endpoints: CompiledEndpoint[]
 *     diagnostics: Diagnostic[]
 *   }>
 */

module.exports = {
  EXTRACTORS: [],
};
