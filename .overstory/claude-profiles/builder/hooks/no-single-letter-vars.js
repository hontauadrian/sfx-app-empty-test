const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync(0, 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

const isSourceFile = /\.(tsx?|jsx?)$/.test(filePath);
const isTestFile = /__tests__|\.test\.|\.spec\./i.test(filePath);
const isTypeDeclaration = /\.d\.ts$/.test(filePath);

if (!isSourceFile || isTestFile || isTypeDeclaration) process.exit(0);

const lines = content.split('\n');
const violations = [];

const singleLetterPatterns = [
  { regex: /\b(?:const|let|var)\s+([a-z])\s*[=:,;)]/g, type: 'variable' },
  { regex: /\(([a-z])\s*[,:)]/g, type: 'parameter' },
  { regex: /\(([a-z])\s*=>/g, type: 'arrow parameter' },
  { regex: /,\s*([a-z])\s*[,:)=]/g, type: 'parameter' },
];

const ALLOWED_SINGLE_LETTERS = new Set(['_']);
const ALLOWED_CONTEXTS = [
  /\.map\s*\(/,
  /\.filter\s*\(/,
  /\.reduce\s*\(/,
  /\.forEach\s*\(/,
  /\.find\s*\(/,
  /\.some\s*\(/,
  /\.every\s*\(/,
  /for\s*\(/,
  /catch\s*\(/,
];

lines.forEach((line, lineIndex) => {
  if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
  if (/import\s/.test(line)) return;

  const isAllowedContext = ALLOWED_CONTEXTS.some((pattern) => pattern.test(line));
  if (isAllowedContext) return;

  singleLetterPatterns.forEach(({ regex, type }) => {
    let match;
    const localRegex = new RegExp(regex.source, regex.flags);
    while ((match = localRegex.exec(line)) !== null) {
      const letter = match[1];
      if (!ALLOWED_SINGLE_LETTERS.has(letter)) {
        violations.push({ line: lineIndex + 1, letter, type, context: line.trim().substring(0, 80) });
      }
    }
  });
});

if (violations.length > 0) {
  const details = violations
    .slice(0, 5)
    .map((violation) => `  Line ${violation.line}: '${violation.letter}' (${violation.type}) — ${violation.context}`)
    .join('\n');
  const suggestion =
    'Use descriptive names: event (not e), value (not v), index (not i), error (not err), response (not res)';
  console.error(
    'BLOCKED: Single-letter variable/parameter names found. Use full descriptive names.\n' +
    details + '\n' +
    (violations.length > 5 ? '  ... and ' + (violations.length - 5) + ' more\n' : '') +
    suggestion + '\n' +
    'File: ' + filePath
  );
  process.exit(2);
}
