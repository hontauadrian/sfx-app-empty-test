'use strict';

/**
 * detectors/multi-tenant.js — Declaration-driven multi-tenancy detection (V1).
 *
 * Strict declared signal sources (priority order — STOP at first match for scope):
 *   1. Declared header parameter in OpenAPI: operation parameters[in==='header']
 *      with a tenant-related name. Header name is read verbatim from the
 *      declaration — no canonical name enforcement.
 *   2. x-multi-tenant OpenAPI extension on operation/path/document.
 *   3. NestJS decorator signal: @TenantId() / @Tenant() parameter decorators,
 *      or guard class names matching declared tenancy guards.
 *
 * Path-regex (URL-substring matching for `:tenantId`, `/tenants/`, etc.) was
 * REMOVED in V1 final pass per source-of-truth principle. Path appearance is
 * not a contract; declarations are. When tenancy presence is signaled by
 * supplementary surfaces (package deps, Prisma schema, middleware classes)
 * but no declared scope source resolves, emit TENANCY_SCOPE_UNDETECTED.
 * When >1 distinct sources match on different endpoints, emit
 * TENANCY_SCOPE_AMBIGUOUS and refuse to pick a scope.
 *
 * Supplementary scans (presence enrichment — not part of scope chain):
 *   - Package deps: @nestjs-modules/tenant, multi-tenant libraries
 *   - Prisma schema: tenantId field on models
 *   - Middleware/guard class names (TenantMiddleware / TenantGuard / ...)
 *
 * Exported for testing:
 *   detectMultiTenant(projectDir, matrix, diagnostics?) → { detected, strategy, headerName, tenantModels, source, diag }
 *   scanDeclaredHeaders(matrix) → { headerName, endpoint, source } | null  (single first match — back-compat)
 *   collectDeclaredHeaderCandidates(matrix) → Array<{ headerName, endpoint, source }>
 *   scanMultiTenantExtension(matrix) → { endpoint, source } | null  (single first match — back-compat)
 *   collectExtensionCandidates(matrix) → Array<{ endpoint, source }>
 *   scanDecoratorSignals(projectDir) → { strategy, candidates, canonicalEndpoint, headerName, source, diag? } | { strategy, signal, source } | null
 *   extractGlobalPrefix(projectDir) → string
 *   extractMethodRoute(content, offset) → { className, methodName, httpMethod, routePath, controllerPrefix } | null
 *   scanMiddleware(projectDir) → { strategy, source } | null
 *   scanPrismaSchema(projectDir) → { fieldName, models, source } | null
 *   scanPackageDeps(projectDir) → { strategy, source } | null
 */

const fs = require('fs');
const path = require('path');

// Known tenant header name patterns (used only for Priority 1 header detection).
// The name is read verbatim from the declaration; the regex merely identifies
// which declared headers are tenant-related.
const TENANT_HEADER_RE = /^x-tenant-id$|^x-org-id$|^x-organization-id$|^x-workspace-id$|^tenant-id$/i;

// NestJS decorator patterns for Priority 3
const TENANT_DECORATOR_RE = /@TenantId\s*\(|@Tenant\s*\(/;

// HTTP verb decorators for extracting method routes
const HTTP_VERB_RE = /@(Get|Post|Put|Delete|Patch)\s*\(\s*'([^']*)'\s*\)|@(Get|Post|Put|Delete|Patch)\s*\(\s*"([^"]*)"\s*\)|@(Get|Post|Put|Delete|Patch)\s*\(\)/;

// Controller prefix decorator
const CONTROLLER_PREFIX_RE = /@Controller\s*\(\s*'([^']*)'\s*\)|@Controller\s*\(\s*"([^"]*)"\s*\)|@Controller\s*\(\)/;

// x-tenant-context-header extension on class or method
const TENANT_CONTEXT_HEADER_RE = /@ApiExtension\s*\(\s*'x-tenant-context-header'\s*,\s*'([^']*)'\s*\)|@ApiExtension\s*\(\s*"x-tenant-context-header"\s*,\s*"([^"]*)"\s*\)/;

