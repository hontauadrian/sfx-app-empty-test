const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

const isSourceFile = /\.(tsx?|jsx?)$/.test(filePath);
const isTestFile = /__tests__|\.test\.|\.spec\./i.test(filePath);

if (!isSourceFile || isTestFile) process.exit(0);

// Detect mobile context: monorepo mobile app OR any file with React Native imports
const isMonorepoMobile = /apps\/mobile\//.test(filePath);
const hasRNImports =
  /from\s+['"]react-native['"]/.test(content) ||
  /from\s+['"]react-native\//.test(content) ||
  /from\s+['"]expo-router['"]/.test(content);

const isMobileFile = isMonorepoMobile || hasRNImports;

if (!isMobileFile) process.exit(0);

const violations = [];

if (/KeyboardAvoidingView/.test(content)) {
  violations.push('KeyboardAvoidingView usage detected');
}

if (/from\s+['"]react-native-keyboard-aware-scroll-view['"]/.test(content)) {
  violations.push('react-native-keyboard-aware-scroll-view import detected');
}

if (violations.length > 0) {
  console.error(
    'BLOCKED: Forbidden keyboard handling component detected.\n' +
    'Found: ' + violations.join(', ') + '\n' +
    'Use react-native-keyboard-controller instead:\n' +
    '  - KeyboardAwareScrollView for screens with inputs\n' +
    '  - KeyboardStickyView for sticky elements\n' +
    '  - KeyboardToolbar for input navigation\n' +
    '  - renderScrollComponent pattern for lists with inputs\n' +
    'KeyboardProvider must be in root layout.\n' +
    'File: ' + filePath
  );
  process.exit(2);
}
