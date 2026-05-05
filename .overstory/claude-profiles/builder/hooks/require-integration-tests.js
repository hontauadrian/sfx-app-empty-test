/**
 * Stop hook — blocks completion if modified API modules or frontend features
 * lack corresponding integration test files.
 *
 * Checks:
 *   - apps/api/src/modules/<module>/  → needs __integration__/*.integration-test.ts
 *   - apps/web/src/features/<feature>/ → needs __integration__/*.integration-test.ts
 *     (only features with data/ layer — pure presentation features are exempt)
 *
 * This ensures builders write integration tests that verify code works
 * end-to-end, not just unit tests with mocked dependencies.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read stdin tolerantly. Containerised panel runtimes (Docker tmux,
// detached child processes) deliver fd 0 with no data — JSON.parse('')
// throws and the hook crashes; claude treats the non-zero exit as
// advisory and the gate silently fails open. The hook only needs the
// stdin payload as a no-op carrier; it shells out to git for the diff,
// so an empty fallback keeps the gate enforcing.
let input = {};
try {
  const raw = fs.readFileSync(0, 'utf8');
  input = raw ? JSON.parse(raw) : {};
} catch {
  input = {};
}

const PROJECT_DIR = process.env.HOOK_TEST_PROJECT_ROOT || process.cwd();

// ── Get modified files from git ─────────────────────────────────────
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
    if (staged) {
      modifiedFiles = staged.split('\n').filter(Boolean);
    }
  } catch {
    process.exit(0);
  }
}

if (modifiedFiles.length === 0) {
  process.exit(0);
}

// ── Patterns ────────────────────────────────────────────────────────
const SKIP_FILES = /\.(test|spec|integration-test)\.(ts|tsx)$|__tests__|__integration__|\.d\.ts$/;
const API_MODULE_PATTERN = /^apps\/api\/src\/modules\/([^/]+)\//;
const WEB_FEATURE_PATTERN = /^apps\/web\/src\/features\/([^/]+)\//;

// Features that are cross-cutting concerns, not data-fetching features
const WEB_SKIP_FEATURES = new Set(['presentation']);

const missingApiModules = new Set();
const missingWebFeatures = new Set();

for (const file of modifiedFiles) {
  if (SKIP_FILES.test(file)) continue;

  // Check API modules
  const apiMatch = file.match(API_MODULE_PATTERN);
  if (apiMatch) {
    missingApiModules.add(apiMatch[1]);
  }

  // Check web features
  const webMatch = file.match(WEB_FEATURE_PATTERN);
  if (webMatch && !WEB_SKIP_FEATURES.has(webMatch[1])) {
    missingWebFeatures.add(webMatch[1]);
  }
}

// ── Helper: check for integration test files ────────────────────────
function hasIntegrationTests(basePath) {
  const integrationDir = path.join(basePath, '__integration__');
  if (!fs.existsSync(integrationDir)) return false;
  try {
    const files = fs.readdirSync(integrationDir);
    return files.some((f) => f.endsWith('.integration-test.ts') || f.endsWith('.integration-test.tsx'));
  } catch {
    return false;
  }
}

// ── Check API modules ───────────────────────────────────────────────
const apiMissing = [];
for (const moduleName of missingApiModules) {
  const modulePath = path.join(PROJECT_DIR, 'apps', 'api', 'src', 'modules', moduleName);
  if (!hasIntegrationTests(modulePath)) {
    apiMissing.push(`  - apps/api/src/modules/${moduleName}/`);
  }
}

// ── Check web features (only if they have a data/ layer) ────────────
const webMissing = [];
for (const featureName of missingWebFeatures) {
  const featurePath = path.join(PROJECT_DIR, 'apps', 'web', 'src', 'features', featureName);
  const hasDataLayer = fs.existsSync(path.join(featurePath, 'data'));
  if (hasDataLayer && !hasIntegrationTests(featurePath)) {
    webMissing.push(`  - apps/web/src/features/${featureName}/`);
  }
}

// ── Report ──────────────────────────────────────────────────────────
const totalMissing = apiMissing.length + webMissing.length;

if (totalMissing > 0) {
  const lines = [
    `BLOCKED: ${totalMissing} module(s)/feature(s) modified without integration tests.`,
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
      '  - Test roundtrips (create then read back)',
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
      '  - Use MSW (Mock Service Worker) to intercept real HTTP calls, NOT mocked repos',
      '  - Verify data flows correctly from API response through mapper to UI state',
      '  - Test error states (network failure, 400, 500)',
      ''
    );
  }

  lines.push('Add integration test files then try completing again.');

  console.log(JSON.stringify({ decision: 'block', reason: lines.join('\n') }));
}

process.exit(0);
