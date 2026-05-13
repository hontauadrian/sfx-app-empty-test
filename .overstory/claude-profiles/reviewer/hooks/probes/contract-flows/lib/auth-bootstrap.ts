/**
 * contract-flows/lib/auth-bootstrap.ts
 *
 * Walks the merged contract's `actors:` map and produces an `ActorTokens`
 * map BEFORE the flow batch runs (Phase 1 §A.2). Replaces the
 * single-bearer model used by earlier ad-hoc HTTP probes.
 *
 * Auth scheme is read from `actor.auth`. Recognised shapes:
 *
 *   - { scheme: 'bearer-in-body', register?: { path, body, key }, login: { path, body, key } }
 *       Optional register call (409 → fall through to login). Login response
 *       body is JSON-pathed via `key` (default '$.accessToken').
 *
 *   - { scheme: 'bearer-in-header', login: { path, body, headerName? } }
 *       Login response Authorization header (or custom `headerName`) becomes
 *       the bearer.
 *
 *   - { scheme: 'cookie', login: { path, body } }
 *       Login response Set-Cookie headers populate the actor's cookie jar.
 *
 *   - { scheme: 'api-key', headerName, value }
 *       No network call; value is stored as-is.
 *
 *   - { scheme: 'oauth-scoped', tokenEndpoint, scopes: string[],
 *       clientId, clientSecret, audience? }
 *       For each scope, POST client_credentials with that scope and store
 *       the access_token in scopedBearers[scope].
 *
 *   - { scheme: 'anonymous' }  — no-op, used by the reserved `anonymous` actor.
 *
 * The bootstrap is non-fatal: each actor failure becomes an
 * AUTH_BOOTSTRAP_ACTOR_FAILED diagnostic, and flows referencing that
 * actor are excluded by the caller.
 *
 * NEVER:
 *   - Logs credentials, tokens, or response bodies in clear.
 *   - Retries on a failed login (silent retry masks broken contracts).
 *   - Reuses an actor's credential for another actor.
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import type { MergedContract } from '../contract-flows-merger';
import type {
  TypedError,
  FlowAuthBootstrapActorFailedError,
} from '../errors';
import type { CookieJar } from './adapters/cookie-jar';
import { createCookieJar } from './adapters/cookie-jar';

export interface ActorCredential {
  bearer?: string;
  cookieJar?: CookieJar;
  apiKey?: { headerName: string; value: string };
  scopedBearers?: Record<string /* scope */, string>;
}

export interface ActorTokens { [actorName: string]: ActorCredential }

export interface BootstrapOptions {
  baseUrl: string;
  /** Override hook for tests. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** Wall-clock cap per actor login (incl. register). Default 5_000ms. */
  perActorTimeoutMs?: number;
}

export interface BootstrapResult {
  tokens: ActorTokens;
  diagnostics: TypedError[];
}

const RESERVED_ANONYMOUS = 'anonymous';

function readJsonPath(body: unknown, path: string): unknown {
  // Minimal JSONPath subset: '$', '$.field', '$.a.b.c', '$.a[0]'.
  if (!path || path === '$') return body;
  if (path.startsWith('$.')) path = path.slice(2);
  else if (path.startsWith('$[')) path = path.slice(1);
  let cur: unknown = body;
  // Tokenise dots and bracket indices.
  const tokens = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((t) => t.length > 0);
  for (const tok of tokens) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[tok];
  }
  return cur;
}

async function timed<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function joinUrl(base: string, path: string): string {
  path = resolveEnvPlaceholders(path);
  if (/^https?:\/\//i.test(path)) return path;
  if (base.endsWith('/') && path.startsWith('/')) return base + path.slice(1);
  if (!base.endsWith('/') && !path.startsWith('/')) return base + '/' + path;
  return base + path;
}

function resolveEnvPlaceholders(value: string): string {
  return value.replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
    return readRuntimeEnvValue(name) ?? '';
  });
}

function readRuntimeEnvValue(key: string): string | undefined {
  const liveValue = process.env[key];
  if (liveValue) return liveValue;
  return readStackRuntimeEnvValue(key);
}

