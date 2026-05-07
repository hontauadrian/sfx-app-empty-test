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
    const token = extractBearerToken(request.headers.authorization);
    const user = await this.authTokenService.verifyAccessToken(token);
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(AUTH_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];

    if (!hasRequiredRole(user.roles, requiredRoles)) {
      throw new ForbiddenException('Missing required role');
    }

    request.user = user;
    return true;
  }
}

function extractBearerToken(authorization: string | string[] | undefined): string {
  const value = Array.isArray(authorization) ? authorization[0] : authorization;

  if (!value?.startsWith('Bearer ')) {
    throw new UnauthorizedException('Bearer token is required');
  }

  return value.slice('Bearer '.length).trim();
}

function hasRequiredRole(userRoles: string[], requiredRoles: string[]): boolean {
  if (requiredRoles.length === 0) return true;
  return requiredRoles.some((role) => userRoles.includes(role));
}
