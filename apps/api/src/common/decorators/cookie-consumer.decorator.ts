import { SetMetadata } from '@nestjs/common';
import type { CustomDecorator } from '@nestjs/common';

export const COOKIE_CONSUMES_KEY = 'cookie:consumes';

export interface CookieValueSubstitutionTarget {
  in: 'header' | 'query' | 'body';
  name: string;
}

export interface CookieValueSubstitutionDecl {
  cookieName: string;
  target: CookieValueSubstitutionTarget;
}

export interface CookieConsumeEntry {
  name: string;
  headerEcho?: string;
  valueSubstitution?: CookieValueSubstitutionDecl;
}

/**
 * Declares that this endpoint consumes (requires) a cookie with the given name.
 * dump-openapi.ts reads this via Nest Reflector and emits `x-cookie-consumes`
 * on the operation object in the OpenAPI spec.
 */
export const CookieConsumer = (name: string): CustomDecorator<string> =>
  SetMetadata(COOKIE_CONSUMES_KEY, { name });

/**
 * For csrf-double-submit: declares cookie + header echo pairing.
 */
CookieConsumer.csrfDouble = (cookieName: string, headerName: string): CustomDecorator<string> =>
  SetMetadata(COOKIE_CONSUMES_KEY, { name: cookieName, headerEcho: headerName });

/**
 * Declares that this endpoint consumes a cookie AND substitutes its value
 * into a specific request parameter (query, header, or body field).
 *
 * Emits x-cookie-consumes with a valueSubstitution entry that the
 * cookie-flows detector reads (P3 extraction path).
 */
CookieConsumer.withValueSource = (
  cookieName: string,
  target: CookieValueSubstitutionTarget,
): CustomDecorator<string> =>
  SetMetadata(COOKIE_CONSUMES_KEY, {
    name: cookieName,
    valueSubstitution: { cookieName, target },
  });
