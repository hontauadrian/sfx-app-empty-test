import 'reflect-metadata';
import { COOKIE_CONSUMES_KEY, CookieConsumer } from '../cookie-consumer.decorator';
import type { CookieConsumeEntry } from '../cookie-consumer.decorator';

describe('CookieConsumer decorator', () => {
  it('should set metadata with correct key and name', () => {
    class TestClass {
      @CookieConsumer('connect.sid')
      handler(): void {
        /* noop */
      }
    }

    const metadata = Reflect.getMetadata(
      COOKIE_CONSUMES_KEY,
      TestClass.prototype.handler,
    ) as CookieConsumeEntry;

    expect(metadata).toEqual({ name: 'connect.sid' });
  });

  it('should not include headerEcho for basic consumer', () => {
    class TestClass {
      @CookieConsumer('pr_session')
      handler(): void {
        /* noop */
      }
    }

    const metadata = Reflect.getMetadata(
      COOKIE_CONSUMES_KEY,
      TestClass.prototype.handler,
    ) as CookieConsumeEntry;

    expect(metadata.headerEcho).toBeUndefined();
  });

  it('should use the correct metadata key constant', () => {
    expect(COOKIE_CONSUMES_KEY).toBe('cookie:consumes');
  });
});

describe('CookieConsumer.csrfDouble decorator', () => {
  it('should set metadata with cookie name and header echo', () => {
    class TestClass {
      @CookieConsumer.csrfDouble('XSRF-TOKEN', 'X-CSRF-Token')
      handler(): void {
        /* noop */
      }
    }

    const metadata = Reflect.getMetadata(
      COOKIE_CONSUMES_KEY,
      TestClass.prototype.handler,
    ) as CookieConsumeEntry;

    expect(metadata).toEqual({
      name: 'XSRF-TOKEN',
      headerEcho: 'X-CSRF-Token',
    });
  });

  it('should include headerEcho in metadata', () => {
    class TestClass {
      @CookieConsumer.csrfDouble('pr_xsrf', 'X-Probe-CSRF-Token')
      handler(): void {
        /* noop */
      }
    }

    const metadata = Reflect.getMetadata(
      COOKIE_CONSUMES_KEY,
      TestClass.prototype.handler,
    ) as CookieConsumeEntry;

    expect(metadata.headerEcho).toBe('X-Probe-CSRF-Token');
    expect(metadata.name).toBe('pr_xsrf');
  });
});
