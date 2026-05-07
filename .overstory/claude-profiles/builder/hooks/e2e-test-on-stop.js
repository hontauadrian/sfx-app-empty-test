/**
 * Stop hook — E2E verification via Playwright MCP evidence log.
 *
 * When the agent tries to end a turn, this hook:
 *   1. Reads session-tracked files (from track-session-files.js)
 *   2. Loads matrix.json (plan 02) if present, else falls back to the legacy
 *      APP_PAGE_PATTERN derivation
 *   3. Loads overlay.json (plan 05) if present — contract-level flows/tokens
 *   4. Reads the MCP evidence log written by mcp-evidence-recorder.js (plan 03
 *      enriches each record with navigatedUrl/pageTokens/networkFailures etc.)
 *   5. Correlates matrix × evidence per-route:
 *        — EVIDENCE_MISMATCH: no snapshot for a changed route, or snapshot
 *          tokens disjoint from expected tokens
 *        — RUNTIME_UNVERIFIED: networkFailures or denied console errors
 *        — AUTH_CONTRACT_INCOMPLETE: guarded routes need both auth+unauth proof
 *        — GATE_GAMING: devtools-click without subsequent real navigation,
 *          or repeated identical snapshot hashes, or orphan-root-only traffic
 *        — FLOW_INCOMPLETE: overlay flows not satisfied
 *   6. Emits a single `{ decision: 'block', reason }` JSON on failure,
 *      exits 0 on pass.
 *
 * The log is write-protected from the agent by PROTECTED_WORKTREE_GLOBS.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PROJECT_DIR = process.env.HOOK_TEST_PROJECT_ROOT || path.resolve(__dirname, '..', '..');
const MCP_CONFIG = path.join(PROJECT_DIR, '.mcp.json');
const SESSION_FILE = path.join(
  os.tmpdir(),
  `claude-session-files-${Buffer.from(PROJECT_DIR).toString('base64url')}.json`
);
const MCP_EVIDENCE_DIR = path.join(PROJECT_DIR, '.claude', 'hooks', '.mcp-evidence');
const MATRIX_FILE = path.join(PROJECT_DIR, '.claude', 'hooks', '.matrix.json');
const OVERLAY_FILE = path.join(PROJECT_DIR, '.runtime-contract.overlay.json');

let input = {};
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  // Stop hooks may be invoked without stdin JSON in some test contexts —
  // fall back to {} and carry on; session_id will be missing and the
  // evidence check will fail closed.
}

// ── Skip if not a web project ────────────────────────────────────────
const WEB_CONFIG_FILES = [
  'next.config.ts', 'next.config.js', 'next.config.mjs',
  'nuxt.config.ts', 'nuxt.config.js',
  'vite.config.ts', 'vite.config.js', 'vite.config.mjs',
  'svelte.config.js', 'svelte.config.ts',
  'angular.json',
  'remix.config.js', 'remix.config.ts',
  'astro.config.mjs', 'astro.config.ts',
];

const WEB_DEPS = [
  'next', 'react-dom', 'nuxt', 'vue', '@angular/core',
  'svelte', '@sveltejs/kit', '@remix-run/react', 'astro', 'vite',
];

function packageHasWebDeps(dir) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
    );
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    return WEB_DEPS.some((dep) => dep in allDeps);
  } catch {
    return false;
  }
}

function isWebProject() {
  for (const configFile of WEB_CONFIG_FILES) {
    if (fs.existsSync(path.join(PROJECT_DIR, configFile))) return true;
  }
  if (packageHasWebDeps(PROJECT_DIR)) return true;
  for (const workspace of ['apps', 'packages']) {
    const wsDir = path.join(PROJECT_DIR, workspace);
    try {
      const entries = fs.readdirSync(wsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const subDir = path.join(wsDir, entry.name);
        for (const configFile of WEB_CONFIG_FILES) {
          if (fs.existsSync(path.join(subDir, configFile))) return true;
        }
        if (packageHasWebDeps(subDir)) return true;
      }
    } catch {
      // workspace dir doesn't exist, skip
    }
  }
  return false;
}

if (!isWebProject()) {
  process.exit(0);
}

// ── Read tracked files ──────────────────────────────────────────────
let changedFiles = [];
try {
  const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  changedFiles = data.files || [];
} catch {
  // No session file → nothing was edited → allow stop
  process.exit(0);
}

if (changedFiles.length === 0) {
  process.exit(0);
}

// ── Route helpers (shared) ──────────────────────────────────────────
function normalizeRoute(urlPath) {
  if (!urlPath) return urlPath;
  if (urlPath === '/') return '/';
  return String(urlPath).replace(/\/+$/, '');
}

function routeMatches(urlPath, route) {
  if (!urlPath) return false;
  const normalizedUrl = normalizeRoute(urlPath);
  const normalizedRoute = normalizeRoute(route);
  if (normalizedRoute === '/') return normalizedUrl === '/' || normalizedUrl === '';
  // Support plan-02 ":param" and Next-style "[param]" placeholders in matrix routes.
  if (/[:[]/.test(normalizedRoute)) {
    const pattern =
      '^' +
      normalizedRoute
        .replace(/\[\.\.\.[^\]]+\]/g, '(.+)')
        .replace(/\[[^\]]+\]/g, '([^/]+)')
        .replace(/:[A-Za-z0-9_]+/g, '([^/]+)') +
      '$';
    try {
      return new RegExp(pattern).test(normalizedUrl);
    } catch {
      return false;
    }
  }
  return normalizedUrl === normalizedRoute;
}

// ── Legacy matrix derivation (fallback for pre-plan-02 sessions) ────
const TESTABLE_PATTERN = /\.(tsx?|jsx?|css|scss)$/;
const EXCLUDED_PATHS = /(\/(\.claude|__tests__|__mocks__|node_modules|e2e)\/)/;
const UI_PATH_PATTERN = /(apps\/web|presentation|app\/|pages|components|features)/;
const APP_PAGE_PATTERN = /(^|\/)app\/(.+)\/page\.(tsx|jsx|ts|js)$/;
const APP_ROOT_PAGE_PATTERN = /(^|\/)app\/page\.(tsx|jsx|ts|js)$/;
const DYNAMIC_SEGMENT_PATTERN = /\[[^\]]+\]/;
const ROUTE_GROUP_PATTERN = /\([^)]+\)\/?/g;

function deriveRoutesFromFile(filePath) {
  if (APP_ROOT_PAGE_PATTERN.test(filePath)) return ['/'];
  const match = filePath.match(APP_PAGE_PATTERN);
  if (!match) return [];
  const segment = match[2];
  if (DYNAMIC_SEGMENT_PATTERN.test(segment)) return [];
  const cleaned = segment.replace(ROUTE_GROUP_PATTERN, '').replace(/\/+$/, '');
  return [`/${cleaned}`];
}

function deriveLegacyMatrix(files) {
  const uiFiles = files.filter(
    (filePath) =>
      TESTABLE_PATTERN.test(filePath) &&
      !EXCLUDED_PATHS.test(filePath) &&
      UI_PATH_PATTERN.test(filePath) &&
      fs.existsSync(filePath)
  );
  if (uiFiles.length === 0) return { pages: [], apiEndpoints: [], forms: [], middleware: [] };
  const routeToFiles = new Map();
  let sawNonPageUIFile = false;
  for (const filePath of uiFiles) {
    const routes = deriveRoutesFromFile(filePath);
    if (routes.length === 0) {
      sawNonPageUIFile = true;
      continue;
    }
    for (const route of routes) {
      if (!routeToFiles.has(route)) routeToFiles.set(route, []);
      routeToFiles.get(route).push(filePath);
    }
  }
  if (sawNonPageUIFile && routeToFiles.size === 0) {
    routeToFiles.set('/', uiFiles);
  }
  const pages = [];
  for (const [route, routeFiles] of routeToFiles.entries()) {
    pages.push({
      route,
      files: routeFiles,
      tokens: [],
      changed: true,
      guard: 'public',
      interactive: true,
    });
  }
  return { pages, apiEndpoints: [], forms: [], middleware: [], _legacy: true };
}

// ── Load matrix.json (plan 02) ──────────────────────────────────────
let matrix;
try {
  if (fs.existsSync(MATRIX_FILE)) {
    matrix = JSON.parse(fs.readFileSync(MATRIX_FILE, 'utf8'));
  } else {
    matrix = deriveLegacyMatrix(changedFiles);
    try {
      process.stderr.write(
        '[e2e-test-on-stop] matrix.json not present — running legacy derivation\n'
      );
    } catch {}
  }
} catch {
  matrix = deriveLegacyMatrix(changedFiles);
}

// Normalize matrix shape — plan 02 emits `pages[].file`; stop hook uses `files[]`.
function normalizePage(page) {
  const files = Array.isArray(page.files)
    ? page.files
    : page.file
      ? [page.file]
      : [];
  return {
    route: page.route,
    files,
    tokens: Array.isArray(page.tokens) ? page.tokens : [],
    changed: page.changed !== false,
    guard: page.guard || 'public',
    interactive: page.interactive !== false,
    mustNotContain: Array.isArray(page.mustNotContain) ? page.mustNotContain : [],
  };
}

const matrixPages = Array.isArray(matrix.pages) ? matrix.pages.map(normalizePage) : [];
const matrixMiddleware = Array.isArray(matrix.middleware) ? matrix.middleware : [];

// Re-stamp `page.changed` against this session's tracked FRONTEND files only.
//
// Playwright evidence (this hook's gate) verifies the *UI rendering layer*.
// Demanding it for backend-only diffs is wrong-layer enforcement — that's
// what trapped earlier sessions in long blocked loops on backend tasks.
// Other layers have their own gates already running in the Stop chain:
//   • http-smoke         → API contract conformance (Zod / OpenAPI)
//   • logical-contract   → actor-state × surface boundary assertions
//   • typecheck / lint   → shape consistency across packages
//   • integration tests  → cross-module behavior
// So a page only needs Playwright iff this session touched at least one of
// its FRONTEND source files. Backend, shared-package, and infra changes
// flow through the gates that fit their layer.
{
  const FRONTEND_PREFIXES = ['apps/web/', 'apps/mobile/'];
  const sessionAbs = new Set(
    changedFiles.map((f) => path.resolve(PROJECT_DIR, f))
  );
  for (const page of matrixPages) {
    page.changed = page.files.some((f) => {
      const abs = path.resolve(PROJECT_DIR, f);
      if (!sessionAbs.has(abs)) return false;
      const rel = path.relative(PROJECT_DIR, abs);
      return FRONTEND_PREFIXES.some((pfx) => rel.startsWith(pfx));
    });
  }
}

// ── Load overlay.json (plan 05 shape) ───────────────────────────────
let overlay = { version: 1, routes: {}, flows: [], ignore: [] };
try {
  if (fs.existsSync(OVERLAY_FILE)) {
    const raw = JSON.parse(fs.readFileSync(OVERLAY_FILE, 'utf8'));
    if (raw && typeof raw === 'object') {
      overlay = {
        version: raw.version || 1,
        routes: raw.routes && typeof raw.routes === 'object' ? raw.routes : {},
        flows: Array.isArray(raw.flows) ? raw.flows : [],
        ignore: Array.isArray(raw.ignore) ? raw.ignore : [],
      };
    }
  }
} catch {
  // keep default
}

// ── Evidence loading ────────────────────────────────────────────────
function readEvidenceRecords(sessionId) {
  if (!sessionId) return [];
  const logFile = path.join(MCP_EVIDENCE_DIR, `${sessionId}.jsonl`);
  if (!fs.existsSync(logFile)) return [];
  try {
    const content = fs.readFileSync(logFile, 'utf8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((record) => record && record.session === sessionId);
  } catch {
    return [];
  }
}

// ── Legacy-record reparsing helpers (for pre-plan-03 records) ───────
const SNAPSHOT_URL_RE = /Page URL:\s*([^\s\\]+)/;
const ERROR_SUMMARY_RE = /Errors:\s*(\d+)/i;
const ERROR_LINE_RE = /(^|\n|\\n)\s*\[?error\]?\s/i;
const TOKEN_PATTERNS = [
  /-\s*(?:heading|button|link|textbox|combobox|checkbox|radio|tab|menuitem|option|switch)\s+"([^"]+)"/g,
  /aria-label\s*[=:]\s*"?([^"\n\\]+)"?/gi,
  /data-testid\s*=\s*"([^"]+)"/gi,
  /-\s*text:\s*"([^"]+)"/g,
  /Page Title:\s*([^\n\\]+)/gi,
];

function unescapePreview(str) {
  if (!str) return '';
  return String(str).replace(/\\n/g, '\n').replace(/\\"/g, '"');
}

function legacyNavigatedUrl(record) {
  if (record.tool === 'mcp__playwright__browser_navigate') {
    const url = record?.input?.url;
    if (url && typeof url === 'string') return url;
  }
  if (record.tool === 'mcp__playwright__browser_snapshot') {
    const match = SNAPSHOT_URL_RE.exec(unescapePreview(record?.output_preview || ''));
    if (match) return match[1];
  }
  return null;
}

function legacyNavigatedPath(record) {
  const url = legacyNavigatedUrl(record);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.pathname === '' ? '/' : parsed.pathname;
  } catch {
    return url.startsWith('/') ? url : null;
  }
}

function normalizeToken(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s-]/g, '')
    .trim();
}

function legacyPageTokens(record) {
  if (record.tool !== 'mcp__playwright__browser_snapshot') return [];
  const text = unescapePreview(record?.output_preview || '');
  const out = new Set();
  for (const re of TOKEN_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      const token = normalizeToken(match[1]);
      if (token && token.length >= 2 && token.length <= 120) out.add(token);
    }
  }
  return Array.from(out);
}

// Back-fill enrichment fields for legacy (schemaVersion < 2) records so
// downstream code uniformly reads from record.navigatedPath / pageTokens.
function enrichRecord(record) {
  if (!record || typeof record !== 'object') return record;
  if (record.schemaVersion >= 2) return record;
  return {
    ...record,
    navigatedUrl: record.navigatedUrl ?? legacyNavigatedUrl(record),
    navigatedPath: record.navigatedPath ?? legacyNavigatedPath(record),
    pageTokens: Array.isArray(record.pageTokens)
      ? record.pageTokens
      : legacyPageTokens(record),
    consoleErrors: Array.isArray(record.consoleErrors) ? record.consoleErrors : [],
    networkFailures: Array.isArray(record.networkFailures) ? record.networkFailures : [],
    snapshotHash: record.snapshotHash ?? null,
    sessionFilesSnapshot: Array.isArray(record.sessionFilesSnapshot)
      ? record.sessionFilesSnapshot
      : [],
    currentUrl: record.currentUrl ?? null,
  };
}

// ── Source-file token extraction (for matching matrix-derived tokens) ─
function extractTokensFromSourceFiles(files) {
  const tokens = new Set();
  const JSX_TEXT_RE = />\s*([A-Za-z][A-Za-z0-9 _'-]{1,80})\s*</g;
  const LABEL_ATTR_RE = /\b(?:aria-label|placeholder|title)\s*=\s*['"]([^'"\n]{2,80})['"]/g;
  const TESTID_RE = /\bdata-testid\s*=\s*['"]([^'"\n]{2,80})['"]/g;
  for (const filePath of files || []) {
    try {
      const source = fs.readFileSync(filePath, 'utf8');
      for (const re of [JSX_TEXT_RE, LABEL_ATTR_RE, TESTID_RE]) {
        re.lastIndex = 0;
        let match;
        while ((match = re.exec(source)) !== null) {
          const normalized = normalizeToken(match[1]);
          if (normalized && normalized.length >= 2 && normalized.length <= 80) {
            tokens.add(normalized);
          }
        }
      }
    } catch {
      // missing file — skip
    }
  }
  return Array.from(tokens);
}

function normalizeTokenSet(tokens) {
  return new Set((tokens || []).map(normalizeToken).filter(Boolean));
}

function tokensIntersect(set1, set2) {
  for (const token of set1) if (set2.has(token)) return true;
  return false;
}

// ── Console allow / deny lists (plan 03 §2.3) ───────────────────────
const CONSOLE_ALLOW = [
  /\[Fast Refresh\]/i,
  /\[HMR\]/i,
  /Download the React DevTools/i,
  /Warning: Extra attributes from the server:/,
  /The resource .*? was preloaded/i,
  /\[Vite\] connected/i,
  /\[vite\] hot updated/i,
  /React Router Future Flag Warning/i,
  /Warning: Each child in a list should have a unique "key"/,
];

const CONSOLE_DENY = [
  /\bUncaught\b/,
  /React will try to recreate/,
  /\bnet::ERR_/,
  /Failed to fetch/i,
  /\bECONNREFUSED\b/,
  /Unhandled promise rejection/i,
  /\b500\b/,
];

function isAllowedConsoleLine(line) {
  const hasDeny = CONSOLE_DENY.some((re) => re.test(line));
  if (hasDeny) return false;
  return CONSOLE_ALLOW.some((re) => re.test(line));
}

// ── Devtools-click detection (plan 03 §2.4) ─────────────────────────
const DEVTOOLS_CLICK_RE =
  /dev ?tools|nextjs ?dev|react ?devtools|vue ?devtools|open ?menu|__next-devtools|__nuxt-devtools/i;

function isDevtoolsClick(record) {
  if (record.tool !== 'mcp__playwright__browser_click') return false;
  try {
    const hay = JSON.stringify(record.input || {}).toLowerCase();
    return DEVTOOLS_CLICK_RE.test(hay);
  } catch {
    return false;
  }
}

// ── Interactive-detection helpers (preserved from pre-plan-03) ──────
const INTERACTIVE_SRC_RE =
  /<\s*(form|button|input|select|textarea)\b|\bon(Click|Submit|Change|KeyDown|KeyUp)\s*=|role=["'](button|link|tab|switch|menuitem|checkbox|textbox)["']/;
const IMPORT_RE = /^\s*(?:import|export)\s+(?:type\s+)?(?:\{[^}]*\}|[\w*$]+(?:\s*,\s*\{[^}]*\})?|\*(?:\s+as\s+\w+)?)\s+from\s+['"]([^'"]+)['"]/gm;
const RESOLVE_EXTS = ['.tsx', '.ts', '.jsx', '.js'];
const MAX_IMPORT_DEPTH = 3;
const aliasCache = new Map();

function loadAliases(fromDir) {
  if (aliasCache.has(fromDir)) return aliasCache.get(fromDir);
  let dir = fromDir;
  while (dir && dir !== path.dirname(dir)) {
    const tsconfigPath = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      try {
        const raw = fs.readFileSync(tsconfigPath, 'utf8');
        const cleaned = raw
          .replace(/\/\/.*$/gm, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/,(\s*[}\]])/g, '$1');
        const config = JSON.parse(cleaned);
        const paths = config?.compilerOptions?.paths;
        if (paths && Object.keys(paths).length > 0) {
          const result = { baseDir: dir, paths };
          aliasCache.set(fromDir, result);
          return result;
        }
      } catch {
        // ignore
      }
    }
    dir = path.dirname(dir);
  }
  aliasCache.set(fromDir, null);
  return null;
}

function tryResolveWithExts(candidate) {
  for (const ext of RESOLVE_EXTS) {
    if (fs.existsSync(candidate + ext)) return candidate + ext;
  }
  for (const ext of RESOLVE_EXTS) {
    const idx = path.join(candidate, `index${ext}`);
    if (fs.existsSync(idx)) return idx;
  }
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  return null;
}

function resolveImport(fromFile, spec) {
  if (spec.startsWith('.')) {
    const base = path.resolve(path.dirname(fromFile), spec);
    return tryResolveWithExts(base);
  }
  const aliases = loadAliases(path.dirname(fromFile));
  if (!aliases) return null;
  for (const [pattern, targets] of Object.entries(aliases.paths)) {
    const prefix = pattern.replace(/\*$/, '');
    if (!spec.startsWith(prefix)) continue;
    const rest = spec.slice(prefix.length);
    for (const target of targets) {
      const targetPrefix = target.replace(/\*$/, '');
      const candidate = path.resolve(aliases.baseDir, targetPrefix + rest);
      const resolved = tryResolveWithExts(candidate);
      if (resolved) return resolved;
    }
  }
  return null;
}

function hasInteractivePrimitive(entryFile, seen, depth) {
  if (depth > MAX_IMPORT_DEPTH || seen.has(entryFile)) return false;
  seen.add(entryFile);
  let source;
  try {
    source = fs.readFileSync(entryFile, 'utf8');
  } catch {
    return false;
  }
  if (INTERACTIVE_SRC_RE.test(source)) return true;
  for (const match of source.matchAll(IMPORT_RE)) {
    const resolved = resolveImport(entryFile, match[1]);
    if (resolved && hasInteractivePrimitive(resolved, seen, depth + 1)) return true;
  }
  return false;
}

function routeIsInteractive(files) {
  const seen = new Set();
  for (const filePath of files || []) {
    if (hasInteractivePrimitive(filePath, seen, 0)) return true;
  }
  return false;
}

// ── Load evidence ───────────────────────────────────────────────────
const sessionId = input.session_id;
const rawRecords = readEvidenceRecords(sessionId);
const records = rawRecords.map(enrichRecord);

// ── Freshness — evidence must be newer than latest edit to route files ─
function latestMtimeMs(files) {
  let max = 0;
  for (const filePath of files || []) {
    try {
      const full = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_DIR, filePath);
      const mtime = fs.statSync(full).mtimeMs;
      if (mtime > max) max = mtime;
    } catch {
      // missing file — skip
    }
  }
  return max;
}

// ── Compute "currentUrl after record" for auth-gated routing checks ──
function currentUrlAfter(record, allRecords) {
  if (record.navigatedPath) {
    // Find the next snapshot after this record; if it shows a different
    // Page URL, the navigation redirected.
    const later = allRecords
      .filter(
        (other) =>
          other.tool === 'mcp__playwright__browser_snapshot' &&
          (other.ts || 0) >= (record.ts || 0)
      )
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (later.length > 0) {
      return later[0].navigatedPath || record.navigatedPath;
    }
  }
  return record.navigatedPath || null;
}

// ── Middleware matcher (matrix.middleware) ──────────────────────────
function middlewareProtects(route) {
  for (const entry of matrixMiddleware) {
    const matchers = Array.isArray(entry?.matchers) ? entry.matchers : [];
    for (const matcher of matchers) {
      if (!matcher) continue;
      try {
        const pattern =
          '^' +
          String(matcher)
            .replace(/:path\*/g, '.*')
            .replace(/\/\*/g, '/.*')
            .replace(/\[\.\.\.[^\]]+\]/g, '.*')
            .replace(/\[[^\]]+\]/g, '[^/]+') +
          '$';
        if (new RegExp(pattern).test(route)) return true;
      } catch {
        // ignore malformed matcher
      }
    }
  }
  return false;
}

