import { validateEnv } from '../env.validation';

const VALID_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
  JWT_SECRET: 'dev-secret-minimum-16-chars',
  OAUTH_ISSUER_URL: 'http://localhost:9080/realms/sfx-panel',
  OAUTH_JWKS_URL: 'http://localhost:9080/realms/sfx-panel/protocol/openid-connect/certs',
  OAUTH_API_CLIENT_ID: 'inventory-dev-api',
};

describe('validateEnv', () => {
  it('requires OAuth issuer, JWKS URL, and API client ID', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: VALID_ENV.DATABASE_URL,
        JWT_SECRET: VALID_ENV.JWT_SECRET,
      }),
    ).toThrow(/OAUTH_ISSUER_URL/);
  });

  it('defaults OAuth audience to the API client ID', () => {
    const config = validateEnv(VALID_ENV);

    expect(config.OAUTH_AUDIENCE).toBe('inventory-dev-api');
  });

  it('allows an explicit OAuth audience', () => {
    const config = validateEnv({
      ...VALID_ENV,
      OAUTH_AUDIENCE: 'inventory-api-audience',
    });

    expect(config.OAUTH_AUDIENCE).toBe('inventory-api-audience');
  });
});
