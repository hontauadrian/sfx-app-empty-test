import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const useGlobalInterceptors = vi.fn();
const useGlobalFilters = vi.fn();
const setGlobalPrefix = vi.fn();
const enableCors = vi.fn();
const use = vi.fn();
const listen = vi.fn().mockResolvedValue(undefined);
const get = vi.fn();
const create = vi.fn();

vi.mock('@nestjs/core', () => ({
  NestFactory: {
    create: (...args: unknown[]): unknown => create(...args),
  },
}));

vi.mock('@nestjs/swagger', () => ({
  SwaggerModule: {
    setup: vi.fn(),
  },
}));

vi.mock('helmet', () => ({
  default: (): string => 'helmet-middleware',
}));

vi.mock('cookie-parser', () => ({
  default: (): string => 'cookie-parser-middleware',
}));

vi.mock('../swagger', () => ({
  buildSwaggerDocument: (): Record<string, unknown> => ({ openapi: '3.0.0', paths: {} }),
}));

vi.mock('../app.module', () => ({
  AppModule: class {},
}));

vi.mock('../common/filters/http-exception.filter', () => ({
  GlobalExceptionFilter: class {},
}));

vi.mock('../common/interceptors/transform.interceptor', () => ({
  TransformInterceptor: class {},
}));

vi.mock('../config/helmet-options', () => ({
  createHelmetOptions: (): Record<string, unknown> => ({}),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
}));

describe('main.bootstrap', () => {
  beforeEach(() => {
    create.mockReset();
    get.mockReset();
    listen.mockReset();
    listen.mockResolvedValue(undefined);
    useGlobalInterceptors.mockReset();
    useGlobalFilters.mockReset();
    setGlobalPrefix.mockReset();
    enableCors.mockReset();
    use.mockReset();
    process.env.NODE_ENV = 'test';
    delete process.env.WEB_ORIGIN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeAppMock(): { app: unknown; configGet: ReturnType<typeof vi.fn> } {
    const configGet = vi.fn((_key: string, fallback: number): number => fallback);
    const app = {
      get: (token: unknown): unknown => {
        if (token && (token as { name?: string }).name === 'ConfigService') {
          return { get: configGet };
        }
        return get(token);
      },
      use,
      enableCors,
      setGlobalPrefix,
      useGlobalFilters,
      useGlobalInterceptors,
      listen,
    };
    return { app, configGet };
  }

  it('boots the app with global filters + interceptors + api/v1 prefix', async () => {
    const { app } = makeAppMock();
    create.mockResolvedValue(app);
    get.mockImplementation((_token: { name?: string }): unknown => ({ handle: vi.fn() }));

    const { bootstrap } = await import('../main');
    await bootstrap();

    expect(create).toHaveBeenCalledTimes(1);
    expect(useGlobalInterceptors).toHaveBeenCalledTimes(1);
    expect(useGlobalFilters).toHaveBeenCalledTimes(1);
    expect(setGlobalPrefix).toHaveBeenCalledWith('api/v1');
    expect(listen).toHaveBeenCalled();
  });

  it('respects WEB_ORIGIN when present', async () => {
    process.env.WEB_ORIGIN = 'http://a.test,http://b.test';
    const { app } = makeAppMock();
    create.mockResolvedValue(app);
    get.mockReturnValue({ handle: vi.fn() });

    const { bootstrap } = await import('../main');
    await bootstrap();

    const corsArgs = enableCors.mock.calls[0]?.[0];
    expect(corsArgs).toEqual({
      origin: ['http://a.test', 'http://b.test'],
      credentials: true,
    });
  });
});
