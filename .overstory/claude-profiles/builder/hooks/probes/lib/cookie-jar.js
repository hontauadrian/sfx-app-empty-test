'use strict';

/**
 * lib/cookie-jar.js — RFC 6265bis-compliant cookie jar primitive.
 *
 * Pure protocol module. No detection logic, no knowledge of probe matrix,
 * no role awareness. Only RFC 6265bis cookie storage and replay behavior.
 *
 * Design decisions documented inline:
 *   - Secure flag on localhost: jar still includes Secure cookies on http://
 *     because the probe enforces declared intent, not browser security policy.
 *   - HttpOnly: jar stores the attr but does not filter on it — HttpOnly is a
 *     browser/JS concern, not a transport concern for an HTTP probe.
 *   - Domain matching for localhost: exact host match only (not subdomain).
 *     RFC 6265bis §5.1.3 domain matching is designed for public DNS; localhost
 *     is a probe convention where subdomain matching is meaningless.
 */

// ---------------------------------------------------------------------------
// Set-Cookie parser (RFC 6265 §5.2)
// ---------------------------------------------------------------------------

/**
 * Parse a single Set-Cookie header string into a structured cookie object.
 *
 * @param {string} header — a single Set-Cookie header value
 * @returns {{ name: string, value: string, attrs: CookieAttrs } | null}
 *
 * @typedef {object} CookieAttrs
 * @property {boolean} httpOnly
 * @property {boolean} secure
 * @property {string|null} sameSite — 'Strict' | 'Lax' | 'None' | null
 * @property {string|null} path
 * @property {string|null} domain
 * @property {number|null} maxAge — seconds; null if not declared
 * @property {string|null} expires — raw Expires string; null if not declared
 */
function parseSetCookie(header) {
  if (typeof header !== 'string' || header.length === 0) return null;

  // Split on first '=' to get name-value pair from the first segment
  const semiIdx = header.indexOf(';');
  const nameValuePart = semiIdx === -1 ? header : header.slice(0, semiIdx);
  const eqIdx = nameValuePart.indexOf('=');

  // RFC 6265 §5.2 step 1: if no '=', the entire string is name with empty value
  // However most implementations reject cookies without '='. We accept them.
  let name, value;
  if (eqIdx === -1) {
    name = nameValuePart.trim();
    value = '';
  } else {
    name = nameValuePart.slice(0, eqIdx).trim();
    value = nameValuePart.slice(eqIdx + 1).trim();
  }

  if (name.length === 0) return null;

  // Unquote value if double-quoted (RFC 6265 §5.2)
  if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
    value = value.slice(1, -1);
  }

  // Parse attributes from remaining segments
  const attrs = {
    httpOnly: false,
    secure: false,
    sameSite: null,
    path: null,
    domain: null,
    maxAge: null,
    expires: null,
  };

  if (semiIdx !== -1) {
    const attrString = header.slice(semiIdx + 1);
    const segments = attrString.split(';');

    for (const segment of segments) {
      const trimmed = segment.trim();
      if (trimmed.length === 0) continue;

      const attrEq = trimmed.indexOf('=');
      let attrName, attrValue;
      if (attrEq === -1) {
        attrName = trimmed;
        attrValue = null;
      } else {
        attrName = trimmed.slice(0, attrEq).trim();
        attrValue = trimmed.slice(attrEq + 1).trim();
      }

      const lowerName = attrName.toLowerCase();

      switch (lowerName) {
        case 'httponly':
          attrs.httpOnly = true;
          break;
        case 'secure':
          attrs.secure = true;
          break;
        case 'samesite':
          if (attrValue) {
            // Normalize to canonical casing
            const lower = attrValue.toLowerCase();
            if (lower === 'strict') attrs.sameSite = 'Strict';
            else if (lower === 'lax') attrs.sameSite = 'Lax';
            else if (lower === 'none') attrs.sameSite = 'None';
            else attrs.sameSite = attrValue; // store as-is for non-standard
          }
          break;
        case 'path':
          attrs.path = attrValue || null;
          break;
        case 'domain':
          if (attrValue) {
            // RFC 6265 §5.2.3: strip leading dot
            attrs.domain = attrValue.startsWith('.')
              ? attrValue.slice(1).toLowerCase()
              : attrValue.toLowerCase();
          }
          break;
        case 'max-age': {
          if (attrValue) {
            const parsed = parseInt(attrValue, 10);
            if (!Number.isNaN(parsed)) {
              attrs.maxAge = parsed;
            }
          }
          break;
        }
        case 'expires':
          attrs.expires = attrValue || null;
          break;
        default:
          // Unknown attributes ignored per RFC 6265 §5.2 step 7
          break;
      }
    }
  }

  return { name, value, attrs };
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/**
 * Parse a URL string into components needed for cookie matching.
 *
 * @param {string} urlStr
 * @returns {{ hostname: string, pathname: string, isSecure: boolean }}
 */
function parseUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    return {
      hostname: url.hostname.toLowerCase(),
      pathname: url.pathname || '/',
      isSecure: url.protocol === 'https:',
    };
  } catch {
    return { hostname: '', pathname: '/', isSecure: false };
  }
}

/**
 * Compute the default-path from a request URI per RFC 6265 §5.1.4.
 *
 * The default-path is the "directory" of the URI path:
 *   /a/b/c → /a/b
 *   /a     → /
 *   /      → /
 *
 * @param {string} pathname
 * @returns {string}
 */
function defaultPath(pathname) {
  if (!pathname || pathname[0] !== '/') return '/';
  const lastSlash = pathname.lastIndexOf('/');
  if (lastSlash <= 0) return '/';
  return pathname.slice(0, lastSlash);
}

/**
 * RFC 6265 §5.1.4 path-match: does the request path match the cookie path?
 *
 * The cookie-path is a prefix of the request-path, with the additional
 * constraint that if the cookie-path is not '/', the next character in the
 * request-path after the cookie-path must be '/' (directory boundary).
 *
 * @param {string} requestPath
 * @param {string} cookiePath
 * @returns {boolean}
 */
function pathMatches(requestPath, cookiePath) {
  if (cookiePath === '/') return true;
  if (requestPath === cookiePath) return true;
  if (requestPath.startsWith(cookiePath)) {
    // The cookie-path must end at a '/' boundary in the request-path
    if (cookiePath.endsWith('/')) return true;
    if (requestPath[cookiePath.length] === '/') return true;
  }
  return false;
}

/**
 * RFC 6265 §5.1.3 domain-match.
 *
 * For localhost: exact host match only (probe convention — subdomains
 * of localhost are meaningless in a probe context).
 *
 * For other hosts: the cookie domain must be a suffix of the request host,
 * and the character before the suffix in the request host must be '.'.
 *
 * @param {string} requestHost — lowercase
 * @param {string} cookieDomain — lowercase, leading dot already stripped
 * @returns {boolean}
 */
function domainMatches(requestHost, cookieDomain) {
  if (requestHost === cookieDomain) return true;

  // Localhost: exact match only
  if (cookieDomain === 'localhost' || requestHost === 'localhost') {
    return requestHost === cookieDomain;
  }

  // IP addresses: exact match only (RFC 6265 §5.1.3)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(requestHost) || requestHost.startsWith('[')) {
    return requestHost === cookieDomain;
  }

  // Subdomain match: request host ends with '.' + cookie domain
  if (requestHost.endsWith('.' + cookieDomain)) {
    return true;
  }

  return false;
}

/**
 * Check if an Expires date string represents a date in the past.
 *
 * @param {string} expiresStr
 * @returns {boolean}
 */
function isExpired(expiresStr) {
  if (!expiresStr) return false;
  const date = new Date(expiresStr);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() <= Date.now();
}

// ---------------------------------------------------------------------------
// CookieJar
// ---------------------------------------------------------------------------

/**
 * @typedef {object} StoredCookie
 * @property {string} name
 * @property {string} value
 * @property {CookieAttrs} attrs
 * @property {string} effectivePath — resolved path (declared or default)
 * @property {string} effectiveDomain — resolved domain (declared or request host)
 * @property {number} creationIndex — monotonic counter for ordering
 * @property {boolean} hostOnly — true if no Domain attr was specified
 */

class CookieJar {
  constructor() {
    /** @type {Map<string, StoredCookie>} keyed by `name|path|domain` */
    this._cookies = new Map();
    /** @type {Set<string>} names that have been cleared (Max-Age=0 or Expires-in-past) */
    this._cleared = new Set();
    /** @type {number} monotonic creation counter for ordering */
    this._counter = 0;
  }

  /**
   * Clear all cookies and state. Called at flow start.
   */
  reset() {
    this._cookies.clear();
    this._cleared.clear();
    this._counter = 0;
  }

