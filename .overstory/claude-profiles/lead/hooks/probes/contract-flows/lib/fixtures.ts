/**
 * contract-flows/lib/fixtures.ts
 *
 * Resolves `fixtureRef` strings (used by ApiStep.multipart entries and
 * by `_shared.fixtures` token entries) to concrete bytes + mimeType +
 * filename.
 *
 * Inputs:
 *   - `fixtures: Map<string, string>` — emitted by the loader; maps
 *     fixtureRef strings to absolute paths on disk.
 *   - `inlineFixtures: Record<string, FixtureValue>` — token-style
 *     fixtures (P0-6) that don't live on disk; passed through verbatim.
 *
 * Outputs: a `FixtureResolver = (ref) => Promise<ResolvedFixture>`
 * suitable for the multipart builder.
 *
 * Errors: missing fixture → throws an Error whose message includes the
 * ref. The caller (multipart builder, http adapter) wraps that into the
 * appropriate typed diagnostic.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';

export interface ResolvedFixture {
  data: Uint8Array;
  mimeType: string;
  filename: string;
}

/** Inline fixture entry (e.g. token fixtures from `_shared.fixtures`). */
export type InlineFixtureValue =
  | string
  | { kind: 'string'; value: string }
  | { kind: 'json'; value: unknown }
  | { kind: 'bytes'; data: Uint8Array; mimeType?: string; filename?: string };

export type FixtureResolver = (ref: string) => Promise<ResolvedFixture>;

const MIME_BY_EXT: Record<string, string> = {
  '.json': 'application/json',
  '.txt':  'text/plain',
  '.csv':  'text/csv',
  '.html': 'text/html',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.pdf':  'application/pdf',
  '.bin':  'application/octet-stream',
  '.svg':  'image/svg+xml',
};

function mimeForFilename(name: string): string {
  return MIME_BY_EXT[extname(name).toLowerCase()] ?? 'application/octet-stream';
}

export interface CreateResolverOptions {
  /** Map fixtureRef → absolute path on disk. From the loader. */
  fixtures?: Map<string, string>;
  /** Inline (in-memory) fixtures, by name. Higher precedence than disk. */
  inlineFixtures?: Record<string, InlineFixtureValue>;
  /** Cap fixture size to defend against accidental gigabyte files.
   *  Default 5MB. */
  maxBytes?: number;
}

export function createFixtureResolver(opts: CreateResolverOptions = {}): FixtureResolver {
  const fixtures = opts.fixtures ?? new Map<string, string>();
  const inline = opts.inlineFixtures ?? {};
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;

  return async (ref: string): Promise<ResolvedFixture> => {
    // Inline first — leads use these for tokens / fake JSON without
    // touching disk.
    if (Object.prototype.hasOwnProperty.call(inline, ref)) {
      const v = inline[ref];
      if (typeof v === 'string') {
        return { data: new TextEncoder().encode(v), mimeType: 'text/plain', filename: ref };
      }
      if ((v as { kind: string }).kind === 'string') {
        const sv = v as { kind: 'string'; value: string };
        return { data: new TextEncoder().encode(sv.value), mimeType: 'text/plain', filename: ref };
      }
      if ((v as { kind: string }).kind === 'json') {
        const jv = v as { kind: 'json'; value: unknown };
        return {
          data: new TextEncoder().encode(JSON.stringify(jv.value)),
          mimeType: 'application/json',
          filename: ref + '.json',
        };
      }
      if ((v as { kind: string }).kind === 'bytes') {
        const bv = v as { kind: 'bytes'; data: Uint8Array; mimeType?: string; filename?: string };
        return {
          data: bv.data,
          mimeType: bv.mimeType ?? 'application/octet-stream',
          filename: bv.filename ?? ref,
        };
      }
    }

    // Disk path lookup.
    const path = fixtures.get(ref);
    if (path === undefined) {
      throw new Error(`fixtureRef '${ref}' is not declared in fixtures map and not inline`);
    }
    if (!existsSync(path)) {
      throw new Error(`fixtureRef '${ref}' resolved to '${path}' which does not exist`);
    }
    const st = statSync(path);
    if (!st.isFile()) {
      throw new Error(`fixtureRef '${ref}' resolved to '${path}' which is not a regular file`);
    }
    if (st.size > maxBytes) {
      throw new Error(`fixtureRef '${ref}' size ${st.size} exceeds maxBytes ${maxBytes}`);
    }
    const buf = readFileSync(path);
    const filename = basename(path);
    return {
      data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
      mimeType: mimeForFilename(filename),
      filename,
    };
  };
}