function readStackRuntimeEnvValue(key: string): string | undefined {
  const projectRoot = process.cwd();
  const stackPath = path.join(projectRoot, '.stack.json');
  if (!fs.existsSync(stackPath)) return undefined;
  try {
    const stack = JSON.parse(fs.readFileSync(stackPath, 'utf8')) as {
      is_worktree?: unknown;
      keycloak_port?: unknown;
      proxy_port?: unknown;
      oauth_issuer_url?: unknown;
      oauth_jwks_url?: unknown;
      oauth2_proxy_redirect_url?: unknown;
    };
    if (stack.is_worktree !== true) return undefined;

    if (key === 'OAUTH_ISSUER_URL' && typeof stack.oauth_issuer_url === 'string') {
      return stack.oauth_issuer_url;
    }
    if (key === 'OAUTH_JWKS_URL' && typeof stack.oauth_jwks_url === 'string') {
      return stack.oauth_jwks_url;
    }
    if (key === 'OAUTH2_PROXY_REDIRECT_URL' && typeof stack.oauth2_proxy_redirect_url === 'string') {
      return stack.oauth2_proxy_redirect_url;
    }

    const realmName = deriveRealmNameFromPackage(projectRoot);
    if (key === 'OAUTH_ISSUER_URL' && typeof stack.keycloak_port === 'number') {
      return `http://keycloak.localtest.me:${stack.keycloak_port}/realms/${realmName}`;
    }
    if (key === 'OAUTH_JWKS_URL' && typeof stack.keycloak_port === 'number') {
      return `http://keycloak.localtest.me:${stack.keycloak_port}/realms/${realmName}/protocol/openid-connect/certs`;
    }
    if (key === 'OAUTH2_PROXY_REDIRECT_URL' && typeof stack.proxy_port === 'number') {
      return `http://app.localtest.me:${stack.proxy_port}/oauth2/callback`;
    }
    if (key === 'OAUTH2_PROXY_CLIENT_ID') return `${realmName}-dev-proxy`;
    if (key === 'OAUTH_API_CLIENT_ID' || key === 'OAUTH_AUDIENCE') return `${realmName}-dev-api`;
  } catch {
    return undefined;
  }
  return undefined;
}

function deriveRealmNameFromPackage(projectRoot: string): string {
  const packagePath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packagePath)) return 'sfx-webapp-boilerplate';
  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { name?: unknown };
    const rawName = typeof packageJson.name === 'string'
      ? packageJson.name.split('/').pop() ?? packageJson.name
      : 'sfx-webapp-boilerplate';
    const normalizedName = rawName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return normalizedName || 'sfx-webapp-boilerplate';
  } catch {
    return 'sfx-webapp-boilerplate';
  }
}

function resolveEnvPlaceholdersInValue(value: unknown): unknown {
  if (typeof value === 'string') return resolveEnvPlaceholders(value);
  if (Array.isArray(value)) return value.map((item) => resolveEnvPlaceholdersInValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        resolveEnvPlaceholdersInValue(nestedValue),
      ]),
    );
  }
  return value;
}

function buildPostBody(
  body: unknown,
  contentType: string | undefined,
): { headers: Record<string, string>; body: string } {
  const resolvedBody = resolveEnvPlaceholdersInValue(body ?? {});
  if (contentType === 'application/x-www-form-urlencoded') {
    const params = new URLSearchParams();
    if (resolvedBody && typeof resolvedBody === 'object' && !Array.isArray(resolvedBody)) {
      for (const [key, value] of Object.entries(resolvedBody)) {
        if (value !== undefined && value !== null) params.set(key, String(value));
      }
    }
    return {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    };
  }

  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(resolvedBody),
  };
}

function failure(actorName: string, scheme: string, reason: string): FlowAuthBootstrapActorFailedError {
  return {
    code: 'FLOW_AUTH_BOOTSTRAP_ACTOR_FAILED',
    actorName,
    scheme,
    reason,
    sourceFile: '',
    message: `Auth bootstrap failed for actor '${actorName}' (scheme '${scheme}'): ${reason}`,
  };
}

/**
 * Recursively wrap every nested z.object() in a schema with .strict() so
 * unknown keys at any depth surface as `unrecognized_keys` issues. Used
 * only for drift detection — the original (lenient) schema is still what
 * the handler dispatches against.
 */
function makeStrictRecursive(schema: z.ZodTypeAny): z.ZodTypeAny {
  const def = (schema as { _def?: { typeName?: string; shape?: () => Record<string, z.ZodTypeAny>; innerType?: z.ZodTypeAny } })._def;
  if (!def) return schema;
  if (def.typeName === 'ZodObject' && typeof def.shape === 'function') {
    const shape = def.shape();
    const newShape: Record<string, z.ZodTypeAny> = {};
    for (const [k, v] of Object.entries(shape)) newShape[k] = makeStrictRecursive(v);
    return z.object(newShape).strict();
  }
  if (def.innerType) {
    // ZodOptional / ZodNullable / ZodDefault — recurse into inner.
    const inner = makeStrictRecursive(def.innerType);
    if (def.typeName === 'ZodOptional') return inner.optional();
    if (def.typeName === 'ZodNullable') return inner.nullable();
  }
  return schema;
}

