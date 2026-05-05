const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

const isPageFile =
  /-page\.tsx$/.test(filePath) ||
  /[A-Z][a-zA-Z]*Page\.tsx$/.test(filePath) ||
  (/pages\/[^/]+\/index\.tsx$/.test(filePath) && !/use[A-Z]/.test(filePath));
const isTestFile = /__tests__|\.test\.|\.spec\./i.test(filePath);

if (!isPageFile || isTestFile) process.exit(0);

const forbiddenHooks = [
  { pattern: /\buseState\s*[<(]/, name: 'useState' },
  { pattern: /\buseReducer\s*[<(]/, name: 'useReducer' },
  { pattern: /\buseMemo\s*\(/, name: 'useMemo' },
  { pattern: /\buseQuery\s*[<(]/, name: 'useQuery' },
  { pattern: /\buseMutation\s*[<(]/, name: 'useMutation' },
];

const violations = [];

forbiddenHooks.forEach(({ pattern, name }) => {
  if (pattern.test(content)) {
    violations.push(name);
  }
});

if (violations.length > 0) {
  console.error(
    'BLOCKED: Logic detected in page/component file. Pages must be presentational only.\n' +
    'Found: ' + violations.join(', ') + '\n' +
    'Move all state and logic to the corresponding use[Feature] hook.\n' +
    'The page should only render uiModel.* properties from the hook.\n' +
    'File: ' + filePath
  );
  process.exit(2);
}
