'use strict';

const { detectNestOpenApi } = require('./nest-openapi');
const { detectExpress } = require('./express');
const { detectFastify } = require('./fastify');
const { detectTrpc } = require('./trpc');

// Dispatch across API frameworks.
async function deriveEndpoints(root, frameworks, diag) {
  const endpoints = [];
  let securitySchemes = {};
  const api = frameworks.api || [];

  if (api.includes('nest')) {
    // Swagger/OpenAPI is the single source of truth for NestJS endpoints.
    // Returning null here is a hard fail — the caller should surface
    // OPENAPI_SPEC_MISSING and refuse to emit a matrix without it.
    const result = await detectNestOpenApi(root, diag);
    if (!result) {
      const err = new Error(
        'OPENAPI_SPEC_MISSING: no /api/docs-json reachable and no apps/api/.openapi.json on disk. ' +
        'Fix: (1) scripts/worktree-stack.sh start, or (2) pnpm --filter @sfx/api build to refresh the static dump, ' +
        'or (3) ensure @nestjs/swagger + SwaggerModule.setup are wired in apps/api/src/main.ts.'
      );
      err.code = 'OPENAPI_SPEC_MISSING';
      throw err;
    }
    if (diag && typeof diag.info === 'function') {
      diag.info(`endpoint source: ${result.source}`);
    }
    endpoints.push(...result.endpoints);
    if (result.securitySchemes) {
      Object.assign(securitySchemes, result.securitySchemes);
    }
  }

  const dispatch = [
    { name: 'express', flag: 'express', fn: detectExpress },
    { name: 'fastify', flag: 'fastify', fn: detectFastify },
    { name: 'trpc',    flag: 'trpc',    fn: detectTrpc },
  ];

  for (const entry of dispatch) {
    if (!api.includes(entry.flag)) continue;
    try {
      const result = entry.fn(root, diag);
      endpoints.push(...result.endpoints);
    } catch (err) {
      diag.recordDetectorError(entry.name, err);
    }
  }
  return { endpoints, securitySchemes };
}

module.exports = { deriveEndpoints };