// Middleware/guard class name patterns (Priority 3 — class name signal)
const TENANT_CLASS_RE = /TenantMiddleware|TenantGuard|TenantInterceptor|TenantService|MultiTenantModule/;

// Known multi-tenant packages
const TENANT_PACKAGES = [
  { pkg: '@nestjs-modules/tenant', strategy: 'module' },
  { pkg: 'nestjs-tenancy', strategy: 'module' },
  { pkg: 'cls-hooked', strategy: 'cls' },
  { pkg: 'nestjs-cls', strategy: 'cls' },
];

// ---------------------------------------------------------------------------
// Priority 1: Declared header parameter in OpenAPI
// ---------------------------------------------------------------------------

/**
 * Collect ALL endpoints declaring a tenant header parameter.
 * Used by detectMultiTenant for AMBIGUOUS detection across distinct headers.
 */
function collectDeclaredHeaderCandidates(matrix) {
  const out = [];
  const endpoints = (matrix && matrix.apiEndpoints) || [];
  for (const ep of endpoints) {
    const params = (ep.swaggerDeclared && ep.swaggerDeclared.parameters) || ep.parameters || [];
    if (Array.isArray(params)) {
      for (const param of params) {
        if (param.in === 'header' && TENANT_HEADER_RE.test(param.name || '')) {
          out.push({
            headerName: param.name,
            endpoint: `${ep.method} ${ep.path}`,
            endpointRef: { method: ep.method, path: ep.path },
            source: `declared-header:${ep.method} ${ep.path}`,
          });
          break; // one match per endpoint
        }
      }
    }
  }
  return out;
}

/**
 * Scan endpoint parameters for a declared tenant header (returns first match).
 * Header name is read verbatim — no canonical name enforcement.
 * Kept for back-compat with existing callers and tests.
 */
function scanDeclaredHeaders(matrix) {
  const candidates = collectDeclaredHeaderCandidates(matrix);
  return candidates.length > 0 ? candidates[0] : null;
}

// ---------------------------------------------------------------------------
// Extension lookup helper — checks both top-level and swaggerDeclared.extensions
// ---------------------------------------------------------------------------

