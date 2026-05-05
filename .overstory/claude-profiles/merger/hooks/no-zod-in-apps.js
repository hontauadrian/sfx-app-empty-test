const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

// App entry points: monorepo apps or standalone src/app (thin wrappers)
const isAppEntryFile =
  (/apps\/(web|mobile)\//.test(filePath) || /src\/app\//.test(filePath)) &&
  /\.(tsx?|jsx?)$/.test(filePath);
const isTestFile = /__tests__|\.test\.|\.spec\./i.test(filePath);
const isConfigFile = /\.config\.|next\.config|app\.config/i.test(filePath);

if (!isAppEntryFile || isTestFile || isConfigFile) process.exit(0);

const lines = content.split('\n');
const violations = [];

const zodSchemaPattern = /\bz\.(object|string|number|boolean|array|enum|union|tuple|intersection|literal|nativeEnum|discriminatedUnion|record|map|set|promise|lazy|preprocess|pipeline)\s*\(/;

lines.forEach((line, index) => {
  if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
  if (/import\s/.test(line)) return;
  if (/from\s+['"]/.test(line)) return;

  if (zodSchemaPattern.test(line)) {
    violations.push({ line: index + 1, context: line.trim().substring(0, 80) });
  }
});

if (violations.length > 0) {
  const details = violations
    .slice(0, 5)
    .map((violation) => `  Line ${violation.line}: ${violation.context}`)
    .join('\n');
  console.error(
    'BLOCKED: Zod schema definition detected in app entry directory.\n' +
    'App route files (src/app/, apps/web/, apps/mobile/) are thin wrappers only.\n' +
    'Define Zod schemas in features/[feature]/presentation/validators/ instead.\n' +
    details + '\n' +
    (violations.length > 5 ? '  ... and ' + (violations.length - 5) + ' more\n' : '') +
    'File: ' + filePath
  );
  process.exit(2);
}
