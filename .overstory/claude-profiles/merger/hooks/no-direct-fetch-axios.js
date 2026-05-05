const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

const isFeatureFile = /features\//.test(filePath) && /\.(tsx?|jsx?)$/.test(filePath);
const isNetworkingFile = /networking\//.test(filePath);
const isTestFile = /__tests__|\.test\.|\.spec\./i.test(filePath);
const isExecuteRequest = /executeRequest/.test(filePath);

if (!isFeatureFile || isNetworkingFile || isTestFile || isExecuteRequest) process.exit(0);

const violations = [];

if (/from\s+['"]axios['"]/.test(content) || /require\s*\(\s*['"]axios['"]\s*\)/.test(content)) {
  violations.push('Direct axios import');
}

if (/\bfetch\s*\(/.test(content) && !/executeRequest/.test(content)) {
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
    if (/\bfetch\s*\(/.test(line) && !/executeRequest/.test(line) && !/mockFetch|fetchMock/.test(line)) {
      violations.push('Direct fetch() call at line ' + (index + 1));
    }
  });
}

if (violations.length > 0) {
  console.error(
    'BLOCKED: Direct fetch/axios calls in feature files. Use executeRequest() abstraction instead.\n' +
    'Found: ' + violations.join(', ') + '\n' +
    'All API calls must go through the executeRequest abstraction in the networking layer.\n' +
    'File: ' + filePath
  );
  process.exit(2);
}
