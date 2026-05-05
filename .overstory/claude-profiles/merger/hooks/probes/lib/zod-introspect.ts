/**
 * Deterministic Zod schema introspector.
 *
 * Parses Zod schema source files via regex-based AST scanning (no runtime
 * Zod import) and emits per-field contracts with valid samples + invalidators.
 *
 * Spec: plan 07 §1a — Phase 1a.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FieldConstraints {
  min?: number;
  max?: number;
  format?: 'email' | 'url' | 'uuid' | 'datetime' | 'regex';
  regex?: string;
  enumValues?: (string | number)[];
}

export interface Invalidator {
  kind:
    | 'missing'
    | 'wrong-type'
    | 'empty-string'
    | 'below-min'
    | 'above-max'
    | 'format-violation'
    | 'regex-violation'
    | 'out-of-enum';
  value: unknown;
  expectedErrorField: string;
}

export interface FieldContract {
  name: string;
  type:
    | 'string'
    | 'number'
    | 'boolean'
    | 'array'
    | 'object'
    | 'enum'
    | 'literal'
    | 'union'
    | 'unknown';
  required: boolean;
  constraints: FieldConstraints;
  samples: {
    valid: unknown;
    invalidators: Invalidator[];
  };
}

export interface SchemaContract {
  schemaRef: string;
  fields: FieldContract[];
  sampleValid: Record<string, unknown>;
  diagnostics?: string[];
}

// ---------------------------------------------------------------------------
// Deterministic seed helpers
// ---------------------------------------------------------------------------

function hashSeed(schemaRef: string): number {
  const hash = createHash('sha256').update(schemaRef).digest();
  // Read first 4 bytes as unsigned 32-bit integer
  return hash.readUInt32BE(0);
}

function deterministicString(seed: number, length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  let s = seed;
  for (let i = 0; i < length; i++) {
    result += chars[s % chars.length];
    s = ((s * 1103515245 + 12345) >>> 0) % 2147483648;
  }
  return result;
}

function deterministicEmail(seed: number): string {
  const local = `gen-${seed.toString(16).slice(0, 8)}`;
  return `${local}@example.com`;
}

function deterministicUrl(seed: number): string {
  const slug = `gen-${seed.toString(16).slice(0, 8)}`;
  return `https://example.com/${slug}`;
}

function deterministicUuid(seed: number): string {
  // Deterministic UUID v4 from seed
  const hex = seed.toString(16).padStart(8, '0');
  const h = hex.repeat(4).slice(0, 32);
  // Set version (4) and variant (8-b)
  const parts = [
    h.slice(0, 8),
    h.slice(8, 12),
    '4' + h.slice(13, 16),
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ];
  return parts.join('-');
}

function deterministicNumber(seed: number, min?: number, max?: number): number {
  const lo = min ?? 0;
  const hi = max ?? 1000;
  return lo + (seed % (hi - lo + 1));
}

// ---------------------------------------------------------------------------
// Zod chain parser — regex-based static analysis
// ---------------------------------------------------------------------------

interface ParsedField {
  name: string;
  type: FieldContract['type'];
  required: boolean;
  constraints: FieldConstraints;
  chainSource: string;
}

/**
 * Extract balanced brace content starting at `pos` in `src`.
 * `src[pos]` must be '{' or '('.
 */
function extractBalanced(src: string, pos: number, open = '{', close = '}'): string {
  if (src[pos] !== open) return '';
  let depth = 1;
  let i = pos + 1;
  while (i < src.length && depth > 0) {
    if (src[i] === open) depth++;
    else if (src[i] === close) depth--;
    i++;
  }
  return src.slice(pos + 1, i - 1);
}

/**
 * Find the source text for a given exported `z.object({...})` declaration.
 */