// ── OpenAPI spec — distinguish "real backend bug" from "endpoint not built yet" ──
//
// A frontend-only diff that calls /api/v1/foo where the backend hasn't shipped
// /api/v1/foo yet is not a frontend agent's failure — they're waiting on the
// backend agent. We cross-reference each network failure URL against the live
// apps/api/.openapi.json:
//   - Path declared in spec   → endpoint is implemented; 5xx / Failed-to-fetch
//                                is a real bug → BLOCK with RUNTIME_UNVERIFIED.
//   - Path NOT in spec        → endpoint is not implemented yet → emit a
//                                BACKEND_ENDPOINT_NOT_IMPLEMENTED warning,
//                                do NOT block.
//   - ECONNREFUSED on api host → entire stack is down (would mask everything)
//                                → BLOCK with STACK_API_DOWN.
//
// If the spec file is missing or malformed we fall back to STRICT mode (treat
// every API failure as a real bug) so a setup error never silently relaxes the
// gate.
const OPENAPI_SPEC_FILE = path.join(PROJECT_DIR, 'apps', 'api', '.openapi.json');
const STACK_FILE = path.join(PROJECT_DIR, '.stack.json');

function loadStackInfo() {
  try {
    const raw = JSON.parse(fs.readFileSync(STACK_FILE, 'utf8'));
    return {
      apiPort: typeof raw.api_port === 'number' ? raw.api_port : null,
    };
  } catch {
    return { apiPort: null };
  }
}

