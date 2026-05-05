import { extendZodWithOpenApi, generateSchema } from '@anatine/zod-openapi';
import { z } from 'zod';

// Side-effect: decorate Zod with `.openapi()` once at module load.
extendZodWithOpenApi(z);

type OpenApiSchemaObject = ReturnType<typeof generateSchema>;

// Registry of named schemas, populated as a side-effect of calling
// `zodToOpenApi(schema, { ref })` — typically at decorator-evaluation
// time while the NestJS module graph is constructed. By the time
// `SwaggerModule.createDocument()` runs in bootstrap, every controller
// has been imported, so every `@ApiBody`/`@ApiResponse` decorator has
// already fired and the registry is complete.
const registry = new Map<string, OpenApiSchemaObject>();

/**
 * Convert a Zod schema to an OpenAPI 3.0 schema object.
 *
 * Without `opts.ref`, the full schema is returned and is typically
 * inlined into an `@ApiBody` / `@ApiResponse` decorator.
 *
 * With `opts.ref`, the schema is registered under that name in the
 * internal registry and a `{ $ref: '#/components/schemas/<name>' }`
 * reference is returned instead. The caller is responsible for
 * merging `getOpenApiSchemas()` into `document.components.schemas`
 * at bootstrap (see `apps/api/src/swagger.ts`).
 *
 * Used by controllers with:
 *   @ApiBody({ schema: zodToOpenApi(mySchema) as never })
 *   @ApiBody({ schema: zodToOpenApi(mySchema, { ref: 'MyInput' }) as never })
 */
export function zodToOpenApi(
  schema: z.ZodTypeAny,
  opts?: { ref?: string },
): OpenApiSchemaObject {
  if (opts?.ref) {
    if (!registry.has(opts.ref)) {
      registry.set(opts.ref, generateSchema(schema));
    }
    // Cast: the runtime value is a $ref object; consumers treat the
    // return type as "an OpenAPI schema-or-ref" regardless.
    return { $ref: `#/components/schemas/${opts.ref}` } as unknown as OpenApiSchemaObject;
  }
  return generateSchema(schema);
}

/**
 * Returns a snapshot of every schema registered via
 * `zodToOpenApi(schema, { ref })`. Merge into the Swagger document at
 * bootstrap so the `$ref`s resolve.
 */
export function getOpenApiSchemas(): Record<string, OpenApiSchemaObject> {
  return Object.fromEntries(registry);
}

/**
 * Test-only: clear the registry. Exported so test suites can start from
 * a clean slate when asserting registration behaviour.
 */
export function __resetOpenApiRegistry(): void {
  registry.clear();
}
