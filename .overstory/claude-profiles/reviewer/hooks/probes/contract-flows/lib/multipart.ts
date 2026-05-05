/**
 * contract-flows/lib/multipart.ts
 *
 * Multipart body builder for ApiStep.bodyKind === 'multipart'.
 *
 * Each entry is either a literal value (string field) or a file part
 * with `fixtureRef`, `mimeType`, optional `filename`. The fixture
 * resolver returns `{ data, mimeType, filename }` from the configured
 * fixtures map (see fixtures.ts).
 *
 * Returns a node-fetch-compatible `FormData` (the global FormData in
 * Node ≥ 18). Caller passes the FormData directly to fetch() — fetch
 * sets Content-Type and the boundary header automatically.
 */

import type { ApiStep } from '../step-types';
import type { FixtureResolver } from './fixtures';

export class MultipartBuildError extends Error {
  readonly fixtureRef: string;
  constructor(fixtureRef: string, cause: string) {
    super(`multipart: failed to resolve fixture '${fixtureRef}': ${cause}`);
    this.name = 'MultipartBuildError';
    this.fixtureRef = fixtureRef;
  }
}

export async function buildMultipartBody(
  parts: NonNullable<ApiStep['multipart']>,
  resolver: FixtureResolver,
): Promise<FormData> {
  const fd = new FormData();
  for (const part of parts) {
    if (part.file) {
      let resolved;
      try {
        resolved = await resolver(part.file.fixtureRef);
      } catch (e: unknown) {
        throw new MultipartBuildError(part.file.fixtureRef, (e as Error).message);
      }
      const filename = part.file.filename ?? resolved.filename ?? part.file.fixtureRef;
      const mimeType = part.file.mimeType || resolved.mimeType || 'application/octet-stream';
      // Wrap Uint8Array in a Blob so FormData treats it as a file part
      // (with filename + content-type headers in the multipart frame).
      const blob = new Blob([resolved.data], { type: mimeType });
      fd.append(part.name, blob, filename);
    } else if (part.value !== undefined) {
      fd.append(part.name, part.value);
    } else {
      // Empty string field is the canonical interpretation of
      // `{ name: 'x' }` with neither value nor file. Multipart spec
      // does not require a body, but most servers expect at least the
      // header frame; appending '' is safe.
      fd.append(part.name, '');
    }
  }
  return fd;
}
