import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { AUTH_ROLES_KEY } from '../../decorators/auth-roles.decorator';
import type { AuthenticatedUser, AuthTokenService } from '../../auth/auth-token.service';

function createExecutionContext(
  authorization: string | undefined,
  headers: Record<string, string | undefined> = {},
): ExecutionContext {
  const request: { headers: Record<string, string | undefined>; user?: AuthenticatedUser } = {
    headers: { authorization, ...headers },
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => createExecutionContext,
    getClass: () => JwtAuthGuard,
  } as unknown as ExecutionContext;
}

function createGuard(
  requiredRoles: string[],
  userRoles: string[],
  receivedTokens: string[] = [],
): JwtAuthGuard {
  const tokenService = {
    verifyAccessToken: async (token: string): Promise<AuthenticatedUser> => {
      receivedTokens.push(token);
      return {
        subject: 'user-1',
        email: 'user@example.com',
        roles: userRoles,
      };
    },
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

  it('accepts oauth2-proxy forwarded access tokens', async () => {
    const receivedTokens: string[] = [];
    const guard = createGuard([], [], receivedTokens);

    await expect(
      guard.canActivate(
        createExecutionContext('Bearer id-token', {
          'x-forwarded-access-token': 'forwarded-token',
        }),
      ),
    ).resolves.toBe(true);
    expect(receivedTokens).toEqual(['forwarded-token']);
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
