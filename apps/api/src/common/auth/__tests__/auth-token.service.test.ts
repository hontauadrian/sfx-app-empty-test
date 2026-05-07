import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AuthTokenService } from '../auth-token.service';

function createConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    OAUTH_ISSUER_URL: 'https://auth.example.test/realms/customer',
    OAUTH_JWKS_URL: 'https://auth.example.test/realms/customer/protocol/openid-connect/certs',
    OAUTH_API_CLIENT_ID: 'inventory-dev-api',
    OAUTH_AUDIENCE: 'inventory-dev-api',
    ...overrides,
  };

  return {
    get: <T = string>(key: string): T => values[key] as T,
  } as ConfigService;
}

describe('AuthTokenService', () => {
  it('extracts client roles from the configured API client', () => {
    const service = new AuthTokenService(createConfigService());

    expect(
      service.extractClientRoles({
        resource_access: {
          'inventory-dev-api': {
            roles: ['viewer', 'editor'],
          },
          'inventory-dev-proxy': {
            roles: ['proxy-only'],
          },
        },
      }),
    ).toEqual(['viewer', 'editor']);
  });

  it('returns an empty role list when the API client has no roles', () => {
    const service = new AuthTokenService(createConfigService());

    expect(service.extractClientRoles({ resource_access: {} })).toEqual([]);
  });

  it('rejects tokens with an invalid segment count', async () => {
    const service = new AuthTokenService(createConfigService());

    await expect(service.verifyAccessToken('not-a-jwt')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
