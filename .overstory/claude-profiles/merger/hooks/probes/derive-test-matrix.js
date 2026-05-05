#!/usr/bin/env node
'use strict';

/**
 * derive-test-matrix.js — project-agnostic test matrix derivation.
 * Mirror copies live in builder/lead/merger/reviewer hooks/probes/.
 *
 * Reads session files + project tree, detects web/api frameworks,
 * and emits a JSON matrix consumed by http-smoke + e2e-test-on-stop.
 *
 * CLI:
 *   node derive-test-matrix.js
 *   node derive-test-matrix.js --project-dir <path>
 *   node derive-test-matrix.js --session-files <path>
 *   node derive-test-matrix.js --output <path>
 *   node derive-test-matrix.js --full
 *   node derive-test-matrix.js --verbose
 *   node derive-test-matrix.js --strict
 *
 * Exit codes:
 *   0  — matrix written
 *   2  — fatal: could not read project dir
 *   3  — fatal: detectors all failed AND --strict
 */

const fs = require('fs');
const path = require('path');

const { parseArgs } = require('./lib/args');
const { createDiag } = require('./lib/diag');
const { readSessionFiles } = require('./lib/sessionFiles');
const { mergeEntries } = require('./lib/merge');

const { enrichMatrix } = require('./lib/enrich-matrix');
const { detectFrameworks } = require('./detectors/frameworks');
const { derivePages } = require('./detectors/pages');
const { deriveEndpoints } = require('./detectors/endpoints');
const { deriveMiddleware } = require('./detectors/middleware');
const { deriveForms } = require('./detectors/forms');
const { deriveAuth } = require('./detectors/auth');
const { deriveBootPlan } = require('./detectors/boot-plan');
const { derivePorts } = require('./detectors/ports');
const { extractTokens } = require('./detectors/tokens');
const { loadManifest } = require('./detectors/manifest-loader');
const { detectResponseEnvelope } = require('./detectors/response-envelope');
const { detectErrorEnvelope } = require('./detectors/error-envelope');
const { detectPrismaUniques } = require('./detectors/prisma-uniques');
const { detectGraphQL } = require('./detectors/graphql');
const { detectWebSocket } = require('./detectors/websocket');
const { detectCsrf } = require('./detectors/csrf');
const { detectOAuth } = require('./detectors/oauth');
const { detectMultiTenant } = require('./detectors/multi-tenant');
const { detectCookieFlows } = require('./detectors/cookie-flows');

/**
 * Load the raw OpenAPI spec from the stack or a static dump.
 * Returns the parsed spec or null.
 */
