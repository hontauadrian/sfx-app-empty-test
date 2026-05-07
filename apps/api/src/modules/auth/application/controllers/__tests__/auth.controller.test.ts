import { AuthController } from '../auth.controller';
import type { AuthenticatedRequest } from '../../types/authenticated-request';

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
});
