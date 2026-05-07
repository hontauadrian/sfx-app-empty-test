const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync(0, 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

const isHookFile = /use[A-Z][A-Za-z]*\.ts(x?)$/.test(filePath) || /use-[a-z][a-z0-9-]*\.ts(x?)$/.test(filePath);
const isNavigationHandler = /NavigationHandler\.ts(x?)$/.test(filePath) || /navigation-handler\.ts(x?)$/.test(filePath);

if (!isHookFile || isNavigationHandler) process.exit(0);

const routerCallPattern = /router\.(push|replace|back|navigate|forward)\s*\(/;

if (routerCallPattern.test(content)) {
  console.error(
    'BLOCKED: router.push/replace/back/navigate is not allowed in hook files.\n' +
    'Hooks must expose a navigationTarget state and clearNavigationTarget callback.\n' +
    'Use a separate use[Feature]NavigationHandler hook that owns the router.\n' +
    'File: ' + filePath
  );
  process.exit(2);
}
