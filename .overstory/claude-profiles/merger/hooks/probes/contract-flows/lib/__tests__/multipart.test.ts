/**
 * Tests for contract-flows/lib/multipart.ts.
 *
 * Coverage:
 *   - Pure value parts produce string fields.
 *   - File parts route through the resolver and become Blob attachments.
 *   - Missing fixture → MultipartBuildError.
 *   - Empty `{ name }` entry is appended as empty string.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildMultipartBody, MultipartBuildError } from '../multipart';
import { createFixtureResolver } from '../fixtures';

test('value-only part is appended as a string field', async () => {
  const r = createFixtureResolver({});
  const fd = await buildMultipartBody([{ name: 'caption', value: 'hello' }], r);
  assert.equal(fd.get('caption'), 'hello');
});

test('file part with inline bytes fixture is appended as a Blob', async () => {
  const r = createFixtureResolver({
    inlineFixtures: {
      pic: { kind: 'bytes', data: new Uint8Array([1, 2, 3]), mimeType: 'image/png', filename: 'pic.png' },
    },
  });
  const fd = await buildMultipartBody(
    [{ name: 'avatar', file: { fixtureRef: 'pic', mimeType: 'image/png', filename: 'pic.png' } }],
    r,
  );
  const v = fd.get('avatar');
  assert.ok(v instanceof Blob);
  assert.equal((v as File).name, 'pic.png');
  assert.equal((v as Blob).type, 'image/png');
  assert.equal((v as Blob).size, 3);
});

test('missing fixture surfaces a MultipartBuildError carrying the fixtureRef', async () => {
  const r = createFixtureResolver({});
  await assert.rejects(
    () => buildMultipartBody([{ name: 'x', file: { fixtureRef: 'missing', mimeType: 'application/octet-stream' } }], r),
    (e: unknown) => e instanceof MultipartBuildError && (e as MultipartBuildError).fixtureRef === 'missing',
  );
});

test('part with neither value nor file is appended as empty string', async () => {
  const r = createFixtureResolver({});
  const fd = await buildMultipartBody([{ name: 'note' }], r);
  assert.equal(fd.get('note'), '');
});

test('multiple parts preserve declared order via getAll()', async () => {
  const r = createFixtureResolver({});
  const fd = await buildMultipartBody(
    [
      { name: 'a', value: '1' },
      { name: 'a', value: '2' },
    ],
    r,
  );
  assert.deepEqual(fd.getAll('a'), ['1', '2']);
});
