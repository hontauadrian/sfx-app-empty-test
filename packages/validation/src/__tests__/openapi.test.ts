import { z } from 'zod';
import {
  zodToOpenApi,
  zodApiBody,
  getOpenApiSchemas,
  __resetOpenApiRegistry,
} from '../openapi';

// @anatine/zod-openapi emits OpenAPI 3.1 shapes, where `type` can be a string
// or an array of strings (e.g. ['string', 'null']).
function typeMatches(actual: unknown, expected: string): boolean {
  if (actual === expected) return true;
  return Array.isArray(actual) && actual.includes(expected);
}

describe('zodToOpenApi', () => {
  it('converts a primitive string schema to an OpenAPI schema', () => {
    const schema = z.string();
    const result = zodToOpenApi(schema) as { type: string | string[] };
    expect(typeMatches(result.type, 'string')).toBe(true);
  });

  it('converts an object schema with required fields', () => {
    const schema = z.object({
      email: z.string().email(),
      name: z.string().min(1),
    });
    const result = zodToOpenApi(schema) as {
      type: string | string[];
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(typeMatches(result.type, 'object')).toBe(true);
    expect(Object.keys(result.properties)).toEqual(
      expect.arrayContaining(['email', 'name']),
    );
    expect(result.required).toEqual(expect.arrayContaining(['email', 'name']));
  });

  it('preserves optional fields as non-required', () => {
    const schema = z.object({
      email: z.string(),
      avatarUrl: z.string().optional(),
    });
    const result = zodToOpenApi(schema) as { required?: string[] };
    expect(result.required).toContain('email');
    expect(result.required ?? []).not.toContain('avatarUrl');
  });

  describe('with { ref } option', () => {
    beforeEach(() => {
      __resetOpenApiRegistry();
    });

    it('returns a $ref pointer when ref is provided', () => {
      const schema = z.object({ email: z.string() });
      const result = zodToOpenApi(schema, { ref: 'CreateUserInput' }) as {
        $ref?: string;
      };
      expect(result.$ref).toBe('#/components/schemas/CreateUserInput');
    });

    it('registers the schema under the given ref name', () => {
      const schema = z.object({ email: z.string().email() });
      zodToOpenApi(schema, { ref: 'CreateUserInput' });
      const schemas = getOpenApiSchemas();
      expect(schemas).toHaveProperty('CreateUserInput');
      const registered = schemas.CreateUserInput as {
        type: string | string[];
        properties: Record<string, unknown>;
      };
      expect(typeMatches(registered.type, 'object')).toBe(true);
      expect(registered.properties).toHaveProperty('email');
    });

    it('does not overwrite an existing registration on second call', () => {
      const schemaA = z.object({ email: z.string() });
      const schemaB = z.object({ email: z.string(), extra: z.string() });
      zodToOpenApi(schemaA, { ref: 'Shared' });
      zodToOpenApi(schemaB, { ref: 'Shared' });
      const registered = getOpenApiSchemas().Shared as {
        properties: Record<string, unknown>;
      };
      // First registration wins — later callers see the same shape.
      expect(Object.keys(registered.properties)).toEqual(['email']);
    });

    it('returns inline schema (not $ref) when ref is omitted', () => {
      const schema = z.object({ email: z.string() });
      const result = zodToOpenApi(schema) as {
        $ref?: string;
        type?: string | string[];
      };
      expect(result.$ref).toBeUndefined();
      expect(typeMatches(result.type, 'object')).toBe(true);
    });

    it('getOpenApiSchemas is empty after reset', () => {
      zodToOpenApi(z.object({ a: z.string() }), { ref: 'Tmp' });
      expect(Object.keys(getOpenApiSchemas())).toContain('Tmp');
      __resetOpenApiRegistry();
      expect(Object.keys(getOpenApiSchemas())).toHaveLength(0);
    });
  });

  describe('zodApiBody helper', () => {
    beforeEach(() => {
      __resetOpenApiRegistry();
    });

    it('registers the schema and returns the @ApiBody-shaped wrapper', () => {
      const schema = z.object({ name: z.string().min(1) });
      const result = zodApiBody(schema, 'CreateTeamInput');
      expect(result).toEqual({
        schema: { $ref: '#/components/schemas/CreateTeamInput' },
      });
      expect(getOpenApiSchemas()).toHaveProperty('CreateTeamInput');
    });

    it('the registered schema preserves required fields', () => {
      const schema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      });
      zodApiBody(schema, 'X');
      const registered = getOpenApiSchemas().X as { required?: string[] };
      expect(registered.required).toContain('name');
      expect(registered.required ?? []).not.toContain('description');
    });

    it('spreads opts.extensions onto the returned ApiBody object', () => {
      const schema = z.object({ name: z.string().min(1) });
      const result = zodApiBody(schema, 'WithExt', {
        extensions: { 'x-probe-unique-fields': ['name'] },
      }) as { schema: { $ref: string }; 'x-probe-unique-fields'?: string[] };
      expect(result.schema.$ref).toBe('#/components/schemas/WithExt');
      expect(result['x-probe-unique-fields']).toEqual(['name']);
    });

    it('omits extension keys when opts.extensions is not provided', () => {
      const schema = z.object({ name: z.string() });
      const result = zodApiBody(schema, 'NoExt') as Record<string, unknown>;
      expect(Object.keys(result)).toEqual(['schema']);
    });

    it('eliminates the dangling-$ref class of bug', () => {
      // The bug class: hand-written `{ $ref: '...' }` without a paired
      // `zodToOpenApi(schema, { ref })`. Using the helper, that path is
      // unreachable: the $ref is only produced when the schema is also
      // registered in the same call.
      const schema = z.object({ name: z.string() });
      const before = Object.keys(getOpenApiSchemas());
      const result = zodApiBody(schema, 'NoOrphanRef');
      const after = Object.keys(getOpenApiSchemas());
      expect(after).toContain('NoOrphanRef');
      expect(result.schema.$ref).toBe('#/components/schemas/NoOrphanRef');
      expect(after.length).toBe(before.length + 1);
    });
  });

  it('propagates .openapi() descriptions and examples', () => {
    const schema = z
      .object({
        email: z.string().openapi({ description: 'User email', example: 'x@y.com' }),
      })
      .openapi({ description: 'User creation payload' });
    const result = zodToOpenApi(schema) as {
      description?: string;
      properties: { email: { description?: string; example?: string } };
    };
    expect(result.description).toBe('User creation payload');
    expect(result.properties.email.description).toBe('User email');
    expect(result.properties.email.example).toBe('x@y.com');
  });
});
