'use strict';

const path = require('path');

const { walkFiles, readFileSafe } = require('../lib/fsutil');

// Form detection. Spec: plan 02 §4.11, heuristic audit 2026-04-27.
//
// Detects files containing <form>/<Form>/useForm() markers.
//
// Previous heuristics removed:
//   - fetch/executeRequest URL extraction (source-code regex — unreliable)
//   - field-name extraction via name=/register(/control.register( regex
//   - navigation target guessing via router.push/navigate/redirect regex
//
// Form submit targets should come from declared Zod schemas linked via
// explicit form-id metadata. Field names come from the schema, not source
// regex. Navigation targets come from the overlay or route declarations.
//
// Until the declaration pipeline is wired, forms are detected as stubs
// (file + changed flag only) with null/empty extracted data + DIAG.
function deriveForms(root, frameworks, pages, endpoints, diag) {
  const forms = [];
  const sourceFiles = walkFiles(root, { extensions: ['.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte'] });
  for (const file of sourceFiles) {
    if (file.includes(path.sep + 'node_modules' + path.sep)) continue;
    // Skip test/spec/stories files — they contain <form> markers for fixtures,
    // not real application surfaces. Spec: plan 07 flow-coverage precision.
    if (/(^|[./-])(test|spec|stories)\.[jt]sx?$/i.test(path.basename(file))) continue;
    const source = readFileSafe(file);
    if (!source) continue;
    if (!/<form\b|<Form\b|useForm\s*\(|use:enhance|@submit/.test(source)) continue;

    forms.push({
      file: path.relative(root, file),
      submitsTo: null,
      fields: [],
      onSuccessNavigate: null,
      changed: false,
    });
  }

  if (forms.length > 0) {
    diag.info(
      `FORM_TARGET_UNDECLARED: ${forms.length} form(s) detected but submit targets, fields, ` +
      'and navigation targets are not extracted (source-code regex heuristics removed). ' +
      'Declare form schemas in packages/validation/**/*.form.schema.ts and link via ' +
      'explicit form-id metadata to enable form-flow assertions.'
    );
  }

  diag.info(`forms: ${forms.length} detected`);
  return forms;
}

module.exports = { deriveForms };
