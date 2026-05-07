import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface JwtHeader {
  readonly alg?: string;
  readonly kid?: string;
}

interface JwksResponse {
  readonly keys?: JsonWebKey[];
}

interface KeycloakResourceAccess {
  readonly [clientId: string]: {
    readonly roles?: string[];
  } | undefined;
}

export interface KeycloakAccessTokenPayload {
  readonly sub?: string;
  readonly email?: string;
  readonly preferred_username?: string;
  readonly iss?: string;
  readonly aud?: string | string[];
  readonly exp?: number;
  readonly resource_access?: KeycloakResourceAccess;
}

export interface AuthenticatedUser {
  readonly subject: string;
  readonly email: string | null;
  readonly roles: string[];
}

@Injectable()
export class AuthTokenService {
  constructor(private readonly configService: ConfigService) {}

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const { header, payload, signingInput, signature } = this.parseJwt(token);

    if (header.alg !== 'RS256' || !header.kid) {
      throw new UnauthorizedException('Unsupported token signing algorithm');
    }

    const jwk = await this.getSigningKey(header.kid);
    const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    const isValid = verify('RSA-SHA256', Buffer.from(signingInput), publicKey, signature);

    if (!isValid) {
      throw new UnauthorizedException('Invalid token signature');
    }

    this.assertPayloadClaims(payload);

    return {
      subject: payload.sub ?? '',
      email: payload.email ?? payload.preferred_username ?? null,
      roles: this.extractClientRoles(payload),
    };
  }

  extractClientRoles(payload: Pick<KeycloakAccessTokenPayload, 'resource_access'>): string[] {
    const apiClientId = this.getRequiredConfig('OAUTH_API_CLIENT_ID');
    const roles = payload.resource_access?.[apiClientId]?.roles;
    return Array.isArray(roles) ? roles : [];
  }

  private parseJwt(token: string): {
    header: JwtHeader;
    payload: KeycloakAccessTokenPayload;
    signingInput: string;
    signature: Buffer;
  } {
    const segments = token.split('.');
    const headerSegment = segments[0];
    const payloadSegment = segments[1];
    const signatureSegment = segments[2];

    if (!headerSegment || !payloadSegment || !signatureSegment || segments.length !== 3) {
      throw new UnauthorizedException('Invalid bearer token');
    }

    return {
      header: parseBase64UrlJson<JwtHeader>(headerSegment),
      payload: parseBase64UrlJson<KeycloakAccessTokenPayload>(payloadSegment),
      signingInput: `${headerSegment}.${payloadSegment}`,
      signature: Buffer.from(signatureSegment, 'base64url'),
    };
  }

  private async getSigningKey(kid: string): Promise<JsonWebKey> {
    const jwksUrl = this.getRequiredConfig('OAUTH_JWKS_URL');
    const response = await fetch(jwksUrl);

    if (!response.ok) {
      throw new UnauthorizedException('Unable to load token signing keys');
    }

    const jwks = (await response.json()) as JwksResponse;
    const key = jwks.keys?.find((candidate) => candidate.kid === kid);

    if (!key) {
      throw new UnauthorizedException('Token signing key not found');
    }

    return key;
  }

  private assertPayloadClaims(payload: KeycloakAccessTokenPayload): void {
    const issuer = this.getRequiredConfig('OAUTH_ISSUER_URL');
    const audience = this.getRequiredConfig('OAUTH_AUDIENCE');
    const nowInSeconds = Math.floor(Date.now() / 1000);

    if (!payload.sub) {
      throw new UnauthorizedException('Token subject is missing');
    }

    if (payload.iss !== issuer) {
      throw new UnauthorizedException('Invalid token issuer');
    }

    if (typeof payload.exp !== 'number' || payload.exp <= nowInSeconds) {
      throw new UnauthorizedException('Token has expired');
    }

    const tokenAudiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!tokenAudiences.includes(audience)) {
      throw new UnauthorizedException('Invalid token audience');
    }
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new UnauthorizedException(`Missing auth configuration: ${key}`);
    }
    return value;
  }
}

function parseBase64UrlJson<T>(segment: string): T {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
  } catch {
    throw new UnauthorizedException('Invalid bearer token');
  }
}