interface ActorAuth {
  scheme: string;
  [k: string]: unknown;
}

async function bootstrapBearerInBody(
  actorName: string,
  auth: ActorAuth,
  base: string,
  fetchImpl: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<{ credential?: ActorCredential; error?: TypedError }> {
  const register = auth.register as { path?: string; body?: unknown; key?: string; contentType?: string } | undefined;
  const login = auth.login as { path: string; body: unknown; key?: string; contentType?: string } | undefined;
  if (!login || !login.path) {
    return { error: failure(actorName, 'bearer-in-body', 'login.path is required') };
  }

  // Optional register; 4xx (especially 409) is treated as "already exists" → fall through.
  if (register && register.path) {
    try {
      const registerBody = buildPostBody(register.body, register.contentType);
      await timed(
        fetchImpl(joinUrl(base, register.path), {
          method: 'POST',
          headers: registerBody.headers,
          body: registerBody.body,
        }),
        timeoutMs,
        `register('${actorName}')`,
      );
      // Ignore status — login is the authoritative step.
    } catch (e: unknown) {
      // Register network error is non-fatal IF login succeeds; we
      // continue and let login report the real error.
      void e;
    }
  }

  let res: Response;
  try {
    const loginBody = buildPostBody(login.body, login.contentType);
    res = await timed(
      fetchImpl(joinUrl(base, login.path), {
        method: 'POST',
        headers: loginBody.headers,
        body: loginBody.body,
      }),
      timeoutMs,
      `login('${actorName}')`,
    );
  } catch (e: unknown) {
    return { error: failure(actorName, 'bearer-in-body', `login network error: ${(e as Error).message}`) };
  }
  if (!res.ok) {
    return { error: failure(actorName, 'bearer-in-body', `login returned status ${res.status}`) };
  }

  let body: unknown;
  try { body = await res.json(); } catch (e: unknown) {
    return { error: failure(actorName, 'bearer-in-body', `login response not JSON: ${(e as Error).message}`) };
  }
  const key = login.key ?? '$.accessToken';
  const tok = readJsonPath(body, key);
  if (typeof tok !== 'string' || tok.length === 0) {
    return { error: failure(actorName, 'bearer-in-body', `JSONPath '${key}' did not resolve to a non-empty string in login response`) };
  }
  return { credential: { bearer: tok } };
}

async function bootstrapBearerInHeader(
  actorName: string,
  auth: ActorAuth,
  base: string,
  fetchImpl: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<{ credential?: ActorCredential; error?: TypedError }> {
  const login = auth.login as { path: string; body: unknown; headerName?: string; contentType?: string } | undefined;
  if (!login || !login.path) {
    return { error: failure(actorName, 'bearer-in-header', 'login.path is required') };
  }
  let res: Response;
  try {
    const loginBody = buildPostBody(login.body, login.contentType);
    res = await timed(
      fetchImpl(joinUrl(base, login.path), {
        method: 'POST',
        headers: loginBody.headers,
        body: loginBody.body,
      }),
      timeoutMs,
      `login('${actorName}')`,
    );
  } catch (e: unknown) {
    return { error: failure(actorName, 'bearer-in-header', `login network error: ${(e as Error).message}`) };
  }
  if (!res.ok) {
    return { error: failure(actorName, 'bearer-in-header', `login returned status ${res.status}`) };
  }
  const headerName = (login.headerName ?? 'Authorization').toLowerCase();
  const raw = res.headers.get(headerName);
  if (!raw) {
    return { error: failure(actorName, 'bearer-in-header', `response is missing '${headerName}' header`) };
  }
  // Strip optional 'Bearer ' prefix; store the token alone.
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (token.length === 0) {
    return { error: failure(actorName, 'bearer-in-header', `'${headerName}' header was empty`) };
  }
  return { credential: { bearer: token } };
}

async function bootstrapCookie(
  actorName: string,
  auth: ActorAuth,
  base: string,
  fetchImpl: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<{ credential?: ActorCredential; error?: TypedError }> {
  const login = auth.login as { path: string; body: unknown; contentType?: string } | undefined;
  if (!login || !login.path) {
    return { error: failure(actorName, 'cookie', 'login.path is required') };
  }
  let res: Response;
  const url = joinUrl(base, login.path);
  try {
    const loginBody = buildPostBody(login.body, login.contentType);
    res = await timed(
      fetchImpl(url, {
        method: 'POST',
        headers: loginBody.headers,
        body: loginBody.body,
      }),
      timeoutMs,
      `login('${actorName}')`,
    );
  } catch (e: unknown) {
    return { error: failure(actorName, 'cookie', `login network error: ${(e as Error).message}`) };
  }
  if (!res.ok) {
    return { error: failure(actorName, 'cookie', `login returned status ${res.status}`) };
  }
  const jar = createCookieJar();
  // Iterate Set-Cookie headers — node-fetch / undici exposes them via
  // `headers.getSetCookie()` if available; fall back to `headers.raw()`
  // OR a single `set-cookie` line.
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  let setCookies: string[] = [];
  if (typeof anyHeaders.getSetCookie === 'function') {
    setCookies = anyHeaders.getSetCookie();
  } else {
    const single = res.headers.get('set-cookie');
    if (single) setCookies = [single];
  }
  if (setCookies.length === 0) {
    return { error: failure(actorName, 'cookie', 'login response had no Set-Cookie headers') };
  }
  for (const sc of setCookies) jar.setCookie(sc, url);
  return { credential: { cookieJar: jar } };
}

function bootstrapApiKey(
  actorName: string,
  auth: ActorAuth,
): { credential?: ActorCredential; error?: TypedError } {
  const headerName = auth.headerName as string | undefined;
  const value = typeof auth.value === 'string' ? resolveEnvPlaceholders(auth.value) : undefined;
  if (!headerName || !value) {
    return { error: failure(actorName, 'api-key', 'headerName and value are required') };
  }
  return { credential: { apiKey: { headerName, value } } };
}

async function bootstrapOauthScoped(
  actorName: string,
  auth: ActorAuth,
  base: string,
  fetchImpl: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<{ credential?: ActorCredential; error?: TypedError }> {
  const tokenEndpoint = typeof auth.tokenEndpoint === 'string'
    ? resolveEnvPlaceholders(auth.tokenEndpoint)
    : undefined;
  const scopes = auth.scopes as string[] | undefined;
  const clientId = typeof auth.clientId === 'string' ? resolveEnvPlaceholders(auth.clientId) : undefined;
  const clientSecret = typeof auth.clientSecret === 'string' ? resolveEnvPlaceholders(auth.clientSecret) : undefined;
  const audience = typeof auth.audience === 'string' ? resolveEnvPlaceholders(auth.audience) : undefined;
  if (!tokenEndpoint || !scopes || scopes.length === 0 || !clientId || !clientSecret) {
    return { error: failure(actorName, 'oauth-scoped', 'tokenEndpoint, scopes, clientId, clientSecret are required') };
  }
  const scopedBearers: Record<string, string> = {};
  for (const scope of scopes) {
    const params = new URLSearchParams();
    params.set('grant_type', 'client_credentials');
    params.set('client_id', clientId);
    params.set('client_secret', clientSecret);
    params.set('scope', scope);
    if (audience) params.set('audience', audience);
    let res: Response;
    try {
      res = await timed(
        fetchImpl(joinUrl(base, tokenEndpoint), {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        }),
        timeoutMs,
        `oauth('${actorName}','${scope}')`,
      );
    } catch (e: unknown) {
      return { error: failure(actorName, 'oauth-scoped', `scope '${scope}' network error: ${(e as Error).message}`) };
    }
    if (!res.ok) {
      return { error: failure(actorName, 'oauth-scoped', `scope '${scope}' returned status ${res.status}`) };
    }
    let body: unknown;
    try { body = await res.json(); } catch (e: unknown) {
      return { error: failure(actorName, 'oauth-scoped', `scope '${scope}' response not JSON: ${(e as Error).message}`) };
    }
    const tok = readJsonPath(body, '$.access_token');
    if (typeof tok !== 'string' || tok.length === 0) {
      return { error: failure(actorName, 'oauth-scoped', `scope '${scope}' missing access_token in response`) };
    }
    scopedBearers[scope] = tok;
  }
  return { credential: { scopedBearers } };
}

export async function bootstrapActors(
  contract: MergedContract,
  options: BootstrapOptions,
): Promise<BootstrapResult> {
  const tokens: ActorTokens = {};
  const diagnostics: TypedError[] = [];
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.perActorTimeoutMs ?? 5_000;

  // Reserved anonymous actor: no credentials. Created always so flows can
  // reference it without being a declared actor.
  tokens[RESERVED_ANONYMOUS] = {};

  for (const [name, attributed] of contract.actors) {
    const auth = attributed.actor.auth as ActorAuth;
    const scheme = (auth?.scheme as string) ?? 'unknown';

    if (name === RESERVED_ANONYMOUS || scheme === 'anonymous') {
      tokens[name] = {};
      continue;
    }

    // Dispatch via the central registry (single source of truth shared with
    // `contract-flows-schema.ts`'s discriminated union). Adding a new scheme
    // = single edit to AUTH_SCHEME_REGISTRY at the bottom of this file.
    let result: { credential?: ActorCredential; error?: TypedError };
    const entry = AUTH_SCHEME_REGISTRY[scheme as AuthSchemeName];
    if (!entry) {
      result = {
        error: failure(
          name,
          scheme,
          `unknown auth scheme '${scheme}' (allowed: ${Object.keys(AUTH_SCHEME_REGISTRY).join(', ')})`,
        ),
      };
    } else {
      result = await entry.handler(name, auth, options.baseUrl, fetchImpl, timeoutMs);
    }

    // Schema drift detection: schemas in AUTH_SCHEME_REGISTRY define the
    // exact set of allowed fields per scheme + nested block. zod's default
    // parse silently drops unknown keys at the loader stage, so by the
    // time we reach this dispatch the typo (e.g. `tokenPath` instead of
    // `key`) is already gone from `auth`. Re-read the raw JSON from the
    // source file for THIS actor and run a .strict() recursive parse
    // against the same schema to surface the typo. Handler still runs
    // (and may fail with the original symptom), but the agent now sees
    // the schema-drift line first and knows exactly which lead-owned
    // file to point at.
    if (entry && attributed.sourceFile) {
      let rawActorAuth: unknown;
      try {
        const rawJson = JSON.parse(fs.readFileSync(attributed.sourceFile, 'utf8')) as { actors?: { name?: string; auth?: unknown }[] };
        const rawActor = (rawJson.actors || []).find((x) => x && x.name === name);
        rawActorAuth = rawActor && rawActor.auth;
      } catch {
        rawActorAuth = undefined;
      }
      const strictSchema = makeStrictRecursive(entry.schema);
      const strictResult = rawActorAuth !== undefined ? strictSchema.safeParse(rawActorAuth) : { success: true } as { success: true };
      if (!strictResult.success) {
        const unknownKeys: string[] = [];
        for (const issue of strictResult.error.issues) {
          if (issue.code === 'unrecognized_keys' && Array.isArray((issue as z.ZodIssue & { keys?: string[] }).keys)) {
            const path = issue.path.length > 0 ? `auth.${issue.path.join('.')}` : 'auth';
            for (const k of (issue as z.ZodIssue & { keys: string[] }).keys) {
              unknownKeys.push(`${path}.${k}`);
            }
          }
        }
        if (unknownKeys.length > 0) {
          diagnostics.push({
            code: 'FLOW_AUTH_BOOTSTRAP_ACTOR_FAILED',
            actorName: name,
            scheme,
            reason: `actor schema drift: unknown fields ${unknownKeys.join(', ')} for scheme '${scheme}'. Allowed fields are defined in the zod schema for this scheme — verify the actor block (most common typo: 'tokenPath' instead of 'key' on bearer-in-body login).`,
            sourceFile: attributed.sourceFile || '',
            message: `Auth bootstrap schema drift for actor '${name}' (scheme '${scheme}'): unknown ${unknownKeys.join(', ')} [declared in ${attributed.sourceFile || 'unknown'} — lead-owned]`,
          });
        }
      }
    }

    if (result.credential) {
      tokens[name] = result.credential;
    }
    if (result.error) {
      // Attach sourceFile so the agent reading the diagnostic knows which
      // flow file (lead-owned) declared the broken actor and can mail
      // lead with the precise file path. AttributedActor already carries
      // sourceFile from the contract-flows-merger.
      const errWithSource = result.error as FlowAuthBootstrapActorFailedError;
      if (errWithSource && errWithSource.code === 'FLOW_AUTH_BOOTSTRAP_ACTOR_FAILED') {
        errWithSource.sourceFile = attributed.sourceFile || '';
        errWithSource.message = `${errWithSource.message} [declared in ${attributed.sourceFile || 'unknown'} — lead-owned, mail lead with this diagnostic]`;
      }
      diagnostics.push(result.error);
    }
  }

  return { tokens, diagnostics };
}

// =============================================================================
// AUTH_SCHEME_REGISTRY — single source of truth for runner + validator.
//
// Each entry pairs a Zod schema (validates the actor.auth shape — used at
// pre-edit time by `validate-flow-file.js` AND at contract-load time by
// `contract-flows-loader.ts` via `ContractFileSchema`) with a handler
// (executes the login at probe-bootstrap time, above).
//
// Adding a new scheme requires exactly ONE edit here:
//   1) define the variant `<Name>AuthSchema` (literal `scheme` discriminator
//      + only the fields the handler reads — match the destructuring in the
//      bootstrap function above).
//   2) implement the bootstrap handler returning { credential?, error? }.
//   3) add the `'<scheme-name>': { schema, handler }` entry to the registry.
//
// `contract-flows-schema.ts` derives its discriminated union from
// `Object.values(AUTH_SCHEME_REGISTRY).map(e => e.schema)`, so the validator
// (which writes pre-edit) and the runner (which dispatches at probe time)
// cannot drift. Drop a scheme from the registry → schema rejects it +
// runner errors with the same name.
// =============================================================================

const RegisterBlock = z.object({
  path: z.string().min(1),
  body: z.unknown().optional(),
  key: z.string().optional(),
  contentType: z.enum(['application/json', 'application/x-www-form-urlencoded']).optional(),
});

export const BearerInBodyAuthSchema = z.object({
  scheme: z.literal('bearer-in-body'),
  register: RegisterBlock.optional(),
  login: z.object({
    path: z.string().min(1),
    body: z.unknown().optional(),
    key: z.string().optional(),
    contentType: z.enum(['application/json', 'application/x-www-form-urlencoded']).optional(),
  }),
  token: z.string().optional(),
});

export const BearerInHeaderAuthSchema = z.object({
  scheme: z.literal('bearer-in-header'),
  login: z.object({
    path: z.string().min(1),
    body: z.unknown().optional(),
    headerName: z.string().optional(),
    contentType: z.enum(['application/json', 'application/x-www-form-urlencoded']).optional(),
  }),
  token: z.string().optional(),
});

export const CookieAuthSchema = z.object({
  scheme: z.literal('cookie'),
  login: z.object({
    path: z.string().min(1),
    body: z.unknown().optional(),
    contentType: z.enum(['application/json', 'application/x-www-form-urlencoded']).optional(),
  }),
});

export const ApiKeyAuthSchema = z.object({
  scheme: z.literal('api-key'),
  headerName: z.string().min(1),
  value: z.string().min(1),
});

export const OauthScopedAuthSchema = z.object({
  scheme: z.literal('oauth-scoped'),
  tokenEndpoint: z.string().min(1),
  scopes: z.array(z.string().min(1)).min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  audience: z.string().optional(),
});

export const AnonymousAuthSchema = z.object({
  scheme: z.literal('anonymous'),
});

type AuthHandler = (
  name: string,
  auth: ActorAuth,
  base: string,
  fetchImpl: typeof globalThis.fetch,
  timeoutMs: number,
) => Promise<{ credential?: ActorCredential; error?: TypedError }>;

// Wrappers for handlers whose underlying fn is sync or has narrower args,
// so the registry exposes a uniform AuthHandler signature.
const bootstrapApiKeyHandler: AuthHandler = async (name, auth) => bootstrapApiKey(name, auth);
const bootstrapAnonymousHandler: AuthHandler = async () => ({ credential: {} });

export const AUTH_SCHEME_REGISTRY = {
  'bearer-in-body':   { schema: BearerInBodyAuthSchema,   handler: bootstrapBearerInBody as AuthHandler },
  'bearer-in-header': { schema: BearerInHeaderAuthSchema, handler: bootstrapBearerInHeader as AuthHandler },
  'cookie':           { schema: CookieAuthSchema,         handler: bootstrapCookie as AuthHandler },
  'api-key':          { schema: ApiKeyAuthSchema,         handler: bootstrapApiKeyHandler },
  'oauth-scoped':     { schema: OauthScopedAuthSchema,    handler: bootstrapOauthScoped as AuthHandler },
  'anonymous':        { schema: AnonymousAuthSchema,      handler: bootstrapAnonymousHandler },
} as const;

export type AuthSchemeName = keyof typeof AUTH_SCHEME_REGISTRY;
