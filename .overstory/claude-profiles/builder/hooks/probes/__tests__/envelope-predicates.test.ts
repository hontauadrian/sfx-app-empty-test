import { test } from 'node:test';
import assert from 'node:assert';
import { isSuccessEnvelope, isErrorEnvelope } from '../shared';
import type { DeclaredSuccessEnvelope, DeclaredErrorEnvelope } from '../shared';

// ---------------------------------------------------------------------------
// isSuccessEnvelope
// ---------------------------------------------------------------------------

test('isSuccessEnvelope returns null when declared is null', () => {
  assert.strictEqual(isSuccessEnvelope({ data: 'x' }, null), null);
});

test('isSuccessEnvelope returns null when successWrapper is null', () => {
  const declared: DeclaredSuccessEnvelope = { successWrapper: null };
  assert.strictEqual(isSuccessEnvelope({ data: 'x' }, declared), null);
});

test('isSuccessEnvelope returns true for body matching single-key wrapper', () => {
  const declared: DeclaredSuccessEnvelope = { successWrapper: ['data'] };
  assert.strictEqual(isSuccessEnvelope({ data: { id: 1 } }, declared), true);
});

test('isSuccessEnvelope returns true for body matching multi-key wrapper', () => {
  const declared: DeclaredSuccessEnvelope = { successWrapper: ['result', 'data'] };
  assert.strictEqual(isSuccessEnvelope({ result: { data: { id: 1 } } }, declared), true);
});

test('isSuccessEnvelope returns false when wrapper key is missing', () => {
  const declared: DeclaredSuccessEnvelope = { successWrapper: ['data'] };
  assert.strictEqual(isSuccessEnvelope({ payload: 'x' }, declared), false);
});

test('isSuccessEnvelope returns false when nested wrapper key is missing', () => {
  const declared: DeclaredSuccessEnvelope = { successWrapper: ['result', 'data'] };
  assert.strictEqual(isSuccessEnvelope({ result: { payload: 'x' } }, declared), false);
});

test('isSuccessEnvelope returns false for null body', () => {
  const declared: DeclaredSuccessEnvelope = { successWrapper: ['data'] };
  assert.strictEqual(isSuccessEnvelope(null, declared), false);
});

test('isSuccessEnvelope returns false for non-object body', () => {
  const declared: DeclaredSuccessEnvelope = { successWrapper: ['data'] };
  assert.strictEqual(isSuccessEnvelope('string', declared), false);
  assert.strictEqual(isSuccessEnvelope(42, declared), false);
});

test('isSuccessEnvelope returns true even when wrapper value is null', () => {
  // The wrapper key existing is sufficient — value can be null (e.g. findUnique returns null).
  const declared: DeclaredSuccessEnvelope = { successWrapper: ['data'] };
  assert.strictEqual(isSuccessEnvelope({ data: null }, declared), true);
});

test('isSuccessEnvelope returns false when intermediate path is not an object', () => {
  const declared: DeclaredSuccessEnvelope = { successWrapper: ['result', 'data'] };
  assert.strictEqual(isSuccessEnvelope({ result: 'not-object' }, declared), false);
});

// ---------------------------------------------------------------------------
// isErrorEnvelope
// ---------------------------------------------------------------------------

test('isErrorEnvelope returns null when declared is null', () => {
  assert.strictEqual(isErrorEnvelope({ error: {} }, null), null);
});

test('isErrorEnvelope returns true for wrapped error matching declared shape', () => {
  const declared: DeclaredErrorEnvelope = {
    wrapper: ['error'],
    statusField: 'statusCode',
    messageField: 'message',
  };
  const body = { success: false, error: { statusCode: 404, message: 'Not found' } };
  assert.strictEqual(isErrorEnvelope(body, declared), true);
});

