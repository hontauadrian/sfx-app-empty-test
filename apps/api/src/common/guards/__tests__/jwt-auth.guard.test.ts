import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { AUTH_ROLES_KEY } from '../../decorators/auth-roles.decorator';
import type { AuthenticatedUser, AuthTokenService } from '../../auth/auth-token.service';

function createExecutionContext(authorization: string | undefined): ExecutionContext {
  const request: { headers: Record<string, string | undefined>; user?: AuthenticatedUser } = {
    headers: { authorization },
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => createExecutionContext,
    getClass: () => JwtAuthGuard,
  } as unknown as ExecutionContext;
}

function createGuard(requiredRoles: string[], userRoles: string[]): JwtAuthGuard {
  const tokenService = {
    verifyAccessToken: async (): Promise<AuthenticatedUser> => ({
      subject: 'user-1',
      email: 'user@example.com',
      roles: userRoles,
    }),
  } as unknown as AuthTokenService;

  const reflector = {
    getAllAndOverride: (key: string) => (key === AUTH_ROLES_KEY ? requiredRoles : undefined),
  } as unknown as Reflector;

  return new JwtAuthGuard(tokenService, reflector);
}

describe('JwtAuthGuard', () => {
  it('rejects requests without a bearer token', async () => {
    const guard = createGuard([], []);

    await expect(guard.canActivate(createExecutionContext(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('allows authenticated requests when no roles are required', async () => {
    const guard = createGuard([], []);

    await expect(
      guard.canActivate(createExecutionContext('Bearer token')),
    ).resolves.toBe(true);
  });

  it('rejects authenticated users that lack a required role', async () => {
    const guard = createGuard(['admin'], ['viewer']);

    await expect(guard.canActivate(createExecutionContext('Bearer token'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows authenticated users that have a required role', async () => {
    const guard = createGuard(['admin'], ['viewer', 'admin']);

    await expect(
      guard.canActivate(createExecutionContext('Bearer token')),
    ).resolves.toBe(true);
  });
});
