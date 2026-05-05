const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

const isHookFile = /use[A-Z][A-Za-z]*\.ts(x?)$/.test(filePath) || /use-[a-z][a-z0-9-]*\.ts(x?)$/.test(filePath);
const isTestFile = /__tests__|\.test\.|\.spec\./i.test(filePath);
const isNavigationHandler = /NavigationHandler\.ts(x?)$/.test(filePath) || /navigation-handler\.ts(x?)$/.test(filePath);

if (!isHookFile || isTestFile || isNavigationHandler) process.exit(0);

const lines = content.split('\n');
const violations = [];
let insideReturn = false;
let braceDepth = 0;

for (let index = 0; index < lines.length; index++) {
  const line = lines[index];

  if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;

  if (/\breturn\s*\{/.test(line)) {
    insideReturn = true;
    braceDepth = 0;
    for (const character of line) {
      if (character === '{') braceDepth++;
      if (character === '}') braceDepth--;
    }
    if (braceDepth <= 0) {
      insideReturn = false;
      continue;
    }
    continue;
  }

  if (insideReturn) {
    for (const character of line) {
      if (character === '{') braceDepth++;
      if (character === '}') braceDepth--;
    }

    if (/\w+\s*:\s*\(/.test(line) && !/useCallback/.test(lines.slice(Math.max(0, index - 5), index).join('\n'))) {
      const match = line.match(/(\w+)\s*:\s*\(/);
      if (match) {
        violations.push({
          line: index + 1,
          functionName: match[1],
          context: line.trim().substring(0, 80),
        });
      }
    }

    if (/\w+\s*:\s*function/.test(line)) {
      const match = line.match(/(\w+)\s*:\s*function/);
      if (match) {
        violations.push({
          line: index + 1,
          functionName: match[1],
          context: line.trim().substring(0, 80),
        });
      }
    }

    if (braceDepth <= 0) {
      insideReturn = false;
    }
  }
}

if (violations.length > 0) {
  const details = violations
    .slice(0, 5)
    .map(
      (violation) =>
        `  Line ${violation.line}: '${violation.functionName}' is an inline function in return object\n    ${violation.context}`
    )
    .join('\n');
  console.error(
    'BLOCKED: Inline function(s) found in hook return object without useCallback.\n' +
    'Every function returned from a hook must be wrapped in useCallback for referential stability.\n' +
    'Define the function with useCallback above the return statement, then reference it by name.\n' +
    details + '\n' +
    (violations.length > 5 ? '  ... and ' + (violations.length - 5) + ' more\n' : '') +
    'File: ' + filePath
  );
  process.exit(2);
}
