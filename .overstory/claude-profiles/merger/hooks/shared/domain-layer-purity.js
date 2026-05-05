const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

const isDomainFile = /\/domain\//.test(filePath) && /\.(tsx?|jsx?)$/.test(filePath);
const isTestFile = /__tests__|\.test\.|\.spec\./i.test(filePath);

if (!isDomainFile || isTestFile) process.exit(0);

const violations = [];

const importLines = content.match(/^.*(?:import|from)\s+['"].*['"]/gm) || [];

importLines.forEach((line) => {
  if (/\/data\//.test(line) || /\/remote\//.test(line) || /\/repositories\//.test(line)) {
    violations.push('Import from data layer: ' + line.trim());
  }
  if (/\/presentation\//.test(line) || /\/pages\//.test(line) || /\/components\//.test(line)) {
    violations.push('Import from presentation layer: ' + line.trim());
  }
  if (/from\s+['"]react['"]/.test(line) || /from\s+['"]react-native['"]/.test(line)) {
    violations.push('Framework import in domain: ' + line.trim());
  }
  if (/@tanstack/.test(line) || /react-query/.test(line)) {
    violations.push('React Query import in domain: ' + line.trim());
  }
  if (/zustand/.test(line)) {
    violations.push('Zustand import in domain: ' + line.trim());
  }
});

if (violations.length > 0) {
  console.error(
    'BLOCKED: Domain layer purity violation. Domain must not import from data, presentation, or frameworks.\n' +
    'Domain models are plain TypeScript interfaces with zero dependencies.\n' +
    violations.map((violation) => '  ' + violation).join('\n') + '\n' +
    'Architecture: presentation -> data -> domain (never reverse).\n' +
    'File: ' + filePath
  );
  process.exit(2);
}
