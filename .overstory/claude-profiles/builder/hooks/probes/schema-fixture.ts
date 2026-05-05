/**
 * Generate valid / invalid request bodies for an endpoint based on:
 *   1. manifest `sampleValid` / `sampleInvalid` (plan 05)
 *   2. Zod schema reference (resolved from @sfx/validation)
 *
 * When neither manifest nor Zod schema declares a body, returns
 * `{ valid: null, invalid: [], source: 'undeclared' }` and emits DIAG
 * FIXTURE_UNDECLARED. Callers must skip the test when source is 'undeclared'.
 *
 * Priority order mirrors plan 04 §3.3.
 */

import { CompiledEndpoint } from './matrix-loader';

export interface FixturePair {
  valid: Record<string, unknown> | null;
  invalid: Array<{ body: unknown; reason: string }>;
  source: 'manifest' | 'zod' | 'undeclared';
}

export interface FixtureOptions {
  manifestEndpoint?: CompiledEndpoint | null;
  zodSchema?: unknown | null;
}

/**
 * Generate valid body + invalid bodies for an endpoint.
 */
export function generateFixture(options: FixtureOptions = {}): FixturePair {
  // Priority 1 — manifest.
  if (options.manifestEndpoint?.sampleValid) {
    return {
      valid: { ...options.manifestEndpoint.sampleValid },
      invalid: (options.manifestEndpoint.sampleInvalid ?? []).map((entry, idx) => ({
        body: entry.body,
        reason: entry.reason ?? `manifest-invalid-${idx}`,
      })),
      source: 'manifest',
    };
  }

  // Priority 2 — Zod schema (when resolvable as a ZodObject).
  if (options.zodSchema && isZodObject(options.zodSchema)) {
    const valid = generateFromZod(options.zodSchema);
    const invalid = generateInvalidFromZod(options.zodSchema);
    return { valid, invalid, source: 'zod' };
  }

  // No declared body — emit DIAG and return undeclared.
  process.stderr.write('[DIAG FIXTURE_UNDECLARED] no manifest or Zod schema declares a body\n');
  return { valid: null, invalid: [], source: 'undeclared' };
}

export function randomUuid(): string {
  // Crypto-random UUID v4 without external deps.
  const bytes = new Uint8Array(16);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomFillSync } = require('node:crypto') as typeof import('node:crypto');
  randomFillSync(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

function isZodObject(schema: unknown): schema is { shape?: unknown; _def?: { shape?: () => Record<string, unknown> }; safeParse?: (v: unknown) => unknown } {
  if (!schema || typeof schema !== 'object') return false;
  const candidate = schema as { safeParse?: unknown; shape?: unknown; _def?: { shape?: unknown } };
  if (typeof candidate.safeParse !== 'function') return false;
  const shape = candidate.shape ?? (typeof candidate._def?.shape === 'function' ? (candidate._def.shape as () => unknown)() : null);
  return !!shape;
}

function generateFromZod(schema: unknown): Record<string, unknown> {
  const shape = extractZodShape(schema);
  if (!shape) return {};
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(shape)) {
    const value = sampleZodField(field, key);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function generateInvalidFromZod(schema: unknown): Array<{ body: unknown; reason: string }> {
  const shape = extractZodShape(schema);
  if (!shape) return [{ body: {}, reason: 'empty-body' }];
  const valid = generateFromZod(schema);
  const invalids: Array<{ body: unknown; reason: string }> = [{ body: {}, reason: 'empty-body' }];
  for (const key of Object.keys(shape)) {
    invalids.push({ body: { ...valid, [key]: '' }, reason: `${key}-empty-string` });
  }
  return invalids;
}

function extractZodShape(schema: unknown): Record<string, unknown> | null {
  if (!schema || typeof schema !== 'object') return null;
  const candidate = schema as { shape?: unknown; _def?: { shape?: unknown } };
  let shape = candidate.shape;
  if (!shape && typeof candidate._def?.shape === 'function') {
    try { shape = (candidate._def.shape as () => Record<string, unknown>)(); } catch { shape = undefined; }
  }
  if (!shape || typeof shape !== 'object') return null;
  return shape as Record<string, unknown>;
}

function sampleZodField(field: unknown, name: string): unknown {
  if (!field || typeof field !== 'object') return undefined;
  const typed = field as { _def?: { typeName?: string; checks?: Array<{ kind: string; value?: unknown; regex?: RegExp }>; values?: unknown[]; value?: unknown } };
  const typeName = typed._def?.typeName;
  if (typeName === 'ZodOptional' || typeName === 'ZodNullable' || typeName === 'ZodDefault') return undefined;

  if (typeName === 'ZodString') {
    const checks = typed._def?.checks ?? [];
    const kinds = new Set(checks.map((c) => c.kind));
    if (kinds.has('email')) return `smoke+${Date.now()}@example.com`;
    if (kinds.has('url')) return 'https://example.com';
    if (kinds.has('uuid')) return randomUuid();
    let minLen = 3;
    for (const check of checks) if (check.kind === 'min' && typeof check.value === 'number') minLen = Math.max(minLen, check.value);
    process.stderr.write(`[DIAG ZOD_STRING_NO_CONSTRAINT] field '${name}' is ZodString without .email()/.url()/.uuid() — using deterministic fill\n`);
    return 'x'.repeat(Math.max(minLen, 3));
  }
  if (typeName === 'ZodNumber') return 1;
  if (typeName === 'ZodBoolean') return true;
  if (typeName === 'ZodArray') return [];
  if (typeName === 'ZodEnum') return typed._def?.values?.[0];
  if (typeName === 'ZodLiteral') return typed._def?.value;
  if (typeName === 'ZodObject') return generateFromZod(field);
  if (typeName === 'ZodDate') return new Date().toISOString();
  process.stderr.write(`[DIAG ZOD_UNSUPPORTED_TYPE] field '${name}' has unrecognized Zod type '${typeName ?? 'unknown'}'\n`);
  return undefined;
}