test('isErrorEnvelope returns true for flat error (empty wrapper)', () => {
  const declared: DeclaredErrorEnvelope = {
    wrapper: [],
    statusField: 'statusCode',
    messageField: 'message',
  };
  const body = { statusCode: 400, message: 'Bad request' };
  assert.strictEqual(isErrorEnvelope(body, declared), true);
});

test('isErrorEnvelope returns false when wrapper key is missing', () => {
  const declared: DeclaredErrorEnvelope = {
    wrapper: ['error'],
    statusField: 'statusCode',
    messageField: 'message',
  };
  const body = { success: false, data: { statusCode: 404, message: 'x' } };
  assert.strictEqual(isErrorEnvelope(body, declared), false);
});

test('isErrorEnvelope returns false when statusField is missing from unwrapped', () => {
  const declared: DeclaredErrorEnvelope = {
    wrapper: ['error'],
    statusField: 'statusCode',
    messageField: 'message',
  };
  const body = { error: { message: 'Not found' } };
  assert.strictEqual(isErrorEnvelope(body, declared), false);
});

test('isErrorEnvelope returns false when messageField is missing from unwrapped', () => {
  const declared: DeclaredErrorEnvelope = {
    wrapper: ['error'],
    statusField: 'statusCode',
    messageField: 'message',
  };
  const body = { error: { statusCode: 404 } };
  assert.strictEqual(isErrorEnvelope(body, declared), false);
});

test('isErrorEnvelope returns false for null body', () => {
  const declared: DeclaredErrorEnvelope = {
    wrapper: [],
    statusField: 'statusCode',
    messageField: 'message',
  };
  assert.strictEqual(isErrorEnvelope(null, declared), false);
});

test('isErrorEnvelope returns false for non-object body', () => {
  const declared: DeclaredErrorEnvelope = {
    wrapper: [],
    statusField: 'statusCode',
    messageField: 'message',
  };
  assert.strictEqual(isErrorEnvelope('error', declared), false);
});

test('isErrorEnvelope returns true when statusField is null (not declared)', () => {
  // When detector could not identify a status field, we skip that check.
  const declared: DeclaredErrorEnvelope = {
    wrapper: ['error'],
    statusField: null,
    messageField: 'message',
  };
  const body = { error: { message: 'Something went wrong' } };
  assert.strictEqual(isErrorEnvelope(body, declared), true);
});

test('isErrorEnvelope returns true when messageField is null (not declared)', () => {
  const declared: DeclaredErrorEnvelope = {
    wrapper: ['error'],
    statusField: 'statusCode',
    messageField: null,
  };
  const body = { error: { statusCode: 500 } };
  assert.strictEqual(isErrorEnvelope(body, declared), true);
});

test('isErrorEnvelope returns true when both fields null (wrapper-only check)', () => {
  const declared: DeclaredErrorEnvelope = {
    wrapper: ['error'],
    statusField: null,
    messageField: null,
  };
  const body = { error: { anything: 'here' } };
  assert.strictEqual(isErrorEnvelope(body, declared), true);
});

test('isErrorEnvelope returns false when wrapped value is not an object', () => {
  const declared: DeclaredErrorEnvelope = {
    wrapper: ['error'],
    statusField: 'statusCode',
    messageField: 'message',
  };
  const body = { error: 'just a string' };
  assert.strictEqual(isErrorEnvelope(body, declared), false);
});

test('isErrorEnvelope handles deep wrapper path', () => {
  const declared: DeclaredErrorEnvelope = {
    wrapper: ['response', 'error'],
    statusField: 'code',
    messageField: 'detail',
  };
  const body = { response: { error: { code: 422, detail: 'Validation failed' } } };
  assert.strictEqual(isErrorEnvelope(body, declared), true);
});

test('isErrorEnvelope returns false on deep wrapper path with missing intermediate', () => {
  const declared: DeclaredErrorEnvelope = {
    wrapper: ['response', 'error'],
    statusField: 'code',
    messageField: 'detail',
  };
  const body = { response: { data: {} } };
  assert.strictEqual(isErrorEnvelope(body, declared), false);
});
