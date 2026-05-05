import { SetMetadata } from '@nestjs/common';
import type { CustomDecorator } from '@nestjs/common';

export const COOKIE_ROLES_KEY = 'cookie:roles';

export type CookieRoleEnum =
  | 'refresh-token'
  | 'session'
  | 'csrf-double-submit'
  | 'oauth-state'
  | 'tenant-scope'
  | 'locale'
  | 'theme'
  | 'feature-flag'
  | 'custom';

export interface CookieRoleEntry {
  name: string;
  role: CookieRoleEnum;
}

/**
 * Declares that this endpoint emits a Set-Cookie with the given name and role.
 * dump-openapi.ts reads this via Nest Reflector and emits `x-cookie-roles`
 * on the operation object in the OpenAPI spec.
 */
export const CookieRole = (name: string, role: CookieRoleEnum): CustomDecorator<string> =>
  SetMetadata(COOKIE_ROLES_KEY, { name, role });
