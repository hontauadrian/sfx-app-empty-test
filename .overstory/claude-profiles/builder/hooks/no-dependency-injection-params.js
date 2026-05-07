const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync(0, 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

const isSourceFile = /\.(tsx?|jsx?)$/.test(filePath);
const isTestFile = /__tests__|\.test\.|\.spec\./i.test(filePath);
const isTypeDeclaration = /\.d\.ts$/.test(filePath);
const isTypesFile = /types\.ts(x?)$/.test(filePath);
const isConfigFile = /\.config\.|provider|Provider/i.test(filePath);
const isContextFile = /Context\.tsx?$/.test(filePath);

if (!isSourceFile || isTestFile || isTypeDeclaration || isTypesFile || isConfigFile || isContextFile) process.exit(0);

const lines = content.split('\n');
const violations = [];

const FORBIDDEN_PARAMS = ['theme', 'router', 'queryClient', 'translate', 'navigation'];
const HOOK_ALTERNATIVES = {
  theme: 'useTheme()',
  router: 'useRouter()',
  queryClient: 'useQueryClient()',
  translate: 'useTranslations(namespace) or scopedTranslate(namespace)',
  navigation: 'useRouter() or use[Feature]NavigationHandler',
};

lines.forEach((line, index) => {
  if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
  if (/import\s/.test(line)) return;
  if (/^\s*(interface|type)\s/.test(line)) return;
  if (/^\s*export\s+(interface|type)\s/.test(line)) return;

  FORBIDDEN_PARAMS.forEach((param) => {
    const paramRegex = new RegExp(
      '[,((]\\s*' + param + '\\s*[,:)=]',
      'i'
    );
    if (paramRegex.test(line)) {
      violations.push({
        line: index + 1,
        param: param,
        alternative: HOOK_ALTERNATIVES[param],
        context: line.trim().substring(0, 80),
      });
    }
  });
});

if (violations.length > 0) {
  const details = violations
    .slice(0, 5)
    .map(
      (violation) =>
        `  Line ${violation.line}: '${violation.param}' as parameter — use ${violation.alternative} instead\n    ${violation.context}`
    )
    .join('\n');
  console.error(
    'BLOCKED: Injectable dependency passed as function parameter.\n' +
    'Call the corresponding hook inside the function body instead.\n' +
    'Only domain state (IDs, form values, flags) should be passed as parameters.\n' +
    details + '\n' +
    (violations.length > 5 ? '  ... and ' + (violations.length - 5) + ' more\n' : '') +
    'File: ' + filePath
  );
  process.exit(2);
}