function loadOpenApiPathPatterns() {
  try {
    const spec = JSON.parse(fs.readFileSync(OPENAPI_SPEC_FILE, 'utf8'));
    const paths = spec && typeof spec === 'object' ? spec.paths || {} : {};
    const keys = Object.keys(paths);
    if (keys.length === 0) return null; // empty spec → strict
    return keys.map((p) => {
      const regex = '^' + String(p)
        .replace(/[.+^$()|[\]\\]/g, (match) => '\\' + match)
        .replace(/\{[^/}]+\}/g, '[^/]+')
        .replace(/:[^/]+/g, '[^/]+') + '/?$';
      return new RegExp(regex);
    });
  } catch {
    return null; // strict fallback
  }
}

function urlIsApiTarget(rawUrl, stack) {
  if (!rawUrl) return false;
  try {
    const u = new URL(rawUrl);
    if (u.pathname.startsWith('/api/')) return true;
    if (stack.apiPort && u.port === String(stack.apiPort)) return true;
    return false;
  } catch {
    return String(rawUrl).startsWith('/api/');
  }
}

function urlMatchesSpecPath(rawUrl, patterns) {
  if (!patterns || patterns.length === 0) return false;
  let pathname;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    pathname = String(rawUrl).split('?')[0];
  }
  // NestJS adds a global /api/v1 prefix at boot; spec keys may omit it
  // ("/auth/login" vs the runtime URL "/api/v1/auth/login"). Try both.
  const candidates = [pathname];
  if (pathname.startsWith('/api/v1/')) candidates.push(pathname.slice('/api/v1'.length));
  if (pathname.startsWith('/api/')) candidates.push(pathname.slice('/api'.length));
  return candidates.some((candidate) => patterns.some((re) => re.test(candidate)));
}