function getExtension(ep, key) {
  if (ep[key] !== undefined) return ep[key];
  if (ep.swaggerDeclared && ep.swaggerDeclared.extensions && ep.swaggerDeclared.extensions[key] !== undefined) {
    return ep.swaggerDeclared.extensions[key];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Priority 2: x-multi-tenant OpenAPI extension
// ---------------------------------------------------------------------------

/**
 * Collect ALL endpoints declaring the x-multi-tenant extension, plus document-level.
 */
function collectExtensionCandidates(matrix) {
  const out = [];
  if (!matrix) return out;

  if (matrix['x-multi-tenant'] === true) {
    out.push({ endpoint: null, endpointRef: null, headerName: null, source: 'extension:document' });
  }

  const endpoints = matrix.apiEndpoints || [];
  for (const ep of endpoints) {
    if (getExtension(ep, 'x-multi-tenant') === true) {
      const declaredHeader = getExtension(ep, 'x-multi-tenant-header') || null;
      out.push({
        endpoint: `${ep.method} ${ep.path}`,
        endpointRef: { method: ep.method, path: ep.path },
        headerName: typeof declaredHeader === 'string' ? declaredHeader : null,
        source: `extension:${ep.method} ${ep.path}`,
      });
    }
  }
  return out;
}

/**
 * Scan for x-multi-tenant extension on operations, paths, or the document root
 * (returns first match). Kept for back-compat.
 */
function scanMultiTenantExtension(matrix) {
  const candidates = collectExtensionCandidates(matrix);
  return candidates.length > 0 ? candidates[0] : null;
}

// ---------------------------------------------------------------------------
// Priority 3: NestJS decorator signals
// ---------------------------------------------------------------------------

/**
 * Extract the global API prefix from apps/api/src/main.ts via static scan of
 * `app.setGlobalPrefix('...')`. Returns the prefix string or '' if not found.
 */
function extractGlobalPrefix(projectDir) {
  const mainPaths = [
    path.join(projectDir, 'apps/api/src/main.ts'),
    path.join(projectDir, 'src/main.ts'),
  ];
  for (const mainPath of mainPaths) {
    if (!fs.existsSync(mainPath)) continue;
    try {
      const content = fs.readFileSync(mainPath, 'utf8');
      const match = content.match(/setGlobalPrefix\s*\(\s*['"]([^'"]*)['"]\s*\)/);
      if (match) return match[1];
    } catch { /* ignore */ }
  }
  return '';
}

/**
 * Given file content and the byte offset of a @TenantId()/@Tenant() match,
 * extract the enclosing method's HTTP verb decorator and the class's
 * @Controller prefix. Returns { className, methodName, httpMethod, routePath }
 * or null if insufficient declarative information is available.
 */
function extractMethodRoute(content, decoratorOffset) {
  // Find the method that encloses this decorator usage by looking backwards
  // from the decorator offset for the nearest HTTP verb decorator.
  const before = content.slice(0, decoratorOffset);

  // Extract the method's HTTP verb decorator — scan backwards from the
  // decorator offset to find the closest @Get/@Post/@Put/@Delete/@Patch.
  // We split into lines and walk backwards.
  const lines = before.split('\n');
  let httpMethod = null;
  let routePath = '';
  let methodName = null;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    // Look for HTTP verb decorator
    const verbMatch = line.match(HTTP_VERB_RE);
    if (verbMatch && !httpMethod) {
      httpMethod = (verbMatch[1] || verbMatch[3] || verbMatch[5]).toUpperCase();
      routePath = verbMatch[2] || verbMatch[4] || '';
    }
    // Look for method name (line with the decorator's method signature)
    // Pattern: async? methodName( or methodName(
    if (!methodName) {
      const methodMatch = line.match(/(?:async\s+)?(\w+)\s*\(/);
      if (methodMatch && !line.match(/^[\s]*(?:\/\/|\/\*|\*|import|export\s+class|@)/)) {
        methodName = methodMatch[1];
      }
    }
    // Stop at class boundary
    if (line.match(/export\s+class\s+|^class\s+/)) break;
    if (httpMethod) break;
  }

  if (!httpMethod) return null;

  // Extract class name and @Controller prefix from the full content
  let className = null;
  const classMatch = content.match(/(?:export\s+)?class\s+(\w+)/);
  if (classMatch) className = classMatch[1];

  let controllerPrefix = '';
  const controllerMatch = content.match(CONTROLLER_PREFIX_RE);
  if (controllerMatch) {
    controllerPrefix = controllerMatch[1] || controllerMatch[2] || '';
  }

  return { className, methodName, httpMethod, routePath, controllerPrefix };
}

/**
 * Scan source files for @TenantId() / @Tenant() parameter decorators
 * or guard class names matching declared tenancy guards.
 *
 * Extended (V2): when @TenantId()/@Tenant() decorators are found, extracts
 * the enclosing method's HTTP verb + route path + @Controller prefix to
 * build candidate endpoints. Also scans for @ApiExtension('x-tenant-context-header', '...')
 * to resolve the header name declaratively.
 *
 * Returns:
 *   { strategy: 'decorator', candidates: [...], canonicalEndpoint, headerName, source, diag? }
 *   { strategy: <guard|middleware|...>, signal, source }  (class-name fallback)
 *   null  (nothing found)
 */
function scanDecoratorSignals(projectDir) {
  const searchDirs = [
    path.join(projectDir, 'apps/api/src'),
    path.join(projectDir, 'src'),
  ];

  const decoratorCandidates = [];
  let firstClassSignal = null;
  let tenantContextHeader = null;

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = findTsFiles(dir);
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');

        // Scan for x-tenant-context-header extension anywhere in this file
        if (!tenantContextHeader) {
          const headerExtMatch = content.match(TENANT_CONTEXT_HEADER_RE);
          if (headerExtMatch) {
            tenantContextHeader = headerExtMatch[1] || headerExtMatch[2];
          }
        }

        // Find ALL @TenantId() / @Tenant() parameter decorator usages in this file
        const decoratorRe = new RegExp(TENANT_DECORATOR_RE.source, 'g');
        let match;
        while ((match = decoratorRe.exec(content)) !== null) {
          const decoratorName = match[0].replace(/\s*\($/, '');
          const routeInfo = extractMethodRoute(content, match.index);
          if (routeInfo) {
            decoratorCandidates.push({
              decoratorName,
              className: routeInfo.className,
              methodName: routeInfo.methodName,
              httpMethod: routeInfo.httpMethod,
              routePath: routeInfo.routePath,
              controllerPrefix: routeInfo.controllerPrefix,
              file: path.relative(projectDir, file),
            });
          } else {
            // Decorator found but no co-located HTTP verb — still record as signal
            decoratorCandidates.push({
              decoratorName,
              className: null,
              methodName: null,
              httpMethod: null,
              routePath: null,
              controllerPrefix: null,
              file: path.relative(projectDir, file),
            });
          }
        }

        // Check for guard/middleware class names (lower priority)
        if (!firstClassSignal) {
          const classMatch = content.match(TENANT_CLASS_RE);
          if (classMatch) {
            firstClassSignal = {
              strategy: inferStrategy(classMatch[0]),
              signal: classMatch[0],
              source: `source:${path.relative(projectDir, file)}`,
            };
          }
        }
      } catch { /* ignore */ }
    }
  }

  // If decorator candidates found, resolve them
  if (decoratorCandidates.length > 0) {
    // Build full paths for candidates with resolved routes
    const globalPrefix = extractGlobalPrefix(projectDir);
    const resolvedCandidates = [];
    const diag = [];

    for (const candidate of decoratorCandidates) {
      if (candidate.httpMethod) {
        // Build full path: /globalPrefix/controllerPrefix/routePath
        const parts = [globalPrefix, candidate.controllerPrefix, candidate.routePath].filter(Boolean);
        const fullPath = '/' + parts.join('/').replace(/\/+/g, '/').replace(/^\/+/, '');
        resolvedCandidates.push({
          className: candidate.className,
          methodName: candidate.methodName,
          method: candidate.httpMethod,
          path: fullPath,
          file: candidate.file,
        });
      }
    }

    // Determine canonical endpoint
    let canonicalEndpoint = null;
    if (resolvedCandidates.length === 1) {
      canonicalEndpoint = { method: resolvedCandidates[0].method, path: resolvedCandidates[0].path };
    } else if (resolvedCandidates.length > 1) {
      diag.push({
        level: 'warn',
        code: 'TENANCY_DECORATOR_AMBIGUOUS',
        candidates: resolvedCandidates.map((c) => ({ className: c.className, method: c.method, path: c.path, file: c.file })),
        reason: 'Multiple methods use @TenantId()/@Tenant() parameter decorator on different endpoints. Cannot determine canonical tenant endpoint. Add operationId or consolidate to a single decorated method.',
      });
    }

    // Resolve headerName from x-tenant-context-header extension
    let headerName = tenantContextHeader || null;
    if (!headerName && resolvedCandidates.length > 0) {
      diag.push({
        level: 'warn',
        code: 'TENANCY_DECORATOR_HEADER_UNDECLARED',
        reason: '@TenantId()/@Tenant() decorator detected but no @ApiExtension(\'x-tenant-context-header\', \'<header-name>\') declared. Add the extension to specify which HTTP header carries the tenant context.',
      });
    }

    return {
      strategy: 'decorator',
      signal: decoratorCandidates[0].decoratorName,
      candidates: resolvedCandidates,
      canonicalEndpoint,
      headerName,
      diag: diag.length > 0 ? diag : undefined,
      source: `decorator:${decoratorCandidates[0].file}`,
    };
  }

  // Fall back to class-name signal
  return firstClassSignal;
}

