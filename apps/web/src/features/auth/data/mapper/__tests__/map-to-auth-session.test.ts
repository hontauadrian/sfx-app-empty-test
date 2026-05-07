import { mapToAuthSession } from '../map-to-auth-session';

describe('mapToAuthSession', () => {
  it('marks users with roles as having app access', () => {
    expect(
      mapToAuthSession({
        isAuthenticated: true,
        subject: 'user-1',
        email: 'user@example.com',
        roles: ['viewer'],
      }),
    ).toEqual({
      isAuthenticated: true,
      subject: 'user-1',
      email: 'user@example.com',
      roles: ['viewer'],
      hasAppAccess: true,
    });
  });

  it('marks authenticated users without roles as pending access', () => {
    expect(
      mapToAuthSession({
        isAuthenticated: true,
        subject: 'user-1',
        email: null,
        roles: [],
      }).hasAppAccess,
    ).toBe(false);
  });
});
