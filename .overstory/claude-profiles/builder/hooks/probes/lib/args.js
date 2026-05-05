'use strict';

// Minimal flag parser — supports --key value, --key=value, --bool.
// Spec: plan 02 §3 — derive-test-matrix.js CLI.
function parseArgs(argv, schema) {
  const stringKeys = new Set(schema.string || []);
  const booleanKeys = new Set(schema.boolean || []);
  const result = {};
  for (const key of stringKeys) result[key] = undefined;
  for (const key of booleanKeys) result[key] = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const eqIndex = token.indexOf('=');
    let name;
    let value;
    if (eqIndex !== -1) {
      name = token.slice(2, eqIndex);
      value = token.slice(eqIndex + 1);
    } else {
      name = token.slice(2);
      value = undefined;
    }
    if (booleanKeys.has(name)) {
      result[name] = value === undefined ? true : value !== 'false' && value !== '0';
      continue;
    }
    if (stringKeys.has(name)) {
      if (value === undefined) {
        const next = argv[index + 1];
        if (next !== undefined && !next.startsWith('--')) {
          value = next;
          index += 1;
        }
      }
      result[name] = value;
      continue;
    }
    // Unknown flag — accept as string to avoid crashing under future flags.
    result[name] = value === undefined ? true : value;
  }
  return result;
}

module.exports = { parseArgs };
