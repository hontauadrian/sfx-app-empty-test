/**
 * Shared source↔test pairing logic.
 *
 * Used by:
 *   - require-tests-for-changes.js (Stop hook — backstop)
 *   - track-pending-tests.js       (PreToolUse — live debt tracker)
 *   - block-commit-if-missing.js   (PreToolUse — checkpoint gate)
 *
 * Rules are the single source of truth for "does this file need a test?"
 * and "which test file pairs with this source?".
 */
const fs = require('fs');
const path = require('path');

// ── Classification rules ────────────────────────────────────────────
const SOURCE_EXT = /\.(tsx?|jsx?)$/;
// Recognize both unit tests (__tests__, *.test.*, *.spec.*) AND integration
// tests (__integration__, *.integration-test.*).
const TEST_FILE = /__tests__|__integration__|\.test\.|\.spec\.|\.integration-test\./i;

const SKIP_PATTERNS = [
  /\.d\.ts$/,                          // Type declarations
  /\.config\./,                        // Config files
  /next\.config/,                      // Next.js config
  /jest\.config/,                      // Jest config
  /tailwind\.config/,                  // Tailwind config
  /eslint/i,                           // ESLint configs
  /prettier/i,                         // Prettier configs
  /\/index\.ts$/,                      // Barrel exports
  /\/index\.tsx$/,                     // Barrel exports (tsx)
  /\/types\.ts$/,                      // Type-only files
  /\/constants\.ts$/,                  // Constants files
  /\.claude\//,                        // Hook files
  /node_modules/,                      // Dependencies
  /\.overstory\//,                     // Overstory files
  /prisma\//,                          // Prisma schema/migrations
  /package\.json$/,                    // Package files
  /tsconfig/,                          // TS config
  /middleware\.ts$/,                   // Next.js middleware
];

/**
 * Whether the given relative path is a source file that requires a test pair.
 * @param {string} relativePath — path relative to project root
 * @returns {boolean}
 */
function needsTest(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath) return false;

  // Must be a JS/TS source file
  if (!SOURCE_EXT.test(relativePath)) return false;

  // Test files do not themselves need tests
  if (TEST_FILE.test(relativePath)) return false;

  // Respect skip patterns
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(relativePath)) return false;
  }

  // Must be within a code package
  if (!/^(apps|packages|src)\//.test(relativePath)) return false;

  return true;
}

/**
 * Locate a test file that pairs with the given source file.
 * Checks same-dir, sibling __tests__/, and parent __tests__/.
 * @param {string} filePath — absolute or project-relative path to source file
 * @param {string} projectDir — absolute project root
 * @returns {{found: boolean, matchedPath: string | null}}
 */
function findTestFile(filePath, projectDir) {
  const absPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(projectDir, filePath);

  const dir = path.dirname(absPath);
  const ext = path.extname(absPath);
  const baseName = path.basename(absPath, ext);

  const candidates = [
    // Same directory
    path.join(dir, `${baseName}.test.ts`),
    path.join(dir, `${baseName}.test.tsx`),
    path.join(dir, `${baseName}.spec.ts`),
    path.join(dir, `${baseName}.spec.tsx`),
    // __tests__/ subdirectory
    path.join(dir, '__tests__', `${baseName}.test.ts`),
    path.join(dir, '__tests__', `${baseName}.test.tsx`),
    path.join(dir, '__tests__', `${baseName}.spec.ts`),
    path.join(dir, '__tests__', `${baseName}.spec.tsx`),
    // Parent __tests__/ directory
    path.join(dir, '..', '__tests__', `${baseName}.test.ts`),
    path.join(dir, '..', '__tests__', `${baseName}.test.tsx`),
    path.join(dir, '..', '__tests__', `${baseName}.spec.ts`),
    path.join(dir, '..', '__tests__', `${baseName}.spec.tsx`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { found: true, matchedPath: candidate };
    }
  }

  return { found: false, matchedPath: null };
}

/**
 * Given a test file path, derive the set of candidate source file paths it
 * could pair with. Caller checks which one exists.
 *
 * Examples:
 *   foo.test.ts                           → [foo.ts, foo.tsx, foo.js, foo.jsx]
 *   dir/__tests__/foo.test.ts             → [dir/foo.ts, dir/foo.tsx, ...]
 *   dir/sub/__tests__/foo.test.ts         → [dir/sub/foo.ts, dir/foo.ts, ...]
 *
 * @param {string} testPath — absolute or project-relative path to test file
 * @returns {string[]} candidate source paths (same absolute-ness as input)
 */
function deriveSourceFromTest(testPath) {
  if (typeof testPath !== 'string' || !testPath) return [];

  const ext = path.extname(testPath);
  let base = path.basename(testPath, ext);
  // Strip .test / .spec / .integration-test suffix
  base = base.replace(/\.(test|spec|integration-test)$/i, '');

  const dir = path.dirname(testPath);
  const isInTestsDir = /(__tests__|__integration__)$/.test(dir);

  const sourceDirs = isInTestsDir
    ? [path.dirname(dir), path.dirname(path.dirname(dir))]
    : [dir];

  const extensions = ['.ts', '.tsx', '.js', '.jsx'];
  const candidates = [];
  for (const sourceDir of sourceDirs) {
    for (const sourceExt of extensions) {
      candidates.push(path.join(sourceDir, `${base}${sourceExt}`));
    }
  }
  return candidates;
}

module.exports = {
  needsTest,
  findTestFile,
  deriveSourceFromTest,
  // Exported for tests
  SOURCE_EXT,
  TEST_FILE,
  SKIP_PATTERNS,
};
