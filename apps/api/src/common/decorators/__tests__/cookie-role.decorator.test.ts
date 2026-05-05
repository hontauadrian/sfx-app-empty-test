import 'reflect-metadata';
import { COOKIE_ROLES_KEY, CookieRole } from '../cookie-role.decorator';
import type { CookieRoleEntry, CookieRoleEnum } from '../cookie-role.decorator';

describe('CookieRole decorator', () => {
  it('should set metadata with correct key, name, and role', () => {
    class TestClass {
      @CookieRole('refresh_token', 'refresh-token')
      handler(): void {
        /* noop */
      }
    }

    const metadata = Reflect.getMetadata(
      COOKIE_ROLES_KEY,
      TestClass.prototype.handler,
    ) as CookieRoleEntry;

    expect(metadata).toEqual({ name: 'refresh_token', role: 'refresh-token' });
  });

  it('should work with session role', () => {
    class TestClass {
      @CookieRole('connect.sid', 'session')
      handler(): void {
        /* noop */
      }
    }

    const metadata = Reflect.getMetadata(
      COOKIE_ROLES_KEY,
      TestClass.prototype.handler,
    ) as CookieRoleEntry;

    expect(metadata).toEqual({ name: 'connect.sid', role: 'session' });
  });

  it('should work with csrf-double-submit role', () => {
    class TestClass {
      @CookieRole('XSRF-TOKEN', 'csrf-double-submit')
      handler(): void {
        /* noop */
      }
    }

    const metadata = Reflect.getMetadata(
      COOKIE_ROLES_KEY,
      TestClass.prototype.handler,
    ) as CookieRoleEntry;

    expect(metadata).toEqual({ name: 'XSRF-TOKEN', role: 'csrf-double-submit' });
  });

  it('should work with all role enum values', () => {
    const roles: CookieRoleEnum[] = [
      'refresh-token',
      'session',
      'csrf-double-submit',
      'oauth-state',
      'tenant-scope',
      'locale',
      'theme',
      'feature-flag',
      'custom',
    ];

    for (const role of roles) {
      class TestClass {
        @CookieRole(`cookie-${role}`, role)
        handler(): void {
          /* noop */
        }
      }

      const metadata = Reflect.getMetadata(
        COOKIE_ROLES_KEY,
        TestClass.prototype.handler,
      ) as CookieRoleEntry;

      expect(metadata).toEqual({ name: `cookie-${role}`, role });
    }
  });

  it('should use the correct metadata key constant', () => {
    expect(COOKIE_ROLES_KEY).toBe('cookie:roles');
  });
});
