const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync(0, 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

const isTestFile = /__tests__|\.test\.|\.spec\./i.test(filePath);
if (isTestFile) process.exit(0);

// Detect platform context from path
const isMonorepoWeb = /apps\/web\//.test(filePath);
const isMonorepoMobile = /apps\/mobile\//.test(filePath);

// Detect platform context from content when not in a monorepo app dir
const hasNextImports = /from\s+['"]next\//.test(content);
const hasRNImports =
  /from\s+['"]react-native['"]/.test(content) ||
  /from\s+['"]react-native\//.test(content) ||
  /from\s+['"]expo-router['"]/.test(content) ||
  /from\s+['"]expo['"]/.test(content) ||
  /from\s+['"]expo-/.test(content);

const isWebFile = isMonorepoWeb || (!isMonorepoMobile && hasNextImports);
const isMobileFile = isMonorepoMobile || (!isMonorepoWeb && hasRNImports);

if (!isWebFile && !isMobileFile) process.exit(0);

const violations = [];

if (isWebFile) {
  // Monorepo: no imports from mobile package
  if (/@project\/mobile/.test(content)) {
    violations.push('Web file importing from mobile package');
  }
  // Any web file: no React Native / Expo module imports
  if (hasRNImports) {
    violations.push('Web file importing React Native / Expo modules');
  }
}

if (isMobileFile) {
  // Monorepo: no imports from web package
  if (/@project\/web/.test(content)) {
    violations.push('Mobile file importing from web package');
  }
  // Any mobile file: no Next.js module imports
  if (hasNextImports) {
    violations.push('Mobile file importing Next.js modules');
  }
}

if (violations.length > 0) {
  console.error(
    'BLOCKED: Cross-platform imports detected. Web and mobile code must not mix.\n' +
    'Found: ' + violations.join(', ') + '\n' +
    'In a monorepo, shared logic belongs in the shared package.\n' +
    'In standalone projects, do not mix platform-specific imports.\n' +
    'File: ' + filePath
  );
  process.exit(2);
}