function classifyNetworkFailure(failure, openApiPatterns, stack) {
  const code = String(failure?.error || '');
  const url = String(failure?.url || '');
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/.test(code) && urlIsApiTarget(url, stack)) {
    return 'stack-down';
  }
  if (!urlIsApiTarget(url, stack)) return 'real-bug';
  if (openApiPatterns === null) return 'real-bug';
  return urlMatchesSpecPath(url, openApiPatterns) ? 'real-bug' : 'unimplemented-endpoint';
}

const STACK_INFO = loadStackInfo();
const OPENAPI_PATH_PATTERNS = loadOpenApiPathPatterns();

// ── Main correlation loop ───────────────────────────────────────────
const blocks = [];
const warnings = [];
const changedPages = matrixPages.filter((page) => page.changed && page.route);

for (const page of changedPages) {
  const editCutoff = latestMtimeMs(page.files);
  const freshRecords = records.filter((record) => (record.ts || 0) >= editCutoff);

  // 6a. Filter records by route.
  const byRoute = freshRecords.filter(
    (record) =>
      record.tool === 'mcp__playwright__browser_snapshot' &&
      routeMatches(record.navigatedPath, page.route)
  );

  // 6b. No snapshot for this route.
  if (byRoute.length === 0) {
    const visited = Array.from(
      new Set(
        freshRecords
          .filter((record) => record.tool === 'mcp__playwright__browser_snapshot')
          .map((record) => record.navigatedPath)
          .filter(Boolean)
      )
    );
    blocks.push({
      code: 'EVIDENCE_MISMATCH',
      route: page.route,
      reason: `no MCP navigate to a URL matching ${page.route}`,
      visited,
    });
    continue;
  }

  // 6c. Token overlap check.
  const fileTokens = new Set([
    ...extractTokensFromSourceFiles(page.files),
    ...(page.tokens || []).map(normalizeToken),
    ...((overlay.routes?.[page.route]?.tokens) || []).map(normalizeToken),
  ].filter(Boolean));

  if (fileTokens.size > 0) {
    const sawOverlap = byRoute.some((record) => {
      const recordTokens = normalizeTokenSet(record.pageTokens);
      return tokensIntersect(recordTokens, fileTokens);
    });
    if (!sawOverlap) {
      const sawSample = Array.from(
        new Set(byRoute.flatMap((record) => record.pageTokens || []))
      ).slice(0, 15);
      blocks.push({
        code: 'EVIDENCE_MISMATCH',
        route: page.route,
        reason: `snapshots for ${page.route} contain none of the expected tokens`,
        expected: Array.from(fileTokens).slice(0, 10),
        saw: sawSample,
      });
    }
  }

  // 6d / 6e. Console + network failures on any record that belongs to this route.
  for (const record of byRoute) {
    const failures = Array.isArray(record.networkFailures) ? record.networkFailures : [];
    const candidateFails = failures.filter((failure) => {
      const code = String(failure?.error || '');
      return (
        /ERR_CONNECTION_REFUSED/.test(code) ||
        /^net::/.test(code) ||
        /^5\d\d$/.test(code) ||
        /^ECONNREFUSED$/.test(code) ||
        /Failed to fetch/i.test(code)
      );
    });
    // Split candidates: real bugs (block) vs unimplemented endpoints (warn) vs
    // stack-down (block, distinct code so the agent knows to start the stack
    // rather than chase code).
    const realBugs = [];
    const unimplemented = [];
    let stackDown = false;
    for (const failure of candidateFails) {
      const verdict = classifyNetworkFailure(
        failure,
        OPENAPI_PATH_PATTERNS,
        STACK_INFO
      );
      if (verdict === 'stack-down') {
        stackDown = true;
        realBugs.push(failure);
      } else if (verdict === 'unimplemented-endpoint') {
        unimplemented.push(failure);
      } else {
        realBugs.push(failure);
      }
    }
    if (realBugs.length > 0) {
      blocks.push({
        code: stackDown ? 'STACK_API_DOWN' : 'RUNTIME_UNVERIFIED',
        route: page.route,
        failures: realBugs,
      });
    }
    if (unimplemented.length > 0) {
      warnings.push({
        code: 'BACKEND_ENDPOINT_NOT_IMPLEMENTED',
        route: page.route,
        failures: unimplemented.map((failure) => ({
          url: failure.url,
          error: failure.error,
        })),
      });
    }
  }

  // Console records (same session window) — surface disallowed errors.
  const consoleRecords = freshRecords.filter(
    (record) => record.tool === 'mcp__playwright__browser_console_messages'
  );
  const disallowedLines = [];
  for (const record of consoleRecords) {
    for (const line of record.consoleErrors || []) {
      if (!isAllowedConsoleLine(line)) disallowedLines.push(line);
    }
  }
  if (disallowedLines.length > 0) {
    blocks.push({
      code: 'RUNTIME_UNVERIFIED',
      route: page.route,
      errors: disallowedLines.slice(0, 10),
    });
  }

  // STEP 7 — Auth-gated routes: need evidence of BOTH unauth and auth behaviour.
  const overlayRoute = overlay.routes?.[page.route];
  const needsAuthContract =
    overlayRoute?.unauthBehavior === 'redirect' ||
    page.guard === 'authenticated' ||
    middlewareProtects(page.route);

  if (needsAuthContract) {
    const unauthRecords = byRoute.filter((record) => {
      const after = currentUrlAfter(record, freshRecords);
      return normalizeRoute(after) !== normalizeRoute(page.route);
    });
    const authRecords = byRoute.filter((record) => {
      const after = currentUrlAfter(record, freshRecords);
      return normalizeRoute(after) === normalizeRoute(page.route);
    });
    if (unauthRecords.length === 0 || authRecords.length === 0) {
      blocks.push({
        code: 'AUTH_CONTRACT_INCOMPLETE',
        route: page.route,
        verified: unauthRecords.length === 0 ? 'authenticated-only' : 'unauthenticated-only',
      });
    }
  }

  // Interactive-route fallback: pre-plan-02 behavior required a click/type/etc.
  // for any route whose source has <form>/<button>. Keep this as a soft net
  // so interactive routes still require interaction even without matrix tokens.
  if (page.interactive && routeIsInteractive(page.files)) {
    const interactions = freshRecords.filter(
      (record) =>
        record.tool === 'mcp__playwright__browser_click' ||
        record.tool === 'mcp__playwright__browser_type' ||
        record.tool === 'mcp__playwright__browser_fill_form' ||
        record.tool === 'mcp__playwright__browser_press_key' ||
        record.tool === 'mcp__playwright__browser_select_option'
    );
    if (interactions.length === 0) {
      blocks.push({
        code: 'EVIDENCE_MISMATCH',
        route: page.route,
        reason:
          'this route is interactive (<form>/<button>/onClick) but no click/type/fill_form/press_key was captured after navigate',
      });
    }
  }
}

