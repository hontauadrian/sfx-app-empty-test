const fs = require('fs');
const hookInput = JSON.parse(fs.readFileSync(0, 'utf8'));
const input = hookInput.tool_input || {};
const filePath = input.file_path || input.path || '';
const content = input.content || input.new_string || '';

if (!filePath || !content) process.exit(0);

const isPackageJson = /package\.json$/.test(filePath);
if (!isPackageJson) process.exit(0);

let parsed;
try {
  parsed = JSON.parse(content);
} catch (_parseError) {
  process.exit(0);
}

const violations = [];

const checkDeps = (depType) => {
  const deps = parsed[depType];
  if (!deps || typeof deps !== 'object') return;

  Object.entries(deps).forEach(([packageName, version]) => {
    if (typeof version !== 'string') return;
    if (version.startsWith('^') || version.startsWith('~')) {
      violations.push(`${depType}.${packageName}: "${version}" (remove ${version[0]} prefix)`);
    }
  });
};

checkDeps('dependencies');
checkDeps('devDependencies');
checkDeps('peerDependencies');

if (violations.length > 0) {
  console.error(
    'BLOCKED: Non-pinned dependency versions found. Use exact versions only (no ^ or ~ prefixes).\n' +
    'Install with: npm install --save-exact <package>\n' +
    violations.map((violation) => '  ' + violation).join('\n') + '\n' +
    'File: ' + filePath
  );
  process.exit(2);
}
