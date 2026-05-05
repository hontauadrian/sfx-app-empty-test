const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

const isSourceFile = /\.(tsx?|jsx?)$/.test(filePath);
const isThemeFile = /theme|colors|Colors|tokens/i.test(filePath);
const isConfigFile = /tailwind|next\.config|\.css$|globals/i.test(filePath);
const isTestFile = /__tests__|\.test\.|\.spec\./i.test(filePath);

if (!isSourceFile || isThemeFile || isConfigFile || isTestFile) process.exit(0);

const lines = content.split('\n');
const violations = [];

lines.forEach((line, index) => {
  if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
  if (/import\s/.test(line)) return;

  const hexMatches = line.match(/#[0-9a-fA-F]{3,8}\b/g);
  if (hexMatches) {
    violations.push({ line: index + 1, matches: hexMatches });
  }
});

if (violations.length > 0) {
  const details = violations
    .slice(0, 5)
    .map((violation) => `  Line ${violation.line}: ${violation.matches.join(', ')}`)
    .join('\n');
  console.error(
    'BLOCKED: Hardcoded hex color values found. Use theme tokens via useTheme() instead.\n' +
    'Use theme.colors.*, theme.spacing.*, theme.fontSizes.*, theme.borderRadius.*\n' +
    details + '\n' +
    'File: ' + filePath
  );
  process.exit(2);
}
