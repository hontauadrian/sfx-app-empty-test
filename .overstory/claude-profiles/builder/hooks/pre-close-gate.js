/**
 * PreToolUse hook — blocks completion/merge commands until quality gates pass.
 *
 * Matches Bash tool calls that try to:
 *   - close the Seeds task (`sd close`)
 *   - send a `worker_done` mail (marks agent as Completed to its parent)
 *   - merge a branch into the canonical branch (`ov merge` without `--dry-run`)
 *
 * Runs the same checks as the Stop hooks, but BEFORE the command executes —
 * so the agent cannot close an issue or merge a branch that is still failing.
 *
 * Enforced gates:
 *   1. Every modified source file has a matching test file
 *      (same logic as require-tests-for-changes.js)
 *   2. Every modified API module / web feature has an __integration__ test
 *      (same logic as require-integration-tests.js)
 *   3. If any UI-relevant files were changed, every affected route has real
 *      Playwright MCP evidence recorded (navigate + snapshot + console_messages)
 *      in .claude/hooks/.mcp-evidence/<session_id>.jsonl. That log is written
 *      by mcp-evidence-recorder.js as Claude Code executes the real tool calls;
 *      the agent cannot forge entries because .claude/hooks/** is in the write
 *      deny-list enforced by the path-boundary guard.
 *   4. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:integration`
 *      all pass against the actual code — not just file existence.
 *      This closes the `expect(true).toBe(true)` stub-file bypass.
 *
 * Emits `{"hookSpecificOutput":{"permissionDecision":"deny", ...}}` on failure —
 * unlike Stop's `{"decision":"block"}`, PreToolUse deny is guaranteed to
 * prevent the tool call.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const crypto = require('crypto');

let input;
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

// Only act on Bash tool calls
if (input.tool_name !== 'Bash') process.exit(0);

const command = input.tool_input?.command || '';

// Completion-intent patterns: `sd close`, `ov mail send --type worker_done`,
// `ov merge` (but let dry-run pass through unchallenged).
const CLOSE_PATTERN = /\bsd\s+close\b/;
const WORKER_DONE_PATTERN = /--type[= ]\s*worker_done\b/;
const OV_MERGE_PATTERN = /\bov\s+merge\b(?![\s\S]*--dry-run\b)/;

const matchedIntent =
  (CLOSE_PATTERN.test(command) && 'sd close') ||
  (WORKER_DONE_PATTERN.test(command) && 'worker_done mail') ||
  (OV_MERGE_PATTERN.test(command) && 'ov merge');

if (!matchedIntent) {
  process.exit(0);
}

function resolveTargetWorktreePath(branchName) {
  try {
    const out = execSync('git worktree list --porcelain', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const blocks = out.split('\n\n');
    for (const block of blocks) {
      const lines = block.split('\n');
      const wtLine = lines.find((line) => line.startsWith('worktree '));
      const branchLine = lines.find((line) => line.startsWith('branch '));
      if (branchLine === `branch refs/heads/${branchName}` && wtLine) {
        return wtLine.slice('worktree '.length);
      }
    }
  } catch {
    return null;
  }
  return null;
}

let PROJECT_DIR;
if (matchedIntent === 'ov merge') {
  const branchMatch = command.match(/--branch[= ]\s*(\S+)/);
  if (!branchMatch) process.exit(0);
  const resolvedPath = resolveTargetWorktreePath(branchMatch[1]);
  if (!resolvedPath) process.exit(0);
  PROJECT_DIR = resolvedPath;
} else {
  PROJECT_DIR = process.env.HOOK_TEST_PROJECT_ROOT || process.cwd();
}
const SESSION_FILE = path.join(
  os.tmpdir(),
  `claude-session-files-${Buffer.from(PROJECT_DIR).toString('base64url')}.json`
);
// Evidence log written by mcp-evidence-recorder.js on every mcp__playwright__*
// tool call. Lives inside .claude/hooks/ which is in PROTECTED_WORKTREE_GLOBS
// so the agent cannot fabricate records via Bash / Write / Edit.
const MCP_EVIDENCE_DIR = path.join(PROJECT_DIR, '.claude', 'hooks', '.mcp-evidence');

// ────────────────────────────────────────────────────────────────────
// Gate 1: Unit test coverage for session-modified files
// (mirrors require-tests-for-changes.js)
// ────────────────────────────────────────────────────────────────────
function checkMissingUnitTests() {
  let sessionFiles = [];
  try {
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    sessionFiles = session.files || [];
  } catch {
    return null;
  }

  if (sessionFiles.length === 0) return null;

  const SOURCE_EXT = /\.(tsx?|jsx?)$/;
  // Mirror require-tests-for-changes.js: integration tests (__integration__,
  // *.integration-test.*) are tests, not source files that need their own test.
  const TEST_FILE = /__tests__|__integration__|\.test\.|\.spec\.|\.integration-test\./i;
  const SKIP_PATTERNS = [
    /\.d\.ts$/,
    /\.config\./,
    /next\.config/,
    /jest\.config/,
    /tailwind\.config/,
    /eslint/i,
    /prettier/i,
    /\/index\.ts$/,
    /\/types\.ts$/,
    /\/constants\.ts$/,
    /\.claude\//,
    /node_modules/,
    /\.overstory\//,
    /prisma\//,
    /package\.json$/,
    /tsconfig/,
    /middleware\.ts$/,
  ];

  function needsTest(filePath) {
    if (!SOURCE_EXT.test(filePath)) return false;
    if (TEST_FILE.test(filePath)) return false;
    for (const pattern of SKIP_PATTERNS) {
      if (pattern.test(filePath)) return false;
    }
    if (!/^(apps|packages|src)\//.test(filePath)) return false;
    return true;
  }

  function findTestFile(filePath) {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(PROJECT_DIR, filePath);
    const dir = path.dirname(absPath);
    const ext = path.extname(absPath);
    const baseName = path.basename(absPath, ext);
    const candidates = [
      path.join(dir, `${baseName}.test.ts`),
      path.join(dir, `${baseName}.test.tsx`),
      path.join(dir, `${baseName}.spec.ts`),
      path.join(dir, `${baseName}.spec.tsx`),
      path.join(dir, '__tests__', `${baseName}.test.ts`),
      path.join(dir, '__tests__', `${baseName}.test.tsx`),
      path.join(dir, '__tests__', `${baseName}.spec.ts`),
      path.join(dir, '__tests__', `${baseName}.spec.tsx`),
      path.join(dir, '..', '__tests__', `${baseName}.test.ts`),
      path.join(dir, '..', '__tests__', `${baseName}.test.tsx`),
      path.join(dir, '..', '__tests__', `${baseName}.spec.ts`),
      path.join(dir, '..', '__tests__', `${baseName}.spec.tsx`),
    ];
    return candidates.some((candidate) => fs.existsSync(candidate));
  }

  const missing = [];
  for (const file of sessionFiles) {
    const relative = file.startsWith(PROJECT_DIR)
      ? file.slice(PROJECT_DIR.length + 1)
      : file;
    if (!needsTest(relative)) continue;
    const absPath = path.isAbsolute(file) ? file : path.join(PROJECT_DIR, file);
    if (!fs.existsSync(absPath)) continue;
    if (/\/index\.tsx?$/.test(file)) continue;
    if (!findTestFile(file)) missing.push(relative);
  }

  if (missing.length === 0) return null;

  const fileList = missing.map((filePath) => `  - ${filePath}`).join('\n');
  return [
    `${missing.length} source file(s) modified without corresponding test files.`,
    '',
    'Files missing tests:',
    fileList,
    '',
    'Every source file you create or modify must have a corresponding .test.ts(x) file.',
    'Add unit test files, then retry.',
  ].join('\n');
}

// ────────────────────────────────────────────────────────────────────
// Gate 2: Integration test coverage for modified modules/features
// (mirrors require-integration-tests.js)
// ────────────────────────────────────────────────────────────────────
function checkMissingIntegrationTests() {
  let modifiedFiles = [];
  try {
    const diffOutput = execSync(
      'git diff --name-only HEAD~1 2>/dev/null || git diff --name-only --cached',
      { cwd: PROJECT_DIR, encoding: 'utf8' }
    ).trim();
    if (diffOutput) {
      modifiedFiles = diffOutput.split('\n').filter(Boolean);
    }
  } catch {
    try {
      const staged = execSync('git diff --name-only --cached', {
        cwd: PROJECT_DIR,
        encoding: 'utf8',
      }).trim();
      if (staged) modifiedFiles = staged.split('\n').filter(Boolean);
    } catch {
      return null;
    }
  }

  // Also include uncommitted session files — builder may not have committed yet
  try {
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    for (const absFile of session.files || []) {
      const relative = absFile.startsWith(PROJECT_DIR)
        ? absFile.slice(PROJECT_DIR.length + 1)
        : absFile;
      if (!modifiedFiles.includes(relative)) modifiedFiles.push(relative);
    }
  } catch {}

  if (modifiedFiles.length === 0) return null;

  const SKIP_FILES = /\.(test|spec|integration-test)\.(ts|tsx)$|__tests__|__integration__|\.d\.ts$/;
  const API_MODULE_PATTERN = /^apps\/api\/src\/modules\/([^/]+)\//;
  const WEB_FEATURE_PATTERN = /^apps\/web\/src\/features\/([^/]+)\//;
  const WEB_SKIP_FEATURES = new Set(['presentation']);

  const touchedApiModules = new Set();
  const touchedWebFeatures = new Set();

  for (const file of modifiedFiles) {
    if (SKIP_FILES.test(file)) continue;
    const apiMatch = file.match(API_MODULE_PATTERN);
    if (apiMatch) touchedApiModules.add(apiMatch[1]);
    const webMatch = file.match(WEB_FEATURE_PATTERN);
    if (webMatch && !WEB_SKIP_FEATURES.has(webMatch[1])) {
      touchedWebFeatures.add(webMatch[1]);
    }
  }

  function hasIntegrationTests(basePath) {
    const integrationDir = path.join(basePath, '__integration__');
    if (!fs.existsSync(integrationDir)) return false;
    try {
      const files = fs.readdirSync(integrationDir);
      return files.some(
        (fileName) =>
          fileName.endsWith('.integration-test.ts') ||
          fileName.endsWith('.integration-test.tsx')
      );
    } catch {
      return false;
    }
  }

  const apiMissing = [];
  for (const moduleName of touchedApiModules) {
    const modulePath = path.join(
      PROJECT_DIR,
      'apps',
      'api',
      'src',
      'modules',
      moduleName
    );
    if (!hasIntegrationTests(modulePath)) {
      apiMissing.push(`  - apps/api/src/modules/${moduleName}/`);
    }
  }

  const webMissing = [];
  for (const featureName of touchedWebFeatures) {
    const featurePath = path.join(
      PROJECT_DIR,
      'apps',
      'web',
      'src',
      'features',
      featureName
    );
    const hasDataLayer = fs.existsSync(path.join(featurePath, 'data'));
    if (hasDataLayer && !hasIntegrationTests(featurePath)) {
      webMissing.push(`  - apps/web/src/features/${featureName}/`);
    }
  }

  const totalMissing = apiMissing.length + webMissing.length;
  if (totalMissing === 0) return null;

  const lines = [
    `${totalMissing} module(s)/feature(s) modified without integration tests.`,
    '',
  ];
  if (apiMissing.length > 0) {
    lines.push(
      'API modules missing integration tests:',
      ...apiMissing,
      '',
      'Required: apps/api/src/modules/<module>/__integration__/<name>.integration-test.ts',
      '  - Use supertest + real NestJS module (AppModule), NOT mocked providers',
      '  - Test full HTTP request -> service -> repository -> DB -> response',
      '  - Cover success AND error paths (400, 401, 404, 409)',
      ''
    );
  }
  if (webMissing.length > 0) {
    lines.push(
      'Frontend features missing integration tests:',
      ...webMissing,
      '',
      'Required: apps/web/src/features/<feature>/__integration__/<name>.integration-test.ts',
      '  - Test hook -> repository -> API call -> state update pipeline',
      '  - Use MSW to intercept real HTTP calls, NOT mocked repos',
      ''
    );
  }
  lines.push('Add integration test files, then retry.');
  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────
// Gate 3: E2E verification via Playwright MCP evidence log
//
// Requires the agent to actually drive the browser using Playwright MCP
// tools (browser_navigate, browser_snapshot, browser_console_messages,
// browser_click/type/fill_form) for every route its changes touched.
//
// The gate reads the append-only evidence log written by
// mcp-evidence-recorder.js on every mcp__playwright__* tool call.
// The log path lives under .claude/hooks/.mcp-evidence/ which is inside
// PROTECTED_WORKTREE_GLOBS — the Bash and Write/Edit path boundary
// guards block the agent from forging records.
//
// There is no flag file. There is no bypass. Evidence comes only from
// Claude Code's own record of MCP tool invocations.
// ────────────────────────────────────────────────────────────────────

// Regexes used for route discovery and requirement decisions.
const TESTABLE_PATTERN = /\.(tsx?|jsx?|css|scss)$/;
const EXCLUDED_PATHS = /(\/(\.claude|__tests__|__mocks__|node_modules|e2e)\/)/;
const UI_PATH_PATTERN = /(apps\/web|presentation|app\/|pages|components|features)/;
// Toolchain/config files live alongside UI source but do not render UI. They
// must not pull a backend-only diff into the Playwright gate just because
// they happen to sit under apps/web/. The fallback "/" route was triggering
// false positives any time a backend builder bumped next.config.ts or
// tsconfig.json — wrong-layer enforcement.
const CONFIG_FILE_PATTERN = /(^|\/)(next|tailwind|postcss|vitest|playwright|jest|eslint|prettier|babel|webpack)\.config\.[mc]?(t|j)sx?$|(^|\/)tsconfig(\.[^.\/]+)?\.json$|(^|\/)package(-lock)?\.json$|(^|\/)pnpm-lock\.yaml$/;
const APP_PAGE_PATTERN = /(^|\/)app\/(.+)\/page\.(tsx|jsx|ts|js)$/;
const APP_ROOT_PAGE_PATTERN = /(^|\/)app\/page\.(tsx|jsx|ts|js)$/;
const DYNAMIC_SEGMENT_PATTERN = /\[[^\]]+\]/;
const ROUTE_GROUP_PATTERN = /\([^)]+\)\/?/g;
const INTERACTIVE_ELEMENT_PATTERN = /<\s*(form|button)\b|on(Click|Submit|Change)\s*=/i;

function collectSessionFiles() {
  try {
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    return data.files || [];
  } catch {
    return [];
  }
}

function relevantUIFiles(changedFiles) {
  return changedFiles.filter(
    (filePath) =>
      TESTABLE_PATTERN.test(filePath) &&
      !EXCLUDED_PATHS.test(filePath) &&
      !CONFIG_FILE_PATTERN.test(filePath) &&
      UI_PATH_PATTERN.test(filePath) &&
      fs.existsSync(filePath)
  );
}

function deriveRoutesFromFile(filePath) {
  // Next.js app router: extract segment path from app/<segments>/page.tsx
  // Strip route groups like (auth), skip dynamic [id] routes which require
  // concrete parameter values to test.
  if (APP_ROOT_PAGE_PATTERN.test(filePath)) return ['/'];
  const match = filePath.match(APP_PAGE_PATTERN);
  if (!match) return [];
  const segment = match[2];
  if (DYNAMIC_SEGMENT_PATTERN.test(segment)) return [];
  const cleaned = segment.replace(ROUTE_GROUP_PATTERN, '').replace(/\/+$/, '');
  return [`/${cleaned}`];
}

function readEvidenceRecords() {
  // Read evidence from ALL session files in the directory, not just the
  // current Claude Code session. After context compaction a new session id
  // is assigned; if we only read the current session's jsonl we lose every
  // Playwright nav recorded before the compaction. Evidence from any session
  // that visited the live stack is acceptable as long as it covers the
  // routes the current diff introduces.
  if (!fs.existsSync(MCP_EVIDENCE_DIR)) return [];
  let files;
  try {
    files = fs.readdirSync(MCP_EVIDENCE_DIR).filter((file) => file.endsWith('.jsonl'));
  } catch {
    return [];
  }
  const records = [];
  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(path.join(MCP_EVIDENCE_DIR, file), 'utf8');
    } catch {
      continue;
    }
    for (const line of content.split('\n').filter(Boolean)) {
      try {
        const record = JSON.parse(line);
        if (record) records.push(record);
      } catch {
        // malformed line — skip
      }
    }
  }
  return records;
}

function recordUrlPath(record) {
  const rawUrl = record?.input?.url;
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    return new URL(rawUrl).pathname;
  } catch {
    // browser_navigate called with a bare path — normalize so the match
    // below still works when the dev server base is implicit.
    return rawUrl.startsWith('/') ? rawUrl : null;
  }
}

function routeMatches(urlPath, route) {
  if (!urlPath) return false;
  if (route === '/') return urlPath === '/' || urlPath === '';
  return urlPath === route || urlPath.startsWith(`${route}/`);
}

function hasInteractiveElements(files) {
  for (const filePath of files) {
    try {
      const absPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(PROJECT_DIR, filePath);
      const content = fs.readFileSync(absPath, 'utf8');
      if (INTERACTIVE_ELEMENT_PATTERN.test(content)) return true;
    } catch {
      // Unreadable — skip
    }
  }
  return false;
}

function consoleHasErrors(record) {
  const preview = record?.output_preview || '';
  if (!preview) return false;
  // Match both "type":"error" and "type": "error" (JSON spacing variants).
  return /"type"\s*:\s*"error"/i.test(preview);
}

function verifyRoute(route, routeFiles, records) {
  const navigates = records.filter(
    (record) =>
      record.tool === 'mcp__playwright__browser_navigate' &&
      routeMatches(recordUrlPath(record), route)
  );
  if (navigates.length === 0) {
    return { ok: false, missing: ['browser_navigate (route never visited)'] };
  }
  const firstNavTs = Math.min(...navigates.map((record) => record.ts || 0));
  const laterRecords = records.filter((record) => (record.ts || 0) >= firstNavTs);

  const missing = [];

  const snapshots = laterRecords.filter(
    (record) => record.tool === 'mcp__playwright__browser_snapshot'
  );
  if (snapshots.length === 0) {
    missing.push('browser_snapshot (never called after navigate)');
  }

  const consoleCalls = laterRecords.filter(
    (record) => record.tool === 'mcp__playwright__browser_console_messages'
  );
  if (consoleCalls.length === 0) {
    missing.push('browser_console_messages (never called after navigate)');
  } else {
    const withErrors = consoleCalls.filter(consoleHasErrors);
    if (withErrors.length === consoleCalls.length) {
      missing.push(
        'browser_console_messages shows errors — fix the console errors in this route'
      );
    }
  }

  if (hasInteractiveElements(routeFiles)) {
    const interactions = laterRecords.filter((record) =>
      [
        'mcp__playwright__browser_click',
        'mcp__playwright__browser_type',
        'mcp__playwright__browser_fill_form',
        'mcp__playwright__browser_press_key',
        'mcp__playwright__browser_select_option',
      ].includes(record.tool)
    );
    if (interactions.length === 0) {
      missing.push(
        'interactive element test (route has <form>/<button>/onClick but no browser_click/type/fill_form/press_key/select_option after navigate)'
      );
    }
  }

  return { ok: missing.length === 0, missing };
}

function checkE2EVerification() {
  const sessionFiles = collectSessionFiles();
  if (sessionFiles.length === 0) return null;

  const uiFiles = relevantUIFiles(sessionFiles);
  if (uiFiles.length === 0) return null;

  // Map route → files that contributed to it. For non-page files we fall
  // back to the root '/' route so there is always at least one surface to
  // verify for any UI change.
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
  if (routeToFiles.size === 0) return null;

  const sessionId = input.session_id;
  const records = readEvidenceRecords();

  const failures = [];
  const passes = [];
  for (const [route, files] of routeToFiles.entries()) {
    const result = verifyRoute(route, files, records);
    if (result.ok) {
      passes.push(route);
    } else {
      failures.push({ route, missing: result.missing });
    }
  }

  if (failures.length === 0) return null;

  const requiredList = Array.from(routeToFiles.keys()).join(', ');
  const failureLines = failures.flatMap(({ route, missing }) => [
    `  ${route}:`,
    ...missing.map((reason) => `    ✗ ${reason}`),
  ]);

  return [
    'E2E VERIFICATION FAILED.',
    '',
    `Required routes (from your changed files): ${requiredList}`,
    passes.length > 0
      ? `Passed: ${passes.join(', ')}`
      : 'Passed: (none yet)',
    '',
    'Missing evidence:',
    ...failureLines,
    '',
    'The gate reads the Playwright MCP evidence log written by',
    '  .claude/hooks/mcp-evidence-recorder.js',
    `  → .claude/hooks/.mcp-evidence/${sessionId || '<session_id>'}.jsonl`,
    'There is no flag file. Evidence only comes from real mcp__playwright__*',
    'tool calls recorded by Claude Code itself.',
    '',
    'To clear this gate:',
    '  1. Ensure the dev server is running on a random port (see Stop hook guidance).',
    '  2. For every failing route above, call — in this order:',
    '     • mcp__playwright__browser_navigate → the route',
    '     • mcp__playwright__browser_snapshot → verify DOM renders',
    '     • mcp__playwright__browser_console_messages → verify zero errors',
    '     • mcp__playwright__browser_click/type/fill_form → if the route has forms or buttons',
    '  3. Fix any errors you see, then retry the close.',
  ].join('\n');
}

// ────────────────────────────────────────────────────────────────────
// Gate 4: Actually run the quality gates against real code.
// Closes the `expect(true).toBe(true)` stub-file bypass — file existence
// is not enough; the gates must actually pass.
//
// Skipped if node_modules isn't installed yet (bootstrap/dry-run repos).
// ────────────────────────────────────────────────────────────────────
function computeGateStateHash() {
  const sh = (cmd) => {
    try {
      return execSync(cmd, { cwd: PROJECT_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 50 * 1024 * 1024 });
    } catch { return ''; }
  };
  const baseBranch = (sh('git symbolic-ref refs/remotes/origin/HEAD').trim().replace('refs/remotes/origin/', '')) || 'master';
  const mergeBase = sh(`git merge-base HEAD origin/${baseBranch}`).trim();
  // Hash the actual diff content, NOT just file names. Pathspec excludes strip
  // orchestration scaffolding so mulch/seeds/canopy/etc commits don't flip the
  // hash — but any real source-code change does.
  const excludes = [
    "':(exclude,glob)**/*.tsbuildinfo'",
    "':(exclude,glob)*.tsbuildinfo'",
    "':(exclude,glob)**/*.png'",
    "':(exclude,glob)*.png'",
    "':(exclude,glob)**/*.jpg'",
    "':(exclude,glob)*.jpg'",
    "':(exclude,glob)**/*.jpeg'",
    "':(exclude,glob)*.jpeg'",
    "':(exclude,glob)**/*.webp'",
    "':(exclude,glob)*.webp'",
    "':(exclude,glob).claude/**'",
    "':(exclude,glob).overstory/**'",
    "':(exclude,glob).mulch/**'",
    "':(exclude,glob).seeds/**'",
    "':(exclude,glob).canopy/**'",
    "':(exclude,glob).bridge.*'",
    "':(exclude,glob)._*'",
    "':(exclude,glob).DS_Store'",
  ].join(' ');
  const range = mergeBase ? `${mergeBase} HEAD` : 'HEAD';
  const diff = sh(`git diff ${range} -- . ${excludes}`);
  return crypto.createHash('sha1').update(diff).digest('hex').slice(0, 12);
}

