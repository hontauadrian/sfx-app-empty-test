import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Reflector } from '@nestjs/core';
import { getOpenApiSchemas } from '@sfx/validation';
import { COOKIE_ROLES_KEY } from './common/decorators/cookie-role.decorator';
import { COOKIE_CONSUMES_KEY } from './common/decorators/cookie-consumer.decorator';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import type { CookieRoleEntry } from './common/decorators/cookie-role.decorator';
import type { CookieConsumeEntry } from './common/decorators/cookie-consumer.decorator';
// Direct JSON import — resolves at compile time so TypeScript picks up
// the shape, and tsc emits a static require() that works under both
// `node dist/main.js` and `tsx scripts/dump-openapi.ts`.
// Note: `resolveJsonModule: true` must be set in tsconfig (project default).
import pkg from '../package.json';

/**
 * Derive a human-readable title from a package name, preserving the
 * npm scope as a word so "@sfx/api" renders as "Sfx Api" (not just
 * "Api"). Hyphens, underscores and slashes split into separate words.
 */
function prettifyName(name: string): string {
  return name
    .replace(/^@/, '')
    .split(/[-_/]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/**
 * Single source of truth for the Swagger/OpenAPI document config.
 * Title/version/description are pulled from apps/api/package.json so
 * renaming the project (or bumping the API version) is a one-file edit
 * and never drifts between the live `/api/docs-json` and the static
 * dump consumed by offline matrix regen.
 */
export function buildSwaggerDocument(app: INestApplication): ReturnType<typeof SwaggerModule.createDocument> {
  const builder = new DocumentBuilder()
    .setTitle(prettifyName(pkg.name))
    .setVersion(pkg.version)
    .addBearerAuth()
    .addApiKey(
      { type: 'apiKey', name: 'x-api-key', in: 'header' },
      'apiKeyHeader',
    )
    .addApiKey(
      { type: 'apiKey', name: 'api_key', in: 'query' },
      'apiKeyQuery',
    )
    .addBasicAuth();
  if (typeof pkg.description === 'string' && pkg.description.length > 0) {
    builder.setDescription(pkg.description);
  }
  const document = SwaggerModule.createDocument(app, builder.build());
  // Merge every schema registered via `zodToOpenApi(schema, { ref })`
  // into `components.schemas` so `$ref` pointers from `@ApiBody` /
  // `@ApiResponse` decorators resolve. By now every controller has
  // been imported and every decorator has fired.
  const extras = getOpenApiSchemas();
  if (Object.keys(extras).length > 0) {
    document.components = document.components ?? {};
    document.components.schemas = {
      ...(document.components.schemas ?? {}),
      ...(extras as Record<string, object>),
    };
  }

  (document as Record<string, unknown>)['x-response-envelope'] = {
    successWrapper: [...TransformInterceptor.ENVELOPE.successWrapper],
    errorPath: TransformInterceptor.ENVELOPE.errorPath,
  };

  const cookieSessionScheme = document.components?.securitySchemes?.['cookieSession'];
  if (cookieSessionScheme && typeof cookieSessionScheme === 'object') {
    (cookieSessionScheme as unknown as Record<string, unknown>)['x-cookie-role'] = 'session';
  }

  // Reflect cookie:roles and cookie:consumes metadata from controllers
  // into x-cookie-roles / x-cookie-consumes extensions on each operation.
  // Mirrors the existing x-csrf-issuer / x-multi-tenant extension pattern.
  injectCookieMetadata(app, document);

  return document;
}

/**
 * Walk all registered route handlers, read cookie:roles and cookie:consumes
 * metadata via Nest Reflector, and inject x-cookie-roles / x-cookie-consumes
 * extensions into the corresponding OpenAPI operation objects.
 */
function injectCookieMetadata(
  app: INestApplication,
  document: ReturnType<typeof SwaggerModule.createDocument>,
): void {
  const reflector = app.get(Reflector);
  const controllerMap = buildControllerMethodMap(app);

  // For each path+method in the OpenAPI doc, try to find matching controller
  // metadata and inject cookie extensions.
  for (const [, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem) continue;
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = (pathItem as Record<string, unknown>)[method] as
        | (Record<string, unknown> & { operationId?: string })
        | undefined;
      if (!operation) continue;

      const operationId = operation.operationId as string | undefined;
      if (!operationId) continue;

      const handler = controllerMap.get(operationId);
      if (!handler) continue;

      // Read cookie:roles
      const cookieRoles = reflector.get<CookieRoleEntry | undefined>(
        COOKIE_ROLES_KEY,
        handler,
      );
      if (cookieRoles) {
        const existing = (operation['x-cookie-roles'] as CookieRoleEntry[]) ?? [];
        existing.push(cookieRoles);
        operation['x-cookie-roles'] = existing;
      }

      // Read cookie:consumes
      const cookieConsumes = reflector.get<CookieConsumeEntry | undefined>(
        COOKIE_CONSUMES_KEY,
        handler,
      );
      if (cookieConsumes) {
        const existing = (operation['x-cookie-consumes'] as CookieConsumeEntry[]) ?? [];
        existing.push(cookieConsumes);
        operation['x-cookie-consumes'] = existing;
      }
    }
  }
}

/**
 * Build a map of operationId -> method handler function by scanning all
 * controllers registered in the Nest application.
 */
type HandlerFn = (...args: unknown[]) => unknown;

function buildControllerMethodMap(app: INestApplication): Map<string, HandlerFn> {
  const map = new Map<string, HandlerFn>();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Nest internals
    const nestApp = app as any;
    const container = nestApp.container;
    if (!container) return map;

    const modules = container.getModules();

    for (const [, moduleRef] of modules) {
      const controllers = moduleRef.controllers;
      if (!controllers) continue;

      for (const [, controllerRef] of controllers) {
        const controllerInstance = controllerRef.instance;
        if (!controllerInstance) continue;

        const prototype = Object.getPrototypeOf(controllerInstance);
        const methodNames = Object.getOwnPropertyNames(prototype).filter(
          (name) => name !== 'constructor' && typeof prototype[name] === 'function',
        );

        for (const methodName of methodNames) {
          const handler = prototype[methodName];
          // Swagger stores operationId via DECORATORS_API_OPERATION metadata
          const apiOperationMeta = Reflect.getMetadata(
            'swagger/apiOperation',
            handler,
          ) as { operationId?: string } | undefined;

          if (apiOperationMeta?.operationId) {
            map.set(apiOperationMeta.operationId, handler);
          }
        }
      }
    }
  } catch {
    // Non-fatal: if container walk fails, cookie metadata won't be injected
    // but the rest of the spec is still valid.
  }

  return map;
}
