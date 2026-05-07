import { SetMetadata } from '@nestjs/common';

export const AUTH_ROLES_KEY = 'auth:roles';

export function AuthRoles(...roles: string[]): ReturnType<typeof SetMetadata> {
  return SetMetadata(AUTH_ROLES_KEY, roles);
}
