process.env.OAUTH_ISSUER_URL ??= 'http://localhost:37385/realms/app';
process.env.OAUTH_JWKS_URL ??= 'http://localhost:37385/realms/app/protocol/openid-connect/certs';
process.env.OAUTH_API_CLIENT_ID ??= 'test-client';
process.env.JWT_SECRET ??= 'integration-test-secret-key-32chars';