function findSchemaDeclaration(source: string, symbolName: string): string | null {
  // Match: export const <name> = z.object({...})
  // We need to find the z.object( and then extract the balanced parens
  const declRegex = new RegExp(
    `(?:export\\s+)?(?:const|let|var)\\s+${escapeRegex(symbolName)}\\s*=\\s*`,
    'g',
  );
  const match = declRegex.exec(source);
  if (!match) return null;
  const afterDecl = source.slice(match.index + match[0].length);
  // Find end of statement: next semicolon at depth 0 or end of file
  let depth = 0;
  let i = 0;
  while (i < afterDecl.length) {
    const ch = afterDecl[i];
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
    else if (ch === ';' && depth === 0) break;
    i++;
  }
  return afterDecl.slice(0, i);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse a z.object({...}) body into field entries.
 */
function parseObjectFields(objectBody: string, prefix: string): ParsedField[] {
  const fields: ParsedField[] = [];
  // Tokenize the object body into key: chain pairs
  // Strategy: scan for `identifier:` at depth 0
  const entries = splitObjectEntries(objectBody);

  for (const entry of entries) {
    const colonIdx = entry.indexOf(':');
    if (colonIdx === -1) continue;
    const fieldName = entry.slice(0, colonIdx).trim();
    const chain = entry.slice(colonIdx + 1).trim();
    const dottedName = prefix ? `${prefix}.${fieldName}` : fieldName;
    const parsed = parseZodChain(chain, dottedName);
    if (parsed.type === 'object') {
      // Recurse into nested object
      const innerObjMatch = chain.match(/z\.object\s*\(/);
      if (innerObjMatch) {
        const parenStart = chain.indexOf('(', innerObjMatch.index!);
        const inner = extractBalanced(chain, parenStart, '(', ')');
        // inner is the content inside z.object(...), which should start with {
        const braceStart = inner.indexOf('{');
        if (braceStart !== -1) {
          const innerBody = extractBalanced(inner, braceStart);
          const nestedFields = parseObjectFields(innerBody, dottedName);
          fields.push(parsed);
          fields.push(...nestedFields);
          continue;
        }
      }
    }
    fields.push(parsed);
  }

  return fields;
}

/**
 * Split an object literal body into individual `key: value` entries,
 * respecting nesting depth.
 */
function splitObjectEntries(body: string): string[] {
  const entries: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) entries.push(trimmed);
      current = '';
    } else {
      current += ch;
    }
  }
  const trimmed = current.trim();
  if (trimmed) entries.push(trimmed);
  return entries;
}

/**
 * Parse a Zod chain string (e.g. `z.string().email().min(3)`) into a ParsedField.
 */