// STEP 8 — Anti-gaming checks (run over the whole session).
// Guard: only run when there are actually changed pages requiring
// verification. When changedPages is empty (e.g. session only touched
// probe infrastructure, not UI files), there is nothing to game and stale
// evidence from prior sessions must not trigger false-positive blocks.
if (changedPages.length > 0) {

// 8a. Devtools-click without a subsequent real route navigation.
const devClicks = records.filter(isDevtoolsClick);
if (devClicks.length > 0) {
  const lastDevTs = Math.max(...devClicks.map((record) => record.ts || 0));
  const matrixRoutes = new Set(matrixPages.map((page) => normalizeRoute(page.route)));
  const postDevNavs = records.filter(
    (record) =>
      record.tool === 'mcp__playwright__browser_navigate' &&
      (record.ts || 0) > lastDevTs &&
      matrixRoutes.has(normalizeRoute(record.navigatedPath))
  );
  if (postDevNavs.length === 0) {
    blocks.push({
      code: 'GATE_GAMING',
      detail: 'devtools interaction without subsequent route verification',
    });
  }
}

// 8b. Snapshot-hash dedup: N>=3 identical (route, hash) blocks.
const hashCount = new Map();
for (const record of records) {
  if (record.tool !== 'mcp__playwright__browser_snapshot') continue;
  if (!record.snapshotHash || !record.navigatedPath) continue;
  const key = `${normalizeRoute(record.navigatedPath)}::${record.snapshotHash}`;
  hashCount.set(key, (hashCount.get(key) || 0) + 1);
}
for (const [key, count] of hashCount) {
  if (count >= 3) {
    const [routePart] = key.split('::');
    blocks.push({
      code: 'GATE_GAMING',
      detail: `repeated identical snapshot x${count} at ${routePart}`,
    });
  }
}

// 8c. Orphan-route detection — diff changed non-root routes but only '/' was navigated.
const navigatedPaths = new Set(
  records
    .filter((record) => record.tool === 'mcp__playwright__browser_navigate')
    .map((record) => normalizeRoute(record.navigatedPath))
    .filter(Boolean)
);
const changedNonRootRoutes = matrixPages
  .filter((page) => page.changed && page.route !== '/')
  .map((page) => page.route);
if (
  changedNonRootRoutes.length > 0 &&
  navigatedPaths.size > 0 &&
  Array.from(navigatedPaths).every((pathname) => pathname === '/' || pathname === '/index')
) {
  blocks.push({
    code: 'EVIDENCE_MISMATCH',
    detail: `diff changed ${changedNonRootRoutes.join(', ')} but only '/' was exercised`,
  });
}

} // end STEP 8 guard: changedPages.length > 0

