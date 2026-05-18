import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthTokenService, type AuthenticatedUser } from '../auth/auth-token.service';
import { AUTH_ROLES_KEY } from '../decorators/auth-roles.decorator';

export interface RequestWithAuthenticatedUser extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authTokenService: AuthTokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuthenticatedUser>();
    const token = extractBearerToken(
      request.headers.authorization,
      request.headers['x-forwarded-access-token'],
    );
    const user = await this.authTokenService.verifyAccessToken(token);
    // Bind the authenticated user to the request BEFORE the role check so
    // downstream observers (audit-log middleware on res.finish, exception
    // filters) can read it even when the role check rejects.
    request.user = user;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(AUTH_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];

    if (!hasRequiredRole(user.roles, requiredRoles)) {
      throw new ForbiddenException('Missing required role');
    }

    return true;
  }
}

function extractBearerToken(
  authorization: string | string[] | undefined,
  forwardedAccessToken: string | string[] | undefined,
): string {
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  const forwardedValue = Array.isArray(forwardedAccessToken)
    ? forwardedAccessToken[0]
    : forwardedAccessToken;

  if (forwardedValue) {
    return forwardedValue.trim();
  }

  if (value?.startsWith('Bearer ')) {
    return value.slice('Bearer '.length).trim();
  }

  throw new UnauthorizedException('Bearer token is required');
}

function hasRequiredRole(userRoles: string[], requiredRoles: string[]): boolean {
  if (requiredRoles.length === 0) return true;
  return requiredRoles.some((role) => userRoles.includes(role));
}