function parseZodChain(chain: string, name: string): ParsedField {
  const constraints: FieldConstraints = {};
  let type: FieldContract['type'] = 'unknown';
  let required = true;

  // Detect base type — match at the start of the chain to avoid matching
  // nested z.string() calls inside a z.object({...}) body.
  if (/^\s*z\.coerce\.number\s*\(/.test(chain)) type = 'number';
  else if (/^\s*z\.coerce\.string\s*\(/.test(chain)) type = 'string';
  else if (/^\s*z\.coerce\.boolean\s*\(/.test(chain)) type = 'boolean';
  else if (/^\s*z\.string\s*\(/.test(chain)) type = 'string';
  else if (/^\s*z\.number\s*\(/.test(chain)) type = 'number';
  else if (/^\s*z\.boolean\s*\(/.test(chain)) type = 'boolean';
  else if (/^\s*z\.array\s*\(/.test(chain)) type = 'array';
  else if (/^\s*z\.object\s*\(/.test(chain)) type = 'object';
  else if (/^\s*z\.enum\s*\(/.test(chain)) type = 'enum';
  else if (/^\s*z\.literal\s*\(/.test(chain)) type = 'literal';
  else if (/^\s*z\.union\s*\(/.test(chain)) type = 'union';

  // Optional / nullable / default
  if (/\.optional\s*\(/.test(chain)) required = false;
  if (/\.nullable\s*\(/.test(chain)) required = false;
  if (/\.default\s*\(/.test(chain)) required = false;

  // String constraints
  if (type === 'string') {
    if (/\.email\s*\(/.test(chain)) constraints.format = 'email';
    if (/\.url\s*\(/.test(chain)) constraints.format = 'url';
    if (/\.uuid\s*\(/.test(chain)) constraints.format = 'uuid';
    if (/\.datetime\s*\(/.test(chain)) constraints.format = 'datetime';

    const minMatch = chain.match(/\.min\s*\(\s*(\d+)/);
    if (minMatch) constraints.min = parseInt(minMatch[1], 10);

    const maxMatch = chain.match(/\.max\s*\(\s*(\d+)/);
    if (maxMatch) constraints.max = parseInt(maxMatch[1], 10);

    const regexMatch = chain.match(/\.regex\s*\(\s*\/([^/]+)\//);
    if (regexMatch) {
      constraints.format = 'regex';
      constraints.regex = regexMatch[1];
    }
  }

  // Number constraints
  if (type === 'number') {
    const minMatch = chain.match(/\.min\s*\(\s*(-?\d+)/);
    if (minMatch) constraints.min = parseInt(minMatch[1], 10);

    const maxMatch = chain.match(/\.max\s*\(\s*(-?\d+)/);
    if (maxMatch) constraints.max = parseInt(maxMatch[1], 10);

    if (/\.int\s*\(/.test(chain)) {
      // int is a constraint, note it via absence of fractional
    }
    if (/\.positive\s*\(/.test(chain) && constraints.min === undefined) {
      constraints.min = 1;
    }
    if (/\.nonnegative\s*\(/.test(chain) && constraints.min === undefined) {
      constraints.min = 0;
    }
  }

  // Array constraints
  if (type === 'array') {
    const minMatch = chain.match(/\.min\s*\(\s*(\d+)/);
    if (minMatch) constraints.min = parseInt(minMatch[1], 10);

    const maxMatch = chain.match(/\.max\s*\(\s*(\d+)/);
    if (maxMatch) constraints.max = parseInt(maxMatch[1], 10);
  }

  // Enum values
  if (type === 'enum') {
    const enumMatch = chain.match(/z\.enum\s*\(\s*\[([^\]]*)\]/);
    if (enumMatch) {
      const raw = enumMatch[1];
      constraints.enumValues = raw
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
        .map((v) => {
          // Strip quotes
          const strMatch = v.match(/^['"`](.*)['"`]$/);
          if (strMatch) return strMatch[1];
          const numVal = Number(v);
          if (!isNaN(numVal)) return numVal;
          return v;
        });
    }
  }

  return { name, type, required, constraints, chainSource: chain };
}

// ---------------------------------------------------------------------------
// Sample + invalidator generation
// ---------------------------------------------------------------------------

function generateValidSample(
  field: ParsedField,
  seed: number,
): unknown {
  const { type, constraints } = field;

  switch (type) {
    case 'string': {
      if (constraints.format === 'email') return deterministicEmail(seed);
      if (constraints.format === 'url') return deterministicUrl(seed);
      if (constraints.format === 'uuid') return deterministicUuid(seed);
      if (constraints.format === 'datetime') return '2024-01-15T10:30:00.000Z';
      if (constraints.format === 'regex' && constraints.regex) {
        // Declaration-driven: generate a value that satisfies BOTH regex AND max.
        // Use a simple character-class extraction from the regex to produce a
        // valid sample. If the regex declares [A-Z], emit uppercase; if [0-9],
        // emit digits. Respect max constraint when present.
        const maxLen = constraints.max ?? 10;
        const regexStr = constraints.regex;
        // Extract allowed character classes from the regex
        let charPool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (/\[.*0-9.*\]/.test(regexStr) || /\\d/.test(regexStr)) {
          charPool += '0123456789';
        }
        if (/\[.*a-z.*\]/.test(regexStr)) {
          charPool += 'abcdefghijklmnopqrstuvwxyz';
        }
        // If regex requires starting with a letter (e.g. ^[A-Z]), ensure first char is alpha
        const requiresUpperStart = /^\^?\[A-Z/.test(regexStr);
        const targetLen = Math.min(Math.max(constraints.min ?? 1, 3), maxLen);
        let result = '';
        for (let i = 0; i < targetLen; i++) {
          const idx = (seed + i) % charPool.length;
          result += charPool[idx];
        }
        if (requiresUpperStart && !/^[A-Z]/.test(result)) {
          result = 'A' + result.slice(1);
        }
        return result;
      }
      const minLen = constraints.min ?? 1;
      const maxLen = constraints.max ?? Math.max(minLen + 10, 20);
      const targetLen = Math.min(Math.max(minLen, 5), maxLen);
      return deterministicString(seed, targetLen);
    }
    case 'number': {
      return deterministicNumber(seed, constraints.min, constraints.max);
    }
    case 'boolean':
      return true;
    case 'enum':
      return constraints.enumValues?.[0] ?? null;
    case 'literal':
      // Attempt to extract from chain
      return null;
    case 'array': {
      const minItems = constraints.min ?? 0;
      const items: unknown[] = [];
      for (let i = 0; i < Math.max(minItems, 1); i++) {
        items.push(`item-${i}`);
      }
      return items;
    }
    case 'object':
      return {};
    case 'union':
    case 'unknown':
      return `gen-${seed.toString(16).slice(0, 8)}`;
  }
}

function generateInvalidators(
  field: ParsedField,
  seed: number,
): Invalidator[] {
  const { type, constraints, name, required } = field;
  const invalidators: Invalidator[] = [];

  // All required fields get a 'missing' invalidator.
  // Omit `value` entirely — downstream JSON.stringify must produce stable output.
  if (required) {
    invalidators.push({
      kind: 'missing',
      expectedErrorField: name,
    } as Invalidator);
  }

  switch (type) {
    case 'string': {
      invalidators.push({
        kind: 'wrong-type',
        value: 12345,
        expectedErrorField: name,
      });

      // empty-string if min >= 1
      if ((constraints.min ?? 0) >= 1) {
        invalidators.push({
          kind: 'empty-string',
          value: '',
          expectedErrorField: name,
        });
      }

      // below-min: 1 char shy
      if (constraints.min !== undefined && constraints.min > 1) {
        invalidators.push({
          kind: 'below-min',
          value: deterministicString(seed, constraints.min - 1),
          expectedErrorField: name,
        });
      }

      // above-max: 1 char over
      if (constraints.max !== undefined) {
        invalidators.push({
          kind: 'above-max',
          value: deterministicString(seed, constraints.max + 1),
          expectedErrorField: name,
        });
      }

      // format-violation
      if (constraints.format === 'email') {
        invalidators.push({
          kind: 'format-violation',
          value: 'not-an-email',
          expectedErrorField: name,
        });
      }
      if (constraints.format === 'url') {
        invalidators.push({
          kind: 'format-violation',
          value: 'not-a-url',
          expectedErrorField: name,
        });
      }
      if (constraints.format === 'uuid') {
        invalidators.push({
          kind: 'format-violation',
          value: 'not-a-uuid',
          expectedErrorField: name,
        });
      }
      if (constraints.format === 'datetime') {
        invalidators.push({
          kind: 'format-violation',
          value: 'not-a-datetime',
          expectedErrorField: name,
        });
      }

      // regex-violation
      if (constraints.format === 'regex') {
        invalidators.push({
          kind: 'regex-violation',
          value: '!!!invalid!!!',
          expectedErrorField: name,
        });
      }
      break;
    }

    case 'number': {
      invalidators.push({
        kind: 'wrong-type',
        value: 'not-a-number',
        expectedErrorField: name,
      });

      if (constraints.min !== undefined) {
        invalidators.push({
          kind: 'below-min',
          value: constraints.min - 1,
          expectedErrorField: name,
        });
      }

      if (constraints.max !== undefined) {
        invalidators.push({
          kind: 'above-max',
          value: constraints.max + 1,
          expectedErrorField: name,
        });
      }
      break;
    }

    case 'boolean': {
      invalidators.push({
        kind: 'wrong-type',
        value: 'not-a-boolean',
        expectedErrorField: name,
      });
      break;
    }

    case 'enum': {
      invalidators.push({
        kind: 'wrong-type',
        value: 12345,
        expectedErrorField: name,
      });
      invalidators.push({
        kind: 'out-of-enum',
        value: '__INVALID_ENUM_VALUE__',
        expectedErrorField: name,
      });
      break;
    }

    case 'array': {
      invalidators.push({
        kind: 'wrong-type',
        value: 'not-an-array',
        expectedErrorField: name,
      });

      if (constraints.min !== undefined && constraints.min > 0) {
        const tooFew: unknown[] = [];
        for (let i = 0; i < constraints.min - 1; i++) tooFew.push(`item-${i}`);
        invalidators.push({
          kind: 'below-min',
          value: tooFew,
          expectedErrorField: name,
        });
      }

      if (constraints.max !== undefined) {
        const tooMany: unknown[] = [];
        for (let i = 0; i < constraints.max + 1; i++) tooMany.push(`item-${i}`);
        invalidators.push({
          kind: 'above-max',
          value: tooMany,
          expectedErrorField: name,
        });
      }
      break;
    }

    case 'object': {
      invalidators.push({
        kind: 'wrong-type',
        value: 'not-an-object',
        expectedErrorField: name,
      });
      break;
    }

    // union / unknown / literal — minimal invalidators
    default: {
      if (required) {
        invalidators.push({
          kind: 'wrong-type',
          value: null,
          expectedErrorField: name,
        });
      }
    }
  }

  return invalidators;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Introspect a Zod schema from source and produce a deterministic contract.
 *
 * @param schemaPath - Path to the .ts file containing the schema
 * @param symbolName - Exported const name (e.g. 'LoginSchema')
 * @returns SchemaContract with fields, samples, and invalidators
 */
export function zodIntrospect(schemaPath: string, symbolName: string): SchemaContract {
  const source = readFileSync(schemaPath, 'utf-8');
  return zodIntrospectSource(source, schemaPath, symbolName);
}

/**
 * Introspect from source string (testable without filesystem).
 */
export function zodIntrospectSource(
  source: string,
  schemaPath: string,
  symbolName: string,
): SchemaContract {
  const schemaRef = `${schemaPath}:${symbolName}`;
  const seed = hashSeed(schemaRef);
  const diagnostics: string[] = [];

  // Find the schema declaration
  const declBody = findSchemaDeclaration(source, symbolName);
  if (!declBody) {
    return { schemaRef, fields: [], sampleValid: {}, diagnostics: [`Symbol '${symbolName}' not found in source`] };
  }

  // Check if it's a z.object
  if (!/z\.object\s*\(/.test(declBody)) {
    diagnostics.push(`'${symbolName}' is not a z.object() — skipping field extraction`);
    return { schemaRef, fields: [], sampleValid: {}, diagnostics };
  }

  // Check for .refine / .superRefine — we ignore custom refines
  if (/\.refine\s*\(/.test(declBody) || /\.superRefine\s*\(/.test(declBody)) {
    diagnostics.push(`'${symbolName}' uses .refine() — custom refinements are not introspected`);
  }

  // Check for .transform
  if (/\.transform\s*\(/.test(declBody)) {
    diagnostics.push(`'${symbolName}' uses .transform() — transforms are not introspected`);
  }

  // Extract the object body
  const objParenStart = declBody.indexOf('(', declBody.search(/z\.object\s*\(/));
  const objParenContent = extractBalanced(declBody, objParenStart, '(', ')');
  const braceStart = objParenContent.indexOf('{');
  if (braceStart === -1) {
    return { schemaRef, fields: [], sampleValid: {}, diagnostics: [...diagnostics, 'Could not parse z.object body'] };
  }
  const objectBody = extractBalanced(objParenContent, braceStart);

  // Parse fields
  const parsedFields = parseObjectFields(objectBody, '');

  // Build field contracts with deterministic samples
  const fields: FieldContract[] = [];
  const sampleValid: Record<string, unknown> = {};

  for (let i = 0; i < parsedFields.length; i++) {
    const pf = parsedFields[i];
    const fieldSeed = (seed + i * 7919) >>> 0; // deterministic per-field seed

    const validSample = generateValidSample(pf, fieldSeed);
    const invalidators = generateInvalidators(pf, fieldSeed);

    fields.push({
      name: pf.name,
      type: pf.type,
      required: pf.required,
      constraints: pf.constraints,
      samples: {
        valid: validSample,
        invalidators,
      },
    });

    // Build the flat sampleValid (nested objects need dotted-path expansion)
    if (!pf.name.includes('.')) {
      // Top-level field
      if (pf.required || validSample !== undefined) {
        sampleValid[pf.name] = validSample;
      }
    } else {
      // Nested field — set in nested structure
      setNestedValue(sampleValid, pf.name, validSample);
    }
  }

  return {
    schemaRef,
    fields,
    sampleValid,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  };
}

/**
 * Set a value at a dotted path in a nested object.
 */
function setNestedValue(obj: Record<string, unknown>, dottedPath: string, value: unknown): void {
  const parts = dottedPath.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}