// STEP 9 — Overlay flow coverage.
function flowIsSatisfied(flow, records) {
  if (!flow || !Array.isArray(flow.steps) || flow.steps.length === 0) return true;
  let cursor = 0;
  for (const record of records) {
    if (cursor >= flow.steps.length) break;
    const step = flow.steps[cursor];
    if (!step || !step.kind) continue;
    const navMatches =
      step.kind === 'visit' &&
      record.tool === 'mcp__playwright__browser_navigate' &&
      (!step.route || routeMatches(record.navigatedPath, step.route));
    const fillMatches =
      step.kind === 'fillForm' &&
      (record.tool === 'mcp__playwright__browser_fill_form' ||
        record.tool === 'mcp__playwright__browser_type');
    const submitMatches =
      step.kind === 'submit' &&
      (record.tool === 'mcp__playwright__browser_click' ||
        record.tool === 'mcp__playwright__browser_press_key');
    const expectUrlMatches =
      step.kind === 'expectUrl' &&
      record.tool === 'mcp__playwright__browser_snapshot' &&
      (!step.route || routeMatches(record.navigatedPath, step.route));
    const expectTokenMatches =
      step.kind === 'expectToken' &&
      record.tool === 'mcp__playwright__browser_snapshot' &&
      Array.isArray(record.pageTokens) &&
      step.token &&
      record.pageTokens.map(normalizeToken).includes(normalizeToken(step.token));
    if (
      navMatches ||
      fillMatches ||
      submitMatches ||
      expectUrlMatches ||
      expectTokenMatches
    ) {
      cursor++;
    }
  }
  return cursor >= flow.steps.length;
}