async function loadOpenApiSpec(projectDir) {
  const stackPath = path.join(projectDir, '.stack.json');
  let stack = null;
  if (fs.existsSync(stackPath)) {
    try { stack = JSON.parse(fs.readFileSync(stackPath, 'utf8')); } catch { /* ignore */ }
  }
  if (stack && stack.api_port) {
    try {
      const http = require('http');
      const spec = await new Promise((resolve) => {
        const url = `http://127.0.0.1:${stack.api_port}/api/docs-json`;
        const req = http.get(url, { timeout: 3000 }, (res) => {
          if (res.statusCode !== 200) { res.resume(); return resolve(null); }
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
      });
      if (spec) return spec;
    } catch { /* ignore */ }
  }
  const candidates = [
    path.join(projectDir, 'apps', 'api', '.openapi.json'),
    path.join(projectDir, '.openapi.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { /* ignore */ }
    }
  }
  return null;
}

function normalizeAbs(projectDir) {
  return (candidate) => {
    if (!candidate) return '';
    return path.isAbsolute(candidate) ? candidate : path.resolve(projectDir, candidate);
  };
}

function computeDiagnostics(merged, detectorErrors, detectorWarnings) {
  const missingGuardHeaders = [];
  const pagesProtectedByConvention = [];
  const unreachablePages = [];
  const orphanEndpoints = [];
  const unknownFrameworks = [];

  for (const page of merged.pages) {
    if (page.guard === 'unknown') missingGuardHeaders.push(page.route);
    if (page.guard === 'authenticated' && !page.fromManifest) pagesProtectedByConvention.push(page.route);
  }
  for (const endpoint of merged.endpoints) {
    if (endpoint.guard === 'unknown') orphanEndpoints.push(`${endpoint.method} ${endpoint.path}`);
  }

  return {
    missingGuardHeaders,
    pagesProtectedByConvention,
    unreachablePages,
    orphanEndpoints,
    unknownFrameworks,
    detectorErrors,
    detectorWarnings: Array.isArray(detectorWarnings) ? detectorWarnings : [],
    orphanOverlayRoutes: merged.orphanOverlayRoutes || [],
  };
}

async function main(argv) {
  const args = parseArgs(argv, {
    string: ['session-files', 'project-dir', 'output'],
    boolean: ['full', 'verbose', 'strict'],
  });

  const projectDir = path.resolve(
    args['project-dir'] ||
    process.env.HOOK_TEST_PROJECT_ROOT ||
    process.cwd()
  );

  if (!fs.existsSync(projectDir)) {
    process.stderr.write(`[derive-test-matrix] fatal: project dir missing: ${projectDir}\n`);
    process.exit(2);
  }

  const output = path.resolve(
    args.output ||
    path.join(projectDir, '.claude/hooks/.matrix.json')
  );
  // Keep stderr log adjacent to the chosen output so an explicit --output
  // (e.g. during tests) does not pollute the scanned project dir.
  const stderrLog = args.output
    ? output.replace(/(\.json)?$/, '.stderr.log')
    : path.join(projectDir, '.claude/hooks/.matrix.stderr.log');
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const diag = createDiag(Boolean(args.verbose), stderrLog);

  // Priority 0 — compiled runtime contract (plan 05).
  const manifest = loadManifest(projectDir, diag);

  // Frameworks.
  let frameworks;
  try {
    frameworks = detectFrameworks(projectDir, diag);
  } catch (frameworksErr) {
    diag.recordDetectorError('frameworks', frameworksErr);
    frameworks = { web: [], api: [], monorepo: 'none', auth: [], appRouter: false, unknown: [], packages: [] };
  }

  // Session files.
  const sessionFiles = args.full
    ? null
    : readSessionFiles(projectDir, args['session-files'], diag);

  // Boot plan + ports.
  let bootPlan;
  try {
    bootPlan = deriveBootPlan(projectDir, frameworks, diag);
  } catch (bootErr) {
    diag.recordDetectorError('boot-plan', bootErr);
    bootPlan = { driver: 'none', driverPath: null, startCmd: null, stopCmd: null,
                 portsCmd: null, alreadyRunning: false, envFiles: [], ports: {} };
  }
  try {
    bootPlan.ports = derivePorts(projectDir, bootPlan, frameworks, diag);
  } catch (portsErr) {
    diag.recordDetectorError('ports', portsErr);
    bootPlan.ports = bootPlan.ports || {};
  }

  // Surfaces.
  let pagesResult = { pages: [], extraEndpoints: [], pageRoles: {} };
  try { pagesResult = derivePages(projectDir, frameworks, diag); }
  catch (pagesErr) { diag.recordDetectorError('pages', pagesErr); }

  let endpoints = [];
  let securitySchemes = {};
  try {
    const endpointResult = await deriveEndpoints(projectDir, frameworks, diag);
    endpoints = endpointResult.endpoints;
    securitySchemes = endpointResult.securitySchemes || {};
  }
  catch (endpointsErr) {
    if (endpointsErr && endpointsErr.code === 'OPENAPI_SPEC_MISSING') {
      diag.error(endpointsErr.message);
      diag.flush();
      process.exit(1);
    }
    diag.recordDetectorError('endpoints', endpointsErr);
  }
  endpoints = [...endpoints, ...pagesResult.extraEndpoints];

  let middleware = [];
  try { middleware = deriveMiddleware(projectDir, frameworks, diag); }
  catch (middlewareErr) { diag.recordDetectorError('middleware', middlewareErr); }

  let forms = [];
  try { forms = deriveForms(projectDir, frameworks, pagesResult.pages, endpoints, diag); }
  catch (formsErr) { diag.recordDetectorError('forms', formsErr); }

  let authDetection = {
    loginSurface: null, registerSurface: null, logoutSurface: null,
    sessionMechanism: 'unknown', tokenStorage: 'unknown', persistsAcrossRefresh: false,
  };
  try { authDetection = deriveAuth(projectDir, frameworks, pagesResult.pages, endpoints, diag); }
  catch (authErr) { diag.recordDetectorError('auth', authErr); }

  // Response envelope — static parse of the bootstrap file + global
  // interceptor/middleware source. Gives the probe a single source of truth for
  // the wrapper path (e.g. NestJS TransformInterceptor → ['data'], N-deep
  // Express middleware → ['payload','data']) so capture paths like
  // `$.accessToken` resolve transparently without runtime sniffing.
  let responseEnvelope = { successWrapper: null, errorWrapper: null, wrapper: null, source: null };
  try { responseEnvelope = detectResponseEnvelope(projectDir, diag); }
  catch (envelopeErr) { diag.recordDetectorError('response-envelope', envelopeErr); }

  // Error envelope — static parse of the global exception filter source.
  // Gives the probe a single source of truth for the error wrapper shape
  // (e.g. NestJS GlobalExceptionFilter → {success:false, error:{statusCode,message}})
  // so error-shape assertions unwrap transparently without runtime sniffing.
  let errorEnvelope = null;
  try { errorEnvelope = detectErrorEnvelope(projectDir, diag); }
  catch (errorEnvErr) { diag.recordDetectorError('error-envelope', errorEnvErr); }

  // Prisma unique-constraint discovery. flows-generator uses this to decide
  // which sampleValid fields need run-unique substitution at probe time
  // (otherwise POST /auth/register with a fixed example email 409s on every
  // subsequent run). Empty models → no uniqueness info → no substitution.
  let prismaModels = { models: {}, source: null };
  try { prismaModels = detectPrismaUniques(projectDir, diag); }
  catch (prismaErr) { diag.recordDetectorError('prisma-uniques', prismaErr); }

  // GraphQL introspection — detect /graphql endpoint, parse schema.
  let graphql = null;
  try { graphql = await detectGraphQL(projectDir, diag); }
  catch (graphqlErr) { diag.recordDetectorError('graphql', graphqlErr); }

  // WebSocket gateway detection — NestJS @WebSocketGateway, socket.io, graphql-ws.
  let websocketGateways = null;
  try { websocketGateways = detectWebSocket(projectDir, diag); }
  catch (wsErr) { diag.recordDetectorError('websocket', wsErr); }

  // CSRF / OAuth / Multi-tenant detectors — pass partial matrix for OpenAPI-based scans.
  // Each detector accepts an optional 3rd `diagnostics` array; we collect them
  // and forward into matrix.diagnostics.detectorWarnings (distinct from
  // detectorErrors, which records thrown exceptions).
  const partialMatrix = { apiEndpoints: endpoints, securitySchemes };
  const detectorWarnings = [];

  let csrf = null;
  const csrfDiag = [];
  try { csrf = detectCsrf(projectDir, partialMatrix, csrfDiag); }
  catch (csrfErr) { diag.recordDetectorError('csrf', csrfErr); }
  for (const entry of csrfDiag) {
    detectorWarnings.push({ detector: 'csrf', ...entry });
  }

  let oauth = null;
  const oauthDiag = [];
  try { oauth = detectOAuth(projectDir, partialMatrix, oauthDiag); }
  catch (oauthErr) { diag.recordDetectorError('oauth', oauthErr); }
  for (const entry of oauthDiag) {
    detectorWarnings.push({ detector: 'oauth', ...entry });
  }

  let multiTenant = null;
  const tenantDiag = [];
  try { multiTenant = detectMultiTenant(projectDir, partialMatrix, tenantDiag); }
  catch (tenantErr) { diag.recordDetectorError('multi-tenant', tenantErr); }
  for (const entry of tenantDiag) {
    detectorWarnings.push({ detector: 'multi-tenant', ...entry });
  }

  // Cookie-flows detector — reads the full OpenAPI spec for cookie declarations.
  // Uses the nest-openapi loader to get the spec, then scans for cookie extensions.
  let cookieFlows = [];
  const cookieDiag = [];
  try {
    const { detectNestOpenApi } = require('./detectors/nest-openapi');
    const openApiResult = await detectNestOpenApi(projectDir, diag);
    if (openApiResult && openApiResult.source) {
      // Re-fetch the spec for the cookie detector (it needs the raw spec, not matrix)
      const openApiSpec = await loadOpenApiSpec(projectDir);
      if (openApiSpec) {
        const cookieResult = detectCookieFlows(openApiSpec);
        cookieFlows = cookieResult.cookieFlows || [];
        for (const d of cookieResult.diagnostics) {
          cookieDiag.push(d);
        }
      }
    }
  } catch (cookieErr) { diag.recordDetectorError('cookie-flows', cookieErr); }
  for (const entry of cookieDiag) {
    detectorWarnings.push({ detector: 'cookie-flows', ...entry });
  }

  // Merge with manifest.
  const merged = mergeEntries(
    { pages: pagesResult.pages, endpoints, middleware, forms, auth: authDetection },
    manifest
  );

  // Tokens per page.
  for (const page of merged.pages) {
    if (!page.tokens || page.tokens.length === 0) {
      try {
        page.tokens = extractTokens(projectDir, page.file, diag);
      } catch (tokenErr) {
        diag.recordDetectorError(`tokens:${page.file}`, tokenErr);
        page.tokens = [];
      }
    }
  }

  // Changed stamping.
  const changedSet = new Set((sessionFiles || []).map(normalizeAbs(projectDir)));
  const stampChanged = (entry) => {
    if (!entry || !entry.file) return entry;
    const abs = normalizeAbs(projectDir)(entry.file);
    entry.changed = args.full ? true : changedSet.has(abs);
    return entry;
  };
  merged.pages.forEach(stampChanged);
  merged.endpoints.forEach(stampChanged);
  merged.forms.forEach(stampChanged);
  merged.middleware.forEach(stampChanged);

  const diagnostics = computeDiagnostics(merged, diag.getDetectorErrors(), detectorWarnings);

  const detectorFatalCount = diag.getDetectorErrors().length;
  if (args.strict && merged.pages.length === 0 && merged.endpoints.length === 0 && detectorFatalCount > 0) {
    diag.error('strict: detectors produced no entries');
    diag.flush();
    process.exit(3);
  }

  const publicFrameworks = {
    web: frameworks.web,
    api: frameworks.api,
    monorepo: frameworks.monorepo,
    auth: frameworks.auth,
    appRouter: frameworks.appRouter,
  };

  const matrix = {
    version: '1',
    generatedAt: new Date().toISOString(),
    projectDir,
    scope: args.full ? 'full' : 'session',
    detectedFrameworks: publicFrameworks,
    bootPlan,
    pages: merged.pages,
    pageRoles: pagesResult.pageRoles || {},
    apiEndpoints: merged.endpoints,
    forms: merged.forms,
    middleware: merged.middleware,
    authDetection: merged.auth || authDetection,
    responseEnvelope,
    errorEnvelope,
    securitySchemes,
    prismaModels,
    graphql,
    websocketGateways,
    csrf,
    oauth,
    multiTenant,
    cookieFlows,
    diagnostics,
    flows: merged.flows,
    manifest: {
      compiledPresent: Boolean(manifest.compiled),
      overlayPresent: Boolean(manifest.overlay),
      overlayCoverage: manifest.overlay && manifest.overlay.coverage ? manifest.overlay.coverage : null,
    },
  };

  // Phase 1d enrichment: attach Zod contracts, NestJS decorator data, and
  // Swagger-declared statuses onto every endpoint.
  try {
    const enrichDiag = [];
    const { enrichedCount } = enrichMatrix(matrix, projectDir, enrichDiag);
    diag.info(`enrichment: ${enrichedCount} endpoints enriched`);
    for (const msg of enrichDiag) {
      diag.info(`enrichment: ${msg}`);
    }
  } catch (enrichErr) {
    diag.recordDetectorError('enrichment', enrichErr);
  }

  fs.writeFileSync(output, JSON.stringify(matrix, null, 2));
  diag.flush();
  process.exit(0);
}

main(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`[derive-test-matrix] fatal: ${err.stack || err.message}\n`);
  process.exit(2);
});
