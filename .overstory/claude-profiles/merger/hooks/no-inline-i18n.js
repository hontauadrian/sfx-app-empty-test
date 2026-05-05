const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

const isSourceFile = /\.(tsx?|jsx?)$/.test(filePath);
const isLocalizationConfig = /localization\/config|i18n\.config|i18next/i.test(filePath);
const isTestFile = /__tests__|\.test\.|\.spec\./i.test(filePath);

if (!isSourceFile || isLocalizationConfig || isTestFile) process.exit(0);

const violations = [];

const lines = content.split('\n');
lines.forEach((line, index) => {
  if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;

  if (/i18n\.t\s*\(/.test(line)) {
    violations.push({ line: index + 1, context: line.trim().substring(0, 80), type: 'i18n.t()' });
  }

  if (/\bt\s*\(\s*['"][^'"]+['"]\s*,\s*\{\s*ns\s*:/.test(line)) {
    violations.push({ line: index + 1, context: line.trim().substring(0, 80), type: 't() with inline ns' });
  }
});

if (violations.length > 0) {
  const details = violations
    .slice(0, 5)
    .map((violation) => `  Line ${violation.line} [${violation.type}]: ${violation.context}`)
    .join('\n');
  console.error(
    'BLOCKED: Inline i18n.t() calls detected. Use scoped helpers instead.\n' +
    'In pure functions/mappers: scopedTranslate(namespace) from @project/shared/localization\n' +
    'In React hooks/components: useTranslations(namespace) from @project/shared/localization\n' +
    'On web: use typed label constants (authLabels, commonLabels) from @project/shared/localization\n' +
    details + '\n' +
    'File: ' + filePath
  );
  process.exit(2);
}
