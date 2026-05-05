const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

// Detect shared/platform-agnostic code:
// - Monorepo: packages/shared/
// - Standalone: src/lib/, src/shared/, src/common/
const isSharedFile =
  (/packages?\/shared\//.test(filePath) ||
   /src\/lib\//.test(filePath) ||
   /src\/shared\//.test(filePath) ||
   /src\/common\//.test(filePath)) &&
  /\.(tsx?|jsx?)$/.test(filePath);
const isTestFile = /__tests__|\.test\.|\.spec\./i.test(filePath);

if (!isSharedFile || isTestFile) process.exit(0);

const violations = [];

if (/from\s+['"]react-native['"]/.test(content) || /from\s+['"]react-native\//.test(content)) {
  violations.push('react-native import');
}

if (/from\s+['"]expo-router['"]/.test(content)) {
  violations.push('expo-router import');
}

if (/from\s+['"]expo['"]/.test(content) || /from\s+['"]expo-/.test(content)) {
  violations.push('Expo module import');
}

if (/from\s+['"]next\//.test(content)) {
  violations.push('Next.js module import');
}

if (/from\s+['"]@react-navigation\//.test(content)) {
  violations.push('@react-navigation import');
}

if (violations.length > 0) {
  console.error(
    'BLOCKED: Platform-specific imports detected in shared/library code.\n' +
    'Found: ' + violations.join(', ') + '\n' +
    'Shared code (lib/, shared/, packages/shared/) must have zero platform-specific dependencies.\n' +
    'Platform-specific code belongs in app-level or feature-level presentation layers.\n' +
    'File: ' + filePath
  );
  process.exit(2);
}