function checkQualityGates() {
  if (!fs.existsSync(path.join(PROJECT_DIR, 'package.json'))) return null;
  if (!fs.existsSync(path.join(PROJECT_DIR, 'node_modules'))) return null;

  const gates = [
    { name: 'Typecheck', command: 'pnpm typecheck', timeoutMs: 180000 },
    { name: 'Lint', command: 'pnpm lint', timeoutMs: 180000 },
    { name: 'Tests', command: 'pnpm test', timeoutMs: 600000 },
    { name: 'Integration tests', command: 'pnpm test:integration', timeoutMs: 600000 },
  ];

  // State-hash gate-pass marker: if every gate in this set already passed for
  // the current source-code state, skip re-running them. Marker only written
  // after a FULL pass; any single gate failure leaves no marker so the next
  // attempt re-runs everything.
  const stateHash = computeGateStateHash();
  const markerDir = path.join(PROJECT_DIR, '.claude', 'hook-reports');
  const markerPath = path.join(markerDir, `gate-pass-pre-close-${stateHash}.json`);
  if (fs.existsSync(markerPath)) {
    return null;
  }

  for (const gate of gates) {
    try {
      execSync(gate.command, {
        cwd: PROJECT_DIR,
        stdio: 'pipe',
        timeout: gate.timeoutMs,
        env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
      });
    } catch (error) {
      const stdout = error.stdout ? error.stdout.toString() : '';
      const stderr = error.stderr ? error.stderr.toString() : '';
      const combined = `${stdout}\n${stderr}`.trim() || 'Command failed with no output';
      const tail = combined.split('\n').slice(-40).join('\n');
      return [
        `${gate.name} failed when running \`${gate.command}\`.`,
        '',
        'Last output (tail):',
        '```',
        tail,
        '```',
        '',
        'This gate runs the real quality checks — you cannot bypass it with',
        'stub tests (e.g. `expect(true).toBe(true)`). Fix the failing code or',
        'tests, re-run the command locally until it passes, then retry.',
      ].join('\n');
    }
  }

  // All gates passed — write marker so subsequent close-intent commands at
  // the same state hash can short-circuit.
  try {
    fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(markerPath, JSON.stringify({
      stateHash,
      timestamp: new Date().toISOString(),
      gates: gates.map((g) => g.name),
    }, null, 2));
  } catch {
    // best-effort cache write; never fail the gate because of cache failure
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────
// Gate 5: Runtime-verification probe artifact
//
// http-smoke.ts writes `.claude/hooks/.http-smoke.json` on every
// invocation — success paths, boot failures, matrix errors, and
// unhandled exceptions alike (see catch block in http-smoke.ts).
// A missing, stale, empty, or non-passing artifact means the agent
// has not actually proven their diff works against the real stack.
//
// We refuse completion if ANY of:
//   - artifact does not exist                → probe never ran
//   - artifact is not valid JSON             → corrupted write
//   - `exitCode !== 0`                       → probe reported failure
//   - `cases.length === 0` with no block     → nothing was exercised
//   - `generatedAt` < newest touched source  → stale from prior run
// ────────────────────────────────────────────────────────────────────
function checkProbeArtifact() {
  const probePath = path.join(PROJECT_DIR, '.claude', 'hooks', '.http-smoke.json');
  if (!fs.existsSync(probePath)) {
    return [
      'Runtime-verification probe artifact missing (.claude/hooks/.http-smoke.json).',
      '',
      'Unit tests + integration tests + typecheck + lint run in-process with',
      'mocks. They do NOT prove the real stack boots and serves your routes.',
      '',
      'Run the probe yourself before closing:',
      '',
      '  pnpm probe:smoke',
      '',
      'Fix every failure the probe reports, then retry.',
    ].join('\n');
  }

  let probe;
  try {
    probe = JSON.parse(fs.readFileSync(probePath, 'utf8'));
  } catch (error) {
    return [
      `Runtime-verification artifact is not valid JSON: ${error.message}`,
      '',
      'Delete it and rerun `pnpm probe:smoke` to regenerate.',
    ].join('\n');
  }

  // Staleness: if any session-touched source is newer than the artifact,
  // the probe has not yet seen the current diff. This catches the common
  // case where an agent ran probe:smoke once early, then kept editing.
  try {
    const sessionPath = SESSION_FILE;
    if (fs.existsSync(sessionPath)) {
      const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      const sessionFiles = Array.isArray(session?.files) ? session.files : [];
      const probeMtime = fs.statSync(probePath).mtimeMs;
      let newest = 0;
      let newestFile = '';
      // Skip orchestration scaffolding + build/test artifacts. These paths
      // are also excluded from the state-hash (see computeGateStateHash);
      // mirroring the filter here keeps the probe-staleness check aligned
      // with what actually constitutes a code change for gate purposes.
      const STALE_PATH_EXCLUSIONS = [
        /^\.claude\//,
        /^\.overstory\//,
        /^\.mulch\//,
        /^\.seeds\//,
        /^\.canopy\//,
        /^\.bridge\./,
        /^\._/,
        /^\.DS_Store$/,
        /\.tsbuildinfo$/,
        /\.(png|jpg|jpeg|webp)$/i,
      ];
      for (const rel of sessionFiles) {
        if (STALE_PATH_EXCLUSIONS.some((rgx) => rgx.test(rel))) continue;
        const abs = path.isAbsolute(rel) ? rel : path.join(PROJECT_DIR, rel);
        if (!fs.existsSync(abs)) continue;
        const stat = fs.statSync(abs);
        if (stat.mtimeMs > newest) {
          newest = stat.mtimeMs;
          newestFile = rel;
        }
      }
      if (newest > probeMtime + 1000) {
        return [
          'Runtime-verification artifact is STALE.',
          '',
          `Probe ran at:       ${new Date(probeMtime).toISOString()}`,
          `Newest edit at:     ${new Date(newest).toISOString()}  (${newestFile})`,
          '',
          'You modified files after the last probe run. The artifact does not',
          'reflect your current diff. Rerun the probe before closing:',
          '',
          '  pnpm probe:smoke',
        ].join('\n');
      }
    }
  } catch {
    // Non-fatal — fall through to exitCode/cases checks.
  }

  const exitCode = Number(probe?.exitCode);
  if (!Number.isFinite(exitCode) || exitCode !== 0) {
    const blockReason =
      typeof probe?.blockReason === 'string' && probe.blockReason.length > 0
        ? probe.blockReason
        : '(no blockReason recorded)';
    const blockCodes = Array.isArray(probe?.blockCodes) ? probe.blockCodes : [];
    const failedCases = Array.isArray(probe?.cases)
      ? probe.cases.filter((c) => c && c.passed === false)
      : [];
    const caseLines = failedCases.slice(0, 15).map((c) => {
      const label = c?.label ?? '(unknown)';
      const status = typeof c?.status === 'number' ? ` [${c.status}]` : '';
      const reason = c?.blockReason ?? 'failed';
      return `  ✗ ${label}${status} — ${reason}`;
    });

    return [
      `Runtime-verification probe FAILED (exitCode=${exitCode}).`,
      '',
      `Block codes: ${blockCodes.length > 0 ? blockCodes.join(', ') : '(none)'}`,
      '',
      'Block reason:',
      '```',
      blockReason.length > 1200 ? `${blockReason.slice(0, 1200)}…` : blockReason,
      '```',
      ...(caseLines.length > 0
        ? ['', 'Failed cases:', ...caseLines]
        : []),
      '',
      'Exit-code map:',
      '  1 = app-under-test failure(s)     → fix the failing route/endpoint',
      '  2 = boot or probe-internal error  → check .smoke-logs/start-*.log',
      '  3 = matrix invalid                → regenerate with `pnpm matrix:regen`',
      '  4 = config error / missing matrix → run `pnpm probe:smoke` from scratch',
      '',
      'Rerun `pnpm probe:smoke` locally, fix every failure, THEN retry.',
    ].join('\n');
  }

  const cases = Array.isArray(probe?.cases) ? probe.cases : [];
  if (cases.length === 0) {
    return [
      'Runtime-verification artifact has exitCode=0 but ZERO cases recorded.',
      '',
      'This means the probe ran but exercised nothing — typically because',
      'the test matrix was empty or the artifact is from a stub run.',
      '',
      'Rerun `pnpm probe:smoke` against your actual diff.',
    ].join('\n');
  }

  return null;
}

// ────────────────────────────────────────────────────────────────────
// Run all gates and assemble response
// ────────────────────────────────────────────────────────────────────
const gateReasons = [
  ['Unit tests', checkMissingUnitTests()],
  ['Integration tests', checkMissingIntegrationTests()],
  ['E2E verification', checkE2EVerification()],
  ['Quality gates', checkQualityGates()],
  ['Runtime-verification probe', checkProbeArtifact()],
].filter(([, reason]) => reason !== null);

if (gateReasons.length === 0) {
  try {
    const dirty = execSync('git status --porcelain -- .overstory/runtime-contract.flows/', {
      cwd: PROJECT_DIR,
      encoding: 'utf8',
    }).trim();
    if (dirty) {
      execSync('git add .overstory/runtime-contract.flows/', { cwd: PROJECT_DIR });
      execSync(
        'git -c user.email="overstory@sfx.local" -c user.name="overstory-orchestrator" commit -m "chore(flows): auto-commit runtime-contract.flows before close" --no-verify',
        { cwd: PROJECT_DIR },
      );
    }
  } catch {}
  process.exit(0);
}

const truncatedCommand =
  command.length > 140 ? `${command.slice(0, 140)}…` : command;

const blockMessage = [
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  `BLOCKED: Cannot run \`${matchedIntent}\` — ${gateReasons.length} quality gate(s) failed.`,
  `Rejected command: ${truncatedCommand.trim()}`,
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  '',
  ...gateReasons.flatMap(([label, reason]) => [
    `### ${label}`,
    reason,
    '',
  ]),
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  `Fix every failing gate above, then retry \`${matchedIntent}\`.`,
  'Do NOT attempt to bypass with stub tests — gate 4 runs the real commands.',
  '',
  'Before you retry, send a status mail to your parent so the lead does not',
  'interpret your silence as completion and stop you mid-fix:',
  '',
  '  ov mail send --to "$OVERSTORY_PARENT_AGENT" \\',
  '    --subject "status: iterating on quality gate failures" \\',
  '    --body "Blocked by <gate name>. Fixing: <summary>. ETA: <short>." \\',
  '    --type status --agent "$OVERSTORY_AGENT_NAME"',
  '',
  'If you have retried 2-3 times without success, escalate with --type error',
  'instead of looping silently.',
].join('\n');

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: blockMessage,
    },
  })
);

process.exit(0);
