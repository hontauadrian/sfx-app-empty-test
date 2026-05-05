/**
 * Tests for contract-flows/lib/fixtures.ts.
 *
 * Coverage:
 *   - Inline string / json / bytes fixtures.
 *   - Disk-backed fixtures (resolved absolute path).
 *   - maxBytes cap.
 *   - Missing fixture → throw.
 *   - mimeType derived from extension when not set.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFixtureResolver } from '../fixtures';

test('inline string fixture returns text/plain bytes', async () => {
  const r = createFixtureResolver({ inlineFixtures: { hello: 'hi there' } });
  const got = await r('hello');
  assert.equal(new TextDecoder().decode(got.data), 'hi there');
  assert.equal(got.mimeType, 'text/plain');
  assert.equal(got.filename, 'hello');
});

test('inline json fixture serializes the value with application/json', async () => {
  const r = createFixtureResolver({ inlineFixtures: { tok: { kind: 'json', value: { a: 1 } } } });
  const got = await r('tok');
  assert.equal(got.mimeType, 'application/json');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(got.data)), { a: 1 });
});

test('inline bytes fixture passes data through with provided mime+filename', async () => {
  const data = new Uint8Array([1, 2, 3, 4]);
  const r = createFixtureResolver({
    inlineFixtures: { bin: { kind: 'bytes', data, mimeType: 'image/png', filename: 'pic.png' } },
  });
  const got = await r('bin');
  assert.deepEqual(Array.from(got.data), [1, 2, 3, 4]);
  assert.equal(got.mimeType, 'image/png');
  assert.equal(got.filename, 'pic.png');
});

test('disk fixture is read and mimeType inferred from extension', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fixtures-test-'));
  try {
    const f = join(dir, 'data.json');
    writeFileSync(f, '{"k":42}');
    const r = createFixtureResolver({ fixtures: new Map([['payload.json', f]]) });
    const got = await r('payload.json');
    assert.equal(got.mimeType, 'application/json');
    assert.equal(got.filename, 'data.json');
    assert.equal(new TextDecoder().decode(got.data), '{"k":42}');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('missing fixture (neither inline nor disk) throws', async () => {
  const r = createFixtureResolver({});
  await assert.rejects(() => r('nope'), /not declared/);
});

test('disk fixture exceeding maxBytes throws', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fixtures-test-'));
  try {
    const f = join(dir, 'big.bin');
    writeFileSync(f, Buffer.alloc(20));
    const r = createFixtureResolver({ fixtures: new Map([['big', f]]), maxBytes: 10 });
    await assert.rejects(() => r('big'), /exceeds maxBytes/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('inline takes precedence over disk on conflicting names', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fixtures-test-'));
  try {
    const f = join(dir, 'a.txt');
    writeFileSync(f, 'from-disk');
    const r = createFixtureResolver({
      fixtures: new Map([['k', f]]),
      inlineFixtures: { k: 'from-inline' },
    });
    const got = await r('k');
    assert.equal(new TextDecoder().decode(got.data), 'from-inline');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
