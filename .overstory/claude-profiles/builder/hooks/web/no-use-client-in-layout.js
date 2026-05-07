const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync(0, 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

const isLayoutFile = /layout\.tsx?$/.test(filePath);
const isTestFile = /__tests__|\.test\.|\.spec\./i.test(filePath);

if (!isLayoutFile || isTestFile) process.exit(0);

// Detect web context: monorepo web app OR standalone src/app/ layout
const isWebLayout =
  /apps\/web\//.test(filePath) ||
  /src\/app\//.test(filePath) ||
  /^app\//.test(filePath);

if (!isWebLayout) process.exit(0);

if (/['"]use client['"]/.test(content)) {
  console.error(
    'BLOCKED: "use client" directive found in layout.tsx.\n' +
    'Layouts persist across navigations and must remain Server Components.\n' +
    'Adding "use client" to a layout disables SSR for the entire subtree.\n' +
    'Extract interactive logic into a separate Client Component child.\n' +
    'File: ' + filePath
  );
  process.exit(2);
}