for (const flow of overlay.flows || []) {
  if (!flowIsSatisfied(flow, records)) {
    blocks.push({
      code: 'FLOW_INCOMPLETE',
      flow: flow.name || '(unnamed flow)',
    });
  }
}

// Always surface non-blocking warnings (e.g. BACKEND_ENDPOINT_NOT_IMPLEMENTED)
// so the agent and the worker_done evidence reader can see "you have unmet
// backend dependencies" without the gate denying the close. Blocking findings
// take precedence in the JSON decision payload below; warnings are advisory.
if (warnings.length > 0) {
  try {
    const warningsFile = path.join(
      PROJECT_DIR,
      '.claude',
      'hooks',
      '.e2e-warnings.json'
    );
    fs.writeFileSync(
      warningsFile,
      JSON.stringify({ ts: Date.now(), warnings }, null, 2)
    );
  } catch {}
  for (const warning of warnings) {
    const detail = (warning.failures || [])
      .map((failure) => `${failure.error || 'failure'} ${failure.url || ''}`.trim())
      .join('; ');
    process.stderr.write(
      `[e2e-test-on-stop] ${warning.code} on ${warning.route}: ${detail}\n`
    );
  }
}

if (blocks.length === 0) {
  process.exit(0);
}

// Ensure Playwright is wired before emitting the block so the agent's
// retry has the MCP server available. Skippable in fixture harness where
// spawning `npx playwright install` would balloon the runtime.
if (!process.env.HOOK_SKIP_PLAYWRIGHT_SETUP) {
  ensurePlaywrightReady();
}

// ── Render block reason ─────────────────────────────────────────────
function renderBlock(block) {
  switch (block.code) {
    case 'EVIDENCE_MISMATCH': {
      const lines = ['EVIDENCE_MISMATCH'];
      if (block.route) lines.push(`  route: ${block.route}`);
      if (block.reason) lines.push(`  ${block.reason}`);
      if (block.expected) lines.push(`  expected tokens: ${block.expected.join(', ') || '(none)'}`);
      if (block.saw) lines.push(`  saw tokens: ${block.saw.join(', ') || '(none)'}`);
      if (block.visited) lines.push(`  visited: ${block.visited.join(', ') || '(none)'}`);
      if (block.detail) lines.push(`  ${block.detail}`);
      return lines.join('\n');
    }
    case 'RUNTIME_UNVERIFIED': {
      const lines = ['RUNTIME_UNVERIFIED'];
      if (block.route) lines.push(`  route: ${block.route}`);
      if (block.failures) {
        for (const failure of block.failures) {
          lines.push(
            `  network failure: ${failure.error}${failure.url ? ` ${failure.url}` : ''}`
          );
        }
      }
      if (block.errors) {
        for (const line of block.errors) lines.push(`  ${line}`);
      }
      return lines.join('\n');
    }
    case 'STACK_API_DOWN': {
      const lines = ['STACK_API_DOWN — backend appears not to be running'];
      if (block.route) lines.push(`  route: ${block.route}`);
      if (block.failures) {
        for (const failure of block.failures) {
          lines.push(
            `  network failure: ${failure.error}${failure.url ? ` ${failure.url}` : ''}`
          );
        }
      }
      lines.push('  Run: bash scripts/worktree-stack.sh start');
      return lines.join('\n');
    }
    case 'AUTH_CONTRACT_INCOMPLETE':
      return `AUTH_CONTRACT_INCOMPLETE\n  route: ${block.route}\n  only verified: ${block.verified}`;
    case 'GATE_GAMING':
      return `GATE_GAMING\n  ${block.detail}`;
    case 'FLOW_INCOMPLETE':
      return `FLOW_INCOMPLETE\n  flow: ${block.flow}`;
    default:
      return JSON.stringify(block);
  }
}

const body = blocks.map(renderBlock).join('\n\n');
const matrixRouteList = changedPages.map((page) => `  ${page.route}`).join('\n') || '  (none)';

