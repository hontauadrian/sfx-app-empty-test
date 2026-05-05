/**
 * Minimal fetch wrapper with cookie jar, redirect handling, bearer auth,
 * per-request timeout, and response capture helpers.
 *
 * Scope: runtime-verification HTTP probe only. Not a general-purpose client.
 * No external deps — uses Node's built-in `fetch` (Node >= 18).
 */

export interface AuthSchemeConfig {
  type: 'bearer' | 'apiKey' | 'basic' | 'oauth2' | 'openIdConnect';
  in?: 'header' | 'query' | 'cookie';
  name?: string;
  value: string;
}

export interface ClientRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  redirect?: 'manual' | 'follow';
  timeoutMs?: number;
  bearer?: string | null;
  csrf?: string | null;
  authScheme?: AuthSchemeConfig | null;
  /** When true, read response as ArrayBuffer for binary downloads */
  binaryResponse?: boolean;
  /** When true, return raw Response for streaming (SSE). Body fields will be empty. */
  streamResponse?: boolean;
}

export interface ClientResponse {
  status: number;
  statusText: string;
  url: string;
  finalUrl: string;
  headers: Record<string, string>;
  bodyText: string;
  bodyJson: unknown;
  bodyBytes?: Uint8Array;
  bodyLength?: number;
  contentType: string;
  elapsedMs: number;
  redirectChain: string[];
  setCookies: string[];
  /** Raw Response object, only populated when streamResponse=true */
  rawResponse?: Response;
}

interface ParsedCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

/**
 * Tiny cookie jar — tracks name/value per host+path. Not spec-complete; just
 * enough to carry a session cookie across a flow on a single origin.
 */
export class CookieJar {
  private cookies: Map<string, ParsedCookie[]> = new Map();

  storeSetCookieHeaders(url: string, setCookies: string[]): void {
    if (!setCookies || setCookies.length === 0) return;
    const origin = safeOrigin(url);
    const existing = this.cookies.get(origin) ?? [];
    for (const raw of setCookies) {
      const parsed = parseSetCookie(raw);
      if (!parsed) continue;
      const idx = existing.findIndex((c) => c.name === parsed.name);
      if (idx >= 0) existing[idx] = parsed;
      else existing.push(parsed);
    }
    this.cookies.set(origin, existing);
  }

  buildCookieHeader(url: string): string {
    const origin = safeOrigin(url);
    const list = this.cookies.get(origin) ?? [];
    if (list.length === 0) return '';
    const now = new Date();
    return list
      .filter((c) => !c.expires || c.expires > now)
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
  }

  clear(): void {
    this.cookies.clear();
  }

  all(): Record<string, ParsedCookie[]> {
    const out: Record<string, ParsedCookie[]> = {};
    for (const [key, value] of this.cookies.entries()) out[key] = [...value];
    return out;
  }
}

function safeOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return url;
  }
}

export function parseSetCookie(raw: string): ParsedCookie | null {
  if (!raw) return null;
  const parts = raw.split(';').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const [head, ...attrs] = parts;
  const eq = head.indexOf('=');
  if (eq < 0) return null;
  const name = head.slice(0, eq).trim();
  const value = head.slice(eq + 1).trim();
  if (!name) return null;

  const cookie: ParsedCookie = { name, value };
  for (const attr of attrs) {
    const [k, v] = attr.split('=').map((p) => p.trim());
    const lower = k.toLowerCase();
    if (lower === 'domain') cookie.domain = v;
    else if (lower === 'path') cookie.path = v;
    else if (lower === 'expires' && v) {
      const when = new Date(v);
      if (!Number.isNaN(when.getTime())) cookie.expires = when;
    } else if (lower === 'max-age' && v) {
      const seconds = Number(v);
      if (Number.isFinite(seconds)) cookie.expires = new Date(Date.now() + seconds * 1000);
    } else if (lower === 'httponly') cookie.httpOnly = true;
    else if (lower === 'secure') cookie.secure = true;
    else if (lower === 'samesite') cookie.sameSite = v;
  }
  return cookie;
}

export class HttpClient {
  readonly jar: CookieJar;
  private baseUrl: string;
  private defaultTimeoutMs: number;

  constructor(baseUrl: string, options: { jar?: CookieJar; timeoutMs?: number } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.jar = options.jar ?? new CookieJar();
    this.defaultTimeoutMs = options.timeoutMs ?? 10_000;
  }

  buildUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  async request(path: string, options: ClientRequestOptions = {}): Promise<ClientResponse> {
    let url = this.buildUrl(path);
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = { accept: 'text/html, application/json;q=0.9, */*;q=0.8' };
    for (const [key, value] of Object.entries(options.headers ?? {})) headers[key.toLowerCase()] = value;
    if (options.bearer) headers.authorization = options.bearer.startsWith('Bearer ') ? options.bearer : `Bearer ${options.bearer}`;
    if (options.csrf) headers['x-csrf-token'] = options.csrf;

    // Per-scheme credential injection (overrides bearer if both set)
    if (options.authScheme) {
      const scheme = options.authScheme;
      switch (scheme.type) {
        case 'bearer':
        case 'oauth2':
        case 'openIdConnect':
          headers.authorization = scheme.value.startsWith('Bearer ') ? scheme.value : `Bearer ${scheme.value}`;
          break;
        case 'basic':
          headers.authorization = scheme.value.startsWith('Basic ') ? scheme.value : `Basic ${scheme.value}`;
          break;
        case 'apiKey':
          if (scheme.in === 'header') {
            headers[(scheme.name ?? 'x-api-key').toLowerCase()] = scheme.value;
          } else if (scheme.in === 'query') {
            const separator = url.includes('?') ? '&' : '?';
            url = `${url}${separator}${encodeURIComponent(scheme.name ?? 'api_key')}=${encodeURIComponent(scheme.value)}`;
          } else if (scheme.in === 'cookie') {
            const existing = headers.cookie ?? '';
            const cookiePair = `${scheme.name ?? 'api_key'}=${scheme.value}`;
            headers.cookie = existing ? `${existing}; ${cookiePair}` : cookiePair;
          }
          break;
      }
    }

    const cookieHeader = this.jar.buildCookieHeader(url);
    if (cookieHeader) {
      headers.cookie = headers.cookie ? `${headers.cookie}; ${cookieHeader}` : cookieHeader;
    }

    let bodyPayload: BodyInit | undefined;
    if (options.body !== undefined && options.body !== null && method !== 'GET') {
      if (options.body instanceof FormData) {
        // Let fetch set Content-Type with multipart boundary automatically
        bodyPayload = options.body;
        delete headers['content-type'];
      } else if (Buffer.isBuffer(options.body) || options.body instanceof Uint8Array) {
        bodyPayload = options.body;
        if (!headers['content-type']) headers['content-type'] = 'application/octet-stream';
      } else if (typeof options.body === 'string') {
        bodyPayload = options.body;
        if (!headers['content-type']) headers['content-type'] = 'text/plain';
      } else {
        bodyPayload = JSON.stringify(options.body);
        if (!headers['content-type']) headers['content-type'] = 'application/json';
      }
    }

    const redirectChain: string[] = [url];
    const ac = new AbortController();
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const start = Date.now();

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: bodyPayload,
        redirect: options.redirect ?? 'manual',
        signal: ac.signal,
      });

      const elapsed = Date.now() - start;
      const setCookies = collectSetCookies(response.headers);
      this.jar.storeSetCookieHeaders(url, setCookies);
      const finalUrl = response.url || url;
      if (finalUrl !== url) redirectChain.push(finalUrl);
      const contentType = response.headers.get('content-type') ?? '';

      // Streaming mode: return raw Response without consuming body
      if (options.streamResponse) {
        return {
          status: response.status,
          statusText: response.statusText,
          url,
          finalUrl,
          headers: headersToObject(response.headers),
          bodyText: '',
          bodyJson: undefined,
          contentType,
          elapsedMs: elapsed,
          redirectChain,
          setCookies,
          rawResponse: response,
        };
      }

      // Binary mode: read as ArrayBuffer
      if (options.binaryResponse) {
        const ab = await response.arrayBuffer();
        const bodyBytes = new Uint8Array(ab);
        return {
          status: response.status,
          statusText: response.statusText,
          url,
          finalUrl,
          headers: headersToObject(response.headers),
          bodyText: '',
          bodyJson: undefined,
          bodyBytes,
          bodyLength: bodyBytes.length,
          contentType,
          elapsedMs: elapsed,
          redirectChain,
          setCookies,
        };
      }

      // Default: text + JSON parse
      const bodyText = await response.text();
      let bodyJson: unknown = undefined;
      if (/application\/json|\+json/i.test(contentType) && bodyText.length > 0) {
        try { bodyJson = JSON.parse(bodyText); } catch { bodyJson = undefined; }
      }

      return {
        status: response.status,
        statusText: response.statusText,
        url,
        finalUrl,
        headers: headersToObject(response.headers),
        bodyText,
        bodyJson,
        contentType,
        elapsedMs: elapsed,
        redirectChain,
        setCookies,
      };
    } catch (error) {
      const elapsed = Date.now() - start;
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 0,
        statusText: ac.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
        url,
        finalUrl: url,
        headers: {},
        bodyText: message,
        bodyJson: undefined,
        bodyBytes: undefined,
        bodyLength: undefined,
        contentType: '',
        elapsedMs: elapsed,
        redirectChain,
        setCookies: [],
      };
    } finally {
      clearTimeout(timer);
    }
  }

  withBearer(bearer: string | null): HttpClient {
    const copy = new HttpClient(this.baseUrl, { jar: this.jar, timeoutMs: this.defaultTimeoutMs });
    copy.defaultBearer = bearer;
    return copy;
  }

  private defaultBearer: string | null = null;
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => { out[key.toLowerCase()] = value; });
  return out;
}

function collectSetCookies(headers: Headers): string[] {
  // Node's Headers has getSetCookie() per spec; fall back to raw get().
  const direct = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.();
  if (Array.isArray(direct) && direct.length > 0) return direct;
  const raw = headers.get('set-cookie');
  return raw ? [raw] : [];
}
