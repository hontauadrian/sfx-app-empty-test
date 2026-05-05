import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFixture, randomUuid } from '../schema-fixture';

test('randomUuid emits v4 format', () => {
  for (let i = 0; i < 5; i++) {
    assert.match(randomUuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});

test('generateFixture prefers manifest sampleValid', () => {
  const fixture = generateFixture({
    manifestEndpoint: { method: 'POST', path: '/x', sampleValid: { email: 'manifest@example.com', password: 'm' }, sampleInvalid: [{ body: { email: '' }, reason: 'empty-email' }] },
  });
  assert.equal(fixture.source, 'manifest');
  assert.deepEqual(fixture.valid, { email: 'manifest@example.com', password: 'm' });
  assert.equal(fixture.invalid.length, 1);
  assert.equal(fixture.invalid[0].reason, 'empty-email');
});

test('generateFixture returns undeclared when no manifest or schema', () => {
  const fixture = generateFixture({});
  assert.equal(fixture.source, 'undeclared');
  assert.equal(fixture.valid, null);
  assert.deepEqual(fixture.invalid, []);
});

test('generateFixture with Zod schema generates from shape', () => {
  // Fake Zod-like schema object (shape + safeParse).
  const fakeString = { _def: { typeName: 'ZodString', checks: [{ kind: 'email' }] }, safeParse: (_v: unknown) => ({ success: true }) };
  const fakeSchema = {
    safeParse: (_v: unknown) => ({ success: true }),
    shape: { email: fakeString, name: { _def: { typeName: 'ZodString', checks: [] }, safeParse: () => ({ success: true }) } },
  };
  const fixture = generateFixture({ zodSchema: fakeSchema });
  assert.equal(fixture.source, 'zod');
  assert.ok(fixture.valid !== null);
  assert.match(String(fixture.valid!.email), /@example\.com$/);
  assert.ok(typeof fixture.valid!.name === 'string');
  assert.ok(fixture.invalid.length >= 2);
});

test('generateFixture Zod empty-body invalid is always first', () => {
  const fakeSchema = {
    safeParse: (_v: unknown) => ({ success: true }),
    shape: { name: { _def: { typeName: 'ZodString', checks: [] }, safeParse: () => ({ success: true }) } },
  };
  const fixture = generateFixture({ zodSchema: fakeSchema });
  assert.deepEqual(fixture.invalid[0].body, {});
  assert.equal(fixture.invalid[0].reason, 'empty-body');
});

test('generateFixture ZodString without constraint uses deterministic fill', () => {
  const fakeSchema = {
    safeParse: (_v: unknown) => ({ success: true }),
    shape: { title: { _def: { typeName: 'ZodString', checks: [{ kind: 'min', value: 5 }] }, safeParse: () => ({ success: true }) } },
  };
  const fixture = generateFixture({ zodSchema: fakeSchema });
  assert.equal(fixture.source, 'zod');
  assert.ok(fixture.valid !== null);
  assert.equal(fixture.valid!.title, 'xxxxx');
});

test('generateFixture ZodString with email check returns email', () => {
  const fakeSchema = {
    safeParse: (_v: unknown) => ({ success: true }),
    shape: { contact: { _def: { typeName: 'ZodString', checks: [{ kind: 'email' }] }, safeParse: () => ({ success: true }) } },
  };
  const fixture = generateFixture({ zodSchema: fakeSchema });
  assert.ok(fixture.valid !== null);
  assert.match(String(fixture.valid!.contact), /@example\.com$/);
});

test('generateFixture ZodString with uuid check returns uuid', () => {
  const fakeSchema = {
    safeParse: (_v: unknown) => ({ success: true }),
    shape: { ref: { _def: { typeName: 'ZodString', checks: [{ kind: 'uuid' }] }, safeParse: () => ({ success: true }) } },
  };
  const fixture = generateFixture({ zodSchema: fakeSchema });
  assert.ok(fixture.valid !== null);
  assert.match(String(fixture.valid!.ref), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('generateFixture skips ZodOptional fields', () => {
  const fakeSchema = {
    safeParse: (_v: unknown) => ({ success: true }),
    shape: {
      required: { _def: { typeName: 'ZodString', checks: [] }, safeParse: () => ({ success: true }) },
      optional: { _def: { typeName: 'ZodOptional' }, safeParse: () => ({ success: true }) },
    },
  };
  const fixture = generateFixture({ zodSchema: fakeSchema });
  assert.ok(fixture.valid !== null);
  assert.ok('required' in fixture.valid!);
  assert.ok(!('optional' in fixture.valid!));
});

test('generateFixture unsupported Zod type returns undefined for field', () => {
  const fakeSchema = {
    safeParse: (_v: unknown) => ({ success: true }),
    shape: {
      weird: { _def: { typeName: 'ZodNever' }, safeParse: () => ({ success: false }) },
      name: { _def: { typeName: 'ZodString', checks: [] }, safeParse: () => ({ success: true }) },
    },
  };
  const fixture = generateFixture({ zodSchema: fakeSchema });
  assert.ok(fixture.valid !== null);
  assert.ok(!('weird' in fixture.valid!));
  assert.ok('name' in fixture.valid!);
});