const reason = `E2E VERIFICATION REQUIRED — PRODUCT QUALITY GATE

You changed UI files this session. Before ending the turn, YOU (this same
agent — do NOT spawn a sub-agent) must verify each affected route in the
browser using Playwright MCP tools. This is NOT a mechanical checkbox —
you are doing ACCEPTANCE TESTING. The question is: "Would a real user be
happy using this? Is this shippable?"

REQUIRED ROUTES (from test matrix):
${matrixRouteList}

FINDINGS:
${body}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT TO DO — Full User Flow Verification (not page-by-page snapshots)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Think like a QA engineer doing final acceptance testing before release.
Walk through the ENTIRE user journey your changes affect:

STEP 1 — NAVIGATE & SCREENSHOT (for each route):
  a. mcp__playwright__browser_navigate → the route
  b. mcp__playwright__browser_take_screenshot → LOOK AT THE PAGE
     - Does it look like a professional, finished product?
     - Is the layout correct? No broken grids, no overlapping elements?
     - Is text readable? Proper font sizes, contrast, spacing?
     - Are colors and spacing consistent with the rest of the app?
     - Is there any missing CSS, unstyled content, or layout shift?
     If ANY visual issue exists → FIX IT before continuing.
  c. mcp__playwright__browser_snapshot → confirm Page URL matches route

STEP 2 — CONSOLE & NETWORK HEALTH:
  mcp__playwright__browser_console_messages → MUST show "Errors: 0".
  If errors exist, fix the underlying bug. Do NOT end with console errors.

STEP 3 — FULL USER FLOW (not just "page loads"):
  Do NOT stop at "I can see the page." Walk the COMPLETE flow:
  - If you built a login page → actually fill the form, submit it,
    verify it redirects to the correct destination (e.g. /dashboard)
  - If you built a dashboard → verify it shows meaningful content,
    not a blank shell. Are there cards, stats, lists? Do they render?
  - If you built a form → fill every field, submit, confirm success
    feedback or navigation occurs. Try invalid input too.
  - If you built navigation → click every nav link, confirm each
    destination loads correctly
  - If you built a list/table → confirm data renders, pagination works
    if present, empty states display correctly

STEP 4 — AUTH REDIRECT MATRIX (mandatory for any auth-gated route):
  Test ALL of these scenarios — not just one:

  a. UNAUTHENTICATED → PROTECTED PAGE:
     - browser_navigate → protected route (e.g. /dashboard)
     - browser_snapshot → Page URL MUST be /login (redirect happened)
     - If it stays on the protected route with a blank page, that is a BUG

  b. AUTHENTICATE → ACCESS PROTECTED PAGE:
     - browser_navigate → /login
     - browser_fill_form with valid credentials
     - browser_click submit button
     - browser_snapshot → Page URL MUST now be the post-login destination
     - browser_take_screenshot → does the authenticated page look correct?

  c. AUTHENTICATED → /login or /register:
     - While still logged in, browser_navigate → /login
     - browser_snapshot → Page URL MUST redirect AWAY from /login
       (typically to /dashboard). If it shows the login form to an
       already-authenticated user, that is a BUG.

  d. LOGOUT → PROTECTED PAGE:
     - Perform logout action (click logout button, or clear session)
     - browser_navigate → protected route
     - browser_snapshot → Page URL MUST be /login again

STEP 5 — USABILITY & INTERACTIONS:
  For every interactive element (forms, buttons, links, modals):
  - mcp__playwright__browser_click / type / fill_form / select_option /
    press_key — actually USE the interface
  - Do buttons respond? Does clicking them produce the expected outcome?
  - Do forms validate? What happens with empty submission?
  - Does navigation make sense? Can the user find their way around?
  - Are error states handled gracefully? (Try triggering one)
  - Are loading states shown during async operations?
  The gate requires at least one interaction call for any interactive
  route. Rendering a form is not the same as proving the form works.

STEP 6 — VISUAL QUALITY CHECKPOINT (final screenshot):
  After completing the flow, take one final screenshot of the key page:
  - mcp__playwright__browser_take_screenshot
  - Is this something you would ship to production?
  - Would a user opening this for the first time understand how to use it?
  - Does it look polished, or does it look like a prototype?
  If the answer is "prototype" → improve the UI before completing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STACK STARTUP (only if the dev server is not already running):
  bash scripts/worktree-stack.sh start
  cat .stack.json  # get web_port / api_port

CRITICAL RULES:
  • Do NOT write or save any e2e test files. This is live browser verification.
  • Do NOT spawn a sub-agent. You must make the MCP tool calls yourself.
  • Zero console errors is NECESSARY but NOT SUFFICIENT. A page with zero
    errors but broken CSS, missing content, or unusable UX is NOT acceptable.
  • Test the COMPLETE journey, not isolated pages. If your login page
    works but redirects to a blank dashboard, the feature is BROKEN.
  • If you edit a file after verifying, re-walk that part of the flow.
    The gate only honors evidence captured after your latest edit.
  • If a screenshot reveals visual issues (broken layout, missing styles,
    unstyled defaults, elements overlapping, text cut off), you MUST fix
    them. Do not attempt to end the turn with known visual defects.
  • The standard is "would a real user be happy?" — not "does it technically
    render?" Ship quality, not just functionality.
  • There is no shortcut. Drive the actual feature in the actual running
    app until the whole flow works end to end, looks professional, and
    behaves correctly for all user states (logged in, logged out, error).`;

console.log(JSON.stringify({ decision: 'block', reason }));

function ensurePlaywrightReady() {
  try {
    if (!fs.existsSync(MCP_CONFIG)) {
      fs.writeFileSync(
        MCP_CONFIG,
        JSON.stringify(
          {
            mcpServers: {
              playwright: {
                command: 'npx',
                args: ['-y', '@playwright/mcp'],
                type: 'stdio',
              },
            },
          },
          null,
          2
        ) + '\n'
      );
    } else {
      const config = JSON.parse(fs.readFileSync(MCP_CONFIG, 'utf8'));
      if (!config.mcpServers?.playwright) {
        config.mcpServers = config.mcpServers || {};
        config.mcpServers.playwright = {
          command: 'npx',
          args: ['-y', '@playwright/mcp'],
          type: 'stdio',
        };
        fs.writeFileSync(MCP_CONFIG, JSON.stringify(config, null, 2) + '\n');
      }
    }
  } catch {}

  try {
    execSync('npx playwright install chromium 2>&1', {
      timeout: 120000,
      stdio: 'pipe',
    });
  } catch {}

  try {
    execSync('npx -y @playwright/mcp --version 2>&1', {
      timeout: 30000,
      stdio: 'pipe',
    });
  } catch {}
}