// ---------------------------------------------------------------------------
// Supplementary: Middleware class scan (kept for enrichment, not priority)
// ---------------------------------------------------------------------------

/**
 * Scan source files for tenant middleware/guard classes.
 */
function scanMiddleware(projectDir) {
  const searchDirs = [
    path.join(projectDir, 'apps/api/src'),
    path.join(projectDir, 'src'),
  ];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = findTsFiles(dir);
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const match = content.match(TENANT_CLASS_RE);
        if (match) {
          const strategy = inferStrategy(match[0]);
          return {
            strategy,
            className: match[0],
            source: `source:${path.relative(projectDir, file)}`,
          };
        }
      } catch { /* ignore */ }
    }
  }
  return null;
}

/**
 * Infer tenant strategy from class name.
 */
function inferStrategy(className) {
  if (/Middleware/i.test(className)) return 'header-middleware';
  if (/Guard/i.test(className)) return 'guard';
  if (/Interceptor/i.test(className)) return 'interceptor';
  if (/Module/i.test(className)) return 'module';
  return 'service';
}

// ---------------------------------------------------------------------------
// Supplementary: Prisma schema scan
// ---------------------------------------------------------------------------

/**
 * Scan Prisma schema for tenantId fields.
 */
function scanPrismaSchema(projectDir) {
  const schemaPath = path.join(projectDir, 'packages/database/prisma/schema.prisma');
  if (!fs.existsSync(schemaPath)) return null;

  try {
    const content = fs.readFileSync(schemaPath, 'utf8');
    const modelRe = /model\s+(\w+)\s*\{([^}]+)\}/g;

    const modelsWithTenant = [];
    let modelMatch;
    while ((modelMatch = modelRe.exec(content)) !== null) {
      const modelName = modelMatch[1];
      const modelBody = modelMatch[2];
      if (/tenantId|orgId|organizationId|workspaceId/i.test(modelBody)) {
        modelsWithTenant.push(modelName);
      }
    }

    if (modelsWithTenant.length === 0) return null;

    return {
      fieldName: 'tenantId',
      models: modelsWithTenant,
      source: 'prisma-schema',
    };
  } catch { /* ignore */ }
  return null;
}

