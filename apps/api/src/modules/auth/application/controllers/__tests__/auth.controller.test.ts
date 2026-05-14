import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuthenticatedRequest } from '../../types/authenticated-request';
import { AuthController } from '../auth.controller';

describe('AuthController', () => {
  it('returns the authenticated user session from the request', () => {
    const controller = new AuthController();
    const request = {
      user: {
        subject: 'user-1',
        email: 'user@example.com',
        roles: ['viewer'],
      },
    } as AuthenticatedRequest;

    expect(controller.me(request)).toEqual({
      isAuthenticated: true,
      subject: 'user-1',
      email: 'user@example.com',
      roles: ['viewer'],
    });
  });

  it('uses the registered OpenAPI bearer security scheme name', () => {
    const controllerSource = readFileSync(
      join(__dirname, '..', 'auth.controller.ts'),
      'utf8',
    );

    expect(controllerSource).toContain("@ApiBearerAuth('accessToken')");
  });
});