  /**
   * Process Set-Cookie headers from a response.
   *
   * Each header is parsed independently. Later cookies override earlier ones
   * with the same name+path+domain (per RFC 6265 §5.3).
   *
   * @param {string[]} setCookieHeaders — one string per Set-Cookie header
   * @param {string} requestUrl — full URL of the request that produced the response
   */
  capture(setCookieHeaders, requestUrl) {
    if (!Array.isArray(setCookieHeaders)) return;
    const { hostname, pathname } = parseUrl(requestUrl);

    for (const header of setCookieHeaders) {
      const parsed = parseSetCookie(header);
      if (!parsed) continue;

      const { name, value, attrs } = parsed;

      // Resolve effective path (RFC 6265 §5.3 step 7)
      const effectivePath = attrs.path || defaultPath(pathname);

      // Resolve effective domain (RFC 6265 §5.3 step 6)
      let effectiveDomain;
      let hostOnly;
      if (attrs.domain) {
        effectiveDomain = attrs.domain; // already lowercased, dot-stripped
        hostOnly = false;
        // Reject if request host does not domain-match
        if (!domainMatches(hostname, effectiveDomain)) continue;
      } else {
        effectiveDomain = hostname;
        hostOnly = true;
      }

      // Check if this is a clear operation (Max-Age=0 or Expires-in-past)
      // Max-Age takes precedence over Expires per RFC 6265 §5.3 step 4
      const isMaxAgeZero = attrs.maxAge !== null && attrs.maxAge <= 0;
      const isExpiresPast = attrs.maxAge === null && isExpired(attrs.expires);

      if (isMaxAgeZero || isExpiresPast) {
        // Clear the cookie
        const key = this._cookieKey(name, effectivePath, effectiveDomain);
        this._cookies.delete(key);
        this._cleared.add(name);
        continue;
      }

      // Store / overwrite
      const key = this._cookieKey(name, effectivePath, effectiveDomain);
      this._counter++;
      this._cookies.set(key, {
        name,
        value,
        attrs,
        effectivePath,
        effectiveDomain,
        creationIndex: this._counter,
        hostOnly,
      });

      // If this name was previously cleared, un-clear it (re-issued)
      this._cleared.delete(name);
    }
  }

  /**
   * Build the Cookie header value for a request to the given URL.
   *
   * Cookies are selected by path-match and domain-match, then ordered per
   * RFC 6265 §5.4: longest path first; among equal paths, earlier-created first.
   *
   * @param {string} requestUrl
   * @returns {string|null} — cookie header value (without 'Cookie: ' prefix), or null
   */
  cookieHeaderFor(requestUrl) {
    const { hostname, pathname } = parseUrl(requestUrl);
    const matching = [];

    for (const cookie of this._cookies.values()) {
      // Domain match
      if (cookie.hostOnly) {
        if (hostname !== cookie.effectiveDomain) continue;
      } else {
        if (!domainMatches(hostname, cookie.effectiveDomain)) continue;
      }

      // Path match
      if (!pathMatches(pathname, cookie.effectivePath)) continue;

      // Secure flag: include even on http:// (probe design decision —
      // probe enforces declared intent, not browser security policy)

      matching.push(cookie);
    }

    if (matching.length === 0) return null;

    // Sort: longest path first; equal paths → earlier creationIndex first
    matching.sort((a, b) => {
      const pathDiff = b.effectivePath.length - a.effectivePath.length;
      if (pathDiff !== 0) return pathDiff;
      return a.creationIndex - b.creationIndex;
    });

    return matching.map((c) => `${c.name}=${c.value}`).join('; ');
  }

  /**
   * Get a cookie by name. If multiple cookies share the same name on different
   * paths/domains, returns the first match (longest path, earliest created).
   *
   * @param {string} name
   * @returns {{ value: string, attrs: CookieAttrs } | null}
   */
  get(name) {
    const matches = [];
    for (const cookie of this._cookies.values()) {
      if (cookie.name === name) matches.push(cookie);
    }
    if (matches.length === 0) return null;

    // Return the one with longest path / earliest creation
    matches.sort((a, b) => {
      const pathDiff = b.effectivePath.length - a.effectivePath.length;
      if (pathDiff !== 0) return pathDiff;
      return a.creationIndex - b.creationIndex;
    });

    return { value: matches[0].value, attrs: matches[0].attrs };
  }

  /**
   * Check if a cookie with the given name exists (not cleared).
   *
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    for (const cookie of this._cookies.values()) {
      if (cookie.name === name) return true;
    }
    return false;
  }

  /**
   * Check if a cookie with the given name has been cleared
   * (Max-Age=0 or Expires-in-past was applied).
   *
   * @param {string} name
   * @returns {boolean}
   */
  isCleared(name) {
    return this._cleared.has(name);
  }

  /**
   * Get the parsed attributes of a cookie by name.
   *
   * @param {string} name
   * @returns {CookieAttrs | null}
   */
  attrsOf(name) {
    const entry = this.get(name);
    return entry ? entry.attrs : null;
  }

  /**
   * Number of live (not cleared) cookies in the jar.
   *
   * @returns {number}
   */
  size() {
    return this._cookies.size;
  }

  /**
   * Array of cookie names that have been cleared during this session.
   *
   * @returns {string[]}
   */
  clearedNames() {
    return [...this._cleared];
  }

  /**
   * Internal: compute a storage key for a cookie.
   * Per RFC 6265 §5.3: same name + path + domain → overwrite.
   *
   * @param {string} name
   * @param {string} path
   * @param {string} domain
   * @returns {string}
   */
  _cookieKey(name, path, domain) {
    return `${name}|${path}|${domain}`;
  }
}

module.exports = { CookieJar, parseSetCookie };
