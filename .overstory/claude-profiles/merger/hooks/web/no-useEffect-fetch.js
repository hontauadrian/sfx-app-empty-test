const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

const isSourceFile = /\.(tsx?|jsx?)$/.test(filePath);
const isTestFile = /__tests__|\.test\.|\.spec\./i.test(filePath);

if (!isSourceFile || isTestFile) process.exit(0);

// Detect web context: monorepo web app OR standalone src/ without React Native imports
const isMonorepoWeb = /apps\/web\//.test(filePath);
const isStandaloneSrc = /src\//.test(filePath);
const hasRNImports =
  /from\s+['"]react-native['"]/.test(content) ||
  /from\s+['"]expo-router['"]/.test(content);
const isMobileFile = /apps\/mobile\//.test(filePath) || hasRNImports;

const isWebFile = isMonorepoWeb || (isStandaloneSrc && !isMobileFile);

if (!isWebFile) process.exit(0);

const hasUseEffect = /\buseEffect\s*\(/.test(content);
const hasUseState = /\buseState\s*[<(]/.test(content);

if (!hasUseEffect || !hasUseState) process.exit(0);

const hasFetchInEffect = /useEffect\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{[\s\S]*?(?:fetch\s*\(|axios[.(]|\.then\s*\()/.test(content);
const hasSetStateAfterFetch = /fetch\s*\([\s\S]*?set[A-Z]/.test(content) || /axios[\s\S]*?set[A-Z]/.test(content);

if (hasFetchInEffect || hasSetStateAfterFetch) {
  console.error(
    'BLOCKED: useEffect + useState data fetching pattern detected.\n' +
    'This is an anti-pattern in Next.js App Router.\n' +
    'Instead use:\n' +
    '  - Server Components: make the component async and await data directly\n' +
    '  - Client Components: use React Query via repository hooks\n' +
    'Never use useEffect + useState for data fetching.\n' +
    'File: ' + filePath
  );
  process.exit(2);
}