// ---------------------------------------------------------------------------
// Supplementary: Package deps scan
// ---------------------------------------------------------------------------

/**
 * Scan package.json for multi-tenant libraries.
 */
function scanPackageDeps(projectDir) {
  const pkgPaths = [
    path.join(projectDir, 'apps/api/package.json'),
    path.join(projectDir, 'package.json'),
  ];

  for (const pkgPath of pkgPaths) {
    if (!fs.existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };
      for (const { pkg: name, strategy } of TENANT_PACKAGES) {
        if (allDeps[name]) {
          return { strategy, source: `package.json:${name}` };
        }
      }
    } catch { /* ignore parse errors */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Recursively find .ts files (max depth 5, max 200 files).
 */
function findTsFiles(dir, depth = 0, result = []) {
  if (depth > 5 || result.length > 200) return result;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findTsFiles(fullPath, depth + 1, result);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts')) {
        result.push(fullPath);
      }
    }
  } catch { /* ignore permission errors */ }
  return result;
}

// ---------------------------------------------------------------------------
// Scope resolver — strict declarations only, with AMBIGUOUS detection
// ---------------------------------------------------------------------------

/**
 * Resolve the tenancy scope from declared sources only (header / extension /
 * decorator). Emits TENANCY_SCOPE_AMBIGUOUS when >1 distinct candidates are
 * found across all declared sources for distinct endpoints.
 *
 * Returns:
 *   { strategy, headerName, source } when exactly one declared scope resolves
 *   null when 0 declared scopes resolve OR when AMBIGUOUS (caller decides UNDETECTED)
 */
