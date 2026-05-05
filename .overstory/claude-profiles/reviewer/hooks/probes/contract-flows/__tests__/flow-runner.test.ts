/**
 * Tests for contract-flows/flow-runner.ts pure helpers.
 *
 * Coverage:
 *   - applyPathPrefix(): empty prefix, absolute URLs, idempotent guard,
 *     prefix-prefix substring trap, leading-slash normalisation, query
 *     strings, deep prefixes.
 *
 * Live HTTP integration is exercised by `pnpm probe:smoke`, not here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyPathPrefix } from '../flow-runner';

test('applyPathPrefix: returns the path unchanged when prefix is empty', () => {
  assert.equal(applyPathPrefix('/health', ''), '/health');
  assert.equal(applyPathPrefix('/probe-ref/auth-flows/me', ''), '/probe-ref/auth-flows/me');
});

test('applyPathPrefix: passes absolute http URLs through untouched', () => {
  assert.equal(applyPathPrefix('http://localhost:3001/foo', '/api/v1'), 'http://localhost:3001/foo');
  assert.equal(applyPathPrefix('https://example.com/bar', '/api/v1'), 'https://example.com/bar');
});

test('applyPathPrefix: prepends the prefix to a relative path that does not have it', () => {
  assert.equal(applyPathPrefix('/probe-ref/auth-flows/me', '/api/v1'), '/api/v1/probe-ref/auth-flows/me');
  assert.equal(applyPathPrefix('/health', '/api/v1'), '/api/v1/health');
});

test('applyPathPrefix: is idempotent — paths that already start with the prefix are unchanged', () => {
  assert.equal(applyPathPrefix('/api/v1/health', '/api/v1'), '/api/v1/health');
  assert.equal(applyPathPrefix('/api/v1/probe-ref/auth-flows/me', '/api/v1'), '/api/v1/probe-ref/auth-flows/me');
});

test('applyPathPrefix: handles a path equal to exactly the prefix', () => {
  assert.equal(applyPathPrefix('/api/v1', '/api/v1'), '/api/v1');
});

test('applyPathPrefix: does not match a prefix-prefix substring (avoids /api/v1 matching /api/v10)', () => {
  assert.equal(applyPathPrefix('/api/v10/foo', '/api/v1'), '/api/v1/api/v10/foo');
});

test('applyPathPrefix: normalises a prefix without leading slash', () => {
  assert.equal(applyPathPrefix('/health', 'api/v1'), '/api/v1/health');
  assert.equal(applyPathPrefix('/api/v1/health', 'api/v1'), '/api/v1/health');
});

test('applyPathPrefix: handles a relative path without leading slash', () => {
  assert.equal(applyPathPrefix('probe-ref/auth-flows/me', '/api/v1'), '/api/v1/probe-ref/auth-flows/me');
});

test('applyPathPrefix: preserves query strings on relative paths', () => {
  assert.equal(applyPathPrefix('/probe-ref/list?page=2', '/api/v1'), '/api/v1/probe-ref/list?page=2');
});

test('applyPathPrefix: handles a deep prefix', () => {
  assert.equal(applyPathPrefix('/foo', '/svc/api/v1'), '/svc/api/v1/foo');
  assert.equal(applyPathPrefix('/svc/api/v1/foo', '/svc/api/v1'), '/svc/api/v1/foo');
});
