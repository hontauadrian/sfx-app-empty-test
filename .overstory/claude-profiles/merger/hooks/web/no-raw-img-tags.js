const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync(0, 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

const isTsxFile = /\.tsx$/.test(filePath);
const isTestFile = /__tests__|\.test\.|\.spec\./i.test(filePath);

if (!isTsxFile || isTestFile) process.exit(0);

// Detect web context: monorepo web OR standalone src/ without React Native
const isMonorepoWeb = /apps\/web\//.test(filePath);
const isStandaloneSrc = /src\//.test(filePath) || /features\//.test(filePath);
const isMobileFile =
  /apps\/mobile\//.test(filePath) ||
  /from\s+['"]react-native['"]/.test(content);

const isWebFile = isMonorepoWeb || (isStandaloneSrc && !isMobileFile);

if (!isWebFile) process.exit(0);

const lines = content.split('\n');
const violations = [];

lines.forEach((line, index) => {
  if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;

  if (/<img\s/i.test(line) && !/next\/image/.test(content)) {
    violations.push({ line: index + 1, context: line.trim().substring(0, 80) });
  }
});

if (violations.length > 0) {
  const details = violations
    .slice(0, 3)
    .map((violation) => `  Line ${violation.line}: ${violation.context}`)
    .join('\n');
  console.error(
    'BLOCKED: Raw <img> tags found. Use next/image (Image component) instead.\n' +
    'Import: import Image from "next/image"\n' +
    details + '\n' +
    'File: ' + filePath
  );
  process.exit(2);
}
