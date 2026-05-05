'use strict';

// Tests for detectors/forms.js — form detection (heuristics removed).
//
// Verifies that:
//   1. Files with <form>/<Form>/useForm() are detected.
//   2. submitsTo is always null (fetch URL heuristic removed).
//   3. fields is always empty (field-name regex heuristic removed).
//   4. onSuccessNavigate is always null (navigation regex heuristic removed).
//   5. DIAG FORM_TARGET_UNDECLARED emitted when forms found.
//   6. Test/spec/stories files are skipped.
//
// Run directly: `node --test __tests__/forms.test.js`

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { deriveForms } = require('../detectors/forms');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDiag() {
  const entries = [];
  return {
    entries,
    info: (msg) => entries.push({ level: 'info', message: msg }),
    warn: (msg) => entries.push({ level: 'warn', message: msg }),
  };
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forms-test-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Form detection
// ---------------------------------------------------------------------------

test('forms: detects file with <form> tag', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'login.tsx'), `
      export default function Login() {
        return <form onSubmit={handleSubmit}><input name="email" /><button>Login</button></form>;
      }
    `);
    const diag = makeDiag();
    const result = deriveForms(dir, {}, [], [], diag);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].file, 'login.tsx');
  });
});

test('forms: detects file with useForm()', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'register.tsx'), `
      import { useForm } from 'react-hook-form';
      export default function Register() {
        const { register } = useForm();
        return <div />;
      }
    `);
    const diag = makeDiag();
    const result = deriveForms(dir, {}, [], [], diag);
    assert.strictEqual(result.length, 1);
  });
});

test('forms: detects file with <Form> component', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'contact.tsx'), `
      import { Form } from './ui/form';
      export default function Contact() { return <Form />; }
    `);
    const diag = makeDiag();
    const result = deriveForms(dir, {}, [], [], diag);
    assert.strictEqual(result.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Heuristic extraction removed
// ---------------------------------------------------------------------------

test('forms: submitsTo is always null (fetch URL regex removed)', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'login.tsx'), `
      export default function Login() {
        const handleSubmit = () => fetch('/api/auth/login', { method: 'POST' });
        return <form onSubmit={handleSubmit}><button>Go</button></form>;
      }
    `);
    const diag = makeDiag();
    const result = deriveForms(dir, {}, [], [], diag);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].submitsTo, null);
  });
});

test('forms: fields is always empty (field-name regex removed)', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'login.tsx'), `
      export default function Login() {
        return <form><input name="email" /><input name="password" /><button>Go</button></form>;
      }
    `);
    const diag = makeDiag();
    const result = deriveForms(dir, {}, [], [], diag);
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0].fields, []);
  });
});

test('forms: onSuccessNavigate is always null (navigation regex removed)', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'login.tsx'), `
      import { useRouter } from 'next/navigation';
      export default function Login() {
        const router = useRouter();
        const handleSubmit = () => { router.push('/dashboard'); };
        return <form onSubmit={handleSubmit}><button>Go</button></form>;
      }
    `);
    const diag = makeDiag();
    const result = deriveForms(dir, {}, [], [], diag);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].onSuccessNavigate, null);
  });
});

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

test('forms: skips test files', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'login.test.tsx'), `
      export default function LoginTest() { return <form />; }
    `);
    const diag = makeDiag();
    const result = deriveForms(dir, {}, [], [], diag);
    assert.strictEqual(result.length, 0);
  });
});

test('forms: skips spec files', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'login.spec.tsx'), `
      export default function LoginSpec() { return <form />; }
    `);
    const diag = makeDiag();
    const result = deriveForms(dir, {}, [], [], diag);
    assert.strictEqual(result.length, 0);
  });
});

test('forms: skips stories files', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'login.stories.tsx'), `
      export default function LoginStory() { return <form />; }
    `);
    const diag = makeDiag();
    const result = deriveForms(dir, {}, [], [], diag);
    assert.strictEqual(result.length, 0);
  });
});

test('forms: skips node_modules', () => {
  withTempDir((dir) => {
    const nmDir = path.join(dir, 'node_modules', 'pkg');
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(path.join(nmDir, 'form.tsx'), '<form />');
    const diag = makeDiag();
    const result = deriveForms(dir, {}, [], [], diag);
    assert.strictEqual(result.length, 0);
  });
});

// ---------------------------------------------------------------------------
// DIAG emission
// ---------------------------------------------------------------------------

test('forms: emits FORM_TARGET_UNDECLARED diag when forms found', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'login.tsx'), '<form />');
    const diag = makeDiag();
    deriveForms(dir, {}, [], [], diag);
    const undeclared = diag.entries.find(
      (entry) => entry.message.includes('FORM_TARGET_UNDECLARED')
    );
    assert.ok(undeclared, 'Expected FORM_TARGET_UNDECLARED diag');
  });
});

test('forms: does NOT emit FORM_TARGET_UNDECLARED when no forms found', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'app.tsx'), 'export default function App() { return <div />; }');
    const diag = makeDiag();
    deriveForms(dir, {}, [], [], diag);
    const undeclared = diag.entries.find(
      (entry) => entry.message.includes('FORM_TARGET_UNDECLARED')
    );
    assert.strictEqual(undeclared, undefined);
  });
});

// ---------------------------------------------------------------------------
// Empty
// ---------------------------------------------------------------------------

test('forms: returns empty array when no form files exist', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'app.tsx'), 'const x = 1;');
    const diag = makeDiag();
    const result = deriveForms(dir, {}, [], [], diag);
    assert.strictEqual(result.length, 0);
  });
});