function resolveTenancyScope(matrix, projectDir, diag) {
  const headerCandidates = matrix ? collectDeclaredHeaderCandidates(matrix) : [];
  const extensionCandidates = matrix ? collectExtensionCandidates(matrix) : [];
  const decoratorResult = scanDecoratorSignals(projectDir);

  // Build a unified candidate list keyed by endpoint+source
  const allCandidates = [];
  for (const c of headerCandidates) {
    allCandidates.push({ kind: 'header', endpoint: c.endpoint, headerName: c.headerName, endpointRef: c.endpointRef, source: c.source });
  }
  for (const c of extensionCandidates) {
    allCandidates.push({ kind: 'extension', endpoint: c.endpoint || 'document', endpointRef: c.endpointRef || null, headerName: c.headerName || null, source: c.source });
  }
  if (decoratorResult && decoratorResult.strategy === 'decorator') {
    // V2: decorator result includes resolved candidates with HTTP paths.
    // Forward any detector-level DIAGs (AMBIGUOUS, HEADER_UNDECLARED) to caller.
    if (decoratorResult.diag && diag) {
      for (const d of decoratorResult.diag) diag.push(d);
    }
    // Use the resolved canonical endpoint path as the endpoint key (not the
    // source file), so reinforcement detection works when a header declaration
    // and a decorator resolve to the same HTTP path.
    const epKey = decoratorResult.canonicalEndpoint
      ? `${decoratorResult.canonicalEndpoint.method} ${decoratorResult.canonicalEndpoint.path}`
      : decoratorResult.source;
    allCandidates.push({
      kind: 'decorator',
      endpoint: epKey,
      endpointRef: decoratorResult.canonicalEndpoint || null,
      headerName: decoratorResult.headerName || null,
      strategy: decoratorResult.strategy,
      source: decoratorResult.source,
    });
  } else if (decoratorResult) {
    // Class-name signal (guard/middleware/etc.) — no endpoint resolution
    allCandidates.push({
      kind: 'decorator',
      endpoint: decoratorResult.source,
      strategy: decoratorResult.strategy,
      source: decoratorResult.source,
    });
  }

  if (allCandidates.length === 0) {
    return null;
  }

  // Distinct endpoints → AMBIGUOUS if >1. Key by endpoint identity only
  // (not kind), so the same endpoint declaring tenancy via both header AND
  // extension is reinforcement, not ambiguity. Decorator candidates use
  // their source file as endpoint key since they don't map to an HTTP path.
  const distinctEndpoints = new Set(allCandidates.map((c) => c.endpoint));
  if (distinctEndpoints.size > 1) {
    if (diag) {
      diag.push({
        level: 'warn',
        code: 'TENANCY_SCOPE_AMBIGUOUS',
        endpoints: allCandidates.map((c) => ({ kind: c.kind, endpoint: c.endpoint, source: c.source })),
        reason: 'Multiple distinct declarations signal a tenancy scope across different endpoints. Consolidate to a single declared header or single x-multi-tenant extension.',
      });
    }
    return null;
  }

  // Exactly one distinct candidate group — return the first (priority: header > extension > decorator)
  const headerWin = allCandidates.find((c) => c.kind === 'header');
  if (headerWin) {
    return {
      strategy: 'header',
      headerName: headerWin.headerName,
      canonicalEndpoint: headerWin.endpointRef || null,
      source: headerWin.source,
    };
  }
  const extensionWin = allCandidates.find((c) => c.kind === 'extension');
  if (extensionWin) {
    // Document-level extension (no per-endpoint) cannot resolve a canonical endpoint
    if (!extensionWin.endpointRef) {
      if (diag) {
        diag.push({
          level: 'warn',
          code: 'TENANCY_EXTENSION_DOCUMENT_SCOPE_UNRESOLVED',
          source: extensionWin.source,
          reason: 'Document-level x-multi-tenant extension cannot resolve a canonical endpoint. Add x-multi-tenant on a specific endpoint.',
        });
      }
      return null;
    }
    // Per-endpoint extension without x-multi-tenant-header declaration
    if (!extensionWin.headerName) {
      if (diag) {
        diag.push({
          level: 'warn',
          code: 'TENANCY_EXTENSION_HEADER_UNDECLARED',
          source: extensionWin.source,
          reason: 'Per-endpoint x-multi-tenant extension found but x-multi-tenant-header not declared. Add @ApiExtension(\'x-multi-tenant-header\', \'<header-name>\') to specify the tenant header.',
        });
      }
      return null;
    }
    // Both endpointRef and headerName resolved from declarations
    return {
      strategy: 'extension',
      headerName: extensionWin.headerName,
      canonicalEndpoint: extensionWin.endpointRef,
      source: extensionWin.source,
    };
  }
  const decoratorWin = allCandidates.find((c) => c.kind === 'decorator');
  if (decoratorWin) {
    return {
      strategy: decoratorWin.strategy,
      headerName: decoratorWin.headerName || null,
      canonicalEndpoint: decoratorWin.endpointRef || null,
      source: decoratorWin.source,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main detection entry point
// ---------------------------------------------------------------------------

/**
 * @param {string} projectDir - Project root directory
 * @param {object} [matrix] - Existing matrix for OpenAPI-based detection
 * @param {Array}  [diagnostics] - Mutable diag array for DIAG messages
 * @returns {{ detected, strategy, headerName, tenantModels, source }}
 */
function detectMultiTenant(projectDir, matrix, diagnostics) {
  const diag = diagnostics || [];

  // Strict scope resolution (header → extension → decorator).
  // Path-regex Tier 4 was removed in V1 final pass.
  const diagBefore = diag.length;
  const scope = resolveTenancyScope(matrix, projectDir, diag);
  const ambiguousDuringResolve = diag.slice(diagBefore).some((d) => d.code === 'TENANCY_SCOPE_AMBIGUOUS');

  // Supplementary enrichment / presence signals (not part of scope chain)
  const pkgResult = scanPackageDeps(projectDir);
  const prismaResult = scanPrismaSchema(projectDir);
  const middlewareResult = scanMiddleware(projectDir);

  const presenceSignaled = Boolean(scope || pkgResult || prismaResult || middlewareResult || ambiguousDuringResolve);

  if (!presenceSignaled) {
    return {
      detected: false,
      strategy: null,
      headerName: null,
      pathParam: null,
      canonicalEndpoint: null,
      tenantModels: null,
      source: null,
    };
  }

  // If presence is signaled but no declared scope resolved → UNDETECTED
  if (!scope) {
    diag.push({
      level: 'warn',
      code: 'TENANCY_SCOPE_UNDETECTED',
      reason: 'Multi-tenancy presence signaled (package, schema, middleware, or ambiguous declarations) but no single declared scope source resolved. Add an OpenAPI tenant header parameter, x-multi-tenant extension, or @TenantId() decorator.',
      presence: {
        package: Boolean(pkgResult),
        prisma: Boolean(prismaResult),
        middleware: Boolean(middlewareResult),
        ambiguous: ambiguousDuringResolve,
      },
    });

    // Fall back to supplementary strategy signal so the matrix still records what was seen.
    let fallbackStrategy = null;
    let fallbackSource = null;
    if (pkgResult) {
      fallbackStrategy = pkgResult.strategy;
      fallbackSource = pkgResult.source;
    } else if (prismaResult) {
      fallbackStrategy = 'schema-field';
      fallbackSource = prismaResult.source;
    } else if (middlewareResult) {
      fallbackStrategy = middlewareResult.strategy;
      fallbackSource = middlewareResult.source;
    }

    return {
      detected: true,
      strategy: fallbackStrategy,
      headerName: null,
      pathParam: null,
      canonicalEndpoint: null,
      tenantModels: (prismaResult && prismaResult.models) || null,
      source: fallbackSource,
    };
  }

  // Scope resolved cleanly
  return {
    detected: true,
    strategy: scope.strategy,
    headerName: scope.headerName,
    pathParam: null,
    canonicalEndpoint: scope.canonicalEndpoint || null,
    tenantModels: (prismaResult && prismaResult.models) || null,
    source: scope.source,
  };
}

// Backwards-compatible alias
function scanEndpointHeaders(matrix) {
  return scanDeclaredHeaders(matrix);
}

module.exports = {
  detectMultiTenant,
  resolveTenancyScope,
  collectDeclaredHeaderCandidates,
  collectExtensionCandidates,
  scanDeclaredHeaders,
  scanEndpointHeaders,
  scanMultiTenantExtension,
  scanDecoratorSignals,
  scanMiddleware,
  scanPrismaSchema,
  scanPackageDeps,
  inferStrategy,
  extractGlobalPrefix,
  extractMethodRoute,
};
