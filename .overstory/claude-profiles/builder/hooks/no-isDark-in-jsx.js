const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

const isTsxFile = /\.tsx$/.test(filePath);
const isTestFile = /__tests__|\.test\.|\.spec\./i.test(filePath);
const isThemeFile = /theme|ThemeContext/i.test(filePath);

if (!isTsxFile || isTestFile || isThemeFile) process.exit(0);

const lines = content.split('\n');
const violations = [];

lines.forEach((line, index) => {
  if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
  if (/import\s/.test(line)) return;

  if (/isDark\s*\?/.test(line) || /isDark\s*&&/.test(line) || /!\s*isDark\s*[?&]/.test(line)) {
    violations.push({ line: index + 1, context: line.trim().substring(0, 80) });
  }
});

if (violations.length > 0) {
  const details = violations
    .slice(0, 5)
    .map((violation) => `  Line ${violation.line}: ${violation.context}`)
    .join('\n');
  console.error(
    'BLOCKED: isDark branching detected in JSX. Never branch on isDark in JSX.\n' +
    'The theme serves the correct token for the active mode. Compute mode logic in the hook,\n' +
    'then use theme.colors.* tokens which already resolve to the correct light/dark value.\n' +
    details + '\n' +
    'File: ' + filePath
  );
  process.exit(2);
}
